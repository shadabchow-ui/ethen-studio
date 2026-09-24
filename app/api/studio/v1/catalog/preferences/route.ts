import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { requireServiceClient, resolveProjectScope } from "../../_lib/supabase-data";
import { resolveEndpointAlias } from "../../_lib/supabase-catalog";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import { listMemoryPreferences, saveMemoryPreferences } from "../../_lib/memory-preferences";
import {
  handlePreferencesGet,
  handlePreferencesPut,
  type PreferencesOutcome,
  type PreferencesStore,
} from "../../_lib/preferences-logic";

export const dynamic = "force-dynamic";

function toResponse(outcome: PreferencesOutcome): Response {
  if (outcome.kind === "passthrough") return outcome.response;
  if (outcome.kind === "error") return studioError(outcome.code, outcome.message);
  return studioSuccess({ favorites: outcome.favorites, recents: outcome.recents });
}

/**
 * Studio V5 M2 — catalog preferences (favourite + recent endpoints, per
 * project and user, member-only). Thin adapter: real guards plus the lane
 * store, decided by the shared preferences logic.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    const projectId = request.nextUrl.searchParams.get("projectId");
    return toResponse(
      await handlePreferencesGet({
        actor: { actorId: session.actorId, response: session.response },
        projectId,
        authz: { authorize: async (id) => requireProject({ api: true, projectId: id }) },
        openStore: () => resolveStore(projectId),
      }),
    );
  } catch (error) {
    const setup = setupRequiredResponse(error, "Catalog preferences need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Preferences lookup failed.");
  }
}

export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    const projectId = request.nextUrl.searchParams.get("projectId");
    const body = await readStudioJson(request);
    return toResponse(
      await handlePreferencesPut({
        actor: { actorId: session.actorId, response: session.response },
        projectId,
        body,
        authz: { authorize: async (id) => requireProject({ api: true, projectId: id }) },
        openStore: () => resolveStore(projectId),
      }),
    );
  } catch (error) {
    const setup = setupRequiredResponse(error, "Catalog preferences need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Preferences update failed.");
  }
}

async function resolveStore(projectId: string | null): Promise<PreferencesStore | null> {
  if (!projectId) return null;
  if (await isStudioLocalRequest()) {
    return {
      get: async (project, user) => listMemoryPreferences(project, user),
      put: async (project, user, lists) => saveMemoryPreferences(project, user, lists),
    };
  }
  const resolved = await resolveProjectScope(projectId);
  if (!resolved) return null;
  const client = requireServiceClient();
  return {
    get: async (project, user) => {
      const { data, error } = await client
        .from("studio_v5_catalog_preferences")
        .select("kind,endpoint_id,position")
        .eq("project_id", project)
        .eq("user_id", user)
        .order("position");
      if (error) throw new Error(`Failed to list preferences: ${error.message}`);
      const favorites: string[] = [];
      const recents: string[] = [];
      for (const row of ((data ?? []) as { kind: string; endpoint_id: string }[])) {
        const canonical = (await resolveEndpointAlias(row.endpoint_id)) ?? row.endpoint_id;
        if (row.kind === "favorite") favorites.push(canonical);
        else if (row.kind === "recent") recents.push(canonical);
      }
      return { favorites, recents };
    },
    put: async (project, user, lists) => {
      const kinds = [
        { kind: "favorite", ids: lists.favorites },
        { kind: "recent", ids: lists.recents },
      ] as const;
      for (const { kind, ids } of kinds) {
        if (ids === undefined) continue;
        const { error: deleteError } = await client
          .from("studio_v5_catalog_preferences")
          .delete()
          .eq("project_id", project)
          .eq("user_id", user)
          .eq("kind", kind);
        if (deleteError) throw new Error(`Failed to replace preferences: ${deleteError.message}`);
        if (ids.length === 0) continue;
        const { error: insertError } = await client.from("studio_v5_catalog_preferences").insert(
          ids.map((endpointId, position) => ({
            tenant_id: resolved.tenantId,
            workspace_id: resolved.workspaceId,
            project_id: project,
            user_id: user,
            kind,
            endpoint_id: endpointId,
            position,
          })),
        );
        if (insertError) throw new Error(`Failed to store preferences: ${insertError.message}`);
      }
      const readBack = async (kind: "favorite" | "recent", provided: readonly string[] | undefined): Promise<string[]> => {
        if (provided !== undefined) return [...provided];
        const { data, error } = await client
          .from("studio_v5_catalog_preferences")
          .select("endpoint_id")
          .eq("project_id", project)
          .eq("user_id", user)
          .eq("kind", kind)
          .order("position");
        if (error) throw new Error(`Failed to list preferences: ${error.message}`);
        return ((data ?? []) as { endpoint_id: string }[]).map((row) => row.endpoint_id);
      };
      return {
        favorites: await readBack("favorite", lists.favorites),
        recents: await readBack("recent", lists.recents),
      };
    },
  };
}
