import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  AgentError,
  assertApprovalUsable,
  assertTierAllows,
  classifyTransition,
  isAgentStage,
  isAgentTerminal,
  isExecutionTier,
  raiseTier,
  tierRank,
  type BackedgeUsage,
} from "@ethen/studio-core/server/agent";
import { asIcu } from "@ethen/studio-core/contracts";
import { evaluatePolicy } from "@ethen/studio-core/server/policy";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { buildSupabasePolicyStores, recordDecision } from "../../../../_lib/supabase-policy";
import {
  appendAgentEvent,
  getAgentRun,
  listAgentApprovals,
  listAgentPatches,
  listAgentPlans,
  nextAgentEventSeq,
  updateAgentRun,
} from "../../../../_lib/supabase-agent";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import { fixtureAdvance, fixtureRaiseTier } from "../../../../_lib/agent-lane";

export const dynamic = "force-dynamic";

function asAgentFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "The Creative Agent needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof AgentError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
    if (error.code === "APPROVAL_REQUIRED") return studioError("APPROVAL_REQUIRED", error.message);
    if (error.code === "POLICY_DENIED") return studioError("FORBIDDEN", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Agent request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function backedgesOf(row: Record<string, unknown>): BackedgeUsage {
  const num = (key: string): number => {
    const value = row[key];
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
  };
  return { executeToPlan: num("executeToPlan"), verifyToObserve: num("verifyToObserve"), verifyToPlan: num("verifyToPlan") };
}

/**
 * STUDIO_17 — stage advance, human tier raise and EXECUTE entry.
 * `to` moves the machine (skip edges need skipReason). `raiseTier`
 * raises the visible tier (session human only). Entering EXECUTE needs
 * approvalId: the envelope must be granted + live + fresh, then j03
 * policy is evaluated immediately before dispatch — a denial blocks.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { runId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const actorId = authorization.actorId ?? "unknown";
    const now = new Date().toISOString();
    if (await isStudioFixtureLane()) {
      const raiseTo = asString(body.raiseTier);
      if (raiseTo) {
        const run = fixtureRaiseTier(localStores().agent, resolved, runId, raiseTo, actorId, now);
        return studioSuccess({ run });
      }
      const { run } = await fixtureAdvance(localStores().agent, resolved, {
        runId,
        to: asString(body.to) ?? "",
        skipReason: asString(body.skipReason),
        approvalId: asString(body.approvalId),
        actorId,
        now,
      });
      return studioSuccess({ run });
    }
    const run = await getAgentRun(resolved, runId);
    if (!run) return studioError("NOT_FOUND", "Agent run was not found.");

    // Human-only tier raise (the session actor is the human; the agent has no session).
    const raiseTo = asString(body.raiseTier);
    if (raiseTo) {
      if (!isExecutionTier(raiseTo)) return studioError("VALIDATION_ERROR", "raiseTier must be plan-only, execute or publish.");
      const runShape = { tier: run.tier } as Parameters<typeof raiseTier>[0];
      const next = raiseTier(runShape, raiseTo, { actorId, isHuman: true });
      if (tierRank(next) <= tierRank(run.tier as typeof next)) {
        return studioError("VALIDATION_ERROR", `Tier ${next} is not above the current tier ${run.tier}.`);
      }
      const updated = await updateAgentRun(resolved, runId, { tier: next });
      await appendAgentEvent({
        runId,
        seq: await nextAgentEventSeq(runId),
        type: "tier.raised",
        stage: updated.stage,
        payload: { from: run.tier, to: next, raisedBy: actorId },
      });
      return studioSuccess({ run: updated });
    }

    const to = asString(body.to);
    if (!to || (!isAgentStage(to) && !isAgentTerminal(to))) {
      return studioError("VALIDATION_ERROR", "to must be a valid agent stage or terminal.");
    }
    const outcome = classifyTransition({
      from: run.stage as Parameters<typeof classifyTransition>[0]["from"],
      to,
      backedges: backedgesOf(run.backedges),
      skipReason: asString(body.skipReason) ?? undefined,
    });

    // EXECUTE entry gate: tier + fresh approval + policy-before-dispatch.
    if (to === "EXECUTE") {
      assertTierAllows({ tier: run.tier } as Parameters<typeof assertTierAllows>[0], "execute", "Dispatch");
      const approvalId = asString(body.approvalId);
      if (!approvalId) return studioError("APPROVAL_REQUIRED", "approvalId is required to enter EXECUTE.");
      const approvals = await listAgentApprovals(resolved, runId);
      const row = approvals.find((a) => a.approvalId === approvalId);
      if (!row) return studioError("NOT_FOUND", "Approval was not found.");
      const plans = await listAgentPlans(resolved, runId);
      const head = plans.length > 0 ? plans[plans.length - 1] : null;
      const patches = await listAgentPatches(resolved, runId);
      const headPatch = patches.length > 0 ? patches[patches.length - 1] : null;
      const world = {
        planHash: head?.planHash ?? "",
        patchHash: headPatch ? headPatch.resultingHash : null,
        quoteId: head?.quoteId ?? null,
        estimatedIcu: asIcu(head?.estimatedIcu ?? 0),
        pins: {
          taskSchemaVersion: String(head?.pins.taskSchemaVersion ?? ""),
          endpointSchemaVersion: String(head?.pins.endpointSchemaVersion ?? ""),
          priceVersion: String(head?.pins.priceVersion ?? ""),
          adapterVersion: String(head?.pins.adapterVersion ?? ""),
        },
      };
      assertApprovalUsable(
        {
          approvalId: row.approvalId,
          state: row.state as "granted",
          planHash: row.planHash,
          patchHash: row.patchHash,
          quoteId: row.quoteId,
          estimatedIcu: asIcu(row.estimatedIcu),
          pins: {
            taskSchemaVersion: String(row.pins.taskSchemaVersion ?? ""),
            endpointSchemaVersion: String(row.pins.endpointSchemaVersion ?? ""),
            priceVersion: String(row.pins.priceVersion ?? ""),
            adapterVersion: String(row.pins.adapterVersion ?? ""),
          },
          expiresAt: row.expiresAt,
        } as Parameters<typeof assertApprovalUsable>[0],
        world,
        now,
      );
      const evaluation = await evaluatePolicy(buildSupabasePolicyStores(), {
        scope: resolved.scope,
        actor: { actorId, roles: ["creator"] },
        task: "agent.invoke",
        action: "generate",
        identityId: null,
        identityVersion: null,
        assetId: null,
        assetVersion: null,
        assetClass: null,
        destination: null,
        contentReview: null,
        spendApproval: { approved: true, approvalId: row.approvalId, capIcu: row.capIcu },
        now,
      });
      await recordDecision(resolved, actorId, evaluation.decision).catch(() => undefined);
      if (!evaluation.decision.allowed) {
        await updateAgentRun(resolved, runId, { stage: "BLOCKED" });
        await appendAgentEvent({
          runId,
          seq: await nextAgentEventSeq(runId),
          type: "run.blocked",
          stage: "BLOCKED",
          payload: {
            reasonCode: evaluation.reasonCode,
            decisionId: evaluation.decision.decisionId,
            remediation: evaluation.decision.remediation,
          },
        });
        return studioError("FORBIDDEN", `Dispatch blocked by policy: ${evaluation.reasonCode}.`);
      }
      const updated = await updateAgentRun(resolved, runId, { stage: "EXECUTE" });
      await appendAgentEvent({
        runId,
        seq: await nextAgentEventSeq(runId),
        type: "execute.dispatched",
        stage: "EXECUTE",
        payload: { approvalId, decisionId: evaluation.decision.decisionId },
      });
      return studioSuccess({ run: updated });
    }

    const patch: Record<string, unknown> = { stage: to };
    if (outcome.counter) {
      const current = backedgesOf(run.backedges);
      patch.backedges = { ...current, [outcome.counter]: current[outcome.counter] + 1 };
    }
    const updated = await updateAgentRun(resolved, runId, patch);
    await appendAgentEvent({
      runId,
      seq: await nextAgentEventSeq(runId),
      type: outcome.kind === "backedge" ? "backedge.taken" : outcome.kind === "skip" ? "stage.skipped" : "stage.advanced",
      stage: to,
      payload: { from: run.stage, to, skipReason: asString(body.skipReason) },
    });
    return studioSuccess({ run: updated });
  } catch (error) {
    return asAgentFailure(error);
  }
}
