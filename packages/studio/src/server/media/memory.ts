/** Studio V5 media — in-memory stores for tests and worker binding (STUDIO_07). */
import "server-only";
import { randomUUID } from "node:crypto";
import type { ProjectScope } from "../../contracts/scope";
import { serializeScope } from "../../contracts/scope";
import type { DerivativeRecord, IngestStage, MediaProbe } from "./types";
import type { IngestAssetPort } from "./ingest";
import type { CanonicalTranscript } from "./transcript";
import type { MediaExportManifest } from "./exports";
import type { UnavailableMarker } from "./reingest";

export interface MediaProcessRecord {
  processId: string;
  scope: ProjectScope;
  idempotencyKey: string;
  stage: IngestStage;
  assetId: string | null;
  version: number | null;
  sha256: string | null;
  failureReason: string | null;
  detail: string | null;
  createdAt: string;
  updatedAt: string;
}

/** In-memory process ledger keyed by full scope + idempotency key. */
export function createMemoryProcessStore() {
  const rows = new Map<string, MediaProcessRecord>();
  const key = (scope: ProjectScope, idempotencyKey: string): string =>
    `${serializeScope(scope)}:${idempotencyKey}`;
  return {
    claim(scope: ProjectScope, idempotencyKey: string, now: string): { record: MediaProcessRecord; replayed: boolean } {
      const existing = rows.get(key(scope, idempotencyKey));
      if (existing) return { record: existing, replayed: true };
      const record: MediaProcessRecord = {
        processId: randomUUID(),
        scope,
        idempotencyKey,
        stage: "QUARANTINED",
        assetId: null,
        version: null,
        sha256: null,
        failureReason: null,
        detail: null,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(key(scope, idempotencyKey), record);
      return { record, replayed: false };
    },
    get(processId: string): MediaProcessRecord | null {
      for (const record of rows.values()) {
        if (record.processId === processId) return record;
      }
      return null;
    },
    mark(processId: string, patch: Partial<MediaProcessRecord> & { stage: IngestStage }, now: string): MediaProcessRecord | null {
      const record = ((): MediaProcessRecord | null => {
        for (const row of rows.values()) {
          if (row.processId === processId) return row;
        }
        return null;
      })();
      if (!record) return null;
      Object.assign(record, patch, { updatedAt: now });
      return record;
    },
    list(): readonly MediaProcessRecord[] {
      return [...rows.values()];
    },
  };
}

export type MemoryProcessStore = ReturnType<typeof createMemoryProcessStore>;

/** In-memory derivative/proxy store keyed by derivative id. */
export function createMemoryDerivativeStore() {
  const rows = new Map<string, DerivativeRecord>();
  return {
    put(record: DerivativeRecord): void {
      rows.set(record.derivativeId, record);
    },
    get(derivativeId: string): DerivativeRecord | null {
      return rows.get(derivativeId) ?? null;
    },
    listForAsset(assetId: string): readonly DerivativeRecord[] {
      return [...rows.values()].filter((row) => row.assetId === assetId);
    },
    markExpired(derivativeId: string, now: string): void {
      const record = rows.get(derivativeId);
      if (record) record.expiredAt = now;
    },
    list(): readonly DerivativeRecord[] {
      return [...rows.values()];
    },
  };
}

export type MemoryDerivativeStore = ReturnType<typeof createMemoryDerivativeStore>;

/** In-memory export manifest store keyed by (scope, idempotencyKey). */
export function createMemoryExportStore() {
  const rows = new Map<string, { manifest: MediaExportManifest; objectKey: string; idempotencyKey: string }>();
  return {
    put(scope: ProjectScope, idempotencyKey: string, manifest: MediaExportManifest, objectKey: string): void {
      rows.set(`${serializeScope(scope)}:${idempotencyKey}`, { manifest, objectKey, idempotencyKey });
    },
    get(scope: ProjectScope, idempotencyKey: string) {
      return rows.get(`${serializeScope(scope)}:${idempotencyKey}`) ?? null;
    },
    getById(exportId: string) {
      for (const row of rows.values()) {
        if (row.manifest.exportId === exportId) return row;
      }
      return null;
    },
  };
}

export type MemoryExportStore = ReturnType<typeof createMemoryExportStore>;

/** In-memory transcript store keyed by transcript id. */
export function createMemoryTranscriptStore() {
  const rows = new Map<string, { transcriptId: string; scope: ProjectScope; assetId: string; transcript: CanonicalTranscript; createdAt: string }>();
  return {
    put(transcriptId: string, scope: ProjectScope, assetId: string, transcript: CanonicalTranscript, createdAt: string): void {
      rows.set(transcriptId, { transcriptId, scope, assetId, transcript, createdAt });
    },
    get(transcriptId: string) {
      return rows.get(transcriptId) ?? null;
    },
  };
}

export type MemoryTranscriptStore = ReturnType<typeof createMemoryTranscriptStore>;

/** In-memory unavailable-marker ledger for dead legacy URLs. */
export function createMemoryUnavailableStore() {
  const rows = new Map<string, UnavailableMarker>();
  return {
    put(marker: UnavailableMarker): void {
      rows.set(`${marker.legacyTable}:${marker.legacyId}`, marker);
    },
    get(legacyTable: string, legacyId: string): UnavailableMarker | null {
      return rows.get(`${legacyTable}:${legacyId}`) ?? null;
    },
  };
}

export type MemoryUnavailableStore = ReturnType<typeof createMemoryUnavailableStore>;

/** In-memory IngestAssetPort: sha256 dedupe + version records for pipeline tests. */
export function createMemoryIngestAssets(): IngestAssetPort & {
  versions(): ReadonlyArray<{ assetId: string; version: number; sha256: string; storageKey: string; scope: ProjectScope }>;
  edges(): ReadonlyArray<{ childAssetId: string; childVersion: number; transform: string }>;
} {
  const versions: Array<{ assetId: string; version: number; sha256: string; storageKey: string; scope: ProjectScope }> = [];
  const edges: Array<{ childAssetId: string; childVersion: number; transform: string }> = [];
  const counters = new Map<string, number>();
  const assetKey = (scope: ProjectScope, assetId: string): string => `${serializeScope(scope)}:${assetId}`;
  return {
    async findVersionBySha256(scope, sha256) {
      const prefix = serializeScope(scope);
      const found = versions.find((v) => v.sha256.toLowerCase() === sha256.toLowerCase() && serializeScope(v.scope) === prefix);
      return found ? { assetId: found.assetId, version: found.version, storageKey: found.storageKey } : null;
    },
    async createAssetWithVersion(input) {
      const assetId = input.assetId ?? randomUUID();
      const next = (counters.get(assetKey(input.scope, assetId)) ?? 0) + 1;
      counters.set(assetKey(input.scope, assetId), next);
      versions.push({ assetId, version: next, sha256: input.sha256, storageKey: input.storageKey, scope: input.scope });
      return { assetId, version: next, storageKey: input.storageKey };
    },
    async recordLineageEdge(input) {
      edges.push({ childAssetId: input.childAssetId, childVersion: input.childVersion, transform: input.transform });
    },
    versions: () => [...versions],
    edges: () => [...edges],
  };
}

/** In-memory object storage for pipeline tests. */
export function createMemoryObjectStore() {
  const objects = new Map<string, Uint8Array>();
  return {
    async putObject(input: { scope: ProjectScope; keyPrefix: string; bytes: Uint8Array; contentType: string }): Promise<{ storageKey: string }> {
      void input.contentType;
      const storageKey = `${input.keyPrefix}/${serializeScope(input.scope)}/${randomUUID()}`;
      objects.set(storageKey, input.bytes);
      return { storageKey };
    },
    async getObject(storageKey: string): Promise<Uint8Array | null> {
      return objects.get(storageKey) ?? null;
    },
  };
}

export type MemoryObjectStore = ReturnType<typeof createMemoryObjectStore>;

/** Fake probe builder for decoder-port tests. */
export function testProbe(overrides: Partial<MediaProbe> = {}): MediaProbe {
  return {
    kind: "image",
    mimeType: "image/png",
    codec: "png",
    container: null,
    width: 64,
    height: 64,
    durationMs: null,
    sampleRateHz: null,
    channelCount: null,
    byteSize: 128,
    sha256: "0".repeat(64),
    warnings: [],
    ...overrides,
  };
}
