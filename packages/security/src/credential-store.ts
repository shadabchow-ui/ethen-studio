// Provider Credential Store — secure credential abstraction for Ethen Desktop Code.
//
// This module defines the interface for provider credential storage without
/// exposing raw secrets to the renderer process. Two implementations exist:
//
// 1. Desktop safeStorage-backed (apps/desktop/ipc/credential-store.ts)
//    Uses Electron safeStorage.encryptString/decryptString via IPC.
//    Encrypted blobs are stored in a scoped file; only credential refs
//    (provider ID + label) are ever exposed to the renderer.
//
// 2. Web/env-var-backed (lib/security/web-credential-store.ts)
//    Delegates to existing process.env resolution (getProviderApiKey).
//    set/get/delete are no-ops — env vars are read-only at runtime.
//    This preserves existing web-mode behavior without leaking keys.
//
// SECURITY RULES
// - No provider key is ever written to plaintext JSON settings.
// - Credential refs never include the raw secret value.
// - Renderer requests for secrets go through IPC or daemon boundary.
// - Web mode continues to resolve keys from env vars only.

/**
 * A credential reference — identifies a stored credential without exposing
 * the raw secret. Safe to pass through IPC to the renderer.
 */
export interface CredentialRef {
  /** Provider ID that this credential belongs to (e.g. "openai", "anthropic") */
  providerId: string;
  /** Human-readable label for display in readiness UI */
  label: string;
  /** True when a secret is stored in the keychain for this provider */
  hasStoredSecret: boolean;
  /** True when the provider has a configured env var fallback */
  hasEnvFallback: boolean;
  /** When the credential was last stored/updated, ISO string or null */
  updatedAt: string | null;
}

/**
 * Result of retrieving a credential secret.
 * The secret value is only available on the main-process/daemon side.
 */
export interface CredentialSecretResult {
  /** The API key / secret value, or null if not found */
  secret: string | null;
  /** Source of the credential */
  source: "keychain" | "env-var" | "none";
}

/**
 * Provider credential store interface.
 *
 * Implementations MUST:
 * - Never write raw secrets to plaintext files or settings JSON
 * - Never expose raw secrets in CredentialRef listings
 * - Preserve existing env-var fallback behaviour for web mode
 * - Be safe to call when the backing store is unavailable
 */
export interface ProviderCredentialStore {
  /**
   * List all credential refs without exposing raw secrets.
   * Safe to call from the renderer or for UI display.
   */
  listCredentialRefs(): Promise<CredentialRef[]>;

  /**
   * Retrieve a stored secret for the given provider ID.
   * Returns null when no secret is stored and no env fallback exists.
   * This should only be called from the trusted main-process/daemon side.
   */
  getSecret(providerId: string): Promise<CredentialSecretResult>;

  /**
   * Store a secret for the given provider ID.
   * No-op for env-var-backed stores.
   */
  setSecret(providerId: string, secret: string): Promise<void>;

  /**
   * Delete a stored secret for the given provider ID.
   * No-op for env-var-backed stores.
   */
  deleteSecret(providerId: string): Promise<void>;

  /**
   * Whether this store is available for writing secrets.
   * Desktop safeStorage may be unavailable in headless/test environments
   * or when Electron APIs are not loaded.
   */
  isAvailable(): boolean;
}

// ── Known provider credential labels ────────────────────────────────────────

export const KNOWN_PROVIDER_CREDENTIALS: Array<{
  providerId: string;
  label: string;
  envVar: string;
}> = [
  { providerId: "openai", label: "OpenAI", envVar: "OPENAI_API_KEY" },
  { providerId: "anthropic", label: "Anthropic", envVar: "ANTHROPIC_API_KEY" },
  { providerId: "deepseek", label: "DeepSeek", envVar: "DEEPSEEK_API_KEY" },
  { providerId: "openai-compatible", label: "OpenAI-compatible", envVar: "ETHEN_OPENAI_COMPATIBLE_API_KEY" },
  { providerId: "google", label: "Google", envVar: "GOOGLE_API_KEY" },
  { providerId: "groq", label: "Groq", envVar: "GROQ_API_KEY" },
  { providerId: "mistral", label: "Mistral", envVar: "MISTRAL_API_KEY" },
  { providerId: "cohere", label: "Cohere", envVar: "COHERE_API_KEY" },
  { providerId: "together", label: "Together", envVar: "TOGETHER_API_KEY" },
  { providerId: "fireworks", label: "Fireworks", envVar: "FIREWORKS_API_KEY" },
  { providerId: "perplexity", label: "Perplexity", envVar: "PERPLEXITY_API_KEY" },
  { providerId: "xai", label: "xAI", envVar: "XAI_API_KEY" },
];
