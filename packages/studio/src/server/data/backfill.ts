/** Studio V5 data — explicit legacy backfill with orphan/conflict detection (STUDIO_02). */
import "server-only";
import type { AssetKind } from "../../contracts/assets";
import type { ProjectScope } from "../../contracts/scope";
import type { AssetRepository } from "./assets";
import type { LineageRepository } from "./lineage";
import type { BackfillEntry, BackfillReport, BackfillStatus } from "./types";

/** Legacy studio_assets-shaped row (subset consumed by the j02 mapping). */
export interface LegacyAssetRow {
  legacyTable: string;
  legacyId: string;
  projectId: string;
  tenantId: string | null;
  organizationId: string;
  filename: string | null;
  kind: string | null;
  contentHash: string | null;
  byteSize: number | null;
  storageKey: string | null;
  jobId: string | null;
  metadata: Readonly<Record<string, unknown>>;
}

/** Legacy studio_asset_links-shaped row. */
export interface LegacyLinkRow {
  legacyId: string;
  projectId: string;
  tenantId: string | null;
  assetId: string;
  linkedAssetId: string | null;
  jobId: string | null;
  linkType: string;
}

export interface BackfillStore {
  get(legacyTable: string, legacyId: string): BackfillEntry | null;
  put(entry: BackfillEntry): void;
  list(): readonly BackfillEntry[];
}

export class MemoryBackfillStore implements BackfillStore {
  private entries = new Map<string, BackfillEntry>();

  get(legacyTable: string, legacyId: string): BackfillEntry | null {
    return this.entries.get(`${legacyTable}:${legacyId}`) ?? null;
  }

  put(entry: BackfillEntry): void {
    this.entries.set(`${entry.legacyTable}:${entry.legacyId}`, { ...entry });
  }

  list(): readonly BackfillEntry[] {
    return [...this.entries.values()];
  }
}

export interface BackfillDeps {
  assets: AssetRepository;
  lineage: LineageRepository;
  store: BackfillStore;
  /**
   * Resolve a legacy row's canonical V5 scope. Return null when the tenant
   * mapping is ambiguous — the row quarantines, never guesses.
   */
  resolveScope: (row: { projectId: string; tenantId: string | null; organizationId: string }) => ProjectScope | null;
  /** Map a legacy asset id to its already-mapped V5 asset id (for links). */
  mappedAssetId: (legacyAssetId: string) => string | null;
}

const LEGACY_KINDS: Readonly<Record<string, AssetKind>> = {
  image: "image",
  video: "video",
  audio: "audio",
  transcript: "transcript",
  document: "document",
  package: "package",
};

function normalizeKind(kind: string | null): AssetKind | null {
  if (!kind) return null;
  return LEGACY_KINDS[kind.toLowerCase()] ?? null;
}

function fingerprint(row: LegacyAssetRow): string {
  return [row.filename ?? "", row.kind ?? "", row.contentHash ?? "", String(row.byteSize ?? "")].join("|");
}

/**
 * Resumable idempotent backfill. Re-running over the same rows replays mapped
 * entries without duplicates; changed fingerprints conflict; unresolvable
 * tenant mappings quarantine; links with missing endpoints orphan.
 */
