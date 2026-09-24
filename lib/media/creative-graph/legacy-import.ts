/**
 * Studio V2 Job 01 — legacy snapshot import protocol as code.
 *
 * 1. Inventory legacy records by tenant/user/source (caller-supplied).
 * 2. Preserve a read-only snapshot plus counts/hash manifest (never mutated here).
 * 3. Map only proven ownership to authorized Platform projects.
 * 4. Quarantine unmapped records rather than invent ownership.
 * 5. Stable import IDs (idempotency keys) + source-ID mapping rows.
 * 6. Import immutable assets only where bytes/evidence exist.
 * 7. Unknown provenance is marked explicitly.
 * 8. Compare counts, relationships, blob hashes, scoped samples (report).
 * 9. Cutover by cohort happens in routes/UI, never here.
 * 10. Rollback reads stay available: imports only add rows, never rewrite.
 *
 * Quarantine is manifest-only (zero writes), so replaying a quarantined
 * record is trivially idempotent. Mapped rows replay through stable
 * idempotency keys plus the studio_legacy_imports mapping table.
 */

import { createHash, randomUUID } from "node:crypto";
import { ensureStudioProject } from "./service";
import type { StudioPersistenceScope, StudioRepository } from "../persistence/studio-repository";

export type LegacySource = "snapshot_project" | "snapshot_asset" | "seed";

export interface LegacyRecord {
  source: LegacySource;
  sourceId: string;
  kind: "project" | "asset";
  name: string;
  ownerRef: string | null;
  /** Present only when real bytes/evidence back the record. */
  evidence?: { storageKey?: string; contentHash?: string; byteSize?: number } | null;
  raw: Readonly<Record<string, unknown>>;
}

/** Proven ownership: caller attests this source record belongs to a Platform project. */
export interface OwnershipAttestation {
  organizationId: string;
  projectId: string;
  actorId: string;
}

export interface ImportPlanEntry {
  record: LegacyRecord;
  decision: "map" | "quarantine";
  reason: string;
  scope: StudioPersistenceScope | null;
  importKey: string;
  contentHash: string;
}

export interface LegacyManifest {
  source: string;
  generatedAt: string;
  total: number;
  byKind: Record<string, number>;
  mapped: number;
  quarantined: number;
  contentHash: string;
  samples: Array<{ sourceId: string; decision: string; reason: string }>;
}

export function stableImportKey(record: LegacyRecord): string {
  return `studio-import-${record.source}-${record.sourceId}`.slice(0, 120);
}

export function legacyContentHash(record: LegacyRecord): string {
  return createHash("sha256").update(JSON.stringify({ source: record.source, sourceId: record.sourceId, kind: record.kind, name: record.name, ownerRef: record.ownerRef, evidence: record.evidence ?? null })).digest("hex");
}

/** Step 8 (pre-flight): inventory + plan without writing anything. */
export function planLegacyImport(
  records: readonly LegacyRecord[],
  ownership: ReadonlyMap<string, OwnershipAttestation>,
): { plan: ImportPlanEntry[]; manifest: LegacyManifest } {
  const plan: ImportPlanEntry[] = [];
  for (const record of records) {
    const importKey = stableImportKey(record);
    const contentHash = legacyContentHash(record);
    const attestation = ownership.get(record.sourceId) ?? null;
    if (!attestation) {
      plan.push({ record, decision: "quarantine", reason: "no-proven-ownership", scope: null, importKey, contentHash });
      continue;
    }
    if (!attestation.organizationId?.trim() || !attestation.projectId?.trim() || !attestation.actorId?.trim()) {
      plan.push({ record, decision: "quarantine", reason: "invalid-attestation", scope: null, importKey, contentHash });
      continue;
    }
    if (record.kind === "asset" && !record.evidence?.contentHash && !record.evidence?.storageKey) {
      plan.push({ record, decision: "quarantine", reason: "no-bytes-no-evidence", scope: null, importKey, contentHash });
      continue;
    }
    plan.push({
      record, decision: "map", reason: "proven-ownership",
      scope: { organizationId: attestation.organizationId, projectId: attestation.projectId, actorId: attestation.actorId },
      importKey, contentHash,
    });
  }
  const byKind: Record<string, number> = {};
  for (const entry of plan) byKind[entry.record.kind] = (byKind[entry.record.kind] ?? 0) + 1;
  const manifest: LegacyManifest = {
    source: "legacy-snapshot",
    generatedAt: new Date().toISOString(),
    total: plan.length,
    byKind,
    mapped: plan.filter((entry) => entry.decision === "map").length,
    quarantined: plan.filter((entry) => entry.decision === "quarantine").length,
    contentHash: createHash("sha256").update(JSON.stringify(plan.map((entry) => [entry.record.source, entry.record.sourceId, entry.decision, entry.contentHash]))).digest("hex"),
    samples: plan.slice(0, 25).map((entry) => ({ sourceId: entry.record.sourceId, decision: entry.decision, reason: entry.reason })),
  };
  return { plan, manifest };
}

export interface ImportReport {
  manifest: LegacyManifest;
  mapped: number;
  replayed: number;
  quarantined: number;
  quarantinedReasons: Record<string, number>;
  mappings: Array<{ source: string; sourceId: string; targetKind: string; targetId: string | null }>;
}

/**
 * Apply a plan: mapped rows are created idempotently (stable keys + mapping
 * table); quarantined rows produce zero writes. Safe to replay.
 */
