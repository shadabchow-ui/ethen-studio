/** Studio V5 media — shared types and errors (STUDIO_07, server-only). */
import "server-only";
import type { ApiErrorCode } from "../../contracts/errors";
import { studioError } from "../../contracts/errors";
import type { AssetKind } from "../../contracts/assets";
import type { ProjectScope } from "../../contracts/scope";

/** Typed media-layer failure carrying a kernel API error code. */
export class MediaError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    retryable = false,
  ) {
    super(message);
    this.name = "MediaError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toApiError(requestId: string) {
    return studioError(this.code, this.message, requestId, this.retryable, this.details);
  }
}

export function mediaError(
  code: ApiErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  retryable = false,
): MediaError {
  return new MediaError(code, message, details, retryable);
}

/** HTTP status projection for MediaError codes (route adapters). */
export const MEDIA_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_REVISION: 409,
  QUOTE_EXPIRED: 410,
  APPROVAL_REQUIRED: 403,
  QUOTA_EXCEEDED: 429,
  POLICY_DENIED: 403,
  CONSENT_REQUIRED: 403,
  ENDPOINT_UNAVAILABLE: 503,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Ingest-side custody pipeline stages. Mirrors AssetProcessingState plus terminal legs. */
export type IngestStage =
  | "QUARANTINED"
  | "SCANNING"
  | "DECODING"
  | "NORMALIZING"
  | "CUSTODY"
  | "AVAILABLE"
  | "FAILED"
  | "UNAVAILABLE";

/** Terminal ingest failure reasons. Every failure quarantines; none fabricate custody. */
export type IngestFailureReason =
  | "EXPIRED_SOURCE"
  | "SSRF_BLOCKED"
  | "OVERSIZED"
  | "INVALID_CODEC"
  | "DECODER_FAILED"
  | "SCAN_REJECTED"
  | "SCAN_UNAVAILABLE"
  | "FETCH_FAILED"
  | "SOURCE_UNAVAILABLE";

/**
 * IngestDescriptor — the published STUDIO_07 contract for provider-output intake.
 * A provider URL is a transient fetch capability, never a canonical asset.
 */
export interface IngestDescriptor {
  /** Transient provider URL. Must be https; expires. Never persisted as the asset. */
  sourceUrl: string;
  /** ISO expiry of the provider URL, when the provider reports one. Null = unknown. */
  expiresAt: string | null;
  /** Expected sha256 when the provider reports one (verified after fetch). */
  expectedSha256: string | null;
  /** Expected byte size when the provider reports one (pre-check only). */
  expectedByteSize: number | null;
  mediaType: AssetKind;
  mimeType: string;
  /** Caller idempotency key; same key + same bytes replay the same process. */
  idempotencyKey: string;
}

export interface IngestRequest {
  scope: ProjectScope;
  descriptor: IngestDescriptor;
  /** Asset to attach a new version to, or null to create one. */
  assetId: string | null;
  /** Origin label recorded on the version (provider operation ref). */
  origin: string;
  /** Test clock override (ISO timestamp). Defaults to now. */
  now?: string;
  /**
   * Fixture-only: admit loopback http(s) source URLs through the fetch
   * guard. Refused in production; absent everywhere else.
   */
  allowInsecureLoopback?: boolean;
}

/** Decoded media facts. Only measured values — never estimates presented as truth. */
export interface MediaProbe {
  kind: AssetKind;
  mimeType: string;
  codec: string | null;
  container: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sampleRateHz: number | null;
  channelCount: number | null;
  byteSize: number;
  sha256: string;
  /** Non-fatal format observations for UI consumers (e.g. HDR downmap warning). */
  warnings: readonly string[];
}

/** Completed ingest outcome: either a custodied version or a duplicate replay. */
export interface IngestOutcome {
  processId: string;
  assetId: string;
  version: number;
  storageKey: string;
  sha256: string;
  probe: MediaProbe;
  /** True when the bytes already had custody and no new version was written. */
  duplicate: boolean;
  stage: IngestStage;
}

export type DerivativeKind = "proxy" | "thumbnail" | "waveform" | "render";

export interface DerivativeRecord {
  derivativeId: string;
  scope: ProjectScope;
  assetId: string;
  version: number;
  kind: DerivativeKind;
  /** Exact transcode/render spec this derivative was built from. */
  spec: Readonly<Record<string, unknown>>;
  storageKey: string;
  sha256: string;
  byteSize: number;
  /** Operational tool pins recorded at build time (ffmpeg version, etc). */
  toolVersions: Readonly<Record<string, string>>;
  createdAt: string;
  /** Proxies/thumbnails/waveforms expire (default 30d). Sources and renders never expire via this path. */
  expiresAt: string | null;
  expiredAt: string | null;
}