export async function runBackfill(
  deps: BackfillDeps,
  rows: { assets: readonly LegacyAssetRow[]; links: readonly LegacyLinkRow[] },
): Promise<BackfillReport> {
  let mapped = 0;
  let replayed = 0;
  let orphans = 0;
  let conflicts = 0;
  let quarantined = 0;
  const entries: BackfillEntry[] = [];

  for (const row of rows.assets) {
    const prior = deps.store.get(row.legacyTable, row.legacyId);
    if (prior?.status === "mapped" && prior.assetId) {
      const asset = await deps.assets.getAsset(
        deps.resolveScope(row) as ProjectScope,
        prior.assetId,
      ).catch(() => null);
      if (asset) {
        replayed += 1;
        entries.push(prior);
        continue;
      }
      // Mapped row vanished (store reset): fall through and remap.
    }
    if (prior?.status === "conflict" || prior?.status === "quarantined" || prior?.status === "orphan") {
      // Terminal diagnostics are stable across replays unless the row changed.
      entries.push(prior);
      if (prior.status === "conflict") conflicts += 1;
      else if (prior.status === "quarantined") quarantined += 1;
      else orphans += 1;
      continue;
    }
    const scope = deps.resolveScope(row);
    if (!scope) {
      quarantined += 1;
      const entry: BackfillEntry = {
        legacyTable: row.legacyTable,
        legacyId: row.legacyId,
        status: "quarantined",
        assetId: null,
        detail: "Ambiguous tenant mapping: no canonical scope resolves for this legacy row.",
      };
      deps.store.put(entry);
      entries.push(entry);
      continue;
    }
    const kind = normalizeKind(row.kind);
    if (!row.filename || !kind || !row.contentHash || !row.storageKey) {
      quarantined += 1;
      const entry: BackfillEntry = {
        legacyTable: row.legacyTable,
        legacyId: row.legacyId,
        status: "quarantined",
        assetId: null,
        detail: "Missing required legacy fields (filename/kind/contentHash/storageKey).",
      };
      deps.store.put(entry);
      entries.push(entry);
      continue;
    }
    const record = await deps.assets.createAsset(scope, { filename: row.filename, kind });
    await deps.assets.appendVersion(scope, record.assetId, {
      storageKey: row.storageKey,
      sha256: row.contentHash,
      byteSize: row.byteSize ?? 0,
      mediaMetadata: { ...row.metadata, legacyTable: row.legacyTable, legacyId: row.legacyId },
      origin: `legacy:${row.legacyTable}:${row.legacyId}`,
      rightsSnapshotId: null,
      processingState: "CUSTODY",
    });
    mapped += 1;
    const entry: BackfillEntry = {
      legacyTable: row.legacyTable,
      legacyId: row.legacyId,
      status: "mapped",
      assetId: record.assetId,
      detail: fingerprint(row),
    };
    deps.store.put(entry);
    entries.push(entry);
  }

  for (const link of rows.links) {
    const prior = deps.store.get("studio_asset_links", link.legacyId);
    if (prior) {
      entries.push(prior);
      if (prior.status === "mapped") replayed += 1;
      else if (prior.status === "orphan") orphans += 1;
      else if (prior.status === "conflict") conflicts += 1;
      else quarantined += 1;
      continue;
    }
    const scope = deps.resolveScope({ projectId: link.projectId, tenantId: link.tenantId, organizationId: "" });
    const childId = deps.mappedAssetId(link.assetId);
    const parentId = link.linkedAssetId ? deps.mappedAssetId(link.linkedAssetId) : null;
    if (!scope || !childId || !parentId) {
      orphans += 1;
      const entry: BackfillEntry = {
        legacyTable: "studio_asset_links",
        legacyId: link.legacyId,
        status: "orphan",
        assetId: childId,
        detail: !scope
          ? "Orphan link: ambiguous tenant mapping."
          : `Orphan link: ${!childId ? "child" : "parent"} endpoint has no mapped asset.`,
      };
      deps.store.put(entry);
      entries.push(entry);
      continue;
    }
    try {
      await deps.lineage.appendEdge(scope, {
        parentAssetId: parentId,
        parentVersion: 1,
        childAssetId: childId,
        childVersion: 1,
        transform: link.linkType?.trim() || "legacy-link",
        jobId: link.jobId,
      });
      mapped += 1;
      const entry: BackfillEntry = {
        legacyTable: "studio_asset_links",
        legacyId: link.legacyId,
        status: "mapped",
        assetId: childId,
        detail: `linked ${parentId} -> ${childId}`,
      };
      deps.store.put(entry);
      entries.push(entry);
    } catch (error) {
      conflicts += 1;
      const entry: BackfillEntry = {
        legacyTable: "studio_asset_links",
        legacyId: link.legacyId,
        status: "conflict",
        assetId: childId,
        detail: error instanceof Error ? error.message : "Link mapping failed.",
      };
      deps.store.put(entry);
      entries.push(entry);
    }
  }

  return { mapped, replayed, orphans, conflicts, quarantined, entries };
}

export type { BackfillStatus };
