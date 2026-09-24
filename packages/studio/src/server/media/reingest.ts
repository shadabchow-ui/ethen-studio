/** Studio V5 media — legacy provider-URL reingest (STUDIO_07, server-only). */
import "server-only";
import { mediaError, MediaError } from "./types";
import type { IngestDescriptor } from "./types";
import { fetchWithGuard, type FetchOncePort } from "./fetch-guard";

export interface LegacySourceRef {
  legacyTable: string;
  legacyId: string;
  sourceUrl: string;
  expiresAt: string | null;
  /** Attempts already made (drives bounded retry). */
  attempts: number;
}

export type ReingestVerdict =
  | { outcome: "fetched"; bytes: Uint8Array; finalUrl: string }
  | { outcome: "retry"; reason: string; nextAttempt: number }
  | { outcome: "unavailable"; reason: string };

/** Bounded reingest attempts before a legacy URL is marked unavailable. */
export const REINGEST_MAX_ATTEMPTS = 3;

/**
 * Attempt one legacy reingest. Expired URLs and SSRF-blocked targets are
 * immediately unavailable (never retried, never fabricated); transport
 * failures retry up to REINGEST_MAX_ATTEMPTS, then mark unavailable.
 */
export async function reingestLegacySource(
  port: FetchOncePort,
  ref: LegacySourceRef,
  opts?: { timeoutMs?: number; maxBytes?: number; now?: string },
): Promise<ReingestVerdict> {
  const nowMs = opts?.now ? Date.parse(opts.now) : Date.now();
  if (ref.expiresAt) {
    const expiry = Date.parse(ref.expiresAt);
    if (Number.isFinite(expiry) && expiry <= nowMs) {
      return { outcome: "unavailable", reason: "EXPIRED_SOURCE" };
    }
  }
  try {
    const fetched = await fetchWithGuard(port, ref.sourceUrl, { timeoutMs: opts?.timeoutMs, maxBytes: opts?.maxBytes });
    return { outcome: "fetched", bytes: fetched.body, finalUrl: fetched.finalUrl };
  } catch (error) {
    if (error instanceof MediaError) {
      const reason = (error.details.reason as string | undefined) ?? error.code;
      if (reason === "EXPIRED_SOURCE" || reason === "SSRF_BLOCKED") {
        return { outcome: "unavailable", reason };
      }
      if (error.retryable && ref.attempts + 1 < REINGEST_MAX_ATTEMPTS) {
        return { outcome: "retry", reason, nextAttempt: ref.attempts + 1 };
      }
      return { outcome: "unavailable", reason };
    }
    if (ref.attempts + 1 < REINGEST_MAX_ATTEMPTS) {
      return { outcome: "retry", reason: "FETCH_FAILED", nextAttempt: ref.attempts + 1 };
    }
    return { outcome: "unavailable", reason: "FETCH_FAILED" };
  }
}

/** Unavailable marker: the honest terminal state for dead legacy URLs. */
export interface UnavailableMarker {
  legacyTable: string;
  legacyId: string;
  reason: string;
  attempts: number;
  markedAt: string;
}

export function markLegacyUnavailable(ref: LegacySourceRef, reason: string, now?: string): UnavailableMarker {
  if (!ref.legacyTable || !ref.legacyId) {
    throw mediaError("BAD_REQUEST", "Legacy ref needs a table and id to mark unavailable.", {});
  }
  return {
    legacyTable: ref.legacyTable,
    legacyId: ref.legacyId,
    reason,
    attempts: ref.attempts,
    markedAt: now ?? new Date().toISOString(),
  };
}

/** Build an IngestDescriptor from a successfully re-fetched legacy URL. */
export function legacyRefToDescriptor(
  ref: LegacySourceRef,
  input: { mediaType: IngestDescriptor["mediaType"]; mimeType: string; idempotencyKey: string },
): IngestDescriptor {
  return {
    sourceUrl: ref.sourceUrl,
    expiresAt: ref.expiresAt,
    expectedSha256: null,
    expectedByteSize: null,
    mediaType: input.mediaType,
    mimeType: input.mimeType,
    idempotencyKey: input.idempotencyKey,
  };
}
