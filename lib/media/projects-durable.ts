import "server-only";

/**
 * Durable, Supabase-backed Studio project persistence.
 *
 * Kept out of ./projects because that module is browser-safe: it is imported by
 * client components and re-exported through lib/media/index.ts. A dynamic
 * import() of the repository from there was still traced into the client graph
 * by Turbopack and broke the production build (GW-DEF-002). Importing the
 * repository statically is correct here because this module is server-only.
 */

import { getStudioRepository } from "./persistence/studio-repository";
import {
  addProject,
  getProjectById,
} from "./projects";
import type {
  MediaProject,
  MediaProjectKind,
  MediaProjectStatus,
  MediaModality,
} from "./types";

export interface StudioProjectScope {
  organizationId: string;
  projectId: string;
  actorId: string;
}

function assertProjectScope(scope: StudioProjectScope): void {
  if (!scope.organizationId?.trim() || !scope.projectId?.trim() || !scope.actorId?.trim()) {
    throw new Error("Studio project persistence requires organizationId, projectId, and actorId.");
  }
}

function isProjectProduction(): boolean {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return false;
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function addProjectDurable(scope: StudioProjectScope, input: { name: string; description?: string | null; kind?: MediaProjectKind; modality?: MediaModality | null; status?: MediaProjectStatus; metadata?: Record<string, unknown> | null }): Promise<MediaProject> {
  assertProjectScope(scope);
  if (isProjectProduction()) {
    const repo = getStudioRepository();
    const now = new Date().toISOString();
    const proj = addProject({ ownerId: scope.actorId, name: input.name, description: input.description, kind: input.kind, modality: input.modality, status: input.status, metadata: input.metadata });
    await repo.insert(scope, "studio_projects", { id: proj.id, payload: { name: proj.name, description: proj.description, kind: proj.kind, status: proj.status }, createdAt: now, updatedAt: now, deletedAt: null });
    return proj;
  }
  return addProject({ ownerId: scope.actorId, name: input.name, description: input.description, kind: input.kind, modality: input.modality, status: input.status, metadata: input.metadata });
}

export async function getProjectDurable(scope: StudioProjectScope, id: string): Promise<MediaProject | null> {
  assertProjectScope(scope);
  if (isProjectProduction()) {
    const repo = getStudioRepository();
    const row = await repo.get(scope, "studio_projects", id);
    if (!row) return null;
    const p = row.payload as Record<string, unknown>;
    return { id: String(row.id), ownerId: String(row.scope.actorId), name: String(p.name ?? ""), description: p.description ? String(p.description) : null, kind: String(p.kind ?? "moodboard") as MediaProjectKind, status: String(p.status ?? "active") as MediaProjectStatus, modality: p.modality ? String(p.modality) as MediaModality : null, assetIds: [], jobIds: [], metadata: (p.metadata as Record<string, unknown> | null) ?? null, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt ?? row.createdAt) } as MediaProject;
  }
  const pr = getProjectById(id);
  if (!pr) return null;
  if (pr.ownerId !== scope.actorId) return null;
  return pr;
}
