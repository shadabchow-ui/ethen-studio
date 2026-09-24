/** Studio V5 data — scoped asset repository with immutable versions (STUDIO_02). */
import "server-only";
import { randomUUID } from "node:crypto";
import type { CasResult, Pagination } from "../ports/repositories";
import type { AssetKind, AssetProcessingState, AssetVersion } from "../../contracts/assets";
import { sameScope, type ProjectScope } from "../../contracts/scope";
import { dataError } from "./types";
import type { AssetReceipt, AssetRecord, Page, SearchEnvelope } from "./types";
import { paginate } from "./pagination";

const ASSET_KINDS: readonly AssetKind[] = ["image", "video", "audio", "transcript", "document", "package"];

const PROCESSING_STATES: readonly AssetProcessingState[] = [
  "QUARANTINED",
  "SCANNING",
  "NORMALIZING",
  "CUSTODY",
  "AVAILABLE",
  "TOMBSTONED",
];

/** Forward-only custody pipeline; mirrored by the SQL immutability trigger. */
const STATE_TRANSITIONS: Readonly<Record<AssetProcessingState, readonly AssetProcessingState[]>> = {
  QUARANTINED: ["SCANNING", "TOMBSTONED"],
  SCANNING: ["NORMALIZING", "TOMBSTONED"],
  NORMALIZING: ["CUSTODY", "TOMBSTONED"],
  CUSTODY: ["AVAILABLE", "TOMBSTONED"],
  AVAILABLE: ["TOMBSTONED"],
  TOMBSTONED: [],
};

export interface CreateAssetInput {
  filename: string;
  kind: AssetKind;
}

export interface AppendVersionInput {
  storageKey: string;
  sha256: string;
  byteSize: number;
  mediaMetadata?: Readonly<Record<string, unknown>>;
  origin: string;
  rightsSnapshotId?: string | null;
  processingState?: AssetProcessingState;
}

export interface AssetRepository {
  createAsset(scope: ProjectScope, input: CreateAssetInput): Promise<AssetRecord>;
  getAsset(scope: ProjectScope, assetId: string): Promise<AssetRecord | null>;
  listAssets(scope: ProjectScope, page: Pagination, query?: string): Promise<SearchEnvelope<AssetRecord>>;
  updateAssetCas(
    scope: ProjectScope,
    assetId: string,
    expectedRevision: number,
    patch: { filename?: string },
  ): Promise<CasResult<AssetRecord>>;
  appendVersion(scope: ProjectScope, assetId: string, input: AppendVersionInput): Promise<AssetVersion>;
  getVersion(scope: ProjectScope, assetId: string, version: number): Promise<AssetVersion | null>;
  listVersions(scope: ProjectScope, assetId: string, page: Pagination): Promise<Page<AssetVersion>>;
  transitionVersionState(
    scope: ProjectScope,
    assetId: string,
    version: number,
    to: AssetProcessingState,
  ): Promise<AssetVersion>;
  tombstoneAsset(scope: ProjectScope, assetId: string, reason: string): Promise<AssetReceipt | null>;
  getReceipt(scope: ProjectScope, assetId: string): Promise<AssetReceipt | null>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw dataError("BAD_REQUEST", `${label} is required.`);
  }
  return value;
}

function assertKind(kind: string): AssetKind {
  if ((ASSET_KINDS as readonly string[]).includes(kind)) return kind as AssetKind;
  throw dataError("BAD_REQUEST", `Unknown asset kind: ${kind}.`);
}

function assertProcessingState(state: string): AssetProcessingState {
  if ((PROCESSING_STATES as readonly string[]).includes(state)) return state as AssetProcessingState;
  throw dataError("BAD_REQUEST", `Unknown processing state: ${state}.`);
}

function cleanFilename(filename: string): string {
  const name = requireNonEmpty(filename, "filename");
  if (name.length > 255) throw dataError("BAD_REQUEST", "Filename exceeds 255 characters.");
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw dataError("BAD_REQUEST", "Filename must not contain path separators.");
  }
  return name;
}

function versionKey(assetId: string, version: number): string {
  return `${assetId}#${version}`;
}

export class MemoryAssetRepository implements AssetRepository {
  private assets = new Map<string, AssetRecord>();
  private versions = new Map<string, AssetVersion[]>();

  private owned(scope: ProjectScope, assetId: string): AssetRecord | null {
    const record = this.assets.get(assetId);
    if (!record || !sameScope(record.scope, scope)) return null;
    return record;
  }

