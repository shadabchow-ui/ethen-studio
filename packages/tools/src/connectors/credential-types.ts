// ── Credential vault types — setup-ready credential abstraction ──────────────
//
// This module defines the type system for credential management. No real
// credentials, tokens, or secrets are stored. All secret values are represented
// as opaque references (CredentialSecretRef). Plaintext secrets must be
// rejected by callers before any record enters the vault.
//
// The vault remains fail-closed at the encryption layer (no TOKEN_ENCRYPTION_KEY,
// no at-rest encryption) but exposes a complete metadata-management abstraction
// that future live connectors can build on.

/** Lifecycle status of a single credential record. */
export type CredentialStatus =
  | "missing"            // no credential record exists for this provider
  | "mock"               // developer mock — zero external dependency, no real secret
  | "configured"         // credential metadata registered; not yet validated for live use
  | "invalid"            // credential metadata fails validation
  | "expired"            // credential has passed its configured expiry
  | "revoked"            // credential has been explicitly revoked
  | "blocked"            // credential blocked by trust/security policy
  | "vault_unavailable"; // encryption vault is not configured — credentials cannot be used

/** Display label for each credential status. */
export const CREDENTIAL_STATUS_LABELS: Record<CredentialStatus, string> = {
  missing: "Missing",
  mock: "Mock",
  configured: "Configured",
  invalid: "Invalid",
  expired: "Expired",
  revoked: "Revoked",
  blocked: "Blocked",
  vault_unavailable: "Vault Unavailable",
};

// ── Connector readiness state ─────────────────────────────────────────────────
//
// A single enriched status that combines connector definition status,
// credential state, vault availability, and policy gating into one
// honest label. This is the primary surface for UI readiness display
// and runtime gating decisions.

export type ConnectorReadinessState =
  | "mock"                  // zero external dependency; mock data only
  | "not_connected"         // no credential record exists
  | "connected_read_only"   // credential configured; reads allowed; writes blocked
  | "write_locked"          // credential configured but write capability denied
  | "approval_required"     // state-changing action blocked pending HITL approval
  | "execute_disabled"      // global execute-mode block (future enablement)
  | "vault_unavailable";    // encryption vault not configured; all live ops blocked

export const CONNECTOR_READINESS_LABELS: Record<ConnectorReadinessState, string> = {
  mock: "Mock",
  not_connected: "Not Connected",
  connected_read_only: "Connected (Read Only)",
  write_locked: "Write Locked",
  approval_required: "Approval Required",
  execute_disabled: "Execute Disabled",
  vault_unavailable: "Vault Unavailable",
};

/** Opaque reference to a stored secret. Never contains a plaintext value. */
export interface CredentialSecretRef {
  /** Stable reference identifier (opaque, not reversible). */
  ref: string;
  /** Provider this secret belongs to. */
  providerId: string;
}

/** Named permission scope granted by a credential. */
export interface CredentialScope {
  id: string;
  label: string;
  description: string;
}

/** Provider identifier for a credential (e.g. "google", "github", "stripe"). */
export type CredentialProvider = string;

/** Metadata record for a credential — no secrets stored here. */
export interface CredentialMetadata {
  id: string;
  providerId: CredentialProvider;
  accountLabel: string;
  status: CredentialStatus;
  scopes: CredentialScope[];
  createdAt: string;
  updatedAt: string;
  lastValidatedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

/** Full credential record combining metadata with a secret reference. */
export interface CredentialRecord {
  id: string;
  metadata: CredentialMetadata;
  /** Reference to the stored secret. Null when status is "missing" or "mock". */
  secretRef: CredentialSecretRef | null;
}

/** Result of validating a credential record against safety/configuration rules. */
export interface CredentialValidationResult {
  valid: boolean;
  status: CredentialStatus;
  reason: string;
  validatedAt: string;
  providerId: CredentialProvider;
}

/** Client-safe redacted view of a credential — no secret data exposed. */
export interface RedactedCredential {
  id: string;
  providerId: CredentialProvider;
  accountLabel: string;
  status: CredentialStatus;
  scopes: CredentialScope[];
  /** Always "[REDACTED]" when a secret ref exists, null otherwise. */
  secretRef: "[REDACTED]" | null;
  createdAt: string;
  updatedAt: string;
}

/** Readiness assessment for whether a connector can operate in live mode. */
export interface LiveConnectorReadiness {
  connectorId: string;
  /** True only when credentials are configured AND connector allows live mode. */
  ready: boolean;
  /** Current credential status for this connector. */
  credentialStatus: CredentialStatus;
  /** Human-readable explanation of the readiness assessment. */
  reason: string;
  /** ISO 8601 timestamp of this check. */
  checkedAt: string;
  /** Whether the connector requires credential setup before any live use. */
  setupRequired: boolean;
  /** Whether execute mode is currently permitted (always false in this job). */
  allowExecute: boolean;
}
