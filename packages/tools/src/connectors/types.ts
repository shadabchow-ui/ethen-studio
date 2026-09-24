/** Provider identifier (e.g. "shippo", "exa", "twelve-data"). */
export type ProviderId = string;

/** Lifecycle status of a single connector connection. */
export type ConnectionStatus =
  | "pending"
  | "active"
  | "expired"
  | "revoked"
  | "error";

/** Scope string granted by the provider during OAuth (e.g. "read", "write"). */
export type ScopeString = string;

/**
 * Server-only token bundle — never serialized to the client.
 * Stored in encrypted vault only.
 */
export interface TokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string; // ISO 8601
  tokenType: string; // e.g. "Bearer"
  scopes: ScopeString[];
  providerRaw?: Record<string, unknown>;
}

/** Connection metadata row — record of a user↔provider auth link. */
export interface ConnectionMetadata {
  id: string;
  userId: string;
  providerId: ProviderId;
  /** Display label shown in UI (e.g. email, account name). */
  accountLabel: string;
  status: ConnectionStatus;
  scopesGranted: ScopeString[];
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
  /** ISO 8601 — last successful token refresh or health probe. */
  lastHealthCheckAt: string | null;
  /** Arbitrary provider-supplied metadata (no secrets). */
  providerMeta: Record<string, unknown> | null;
}

/** Client-safe redacted view of a connection — no token data. */
export interface SafeConnection {
  id: string;
  providerId: ProviderId;
  accountLabel: string;
  status: ConnectionStatus;
  scopesGranted: ScopeString[];
  createdAt: string;
  updatedAt: string;
  lastHealthCheckAt: string | null;
  providerMeta: Record<string, unknown> | null;
}
