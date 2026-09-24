/** Studio V5 media — quarantine/scan/decode/normalize/custody pipeline (STUDIO_07). */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { ProjectScope } from "../../contracts/scope";
import { mediaError, MediaError } from "./types";
import type { IngestDescriptor, IngestOutcome, IngestRequest, IngestStage, MediaProbe } from "./types";
import { fetchWithGuard, type FetchOncePort } from "./fetch-guard";
import { MEDIA_MAX_BYTES, validateProbe } from "./probe";

/** Malware/media scanner port. No local allow-fallback: unavailable scanner blocks ingest. */
export interface ScannerPort {
  scan(input: { bytes: Uint8Array; sha256: string; mimeType: string; filename: string }): Promise<void>;
}

/** Isolated decoder port. Runs in the restricted media worker; throws on crash. */
export interface DecoderPort {
  decode(bytes: Uint8Array, mimeType: string): Promise<Omit<MediaProbe, "byteSize" | "sha256" | "warnings"> & { warnings?: readonly string[] }>;
}

/** Normalizer port: canonical bytes + proxy inputs. Identity default for images. */
export interface NormalizerPort {
  normalize(bytes: Uint8Array, probe: MediaProbe): Promise<{ bytes: Uint8Array }>;
}

/** Minimal asset persistence surface the pipeline needs (j02 binds the real one). */
export interface IngestAssetPort {
  findVersionBySha256(scope: ProjectScope, sha256: string): Promise<{ assetId: string; version: number; storageKey: string } | null>;
  createAssetWithVersion(input: {
    scope: ProjectScope;
    assetId: string | null;
    kind: MediaProbe["kind"];
    filename: string;
    storageKey: string;
    sha256: string;
    byteSize: number;
    mediaMetadata: Readonly<Record<string, unknown>>;
    origin: string;
  }): Promise<{ assetId: string; version: number; storageKey: string }>;
  recordLineageEdge(input: {
    scope: ProjectScope;
    childAssetId: string;
    childVersion: number;
    parentAssetId: string | null;
    parentVersion: number | null;
    transform: string;
    jobId: string | null;
  }): Promise<void>;
}

/** Byte storage port (object store write). */
export interface IngestStoragePort {
  putObject(input: { scope: ProjectScope; keyPrefix: string; bytes: Uint8Array; contentType: string }): Promise<{ storageKey: string }>;
}

export interface IngestPorts {
  fetch: FetchOncePort;
  scan: ScannerPort;
  decode: DecoderPort;
  normalize?: NormalizerPort;
  assets: IngestAssetPort;
  storage: IngestStoragePort;
}

