import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { StudioSetupError, setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  WORKFLOW_EXECUTION_ERROR_STATUS,
  WorkflowExecutionError,
  isCompiledEnvelope,
  planRun,
} from "@ethen/studio-core/server/workflow";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { getCompiledDag, insertRunRecord } from "../../_lib/supabase-workflow";
import { isStudioFixtureLane } from "../../_lib/local-lane";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function executionError(error: WorkflowExecutionError) {
  const status = WORKFLOW_EXECUTION_ERROR_STATUS[error.code] ?? 500;
  if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
  if (error.code === "BUDGET_EXCEEDED") return studioError("INSUFFICIENT_CREDITS", error.message);
  if (error.code === "RAW_GRAPH_REJECTED" || error.code === "INVALID_ENVELOPE" || error.code === "UNKNOWN_NODE") {
    return studioError("VALIDATION_ERROR", error.message);
  }
  void status;
  return studioError("INTERNAL_ERROR", error.message);
}

/**
 * STUDIO_13 — V1 canvas run creation. Compiled-DAG only: the caller names
 * a stored (graphId, revision); the route resolves the immutable DAG row
 * and plans from it. A raw graph payload is rejected before any write.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    if (body.graph && typeof body.graph === "object") {
      return studioError("VALIDATION_ERROR", "Runs accept only compiled revisions; raw graph payloads never execute.");
    }
    const projectId = asString(body.projectId);
    const graphId = asString(body.graphId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!graphId) return studioError("VALIDATION_ERROR", "graphId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const revision = typeof body.revision === "number" ? body.revision : Number(body.revision);
    const budgetIcu = typeof body.budgetIcu === "number" ? body.budgetIcu : Number(body.budgetIcu);
    if (!Number.isInteger(revision) || revision <= 0) return studioError("VALIDATION_ERROR", "revision is required.");
    if (!Number.isInteger(budgetIcu) || budgetIcu < 0) return studioError("VALIDATION_ERROR", "budgetIcu is required.");
    // P05 — the fixture lane has no runner: node→job admission, cache
    // settlement and the orchestration loop live behind Temporal, and no
    // existing code drives bindings without it. Runs honestly report it.
    if (await isStudioFixtureLane()) {
      throw new StudioSetupError("temporal", "Workflow runs need the job orchestrator.");
    }

    const selection = Array.isArray(body.selection)
      ? (body.selection as unknown[]).filter((entry): entry is string => typeof entry === "string")
      : null;

    const dag = await getCompiledDag(resolved, graphId, revision);
    if (!dag) return studioError("NOT_FOUND", "No compiled DAG for this graph revision; compile first.");
    const envelope = { ir: dag.ir as never, dagHash: dag.dagHash };
    if (!isCompiledEnvelope(envelope)) {
      return studioError("VALIDATION_ERROR", "Stored DAG failed envelope verification; refusing execution.");
    }
    let plan: { order: string[]; reuse: string[]; recompute: string[] };
    try {
      plan = planRun({ envelope, selectedNodeIds: selection ?? undefined, cacheHits: new Set() });
    } catch (error) {
      if (error instanceof WorkflowExecutionError) return executionError(error);
      throw error;
    }
    const created = await insertRunRecord({
      scope: resolved,
      graphId,
      revision,
      dagHash: dag.dagHash,
      selection,
      plan,
      budgetIcu,
    });
    return studioSuccess({ runId: created.runId, status: created.status, recompute: plan.recompute, reuse: plan.reuse });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Workflows need the Studio data service.");
    if (setup) return setup;
    if (error instanceof WorkflowExecutionError) return executionError(error);
    return studioError("INTERNAL_ERROR", "Canvas run creation failed.");
  }
}
