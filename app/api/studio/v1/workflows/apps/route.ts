import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  WorkflowExecutionError,
  freezeWorkflowApp,
} from "@ethen/studio-core/server/workflow";
import { resolveProjectScope, requireServiceClient } from "../../_lib/supabase-data";
import { getCompiledDag, listGraphRevisions } from "../../_lib/supabase-workflow";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureFreezeApp, WorkflowLaneError } from "../../_lib/workflow-lane";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

/**
 * STUDIO_13 — V1 Workflow→App freeze: pins (graphId, revision, dagHash)
 * plus declared form schema as a private-workspace app. Rejects graphs
 * without input/output bindings (nothing invocable to freeze).
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const graphId = asString(body.graphId);
    const appId = asString(body.appId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!graphId) return studioError("VALIDATION_ERROR", "graphId is required.");
    if (!appId) return studioError("VALIDATION_ERROR", "appId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const revision = typeof body.revision === "number" ? body.revision : Number(body.revision);
    if (!Number.isInteger(revision) || revision <= 0) return studioError("VALIDATION_ERROR", "revision is required.");
    if (await isStudioFixtureLane()) {
      const app = fixtureFreezeApp(localStores().workflow, resolved, {
        graphId,
        revision,
        appId,
        ownerId: authorization.actorId ?? "unknown",
        invoke: asIdList(body.invoke),
        manage: asIdList(body.manage),
      });
      return studioSuccess({ app });
    }
    const dag = await getCompiledDag(resolved, graphId, revision);
    if (!dag) return studioError("NOT_FOUND", "No compiled DAG for this graph revision; compile first.");
    const { graph } = await listGraphRevisions(resolved, graphId);
    if (!graph || typeof graph !== "object") return studioError("NOT_FOUND", "Graph revision payload missing.");

    const frozen = freezeWorkflowApp(
      graph as never,
      {
        appId,
        graphId,
        frozenDagHash: dag.dagHash,
        frozenRevision: revision,
        inputs: [],
        outputs: [],
        ownerId: authorization.actorId ?? "unknown",
        invoke: asIdList(body.invoke),
        manage: asIdList(body.manage),
      },
    );
    if (!frozen.ok) {
      return studioError("VALIDATION_ERROR", frozen.diagnostics.map((entry) => entry.message).join(" "));
    }
    const client = requireServiceClient();
    const { error } = await client.from("studio_v5_workflow_apps").insert({
      app_id: appId,
      tenant_id: resolved.tenantId,
      project_id: resolved.projectId,
      graph_id: graphId,
      frozen_dag_hash: dag.dagHash,
      frozen_revision: revision,
      form_inputs: frozen.app.inputs,
      form_outputs: frozen.app.outputs,
      owner_id: authorization.actorId ?? resolved.tenantId,
      visibility: "private-workspace",
      invoke_grants: asIdList(body.invoke),
      manage_grants: asIdList(body.manage),
    });
    if (error) throw new WorkflowExecutionError("ADMISSION_FAILED", "App could not be frozen.");
    return studioSuccess({ app: frozen.app });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Workflows need the Studio data service.");
    if (setup) return setup;
    if (error instanceof WorkflowLaneError) {
      if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
      return studioError("VALIDATION_ERROR", error.message);
    }
    if (error instanceof WorkflowExecutionError) return studioError("INTERNAL_ERROR", error.message);
    return studioError("INTERNAL_ERROR", "Workflow app creation failed.");
  }
}