export async function applyLegacyImport(
  repo: StudioRepository,
  plan: readonly ImportPlanEntry[],
  manifest: LegacyManifest,
): Promise<ImportReport> {
  let mapped = 0;
  let replayed = 0;
  const quarantinedReasons: Record<string, number> = {};
  const mappings: ImportReport["mappings"] = [];

  for (const entry of plan) {
    if (entry.decision === "quarantine" || !entry.scope) {
      quarantinedReasons[entry.reason] = (quarantinedReasons[entry.reason] ?? 0) + 1;
      mappings.push({ source: entry.record.source, sourceId: entry.record.sourceId, targetKind: "quarantined", targetId: null });
      continue;
    }
    const scope = entry.scope;
    if (entry.record.kind === "project") {
      // Extension row is unique per platform project; the mapping row below
      // is the replay guard for the import itself.
      const extension = await ensureStudioProject(repo, scope, entry.record.name);
      const targetId = extension.id;
      const alreadyMapped = await findMapping(repo, scope, entry.record.source, entry.record.sourceId);
      if (alreadyMapped) {
        replayed += 1;
      } else {
        await repo.insert(scope, "studio_legacy_imports", {
          id: randomUUID(),
          payload: { source: entry.record.source, source_id: entry.record.sourceId, target_kind: "studio_project", target_id: targetId, content_hash: entry.contentHash, provenance: entry.record.ownerRef ? `snapshot-owner:${entry.record.ownerRef}` : "unknown" },
          createdAt: new Date().toISOString(),
          updatedAt: null,
          deletedAt: null,
        });
        mapped += 1;
      }
      mappings.push({ source: entry.record.source, sourceId: entry.record.sourceId, targetKind: "studio_project", targetId });
    } else {
      // Assets import as studio_assets rows only with evidence; the caller's
      // plan step already quarantined evidence-less records. Replay guard is
      // the mapping table (studio_assets carries no idempotency column).
      const alreadyMapped = await findMapping(repo, scope, entry.record.source, entry.record.sourceId);
      if (alreadyMapped) {
        replayed += 1;
        mappings.push({ source: entry.record.source, sourceId: entry.record.sourceId, targetKind: "studio_asset", targetId: null });
        continue;
      }
      const at = new Date().toISOString();
      const assetId = randomUUID();
      const evidence = entry.record.evidence ?? {};
      await repo.insert(scope, "studio_assets", {
        id: assetId,
        payload: {
          asset_kind: "import",
          content_hash: evidence.contentHash ?? entry.contentHash,
          metadata: {
            name: entry.record.name,
            import_source: entry.record.source,
            import_source_id: entry.record.sourceId,
            provenance: entry.record.ownerRef ? `snapshot-owner:${entry.record.ownerRef}` : "unknown",
            evidence,
          },
          lineage: {},
        },
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      });
      await repo.insert(scope, "studio_legacy_imports", {
        id: randomUUID(),
        payload: { source: entry.record.source, source_id: entry.record.sourceId, target_kind: "studio_asset", target_id: assetId, content_hash: entry.contentHash, provenance: entry.record.ownerRef ? `snapshot-owner:${entry.record.ownerRef}` : "unknown" },
        createdAt: at,
        updatedAt: null,
        deletedAt: null,
      });
      await repo.appendEvent(scope, { entityKind: "asset", entityId: assetId, revision: 1, type: "asset.imported", payload: { source: entry.record.source, source_id: entry.record.sourceId }, target: "studio-graph", actorId: scope.actorId });
      mapped += 1;
      mappings.push({ source: entry.record.source, sourceId: entry.record.sourceId, targetKind: "studio_asset", targetId: assetId });
    }
  }

  return { manifest, mapped, replayed, quarantined: plan.filter((entry) => entry.decision === "quarantine").length, quarantinedReasons, mappings };
}

async function findMapping(repo: StudioRepository, scope: StudioPersistenceScope, source: string, sourceId: string): Promise<boolean> {
  const rows = await repo.list(scope, "studio_legacy_imports");
  return rows.some((row) => {
    const payload = row.payload as Record<string, unknown>;
    return payload.source === source && payload.source_id === sourceId && (payload.target_kind as string) !== "quarantined";
  });
}

/** Adapt in-memory snapshot project shapes into LegacyRecords (inventory only, no writes). */
export function adaptSnapshotProjects(projects: readonly { id: string; name?: string | null; ownerId?: string | null }[]): LegacyRecord[] {
  return projects.map((project) => ({
    source: "snapshot_project" as const,
    sourceId: String(project.id),
    kind: "project" as const,
    name: project.name ?? String(project.id),
    ownerRef: project.ownerId ?? null,
    raw: project as unknown as Record<string, unknown>,
  }));
}

/** Adapt in-memory snapshot asset shapes into LegacyRecords (inventory only, no writes). */
export function adaptSnapshotAssets(assets: readonly { id: string; title?: string | null; name?: string | null; ownerId?: string | null; url?: string | null }[]): LegacyRecord[] {
  return assets.map((asset) => ({
    source: "snapshot_asset" as const,
    sourceId: String(asset.id),
    kind: "asset" as const,
    name: asset.title ?? asset.name ?? String(asset.id),
    ownerRef: asset.ownerId ?? null,
    // Snapshot/mock URLs are not bytes: evidence stays null so these quarantine
    // unless a caller supplies real storage evidence.
    evidence: null,
    raw: asset as unknown as Record<string, unknown>,
  }));
}
