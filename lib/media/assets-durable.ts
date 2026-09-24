import "server-only";

/**
 * Durable, Supabase-backed Studio asset persistence.
 *
 * Kept out of ./assets because that module is browser-safe: it is re-exported
 * through lib/media/index.ts and reached by many client components. A dynamic
 * import() of the repository from there was still traced into the client graph
 * by Turbopack and broke the production build (GW-DEF-002). Importing the
 * repository statically is correct here because this module is server-only.
 */

import {
  getStudioRepository,
  hashStudioExternalReference,
} from "./persistence/studio-repository";
import {
  addAsset,
  getAssetById,
  getAssetsByProject,
} from "./assets";
import type { MediaAsset } from "./types";

/** Mirrors the id shape used by the in-memory asset store. */
function generateId(): string {
  return `asset_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export interface StudioAssetScope {
  organizationId: string;
  projectId: string;
  actorId: string;
}

function assertAssetScope(scope: StudioAssetScope): void {
  if (!scope.organizationId?.trim() || !scope.projectId?.trim() || !scope.actorId?.trim()) {
    throw new Error("Studio asset persistence requires organizationId, projectId, and actorId.");
  }
}

function isAssetProduction(): boolean {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return false;
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function addAssetDurable(scope: StudioAssetScope, asset: Omit<MediaAsset, "id" | "createdAt" | "updatedAt">): Promise<MediaAsset> {
  assertAssetScope(scope);
  if (isAssetProduction()) {
    const repo = getStudioRepository();
    const now = new Date().toISOString();
    const id = generateId();
    const created: MediaAsset = { ...asset, id, createdAt: now, updatedAt: now };
    const contentHash = (created.url ? hashStudioExternalReference(String(created.url)) : null);
    await repo.insert(scope, "studio_assets", { id, payload: { ...created, contentHash, asset_kind: (created as unknown as { kind?: string }).kind ?? (created as unknown as { type?: string }).type }, createdAt: now, updatedAt: now, deletedAt: null });
    return created;
  }
  return addAsset(asset);
}

export async function getAssetsDurable(scope: StudioAssetScope): Promise<readonly MediaAsset[]> {
  assertAssetScope(scope);
  if (isAssetProduction()) {
    const repo = getStudioRepository();
    const rows = await repo.list(scope, "studio_assets");
    return rows.map((r) => {
      const p = r.payload as Record<string, unknown>;
      return { id: String(r.id), projectId: String(r.scope.projectId), ownerId: String(r.scope.actorId), type: String(p.type ?? "image") as MediaAsset["type"], title: String(p.title ?? ""), toolId: String(p.toolId ?? ""), url: p.url ? String(p.url) : null, thumbnailUrl: p.thumbnailUrl ? String(p.thumbnailUrl) : null, mimeType: p.mimeType ? String(p.mimeType) : null, width: p.width != null ? Number(p.width) : null, height: p.height != null ? Number(p.height) : null, createdAt: String(r.createdAt), updatedAt: String(r.updatedAt ?? r.createdAt) } as MediaAsset;
    });
  }
  return getAssetsByProject(scope.projectId);
}

export async function getAssetByIdDurable(scope: StudioAssetScope, id: string): Promise<MediaAsset | null> {
  assertAssetScope(scope);
  if (isAssetProduction()) {
    const repo = getStudioRepository();
    const row = await repo.get(scope, "studio_assets", id);
    if (!row) return null;
    const p = row.payload as Record<string, unknown>;
    return { id: String(row.id), projectId: String(row.scope.projectId), ownerId: String(row.scope.actorId), type: String(p.type ?? "image") as MediaAsset["type"], title: String(p.title ?? ""), toolId: String(p.toolId ?? ""), url: p.url ? String(p.url) : null, thumbnailUrl: p.thumbnailUrl ? String(p.thumbnailUrl) : null, mimeType: p.mimeType ? String(p.mimeType) : null, width: p.width != null ? Number(p.width) : null, height: p.height != null ? Number(p.height) : null, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt ?? row.createdAt) } as MediaAsset;
  }
  const a = getAssetById(id);
  if (!a) return null;
  if (a.projectId !== scope.projectId) return null;
  return a;
}
