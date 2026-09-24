import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { AgentError, assertApprovalUsable, checkPublishGate } from "@ethen/studio-core/server/agent";
import { asIcu } from "@ethen/studio-core/contracts";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { SupabaseAuthorityRepository } from "../../../../_lib/supabase-policy";
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
import { fixturePublish } from "../../../../_lib/agent-lane";

export const dynamic = "force-dynamic";

function asAgentFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "The Creative Agent needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof AgentError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "APPROVAL_REQUIRED") return studioError("APPROVAL_REQUIRED", error.message);
    if (error.code === "STALE_REVISION" || error.code === "CONFLICT") return studioError("CONFLICT", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Agent request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_17 — publish gate. Public publish needs a fresh granted publish
 * approval or a live scoped PublishAuthority (channel + asset class,
 * unexpired, uses left, unrevoked). Export-first fallback: without either
 * the run keeps its results; nothing is falsely marked published.
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
    const channel = asString(body.channel);
    const assetClass = asString(body.assetClass);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!channel) return studioError("VALIDATION_ERROR", "channel is required.");
    if (!assetClass) return studioError("VALIDATION_ERROR", "assetClass is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const now = new Date().toISOString();
    if (await isStudioFixtureLane()) {
      const { run, via } = await fixturePublish(localStores().agent, resolved, {
        runId,
        channel,
        assetClass,
        approvalId: asString(body.approvalId),
        now,
      });
      return studioSuccess({ run, via });
    }
    const run = await getAgentRun(resolved, runId);
    if (!run) return studioError("NOT_FOUND", "Agent run was not found.");

    // Fresh granted publish approval, when the caller presents one.
    let publishApprovalGranted = false;
    const approvalId = asString(body.approvalId);
    if (approvalId) {
      const approvals = await listAgentApprovals(resolved, runId);
      const row = approvals.find((a) => a.approvalId === approvalId);
      if (!row) return studioError("NOT_FOUND", "Approval was not found.");
      if (row.kind !== "publish") return studioError("VALIDATION_ERROR", "Approval is not a publish approval.");
      const plans = await listAgentPlans(resolved, runId);
      const head = plans.length > 0 ? plans[plans.length - 1] : null;
      const patches = await listAgentPatches(resolved, runId);
      const headPatch = patches.length > 0 ? patches[patches.length - 1] : null;
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
        {
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
        },
        now,
      );
      publishApprovalGranted = true;
    }

    const authorities = new SupabaseAuthorityRepository();
    const gate = await checkPublishGate(
      {
        getAuthority: async (id) => {
          const found = await authorities.getAuthority(resolved.scope, id);
          return found
            ? {
                authorityId: found.authorityId,
                channel: found.channel,
                assetClass: found.assetClass,
                expiresAt: found.expiresAt,
                maxUses: found.maxUses,
                usedCount: found.usedCount,
                revokedAt: found.revokedAt,
              }
            : null;
        },
        consumeAuthority: async (id) => {
          try {
            await authorities.consumeAuthority(resolved.scope, id);
            return true;
          } catch {
            return false;
          }
        },
      },
      { channel, assetClass, authorityId: asString(body.authorityId), publishApprovalGranted, now },
    );
    if (!gate.allowed) {
      await appendAgentEvent({
        runId,
        seq: await nextAgentEventSeq(runId),
        type: "publish.denied",
        stage: run.stage,
        payload: { channel, assetClass, reason: gate.reason },
      });
      return studioError("APPROVAL_REQUIRED", gate.reason);
    }
    const updated = await updateAgentRun(resolved, runId, { stage: "PUBLISHED" });
    await appendAgentEvent({
      runId,
      seq: await nextAgentEventSeq(runId),
      type: "publish.approved",
      stage: "PUBLISHED",
      payload: { channel, assetClass, via: gate.via, authorityId: gate.authorityId },
    });
    return studioSuccess({ run: updated, via: gate.via });
  } catch (error) {
    return asAgentFailure(error);
  }
}
