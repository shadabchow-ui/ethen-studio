import type { TokenBundle } from "./types";
import type {
  CredentialRecord,
  CredentialStatus,
  CredentialProvider,
} from "./credential-types";
import { assertNoPlaintextSecret } from "./credential-redaction";

// ── Token vault (encryption layer — fail-closed) ─────────────────────────────
//
// The repo currently has no encryption-at-rest pattern, no
// TOKEN_ENCRYPTION_KEY env var, and no secret-storage infrastructure.
// Until those are implemented, all token storage operations return
// `undefined` (not found) and writes are silently rejected.
//
// Connection metadata (no secrets) is stored separately via the
// connections table migration and queries module.

const VAULT_BLOCKED_MESSAGE =
  "Token storage unavailable — no encryption infrastructure is configured on this server.";

/** Store a token bundle for a connection. Always fails until encryption is available. */
export async function storeTokens(
  _connectionId: string,
  _tokens: TokenBundle
): Promise<void> {
  void _connectionId;
  void _tokens;
  if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
    console.warn(`[token-vault] ${VAULT_BLOCKED_MESSAGE}`);
  }
}

/** Retrieve a token bundle for a connection. Always returns undefined. */
export async function getTokens(
  _connectionId: string
): Promise<TokenBundle | undefined> {
  void _connectionId;
  return undefined;
}

/** Replace the token bundle for a connection (e.g. after refresh). */
export async function updateTokens(
  _connectionId: string,
  _tokens: TokenBundle
): Promise<void> {
  void _connectionId;
  void _tokens;
}

/** Delete / revoke the token bundle for a connection. */
export async function deleteTokens(_connectionId: string): Promise<void> {
  void _connectionId;
}

/**
 * Returns true if the encryption-backed token vault is configured and
 * operational. Always returns false until TOKEN_ENCRYPTION_KEY is provisioned.
 */
export function isVaultConfigured(): boolean {
  return false;
}

// ── Credential vault abstraction (metadata layer — setup-ready) ──────────────
//
// The CredentialVault provides a safe, setup-ready credential metadata store.
// It manages CredentialRecord entries — each containing metadata (no secrets)
// and an optional opaque CredentialSecretRef. Plaintext secrets are rejected
// at the boundary via assertNoPlaintextSecret before any record enters the vault.
//
// This abstraction is the future integration point for live connectors:
//   - Mock credentials use the mock path (CredentialStatus = "mock")
//   - Live credentials use the configured path (CredentialStatus = "configured")
//   - Setup-required connectors remain blocked until a configured credential exists
//   - Execute mode remains blocked regardless of credential state

/** In-memory credential record store. */
export class CredentialVault {
  private records = new Map<string, CredentialRecord>();

  /**
   * Register a credential record. Rejects records that contain plaintext
   * secrets anywhere in the metadata payload.
   */
  register(record: CredentialRecord): boolean {
    assertNoPlaintextSecret(
      record.metadata as unknown as Record<string, unknown>,
      `credential register "${record.id}"`,
    );

    if (this.records.has(record.id)) {
      return false;
    }
    this.records.set(record.id, record);
    return true;
  }

  /** Retrieve a credential record by id. Returns null if not found. */
  get(id: string): CredentialRecord | null {
    return this.records.get(id) ?? null;
  }

  /** List all registered credential records. */
  list(): CredentialRecord[] {
    return Array.from(this.records.values());
  }

  /** List credential records for a specific provider. */
  listByProvider(providerId: CredentialProvider): CredentialRecord[] {
    return this.list().filter(
      (r) => r.metadata.providerId === providerId,
    );
  }

  /** List credential records with a specific status. */
  listByStatus(status: CredentialStatus): CredentialRecord[] {
    return this.list().filter((r) => r.metadata.status === status);
  }

  /** Check if a credential record exists for the given id. */
  has(id: string): boolean {
    return this.records.has(id);
  }

  /** Update the status of an existing credential record. */
  updateStatus(id: string, status: CredentialStatus): boolean {
    const record = this.records.get(id);
    if (!record) return false;
    record.metadata.status = status;
    record.metadata.updatedAt = new Date().toISOString();
    return true;
  }

  /** Remove a credential record. */
  remove(id: string): boolean {
    return this.records.delete(id);
  }

  /** Returns the number of registered credential records. */
  get size(): number {
    return this.records.size;
  }

  /** Remove all credential records (useful in development/reset flows). */
  clear(): void {
    this.records.clear();
  }
}

/** Singleton vault instance for the application lifecycle. */
export const credentialVault = new CredentialVault();

/**
 * Returns true if the credential vault abstraction is operational (not the
 * encryption layer — see isVaultConfigured() for encryption status).
 *
 * The credential vault is always setup-ready: it can register, query, and
 * manage credential metadata without requiring encryption infrastructure.
 */
export function isCredentialVaultSetupReady(): boolean {
  return true;
}
