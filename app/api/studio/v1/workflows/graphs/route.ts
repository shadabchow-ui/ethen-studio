import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { canonicalSha256, WorkflowExecutionError } from "@ethen/studio-core/server/workflow";
import type { CanvasGraph } from "@ethen/studio-core/contracts";
import { canvasTemplate } from "@/components/studio/v5/canvas/templates";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { insertGraphRevision, listGraphs } from "../../_lib/supabase-workflow";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureCreateGraph, fixtureListGraphs, WorkflowLaneError } from "../../_lib/workflow-lane";

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

/** STUDIO M5 — V1 graph index: head revision per graph in this project. */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      return studioSuccess({ graphs: fixtureListGraphs(localStores().workflow, resolved), source: "memory" });
    }
    return studioSuccess({ graphs: await listGraphs(resolved), source: "supabase" });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Workflows need the Studio data service.");
    if (setup) return setup;
    const lane = asLaneFailure(error);
    if (lane) return lane;
    if (error instanceof WorkflowExecutionError) return studioError("NOT_FOUND", error.message);
    return studioError("INTERNAL_ERROR", "Graph index failed.");
  }
}

/**
 * P05 — V1 graph create: revision 1 from a template or an empty graph.
 * Returns `{ graphId, revision: 1 }`. The optional display name is
 * accepted but not persisted (the revisions table carries no name
 * column, verified; no migration is written for it).
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (body.name !== undefined && asString(body.name) === null) {
      return studioError("VALIDATION_ERROR", "name must be a non-empty string.");
    }
    const templateId = asString(body.templateId);
    if (body.templateId !== undefined && body.templateId !== null && templateId === null) {
      return studioError("VALIDATION_ERROR", "templateId must be a non-empty string.");
    }
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      const created = fixtureCreateGraph(
        localStores().workflow,
        resolved,
        { name: asString(body.name) ?? undefined, templateId },
      );
      return studioSuccess({ graphId: created.graphId, revision: created.revision }, undefined, 201);
    }
    let graph: CanvasGraph = { nodes: [], edges: [] };
    if (templateId) {
      const template = canvasTemplate(templateId);
      if (!template) return studioError("VALIDATION_ERROR", `Unknown template ${templateId}.`);
      graph = structuredClone(template.graph);
    }
    const graphId = randomUUID();
    const { canonical, sha256 } = canonicalSha256({ nodes: graph.nodes, edges: graph.edges });
    const stored = await insertGraphRevision({
      scope: resolved,
      graphId,
      revision: 1,
      canonicalJson: JSON.parse(canonical) as unknown,
      sha256,
      nodeCount: graph.nodes.length,
    });
    return studioSuccess({ graphId, revision: stored.revision }, undefined, 201);
  } catch (error) {
    const setup = setupRequiredResponse(error, "Workflows need the Studio data service.");
    if (setup) return setup;
    const lane = asLaneFailure(error);
    if (lane) return lane;
    if (error instanceof WorkflowExecutionError) return studioError("INTERNAL_ERROR", error.message);
    return studioError("INTERNAL_ERROR", "Graph creation failed.");
  }
}
