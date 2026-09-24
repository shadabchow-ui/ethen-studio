import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  canonicalSha256,
  compileGraph,
  WorkflowExecutionError,
} from "@ethen/studio-core/server/workflow";
import { DEFAULT_VERSION_PINS, STUDIO_WORKFLOW_IR_VERSION } from "@ethen/studio-core/contracts";
import type { CanvasGraph } from "@ethen/studio-core/contracts";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { insertCompiledDag, insertGraphRevision, listGraphRevisions } from "../../../../_lib/supabase-workflow";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  assertAuthoringGraph,
  fixtureListRevisions,
  fixtureSaveRevision,
  workflowLaneEndpointResolver,
  workflowLanePolicy,
  WorkflowLaneError,
} from "../../../../_lib/workflow-lane";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asLaneFailure(error: unknown): Response | null {
  if (error instanceof WorkflowLaneError) {
    if (error.code === "CONFLICT") return studioError("CONFLICT", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    return studioError("VALIDATION_ERROR", error.message);
  }
  return null;
}

/** STUDIO_13 — V1 graph revisions: append-only history with compiled DAG pointers. */
export async function GET(request: NextRequest, context: { params: Promise<{ graphId: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { graphId } = await context.params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      return studioSuccess({ revisions: fixtureListRevisions(localStores().workflow, resolved, graphId) });
    }
    const { revisions } = await listGraphRevisions(resolved, graphId);
    return studioSuccess({ revisions });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Workflows need the Studio data service.");
    if (setup) return setup;
    const lane = asLaneFailure(error);
    if (lane) return lane;
    if (error instanceof WorkflowExecutionError) return studioError("NOT_FOUND", error.message);
    return studioError("INTERNAL_ERROR", "Graph revisions failed.");
  }
}

/**
 * P05 — V1 revision save: optimistic concurrency on `baseRevision`
 * (stale → CONFLICT), kernel validate + compile (invalid →
 * VALIDATION_ERROR with node-level messages), then an immutable append.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ graphId: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { graphId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const baseRevision = typeof body.baseRevision === "number" ? body.baseRevision : Number(body.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision <= 0) {
      return studioError("VALIDATION_ERROR", "baseRevision is required.");
    }
    assertAuthoringGraph(body.graph);
    const graph = body.graph as CanvasGraph;
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      const saved = fixtureSaveRevision(localStores().workflow, resolved, { graphId, baseRevision, graph });
      return studioSuccess(saved, undefined, 201);
    }
    const { revisions } = await listGraphRevisions(resolved, graphId);
    const head = revisions.length > 0 ? revisions[revisions.length - 1] : null;
    if (!head) return studioError("NOT_FOUND", "Graph not found in this project.");
    if (baseRevision !== head.revision) {
      return studioError("CONFLICT", `Revision ${baseRevision} is stale; head is ${head.revision}. Reload and retry.`);
    }
    const { canonical, sha256 } = canonicalSha256({ nodes: graph.nodes, edges: graph.edges });
    if (sha256 === head.sha256) {
      return studioSuccess({ revision: head.revision, sha256: head.sha256, dagHash: head.dagHash }, undefined, 200);
    }
    const compiled = compileGraph(graph, {
      scope: resolved.scope,
      graphId,
      revision: head.revision + 1,
      policy: workflowLanePolicy(),
      endpoints: workflowLaneEndpointResolver,
      pins: { ...DEFAULT_VERSION_PINS },
    });
    if (!compiled.ok) {
      const messages = compiled.diagnostics.map((entry) =>
        entry.nodeId ? `${entry.nodeId}: ${entry.message}` : entry.message,
      );
      return studioError("VALIDATION_ERROR", messages.join(" "));
    }
    const stored = await insertGraphRevision({
      scope: resolved,
      graphId,
      revision: head.revision + 1,
      canonicalJson: JSON.parse(canonical) as unknown,
      sha256,
      nodeCount: graph.nodes.length,
    });
    const pinned = await insertCompiledDag({
      scope: resolved,
      dagHash: compiled.dagHash,
      graphId,
      revision: stored.revision,
      ir: compiled.ir,
      irVersion: STUDIO_WORKFLOW_IR_VERSION,
      pins: { ...DEFAULT_VERSION_PINS },
    });
    return studioSuccess({ revision: stored.revision, sha256: stored.sha256, dagHash: pinned.dagHash }, undefined, 201);
  } catch (error) {
    const setup = setupRequiredResponse(error, "Workflows need the Studio data service.");
    if (setup) return setup;
    const lane = asLaneFailure(error);
    if (lane) return lane;
    if (error instanceof WorkflowExecutionError) return studioError("INTERNAL_ERROR", error.message);
    return studioError("INTERNAL_ERROR", "Graph revision save failed.");
  }
}
