import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  AgentError,
  denyApproval,
  grantApproval,
  requestApproval,
  type ApprovalEnvelope,
} from "@ethen/studio-core/server/agent";
import { asIcu } from "@ethen/studio-core/contracts";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import {
  appendAgentEvent,
  getAgentRun,
  insertAgentApproval,
  listAgentApprovals,
  listAgentPatches,
  listAgentPlans,
  nextAgentEventSeq,
  updateAgentApproval,
  type AgentApprovalRow,
} from "../../../../_lib/supabase-agent";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import { fixtureDecideApproval, fixtureRequestApproval } from "../../../../_lib/agent-lane";

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
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Agent request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toEnvelope(row: AgentApprovalRow): ApprovalEnvelope {
  return {
    approvalId: row.approvalId,
    runId: row.runId,
    scope: { tenantId: "" as never, workspaceId: "" as never, projectId: "" as never },
    planRevision: row.planRevision,
    planHash: row.planHash,
    patchHash: row.patchHash,
    quoteId: row.quoteId,
    estimatedIcu: asIcu(row.estimatedIcu),
    capIcu: asIcu(row.capIcu),
    pins: {
      taskSchemaVersion: String(row.pins.taskSchemaVersion ?? ""),
      endpointSchemaVersion: String(row.pins.endpointSchemaVersion ?? ""),
      priceVersion: String(row.pins.priceVersion ?? ""),
      adapterVersion: String(row.pins.adapterVersion ?? ""),
    },
    policyDecisionId: row.policyDecisionId,
    tier: row.tier as ApprovalEnvelope["tier"],
    kind: row.kind as ApprovalEnvelope["kind"],
    state: row.state as ApprovalEnvelope["state"],
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt,
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt,
    expiresAt: row.expiresAt,
    staleReason: row.staleReason,
  };
}

/**
 * STUDIO_17 — approval requests and human decisions. POST without
 * approvalId requests an envelope pinned to the head plan/patch; POST
 * with approvalId + decision grants/denies after revalidating freshness.
 * Grants and denies are human-only (session actor, never the agent).
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
    const approvalId = asString(body.approvalId);
    if (await isStudioFixtureLane()) {
      if (!approvalId) {
        const kind = asString(body.kind);
        if (kind !== "execute" && kind !== "publish") {
          return studioError("VALIDATION_ERROR", "kind must be execute or publish.");
        }
        const capIcu = typeof body.capIcu === "number" ? body.capIcu : Number(body.capIcu);
        if (!Number.isInteger(capIcu) || capIcu < 0) {
          return studioError("VALIDATION_ERROR", "capIcu (integer ICU) is required.");
        }
        const approval = fixtureRequestApproval(localStores().agent, resolved, {
          runId,
          kind,
          capIcu,
          policyDecisionId: asString(body.policyDecisionId),
          requestedBy: actorId,
          now,
        });
        return studioSuccess({ approval }, undefined, 201);
      }
      const decision = asString(body.decision);
      if (decision !== "granted" && decision !== "denied") {
        return studioError("VALIDATION_ERROR", "decision must be granted or denied.");
      }
      const approval = fixtureDecideApproval(localStores().agent, resolved, {
        approvalId,
        decision,
        actorId,
        now,
      });
      return studioSuccess({ approval });
    }
    const run = await getAgentRun(resolved, runId);
    if (!run) return studioError("NOT_FOUND", "Agent run was not found.");
    if (!approvalId) {
      const kind = asString(body.kind);
      if (kind !== "execute" && kind !== "publish") {
        return studioError("VALIDATION_ERROR", "kind must be execute or publish.");
      }
      const capIcu = typeof body.capIcu === "number" ? body.capIcu : Number(body.capIcu);
      if (!Number.isInteger(capIcu) || capIcu < 0) {
        return studioError("VALIDATION_ERROR", "capIcu (integer ICU) is required.");
      }
      const plans = await listAgentPlans(resolved, runId);
      const head = plans.length > 0 ? plans[plans.length - 1] : null;
      if (!head) return studioError("VALIDATION_ERROR", "A plan revision is required before requesting approval.");
      const patches = await listAgentPatches(resolved, runId);
      const headPatch = patches.length > 0 ? patches[patches.length - 1] : null;
      const envelope = requestApproval({
        runId,
        scope: resolved.scope,
        planRevision: head.revision,
        planHash: head.planHash,
        patchHash: headPatch ? headPatch.resultingHash : null,
        quoteId: head.quoteId,
        estimatedIcu: asIcu(head.estimatedIcu),
        capIcu: asIcu(capIcu),
        pins: {
          taskSchemaVersion: String(head.pins.taskSchemaVersion ?? ""),
          endpointSchemaVersion: String(head.pins.endpointSchemaVersion ?? ""),
          priceVersion: String(head.pins.priceVersion ?? ""),
          adapterVersion: String(head.pins.adapterVersion ?? ""),
        },
        policyDecisionId: asString(body.policyDecisionId),
        tier: run.tier as ApprovalEnvelope["tier"],
        kind,
        requestedBy: actorId,
        now,
      });
      const saved = await insertAgentApproval({
        runId,
        planRevision: envelope.planRevision,
        planHash: envelope.planHash,
        patchHash: envelope.patchHash,
        quoteId: envelope.quoteId,
        estimatedIcu: envelope.estimatedIcu,
        capIcu: envelope.capIcu,
        pins: { ...envelope.pins },
        policyDecisionId: envelope.policyDecisionId,
        tier: envelope.tier,
        kind: envelope.kind,
        requestedBy: envelope.requestedBy,
        requestedAt: envelope.requestedAt,
        expiresAt: envelope.expiresAt,
      });
      await appendAgentEvent({
        runId,
        seq: await nextAgentEventSeq(runId),
        type: "approval.requested",
        stage: run.stage,
        payload: { approvalId: saved.approvalId, kind, capIcu },
      });
      return studioSuccess({ approval: saved }, undefined, 201);
    }

    const decision = asString(body.decision);
    if (decision !== "granted" && decision !== "denied") {
      return studioError("VALIDATION_ERROR", "decision must be granted or denied.");
    }
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
    const envelope = toEnvelope(row);
    const next =
      decision === "granted"
        ? grantApproval(envelope, world, actorId, true, now)
        : denyApproval(envelope, actorId, true);
    const saved = await updateAgentApproval(approvalId, {
      state: next.state,
      granted_by: next.grantedBy,
      granted_at: next.grantedAt,
      stale_reason: next.staleReason,
    });
    await appendAgentEvent({
      runId,
      seq: await nextAgentEventSeq(runId),
      type: next.state === "granted" ? "approval.granted" : next.state === "denied" ? "approval.denied" : "approval.invalidated",
      stage: run.stage,
      payload: { approvalId, state: next.state, staleReason: next.staleReason },
    });
    return studioSuccess({ approval: saved });
  } catch (error) {
    return asAgentFailure(error);
  }
}