  async createAsset(scope: ProjectScope, input: CreateAssetInput): Promise<AssetRecord> {
    const filename = cleanFilename(input.filename);
    const kind = assertKind(input.kind);
    const at = nowIso();
    const record: AssetRecord = {
      assetId: randomUUID(),
      scope: { ...scope },
      filename,
      kind,
      revision: 1,
      tombstonedAt: null,
      receipt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.assets.set(record.assetId, record);
    this.versions.set(record.assetId, []);
    return { ...record };
  }

  async getAsset(scope: ProjectScope, assetId: string): Promise<AssetRecord | null> {
    const record = this.owned(scope, assetId);
    return record ? { ...record } : null;
  }

  async listAssets(scope: ProjectScope, page: Pagination, query = ""): Promise<SearchEnvelope<AssetRecord>> {
    const needle = query.trim().toLowerCase();
    const rows = [...this.assets.values()]
      .filter((r) => sameScope(r.scope, scope) && r.tombstonedAt === null)
      .filter((r) => needle.length === 0 || r.filename.toLowerCase().includes(needle))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const result = paginate(rows, page.limit, page.cursor);
    return { ...result, query, truncated: result.nextCursor !== null };
  }

  async updateAssetCas(
    scope: ProjectScope,
    assetId: string,
    expectedRevision: number,
    patch: { filename?: string },
  ): Promise<CasResult<AssetRecord>> {
    const current = this.owned(scope, assetId);
    if (!current) return { ok: false, value: null, conflict: false };
    if (current.tombstonedAt !== null) {
      throw dataError("CONFLICT", "Tombstoned assets are immutable.", { assetId });
    }
    if (current.revision !== expectedRevision) return { ok: false, value: { ...current }, conflict: true };
    const updated: AssetRecord = {
      ...current,
      filename: patch.filename !== undefined ? cleanFilename(patch.filename) : current.filename,
      revision: current.revision + 1,
      updatedAt: nowIso(),
    };
    this.assets.set(assetId, updated);
    return { ok: true, value: { ...updated }, conflict: false };
  }

  async appendVersion(scope: ProjectScope, assetId: string, input: AppendVersionInput): Promise<AssetVersion> {
    const record = this.owned(scope, assetId);
    if (!record) throw dataError("NOT_FOUND", "Asset not found in this project scope.", { assetId });
    if (record.tombstonedAt !== null) {
      throw dataError("CONFLICT", "Cannot append versions to a tombstoned asset.", { assetId });
    }
    const storageKey = requireNonEmpty(input.storageKey, "storageKey");
    if (/^https?:\/\//i.test(storageKey)) {
      throw dataError("BAD_REQUEST", "storageKey must be an owned storage key, never a provider URL.");
    }
    const sha256 = requireNonEmpty(input.sha256, "sha256");
    if (!/^[0-9a-fA-F]{64}$/.test(sha256)) throw dataError("BAD_REQUEST", "sha256 must be 64 hex characters.");
    if (!Number.isInteger(input.byteSize) || input.byteSize < 0) {
      throw dataError("BAD_REQUEST", "byteSize must be a non-negative integer.");
    }
    const origin = requireNonEmpty(input.origin, "origin");
    const list = this.versions.get(assetId) ?? [];
    const version: AssetVersion = Object.freeze({
      assetId,
      version: list.length + 1,
      scope: { ...scope },
      kind: record.kind,
      storageKey,
      sha256: sha256.toLowerCase(),
      byteSize: input.byteSize,
      mediaMetadata: Object.freeze({ ...(input.mediaMetadata ?? {}) }),
      origin,
      rightsSnapshotId: input.rightsSnapshotId ?? null,
      processingState: input.processingState ? assertProcessingState(input.processingState) : "QUARANTINED",
      createdAt: nowIso(),
    });
    list.push(version);
    this.versions.set(assetId, list);
    return version;
  }

  async getVersion(scope: ProjectScope, assetId: string, version: number): Promise<AssetVersion | null> {
    if (!this.owned(scope, assetId)) return null;
    return (this.versions.get(assetId) ?? []).find((v) => v.version === version) ?? null;
  }

  async listVersions(scope: ProjectScope, assetId: string, page: Pagination): Promise<Page<AssetVersion>> {
    if (!this.owned(scope, assetId)) throw dataError("NOT_FOUND", "Asset not found in this project scope.", { assetId });
    const rows = [...(this.versions.get(assetId) ?? [])].sort((a, b) => b.version - a.version);
    return paginate(rows, page.limit, page.cursor);
  }

  async transitionVersionState(
    scope: ProjectScope,
    assetId: string,
    version: number,
    to: AssetProcessingState,
  ): Promise<AssetVersion> {
    const record = this.owned(scope, assetId);
    if (!record) throw dataError("NOT_FOUND", "Asset not found in this project scope.", { assetId });
    const list = this.versions.get(assetId) ?? [];
    const index = list.findIndex((v) => v.version === version);
    if (index < 0) throw dataError("NOT_FOUND", "Asset version not found.", { assetId, version });
    const current = list[index];
    const next = assertProcessingState(to);
    if (!STATE_TRANSITIONS[current.processingState].includes(next)) {
      throw dataError("CONFLICT", `Illegal processing transition ${current.processingState} -> ${next}.`, {
        assetId,
        version,
      });
    }
    const updated: AssetVersion = Object.freeze({ ...current, processingState: next });
    list[index] = updated;
    return updated;
  }

  async tombstoneAsset(scope: ProjectScope, assetId: string, reason: string): Promise<AssetReceipt | null> {
    const record = this.owned(scope, assetId);
    if (!record) return null;
    if (record.tombstonedAt !== null) return record.receipt ? { ...record.receipt } : null;
    const cleanReason = requireNonEmpty(reason, "reason");
    const list = this.versions.get(assetId) ?? [];
    const latest = list[list.length - 1] ?? null;
    const at = nowIso();
    const receipt: AssetReceipt = {
      assetId,
      scope: { ...scope },
      finalVersion: latest?.version ?? 0,
      finalSha256: latest?.sha256 ?? "",
      finalByteSize: latest?.byteSize ?? 0,
      tombstonedAt: at,
      reason: cleanReason,
    };
    const updated: AssetRecord = { ...record, tombstonedAt: at, receipt, updatedAt: at };
    this.assets.set(assetId, updated);
    return { ...receipt };
  }

  async getReceipt(scope: ProjectScope, assetId: string): Promise<AssetReceipt | null> {
    const record = this.owned(scope, assetId);
    if (!record || !record.receipt) return null;
    return { ...record.receipt };
  }
}

export { versionKey };
