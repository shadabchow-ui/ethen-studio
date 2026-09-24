/**
 * Studio V5 node cache validity (STUDIO_13). Pure.
 * A cache hit reuses outputs only while rights, pins and retention still
 * hold: consent/rights-snapshot drift, pin changes and retention expiry
 * each invalidate. Fail-closed: unknown or missing validity evidence
 * invalidates (recompute), never reuses.
 */
import "server-only";

export interface StoredNodeCacheEntry {
  cacheKey: string;
  dagHash: string;
  nodeId: string;
  /** Rights snapshot the output was produced under. */
  rightsSnapshotId: string | null;
  /** Consent ids the output was produced under (sorted). */
  consentIds: readonly string[];
  /** Pins hash the output was produced under. */
  pinsHash: string;
  /** ISO timestamp after which the entry must not be reused. */
  retainedUntil: string | null;
  outputHash: string;
}

export interface CacheValidityContext {
  rightsSnapshotId: string | null;
  consentIds: readonly string[];
  pinsHash: string;
  nowIso: string;
}

export type CacheInvalidReason =
  | "RIGHTS_CHANGED"
  | "CONSENT_CHANGED"
  | "PINS_CHANGED"
  | "RETENTION_EXPIRED"
  | "CACHE_KEY_CHANGED";

export type CacheValidity =
  | { valid: true }
  | { valid: false; reason: CacheInvalidReason; detail: string };

/**
 * Recheck a stored entry against current rights/pins/retention. Any drift
 * invalidates the entry — reuse requires an exact match on all axes.
 */
export function checkNodeCacheValidity(
  stored: StoredNodeCacheEntry,
  current: { cacheKey: string } & CacheValidityContext,
): CacheValidity {
  if (stored.cacheKey !== current.cacheKey) {
    return {
      valid: false,
      reason: "CACHE_KEY_CHANGED",
      detail: `Node ${stored.nodeId} cache identity changed; recompute required.`,
    };
  }
  if (stored.pinsHash !== current.pinsHash) {
    return {
      valid: false,
      reason: "PINS_CHANGED",
      detail: `Node ${stored.nodeId} pins changed; cached output is stale.`,
    };
  }
  if ((stored.rightsSnapshotId ?? null) !== (current.rightsSnapshotId ?? null)) {
    return {
      valid: false,
      reason: "RIGHTS_CHANGED",
      detail: `Node ${stored.nodeId} rights snapshot changed; cached output must not be reused.`,
    };
  }
  const storedConsent = [...stored.consentIds].sort().join(",");
  const currentConsent = [...current.consentIds].sort().join(",");
  if (storedConsent !== currentConsent) {
    return {
      valid: false,
      reason: "CONSENT_CHANGED",
      detail: `Node ${stored.nodeId} consent set changed; cached output must not be reused.`,
    };
  }
  if (stored.retainedUntil !== null && stored.retainedUntil <= current.nowIso) {
    return {
      valid: false,
      reason: "RETENTION_EXPIRED",
      detail: `Node ${stored.nodeId} cache retention expired at ${stored.retainedUntil}.`,
    };
  }
  return { valid: true };
}
