import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  AgentError,
  createPlanRevision,
  proposePatch,
  realAgentCompilerPort,
  type AgentPlanStep,
  type CanvasPatchOp,
} from "@ethen/studio-core/server/agent";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import {
  appendAgentEvent,
  casBumpHeadRevision,
  getAgentRun,
  insertAgentPatch,
  insertAgentPlan,
  invalidateLiveApprovals,
  nextAgentEventSeq,
} from "../../../../_lib/supabase-agent";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import { fixtureAppendPlan, parsePlanPins, parsePlanSteps } from "../../../../_lib/agent-lane";

export const dynamic = "force-dynamic";

function asAgentFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "The Creative Agent needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof AgentError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Agent request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asSteps(value: unknown): AgentPlanStep[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const steps: AgentPlanStep[] = [];
  for (const entry of value) {
    const row = entry as Record<string, unknown>;
    const key = asString(row.key);
    const title = asString(row.title);
    const action = asString(row.action);
    const estimatedIcu = typeof row.estimatedIcu === "number" ? row.estimatedIcu : Number(row.estimatedIcu);
    const deps = Array.isArray(row.deps) ? row.deps.filter((d): d is string => typeof d === "string") : null;
    if (!key || !title || !action || deps === null || !Number.isInteger(estimatedIcu) || estimatedIcu < 0) return null;
    steps.push({ key, title, action, deps, estimatedIcu });
  }
  return steps;
}

/**
 * STUDIO_17 — append a plan revision, optionally with a Canvas patch
 * proposal. The kernel validates the step DAG, compiles the patched graph
 * and computes hashes; any new revision invalidates live approvals and
 * bumps the head under CAS.
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
    if (await isStudioFixtureLane()) {
      const goal = asString(body.goal);
      if (!goal) return studioError("VALIDATION_ERROR", "goal is required.");
      const steps = parsePlanSteps(body.steps);
      const pins = parsePlanPins(body.pins);
      const constraints = Array.isArray(body.constraints)
        ? body.constraints.filter((c): c is string => typeof c === "string")
        : [];
      const patchBody = body.patch as { baseGraph?: unknown; ops?: unknown } | undefined;
      const saved = fixtureAppendPlan(localStores().agent, resolved, {
        runId,
        goal,
        constraints,
        steps,
        pins,
        quoteId: asString(body.quoteId),
        patch: patchBody ? { baseGraph: patchBody.baseGraph, ops: patchBody.ops } : null,
        now: new Date().toISOString(),
      });
      return studioSuccess({ plan: saved.plan, patch: saved.patch }, undefined, 201);
    }
    const run = await getAgentRun(resolved, runId);
    if (!run) return studioError("NOT_FOUND", "Agent run was not found.");

    const goal = asString(body.goal);
    const steps = asSteps(body.steps);
    if (!goal) return studioError("VALIDATION_ERROR", "goal is required.");
    if (!steps) return studioError("VALIDATION_ERROR", "steps must be a non-empty validated list.");
    const constraints = Array.isArray(body.constraints)
      ? body.constraints.filter((c): c is string => typeof c === "string")
      : [];
    const pins = (body.pins as Record<string, unknown> | undefined) ?? {};
    const pin = (key: string): string | null => (typeof pins[key] === "string" ? (pins[key] as string) : null);
    if (!pin("taskSchemaVersion") || !pin("endpointSchemaVersion") || !pin("priceVersion") || !pin("adapterVersion")) {
      return studioError("VALIDATION_ERROR", "pins.taskSchemaVersion/endpointSchemaVersion/priceVersion/adapterVersion are required.");
    }
    const now = new Date().toISOString();
    const revision = createPlanRevision({
      runId,
      scope: resolved.scope,
      revision: run.headRevision + 1,
      goal,
      constraints,
      steps,
      pins: {
        taskSchemaVersion: pin("taskSchemaVersion") as string,
        endpointSchemaVersion: pin("endpointSchemaVersion") as string,
        priceVersion: pin("priceVersion") as string,
        adapterVersion: pin("adapterVersion") as string,
      },
      quoteId: asString(body.quoteId),
      now,
    });

    // Optional patch proposal: validated + compiled server-side, never trusted blind.
    let patch: Awaited<ReturnType<typeof insertAgentPatch>> | null = null;
    const patchBody = body.patch as { baseGraph?: unknown; ops?: unknown } | undefined;
    if (patchBody) {
      const baseGraph = patchBody.baseGraph as Parameters<typeof proposePatch>[0]["base"];
      const ops = patchBody.ops as CanvasPatchOp[] | undefined;
      if (!baseGraph || !Array.isArray(baseGraph.nodes) || !Array.isArray(baseGraph.edges) || !Array.isArray(ops)) {
        return studioError("VALIDATION_ERROR", "patch needs baseGraph {nodes, edges} and ops[].");
      }
      const proposed = proposePatch({
        runId,
        planRevision: revision.revision,
        base: baseGraph,
        ops,
        compiler: realAgentCompilerPort,
        now,
      });
      patch = proposed.patch as unknown as Awaited<ReturnType<typeof insertAgentPatch>>;
    }

    await casBumpHeadRevision(resolved, runId, run.headRevision);
    const savedPlan = await insertAgentPlan({
      runId,
      revision: revision.revision,
      goal: revision.goal,
      constraints: [...revision.constraints],
      steps: revision.steps.map((s) => ({ ...s, deps: [...s.deps] })),
      pins: { ...revision.pins },
      estimatedIcu: revision.estimatedIcu,
      quoteId: revision.quoteId,
      planHash: revision.planHash,
    });
    let savedPatch: Awaited<ReturnType<typeof insertAgentPatch>> | null = null;
    if (patch) {
      savedPatch = await insertAgentPatch({
        runId,
        planRevision: revision.revision,
        baseGraphHash: patch.baseGraphHash,
        ops: patch.ops,
        resultingHash: patch.resultingHash,
        diff: [...patch.diff],
      });
    }
    await invalidateLiveApprovals(runId, `superseded by plan revision ${revision.revision}`);
    await appendAgentEvent({
      runId,
      seq: await nextAgentEventSeq(runId),
      type: "plan.revised",
      stage: run.stage,
      payload: { revision: revision.revision, planHash: revision.planHash, patchId: savedPatch?.patchId ?? null },
    });
    return studioSuccess({ plan: savedPlan, patch: savedPatch }, undefined, 201);
  } catch (error) {
    return asAgentFailure(error);
  }
}
