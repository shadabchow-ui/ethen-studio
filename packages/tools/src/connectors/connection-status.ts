// ── Connector-level status, health, and rate-limit metadata ─────────────────

/**
 * High-level readiness status of a connector provider.
 * Distinct from lib/connectors/types.ts ConnectionStatus which tracks a
 * single user↔provider connection lifecycle.
 */
export type ConnectorStatus =
  | "setup-required"   // live connector that needs credential configuration
  | "mock"             // developer mock with zero external dependency
  | "live"             // production connector with configured credentials
  | "degraded"         // live connector experiencing provider-side issues
  | "unavailable"      // known provider outage or blocked by policy
  | "planned";         // contract-only; no implementation yet

/** Health probe result for a connector provider. */
export interface ConnectorHealth {
  status: ConnectorStatus;
  /** Human-readable status detail. */
  detail: string;
  /** Whether the connector responded to the last health check. */
  responsive: boolean;
  /** ISO 8601 timestamp of last successful health check. */
  lastCheckedAt: string | null;
  /** ISO 8601 timestamp of last error. */
  lastErrorAt: string | null;
  /** Error message from the last health check failure. */
  lastErrorMessage: string | null;
}

/** Rate-limit metadata surfaced to consumers. */
export interface ConnectorRateLimit {
  /** Maximum requests allowed in the current window. */
  limit: number | null;
  /** Number of requests remaining in the current window. */
  remaining: number | null;
  /** ISO 8601 timestamp when the rate-limit window resets. */
  resetAt: string | null;
  /** Human-readable rate-limit summary (e.g. "1000 req/hour"). */
  summary: string | null;
}
