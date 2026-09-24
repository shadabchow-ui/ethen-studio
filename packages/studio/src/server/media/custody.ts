/**
 * Studio media custody (STUDIO M4) — provider-URL to owned version.
 *
 * Binds the STUDIO_07 ingest pipeline to concrete ports: SQL asset
 * persistence over j02, object storage (configured Supabase bucket or a
 * local-disk dev adapter), and scan/decode ports. Production scan/decode
 * have no env-constructible implementation yet, so non-fixture boot fails
 * closed naming the missing piece; fixture mode uses the honest fixture
 * ports (magic-byte verification, measured sizes/hashes, recorded
 * warnings). Provider-ingest roots carry no parent edge — job→asset
 * lineage is the generation row the ingest activity links.
 *
 * Lives in core so the worker and the fixture lane share one custody
 * kernel (the worker re-exports this module for its local imports).
 */
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildScope, type ProjectScope } from "../../contracts";
import type { AssetKind } from "../../contracts/assets";
import { runIngestPipeline, type IngestAssetPort, type IngestStoragePort } from "./ingest";
import type { FetchOncePort } from "./fetch-guard";
import { mediaError, type MediaProbe } from "./types";

/** Minimal SQL surface custody needs (the worker db satisfies this). */
export interface CustodyDb {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** SQL asset persistence over studio_v5_assets / asset_versions / lineage. */
export function createSqlIngestAssets(db: CustodyDb): IngestAssetPort {
  return {
    async findVersionBySha256(scope: ProjectScope, sha256: string) {
      const result = await db.query(
        `select v.asset_id, v.version, v.storage_key
           from public.studio_v5_asset_versions v
           join public.studio_v5_assets a on a.id = v.asset_id
          where v.project_id = $1 and v.sha256 = $2
            and a.tombstoned_at is null and a.deleted_at is null
          order by v.version desc limit 1`,
        [scope.projectId, sha256],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        assetId: String(row.asset_id ?? ""),
        version: Number(row.version ?? 0),
        storageKey: String(row.storage_key ?? ""),
      };
    },
    async createAssetWithVersion(input) {
      let assetId = input.assetId;
      if (!assetId) {
        const created = await db.query(
          `insert into public.studio_v5_assets (tenant_id, workspace_id, project_id, filename, kind)
           values ($1, $2, $3, $4, $5) returning id`,
          [scopeOf(input.scope).tenantId, input.scope.workspaceId, input.scope.projectId, input.filename, input.kind],
        );
        assetId = String(created.rows[0]?.id ?? "");
        if (!assetId) throw new Error("STUDIO_CUSTODY_INVALID: asset insert returned no id.");
      }
      const next = await db.query(
        "select coalesce(max(version), 0) + 1 as version from public.studio_v5_asset_versions where asset_id = $1",
        [assetId],
      );
      const version = Number(next.rows[0]?.version ?? 1);
      await db.query(
        `insert into public.studio_v5_asset_versions
           (asset_id, version, project_id, storage_key, sha256, byte_size, media_metadata, origin, processing_state)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'CUSTODY')`,
        [
          assetId,
          version,
          input.scope.projectId,
          input.storageKey,
          input.sha256,
          input.byteSize,
          JSON.stringify(input.mediaMetadata ?? {}),
          input.origin,
        ],
      );
      return { assetId, version, storageKey: input.storageKey };
    },
    async recordLineageEdge(input) {
      // Provider-ingest roots have no parent asset; their lineage is the
      // generation row linking job → asset versions. Edges record only
      // real asset-to-asset derivations.
      if (!input.parentAssetId || !input.parentVersion) return;
      await db.query(
        `insert into public.studio_v5_lineage_edges
           (tenant_id, project_id, parent_asset_id, parent_version, child_asset_id, child_version, transform, job_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict do nothing`,
        [
          scopeOf(input.scope).tenantId,
          input.scope.projectId,
          input.parentAssetId,
          input.parentVersion,
          input.childAssetId,
          input.childVersion,
          input.transform,
          input.jobId,
        ],
      );
    },
  };
}

function scopeOf(scope: ProjectScope): { tenantId: string; workspaceId: string; projectId: string } {
  return {
    tenantId: String(scope.tenantId),
    workspaceId: String(scope.workspaceId),
    projectId: String(scope.projectId),
  };
}

export interface ObjectStoreConfig {
  supabaseUrl: string;
  serviceKey: string;
  bucket: string;
  fetchImpl?: typeof fetch;
}

/** Supabase Storage object store (configured bucket, service role). */
export function createSupabaseObjectStore(config: ObjectStoreConfig): IngestStoragePort & {
  getObject(storageKey: string): Promise<Uint8Array>;
} {
  const fetchImpl = config.fetchImpl ?? fetch;
  const base = config.supabaseUrl.replace(/\/+$/, "");
  return {
    async putObject(input) {
      const key = `${input.keyPrefix.replace(/^\/+|\/+$/g, "")}/${randomUUID()}`;
      const response = await fetchImpl(`${base}/storage/v1/object/${config.bucket}/${key}`, {
        method: "POST",
        headers: {
          apikey: config.serviceKey,
          authorization: `Bearer ${config.serviceKey}`,
          "content-type": input.contentType,
        },
        // ES2022 lib has no BodyInit; ArrayBuffer is a valid body member
        // and the runtime value (Uint8Array) is accepted by fetch.
        body: input.bytes as unknown as ArrayBuffer,
      });
      if (!response.ok) {
        throw mediaError("PROVIDER_ERROR", `Object store write failed with status ${response.status}.`, {}, true);
      }
      return { storageKey: `${config.bucket}/${key}` };
    },
    async getObject(storageKey: string) {
      const key = storageKey.startsWith(`${config.bucket}/`) ? storageKey.slice(config.bucket.length + 1) : storageKey;
      const response = await fetchImpl(`${base}/storage/v1/object/${config.bucket}/${key}`, {
        headers: { apikey: config.serviceKey, authorization: `Bearer ${config.serviceKey}` },
      });
      if (!response.ok) {
        throw mediaError("PROVIDER_ERROR", `Object store read failed with status ${response.status}.`, {}, true);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

/** Local-disk dev adapter (fixture/dev only — never production custody). */
export function createLocalDiskStore(rootDir: string): IngestStoragePort & {
  getObject(storageKey: string): Promise<Uint8Array>;
} {
  if (process.env.NODE_ENV === "production") {
    throw new Error("STUDIO_CUSTODY_REFUSED: the local-disk store never serves production.");
  }
  mkdirSync(rootDir, { recursive: true });
  const keyToPath = (storageKey: string): string => {
    if (storageKey.includes("..") || storageKey.startsWith("/")) {
      throw mediaError("BAD_REQUEST", "Storage key escapes the custody root.");
    }
    return join(rootDir, storageKey);
  };
  return {
    async putObject(input) {
      const key = `${input.keyPrefix.replace(/^\/+|\/+$/g, "")}/${randomUUID()}`;
      const path = keyToPath(key);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, input.bytes);
      return { storageKey: key };
    },
    async getObject(storageKey: string) {
      return new Uint8Array(readFileSync(keyToPath(storageKey)));
    },
  };
}

const FIXTURE_MAGIC: ReadonlyArray<{ mime: string; magic: number[] }> = [
  { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
  { mime: "video/mp4", magic: [0x00, 0x00, 0x00] },
  { mime: "audio/mpeg", magic: [0x49, 0x44, 0x33] },
  { mime: "audio/wav", magic: [0x52, 0x49, 0x46, 0x46] },
  { mime: "model/gltf-binary", magic: [0x67, 0x6c, 0x54, 0x46] },
];

/**
 * Fixture scanner (fixture/dev only): verifies magic bytes match the
 * declared mime and records the verdict as evidence. Anything else is
 * rejected — the fixture never waves bytes through.
 */
export function createFixtureScanner(): {
  scan(input: { bytes: Uint8Array; sha256: string; mimeType: string; filename: string }): Promise<void>;
} {
  if (process.env.NODE_ENV === "production") {
    throw new Error("STUDIO_CUSTODY_REFUSED: the fixture scanner never serves production.");
  }
  return {
    async scan(input) {
      const known = FIXTURE_MAGIC.find((entry) => entry.mime === input.mimeType);
      if (!known) {
        throw mediaError("FORBIDDEN", `Fixture scanner cannot verify mime ${input.mimeType}.`, { reason: "SCAN_REJECTED" });
      }
      const head = Array.from(input.bytes.slice(0, known.magic.length));
      const matches = known.magic.every((byte, index) => head[index] === byte);
      if (!matches) {
        throw mediaError("FORBIDDEN", "Fixture bytes do not match the declared mime.", { reason: "SCAN_REJECTED" });
      }
    },
  };
}

/**
 * Fixture decoder: mime-conventional probe that satisfies V1 validity.
 * Codec/container/image-dimensions are conventional per mime (the
 * pipeline requires V1-supported values), sizes and hashes stay
 * measured, and the warning discloses the convention on every probe.
 */
const FIXTURE_PROBE: Readonly<Record<string, { codec: string | null; container: string | null; width: number | null; height: number | null }>> = {
  "image/png": { codec: "png", container: "png", width: 64, height: 64 },
  "image/jpeg": { codec: "jpeg", container: "jpeg", width: 64, height: 64 },
  "image/webp": { codec: "webp", container: "webp", width: 64, height: 64 },
  "video/mp4": { codec: "h264", container: "mp4", width: null, height: null },
  "audio/mpeg": { codec: "mp3", container: "mp3", width: null, height: null },
  "audio/wav": { codec: "pcm", container: "wav", width: null, height: null },
  "model/gltf-binary": { codec: null, container: "glb", width: null, height: null },
};

export function createFixtureDecoder(): {
  decode(bytes: Uint8Array, mimeType: string): Promise<{ kind: AssetKind; mimeType: string; codec: string | null; container: string | null; width: number | null; height: number | null; durationMs: number | null; sampleRateHz: number | null; channelCount: number | null; warnings?: readonly string[] }>;
} {
  if (process.env.NODE_ENV === "production") {
    throw new Error("STUDIO_CUSTODY_REFUSED: the fixture decoder never serves production.");
  }
  return {
    async decode(bytes, mimeType) {
      void bytes;
      const [family] = mimeType.split("/");
      const kind: AssetKind =
        family === "image" ? "image" : family === "video" ? "video" : family === "audio" ? "audio" : family === "model" ? "package" : "document";
      const conventional = FIXTURE_PROBE[mimeType] ?? { codec: null, container: null, width: null, height: null };
      return {
        kind,
        mimeType,
        codec: conventional.codec,
        container: conventional.container,
        width: conventional.width,
        height: conventional.height,
        durationMs: null,
        sampleRateHz: null,
        channelCount: null,
        warnings: [
          "fixture decode: codec, container, and image dimensions are mime-conventional, not measured; sizes and hashes are measured.",
        ],
      };
    },
  };
}

/** Descriptor mime → asset kind. Unknown families fail closed. */
export function mediaKindForMime(mimeType: string): AssetKind {
  const [family] = mimeType.split("/");
  if (family === "image") return "image";
  if (family === "video") return "video";
  if (family === "audio") return "audio";
  if (family === "model") return "package";
  if (mimeType === "text/vtt" || mimeType === "application/json") return "transcript";
  throw mediaError("BAD_REQUEST", `Provider mime ${mimeType} maps to no asset kind.`);
}

export interface StudioIngestPortDeps {
  db: CustodyDb;
  /** Fixture-only loopback fetch bypass (wired true in fixture mode). */
  allowInsecureLoopback?: boolean;
  fetch: FetchOncePort;
  scan: { scan(input: { bytes: Uint8Array; sha256: string; mimeType: string; filename: string }): Promise<void> };
  decode: {
    decode(bytes: Uint8Array, mimeType: string): Promise<Omit<MediaProbe, "byteSize" | "sha256" | "warnings"> & { warnings?: readonly string[] }>;
  };
  assets: IngestAssetPort;
  storage: IngestStoragePort;
}

export interface StudioIngestOptions {
  mediaType?: string;
  mimeType?: string;
  expectedByteSize?: number | null;
  expiresAt?: string | null;
  origin?: string;
}

/**
 * Studio ingest port: download one provider URL into owned custody and
 * return the version id. Scope comes from the job row; the descriptor
 * carries the adapter-measured media facts; lineage flows through the
 * pipeline into the generation link the activity writes.
 */
export function createStudioIngestPort(deps: StudioIngestPortDeps): {
  ingest(providerUrl: string, jobId: string, opts?: StudioIngestOptions): Promise<string>;
} {
  return {
    async ingest(providerUrl: string, jobId: string, opts: StudioIngestOptions = {}): Promise<string> {
      const job = await deps.db.query(
        "select tenant_id, workspace_id, project_id from public.studio_v5_jobs where job_id = $1",
        [jobId],
      );
      const row = job.rows[0];
      if (!row) {
        throw mediaError("BAD_REQUEST", `Ingest job ${jobId} is unknown.`);
      }
      const scope = buildScope(
        String(row.tenant_id ?? ""),
        String(row.workspace_id ?? "default"),
        String(row.project_id ?? ""),
      );
      const mimeType = opts.mimeType ?? "application/octet-stream";
      const outcome = await runIngestPipeline(
        { fetch: deps.fetch, scan: deps.scan, decode: deps.decode, assets: deps.assets, storage: deps.storage },
        {
          scope,
          descriptor: {
            sourceUrl: providerUrl,
            expiresAt: opts.expiresAt ?? null,
            expectedSha256: null,
            expectedByteSize: opts.expectedByteSize ?? null,
            mediaType: opts.mediaType ? mediaKindForMime(opts.mediaType) : mediaKindForMime(mimeType),
            mimeType,
            idempotencyKey: `ingest:${jobId}:${sha256Hex(providerUrl).slice(0, 16)}`,
          },
          assetId: null,
          origin: opts.origin ?? `provider-ingest:${jobId}`,
          allowInsecureLoopback: deps.allowInsecureLoopback,
        },
      );
      return `${outcome.assetId}:v${outcome.version}`;
    },
  };
}

/** Guarded single-fetch port over global fetch (worker network edge). */
export function createWorkerFetchPort(fetchImpl: typeof fetch = fetch): FetchOncePort {
  return {
    async fetchOnce(url: string, opts: { timeoutMs: number; maxBytes: number }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      try {
        const response = await fetchImpl(url, { redirect: "manual", signal: controller.signal });
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > opts.maxBytes) {
          throw mediaError("BAD_REQUEST", "Fetched bytes exceed the ingest limit.", { reason: "OVERSIZED" });
        }
        const headers: Record<string, string> = {};
        response.headers.forEach((value, name) => {
          headers[name] = value;
        });
        return { status: response.status, headers, body: new Uint8Array(buffer) };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
