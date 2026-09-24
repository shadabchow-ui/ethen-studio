import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  WorkflowExecutionError,
  dirtyDownstreamClosureIr,
  isCompiledEnvelope,
  requireCompiledEnvelope,
} from "@ethen/studio-core/server/workflow";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { getCompiledDag } from "../../../../_lib/supabase-workflow";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import { fixtureEstimate, WorkflowLaneError } from "../../../../_lib/workflow-lane";

export const dynamic = "force-dynamic";

function asLaneFailure(error: unknown): Response | null {
  if (error instanceof WorkflowLaneError) {
    if (error.code === "CONFLICT") return studioError("CONFLICT", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    return studioError("VALIDATION_ERROR", error.message);
  }
  return null;
}

/**
 * STUDIO_13 — V1 run estimate: per-node ICU from the compiled revision
 * budget envelope. A selection estimates the selection plus dirty
 * downstream only (partial-rerun pricing).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ graphId: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { graphId } = await context.params;
    const params = request.nextUrl.searchParams;
    const projectId = params.get("projectId");
    const revision = Number(params.get("revision"));
    const budgetIcu = Number(params.get("budget") ?? "1000");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!Number.isInteger(revision) || revision <= 0) return studioError("VALIDATION_ERROR", "revision is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const selectionParam = params.get("selection");
    const selection = selectionParam ? selectionParam.split(",").map((entry) => entry.trim()).filter(Boolean) : null;
    if (await isStudioFixtureLane()) {
      const estimate = fixtureEstimate(localStores().workflow, resolved, {
        graphId,
        revision,
        selection,
        budgetIcu,
      });
      if (!estimate) return studioError("NOT_FOUND", "No compiled DAG for this graph revision.");
      return studioSuccess(estimate);
    }
    const dag = await getCompiledDag(resolved, graphId, revision);
    if (!dag) return studioError("NOT_FOUND", "No compiled DAG for this graph revision.");
    const envelope = { ir: dag.ir as never, dagHash: dag.dagHash };
    if (!isCompiledEnvelope(envelope)) return studioError("VALIDATION_ERROR", "Stored DAG failed verification.");
    const ir = requireCompiledEnvelope(envelope);
    let scoped: string[];
    try {
      scoped = selection ? dirtyDownstreamClosureIr(ir, selection) : ir.nodes.map((node) => node.nodeId);
    } catch (error) {
      if (error instanceof WorkflowExecutionError) return studioError("VALIDATION_ERROR", error.message);
      throw error;
    }
    const perNodeIcu: Record<string, number> = {};
    for (const node of ir.nodes) {
      perNodeIcu[node.nodeId] = scoped.includes(node.nodeId) ? node.budgetIcu : 0;
    }
    const totalIcu = Object.values(perNodeIcu).reduce((sum, value) => sum + value, 0);
    return studioSuccess({ perNodeIcu, totalIcu, budgetIcu, withinBudget: totalIcu <= budgetIcu });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Workflows need the Studio data service.");
    if (setup) return setup;
    const lane = asLaneFailure(error);
    if (lane) return lane;
    if (error instanceof WorkflowExecutionError) return studioError("NOT_FOUND", error.message);
    return studioError("INTERNAL_ERROR", "Run estimate failed.");
  }
}
