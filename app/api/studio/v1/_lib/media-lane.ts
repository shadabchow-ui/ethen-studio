import "server-only";

/**
 * P03 — fixture-lane media repository (RC-3 media).
 *
 * Mirrors the `MediaExportView` shapes the export routes consume, backed
 * by `localStores().media` (the kernel memory export store, never a
 * rewrite). Routes branch onto these functions only when
 * `isStudioFixtureLane()` holds. A fixture claim records the export row
 * (metadata manifest, lifecycle `pending`): packaging bytes is worker
 * work, and the fixture lane has no worker — the same honest pending
 * the Supabase claim row carries before the worker builds it.
 */
import { createHash, randomUUID } from "node:crypto";
import type { ProjectScope } from "@ethen/studio-core/contracts";
import {
  MEDIA_EXPORT_PRESETS,
  assertMediaExportPreset,
  type ExportPinnedInput,
  type MediaExportManifest,
  type MediaExportPreset,
} from "@ethen/studio-core/server/media";
import type { LocalMediaStores } from "./local-lane";

export interface FixtureScope {
  scope: ProjectScope;
}

function sameScope(a: ProjectScope, b: ProjectScope): boolean {
  return (
    String(a.tenantId) === String(b.tenantId) &&
    String(a.workspaceId) === String(b.workspaceId) &&
    String(a.projectId) === String(b.projectId)
  );
}

function scopeKey(scope: ProjectScope): string {
  return `${String(scope.tenantId)}:${String(scope.workspaceId)}:${String(scope.projectId)}`;
}

export interface FixtureExportView {
  exportId: string;
  preset: string;
  presetVersion: string;
  title: string;
  lifecycle: string;
  manifestHash: string | null;
  decisionId: string | null;
  objectKey: string | null;
  replayed: boolean;
}

function toView(
  stores: LocalMediaStores,
  manifest: MediaExportManifest,
  objectKey: string,
  replayed: boolean,
): FixtureExportView {
  return {
    exportId: manifest.exportId,
    preset: manifest.preset,
    presetVersion: manifest.presetVersion,
    title: manifest.title,
    lifecycle: stores.lifecycles.get(manifest.exportId) ?? "pending",
    manifestHash: manifest.manifestHash,
    decisionId: manifest.decisionId,
    objectKey,
    replayed,
  };
}

/** Claim an idempotent fixture export (same key replays the same row). */
export function fixtureClaimExport(
  stores: LocalMediaStores,
  scope: FixtureScope,
  input: { idempotencyKey: string; preset: string; title: string; inputs: readonly ExportPinnedInput[] },
): FixtureExportView {
  assertMediaExportPreset(input.preset);
  const preset: MediaExportPreset = input.preset;
  const existing = stores.exports.get(scope.scope, input.idempotencyKey);
  if (existing && sameScope(existing.manifest.scope, scope.scope)) {
    return toView(stores, existing.manifest, existing.objectKey, true);
  }
  const now = new Date().toISOString();
  const base = {
    exportId: randomUUID(),
    preset,
    presetVersion: MEDIA_EXPORT_PRESETS[preset].version,
    title: input.title,
    scope: scope.scope,
    inputs: [...input.inputs],
    rightsSnapshotIds: {},
    lineage: [],
    identityRefs: [],
    decisionId: "fixture:pending",
    interchangeWarnings: [],
    files: [],
  };
  const manifestHash = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  const manifest: MediaExportManifest = { ...base, manifestHash, exportedAt: now };
  const objectKey = `fixture-pending/${manifest.exportId}`;
  stores.exports.put(scope.scope, input.idempotencyKey, manifest, objectKey);
  stores.exportOrder.push({ scopeKey: scopeKey(scope.scope), exportId: manifest.exportId });
  stores.lifecycles.set(manifest.exportId, "pending");
  return toView(stores, manifest, objectKey, false);
}

/** Scoped read of one fixture export, or null outside this scope. */
export function fixtureGetExport(
  stores: LocalMediaStores,
  scope: FixtureScope,
  exportId: string,
): FixtureExportView | null {
  const row = stores.exports.getById(exportId);
  if (!row || !sameScope(row.manifest.scope, scope.scope)) return null;
  return toView(stores, row.manifest, row.objectKey, false);
}

/** Newest-first fixture exports for this scope (empty is legitimate). */
export function fixtureListExports(stores: LocalMediaStores, scope: FixtureScope): FixtureExportView[] {
  const key = scopeKey(scope.scope);
  const views: FixtureExportView[] = [];
  for (let index = stores.exportOrder.length - 1; index >= 0; index -= 1) {
    const entry = stores.exportOrder[index];
    if (entry.scopeKey !== key) continue;
    const row = stores.exports.getById(entry.exportId);
    if (row && sameScope(row.manifest.scope, scope.scope)) {
      views.push(toView(stores, row.manifest, row.objectKey, false));
    }
  }
  return views;
}