export interface IngestProgress {
  processId: string;
  stage: IngestStage;
  /** Measured 0..1 only at fetch/decode boundaries; null while indeterminate. */
  progress: number | null;
  detail: string;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function expiryMs(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Run the full ingest pipeline for one provider URL. Stages:
 * QUARANTINED (bytes held, untrusted) → SCANNING → DECODING →
 * NORMALIZING → CUSTODY (owned version written). Duplicate bytes replay the
 * existing version without writing. Every failure throws MediaError and the
 * caller records the process as FAILED/UNAVAILABLE — custody is never
 * fabricated from a provider URL.
 */
export async function runIngestPipeline(
  ports: IngestPorts,
  request: IngestRequest,
  onProgress?: (progress: IngestProgress) => void,
): Promise<IngestOutcome> {
  const processId = randomUUID();
  const now = request.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const descriptor: IngestDescriptor = request.descriptor;
  const emit = (stage: IngestStage, progress: number | null, detail: string): void => {
    onProgress?.({ processId, stage, progress, detail });
  };

  if (!descriptor.idempotencyKey || descriptor.idempotencyKey.trim().length === 0) {
    throw mediaError("BAD_REQUEST", "Ingest idempotency key is required.", { processId });
  }
  // Expired provider URLs die before any network or storage side effect.
  const expiry = expiryMs(descriptor.expiresAt);
  if (descriptor.expiresAt !== null && expiry === null) {
    throw mediaError("BAD_REQUEST", "Ingest expiresAt is not a valid timestamp.", { processId });
  }
  if (expiry !== null && expiry <= nowMs) {
    throw mediaError("QUOTE_EXPIRED", "Provider URL expired before ingest; re-request the output.", {
      processId,
      reason: "EXPIRED_SOURCE",
    });
  }
  const kindMax = MEDIA_MAX_BYTES[descriptor.mediaType];
  if (descriptor.expectedByteSize !== null && descriptor.expectedByteSize !== undefined) {
    if (!Number.isInteger(descriptor.expectedByteSize) || descriptor.expectedByteSize <= 0) {
      throw mediaError("BAD_REQUEST", "Expected byte size must be a positive integer.", { processId });
    }
    if (descriptor.expectedByteSize > kindMax) {
      throw mediaError("BAD_REQUEST", "Declared media size exceeds the ingest limit.", {
        processId,
        byteSize: descriptor.expectedByteSize,
        maxBytes: kindMax,
        reason: "OVERSIZED",
      });
    }
  }

  emit("QUARANTINED", 0, "Source admitted to quarantine; no trust yet.");
  let fetched: { body: Uint8Array; finalUrl: string; contentType: string | null };
  try {
    fetched = await fetchWithGuard(ports.fetch, descriptor.sourceUrl, {
      maxBytes: kindMax,
      allowInsecureLoopback: request.allowInsecureLoopback,
    });
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw mediaError("PROVIDER_ERROR", "Provider fetch failed.", { processId, reason: "FETCH_FAILED" }, true);
  }
  emit("QUARANTINED", 0.25, `Fetched ${fetched.body.byteLength} bytes from provider.`);
  const digest = sha256Hex(fetched.body);
  if (descriptor.expectedSha256 && descriptor.expectedSha256.toLowerCase() !== digest) {
    throw mediaError("PROVIDER_ERROR", "Fetched bytes do not match the provider-reported hash.", {
      processId,
      reason: "FETCH_FAILED",
    });
  }

  // Duplicate bytes replay existing custody: no second version, no second scan of truth.
  const existing = await ports.assets.findVersionBySha256(request.scope, digest);
  if (existing) {
    emit("CUSTODY", 1, "Bytes already in custody; replaying existing version.");
    const replayProbe = await safeDecode(ports, fetched.body, descriptor.mimeType, processId, fetched.body.byteLength, digest);
    return {
      processId,
      assetId: existing.assetId,
      version: existing.version,
      storageKey: existing.storageKey,
      sha256: digest,
      probe: replayProbe,
      duplicate: true,
      stage: "CUSTODY",
    };
  }

  emit("SCANNING", 0.4, "Scanner verdict required before decode.");
  try {
    await ports.scan.scan({
      bytes: fetched.body,
      sha256: digest,
      mimeType: descriptor.mimeType,
      filename: `ingest-${processId}`,
    });
  } catch (error) {
    if (error instanceof MediaError) throw error;
    const message = error instanceof Error ? error.message : "Scanner rejected the upload.";
    const unavailable = /unavailable|not configured|timeout/i.test(message);
    throw mediaError(
      unavailable ? "ENDPOINT_UNAVAILABLE" : "FORBIDDEN",
      message,
      { processId, reason: unavailable ? "SCAN_UNAVAILABLE" : "SCAN_REJECTED" },
      unavailable,
    );
  }

  emit("DECODING", 0.6, "Decoding in the isolated media worker.");
  const probe = await safeDecode(ports, fetched.body, descriptor.mimeType, processId, fetched.body.byteLength, digest);
  const validated = validateProbe(descriptor.mediaType, probe);

  emit("NORMALIZING", 0.8, "Normalizing canonical bytes.");
  const normalized = ports.normalize
    ? await ports.normalize.normalize(fetched.body, validated.probe)
    : { bytes: fetched.body };
  const finalDigest = sha256Hex(normalized.bytes);
  // Normalize may converge onto already-custodied bytes (e.g. re-encode): re-check.
  const converged = finalDigest !== digest
    ? await ports.assets.findVersionBySha256(request.scope, finalDigest)
    : null;
  if (converged) {
    emit("CUSTODY", 1, "Normalized bytes already in custody; replaying existing version.");
    return {
      processId,
      assetId: converged.assetId,
      version: converged.version,
      storageKey: converged.storageKey,
      sha256: finalDigest,
      probe: validated.probe,
      duplicate: true,
      stage: "CUSTODY",
    };
  }

  const stored = await ports.storage.putObject({
    scope: request.scope,
    keyPrefix: `studio-v5/${descriptor.mediaType}`,
    bytes: normalized.bytes,
    contentType: descriptor.mimeType,
  });
  const created = await ports.assets.createAssetWithVersion({
    scope: request.scope,
    assetId: request.assetId,
    kind: descriptor.mediaType,
    filename: `ingest-${processId}`,
    storageKey: stored.storageKey,
    sha256: finalDigest,
    byteSize: normalized.bytes.byteLength,
    mediaMetadata: {
      codec: validated.probe.codec,
      container: validated.probe.container,
      width: validated.probe.width,
      height: validated.probe.height,
      durationMs: validated.probe.durationMs,
      sampleRateHz: validated.probe.sampleRateHz,
      channelCount: validated.probe.channelCount,
      warnings: validated.warnings,
    },
    origin: request.origin,
  });
  await ports.assets.recordLineageEdge({
    scope: request.scope,
    childAssetId: created.assetId,
    childVersion: created.version,
    parentAssetId: null,
    parentVersion: null,
    transform: "provider-ingest",
    jobId: null,
  });
  emit("CUSTODY", 1, "Owned version written; custody established.");
  return {
    processId,
    assetId: created.assetId,
    version: created.version,
    storageKey: created.storageKey,
    sha256: finalDigest,
    probe: validated.probe,
    duplicate: false,
    stage: "CUSTODY",
  };
}

async function safeDecode(
  ports: IngestPorts,
  bytes: Uint8Array,
  mimeType: string,
  processId: string,
  byteSize: number,
  digest: string,
): Promise<MediaProbe> {
  let decoded: Omit<MediaProbe, "byteSize" | "sha256" | "warnings"> & { warnings?: readonly string[] };
  try {
    decoded = await ports.decode.decode(bytes, mimeType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Decoder crashed.";
    throw mediaError("BAD_REQUEST", `Media decode failed: ${message}`, {
      processId,
      reason: "DECODER_FAILED",
    });
  }
  return {
    ...decoded,
    byteSize,
    sha256: digest,
    warnings: decoded.warnings ?? [],
  };
}
