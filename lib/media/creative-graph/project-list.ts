import "server-only";

import { createServiceClient } from "@ethen/database/service";
import { getStudioRepository } from "../persistence/studio-repository";
import { isStudioLocalRequest, listStudioLocalProjects, localProject, STUDIO_LOCAL_USER_ID } from "@/lib/studio-local-project";

export interface CanonicalProjectListItem {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  role: "owner" | "member";
  provisioned: boolean;
  counts: { briefs: number; deliverables: number; directionSpecs: number; assets: number; decisionLocks: number };
}

/**
 * Studio V2 Job 01 — one canonical project list.
 * Platform projects where the actor is owner or member, each with studio
 * extension presence and canonical counts. Home, Projects, and Assets read
 * this (directly; the legacy graph/projects adapter was retired in M5 D3 and
 * browser surfaces read /api/studio/v1/projects).
 */
export async function listCanonicalProjects(actorId: string): Promise<CanonicalProjectListItem[]> {
  if (!actorId?.trim()) throw new Error("STUDIO_SCOPE_REQUIRED: actorId is required.");
  if (actorId === STUDIO_LOCAL_USER_ID && await isStudioLocalRequest()) {
    const repo = getStudioRepository();
    return Promise.all(listStudioLocalProjects().map(async (source) => {
      const project = localProject(source);
      const scope = { organizationId: `user:${actorId}`, projectId: project.id, actorId };
      const [briefs, deliverables, specs, assets, locks, extension] = await Promise.all([
      repo.list(scope, "studio_briefs"), repo.list(scope, "studio_deliverables"),
      repo.list(scope, "studio_creative_direction_specs"), repo.list(scope, "studio_assets"),
      repo.list(scope, "studio_decision_locks"), repo.list(scope, "studio_projects"),
      ]);
      return { ...project, provisioned: extension.length > 0, counts: {
        briefs: briefs.length, deliverables: deliverables.length, directionSpecs: specs.length,
        assets: assets.length, decisionLocks: locks.length,
      } };
    }));
  }
  const client = createServiceClient();
  if (!client) throw new Error("Project listing requires configured persistence.");
  const { data: owned, error: ownedError } = await client.from("projects").select("id,name,slug,status,owner_user_id").eq("owner_user_id", actorId).limit(100);
  if (ownedError) throw new Error(`Project listing failed: ${ownedError.message}`);
  const { data: memberships, error: memberError } = await client.from("project_members").select("project_id").eq("user_id", actorId).limit(100);
  if (memberError) throw new Error(`Project listing failed: ${memberError.message}`);
  const ownedRows = (owned ?? []) as Array<Record<string, unknown>>;
  const memberIds = ((memberships ?? []) as Array<{ project_id: string }>).map((row) => row.project_id).filter((id) => !ownedRows.some((row) => String(row.id) === id));
  let memberProjects: Array<Record<string, unknown>> = [];
  if (memberIds.length > 0) {
    const { data, error } = await client.from("projects").select("id,name,slug,status,owner_user_id").in("id", memberIds);
    if (error) throw new Error(`Project listing failed: ${error.message}`);
    memberProjects = (data ?? []) as Array<Record<string, unknown>>;
  }
  const repo = getStudioRepository();
  return Promise.all([...ownedRows, ...memberProjects].slice(0, 50).map(async (project) => {
    const projectId = String(project.id);
    const scope = { organizationId: `user:${String(project.owner_user_id ?? actorId)}`, projectId, actorId };
    const [briefs, deliverables, specs, assets, locks, extension] = await Promise.all([
      repo.list(scope, "studio_briefs").catch(() => []),
      repo.list(scope, "studio_deliverables").catch(() => []),
      repo.list(scope, "studio_creative_direction_specs").catch(() => []),
      repo.list(scope, "studio_assets").catch(() => []),
      repo.list(scope, "studio_decision_locks").catch(() => []),
      repo.list(scope, "studio_projects").catch(() => []),
    ]);
    return {
      id: projectId,
      name: String(project.name ?? "Untitled project"),
      slug: typeof project.slug === "string" ? project.slug : null,
      status: String(project.status ?? "active"),
      role: String(project.owner_user_id) === actorId ? "owner" : "member",
      provisioned: extension.length > 0,
      counts: { briefs: briefs.length, deliverables: deliverables.length, directionSpecs: specs.length, assets: assets.length, decisionLocks: locks.length },
    } satisfies CanonicalProjectListItem;
  }));
}
