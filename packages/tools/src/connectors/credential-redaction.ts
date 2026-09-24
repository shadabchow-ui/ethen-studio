// ── Credential redaction helpers ─────────────────────────────────────────────
//
// Every helper in this module guarantees that plaintext secrets are never
// exposed to logs, UI, audit records, or runtime fixtures. Secret-like fields
// are replaced with "[REDACTED]" or an opaque secret reference.

import type {
  CredentialRecord,
  CredentialMetadata,
  CredentialValidationResult,
  CredentialScope,
  RedactedCredential,
} from "./credential-types";

// ── Plaintext detection ──────────────────────────────────────────────────────

/** Patterns that indicate a value may contain a plaintext secret. */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /^sk[-_]/i,                                 // stripe-like secret key
  /^ghp_/i,                                   // github personal access token
  /^gho_/i,                                   // github oauth token
  /^ghu_/i,                                   // github user-to-server token
  /^ghs_/i,                                   // github server-to-server token
  /^ghr_/i,                                   // github refresh token
  /^xox[bpsar]-/i,                            // slack tokens
  /^ya29\./i,                                 // google access token
  /^eyJ/i,                                    // JWT header
  /^[A-Za-z0-9+/]{40,}={0,2}$/,              // base64-like long strings
  /^[A-Za-z0-9_-]{32,}$/,                     // hex/b64 long tokens
];

const SECRET_KEY_PATTERNS: RegExp[] = [
  /secret/i,
  /token/i,
  /key/i,
  /password/i,
  /passwd/i,
  /credential/i,
  /auth/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /client[_-]?secret/i,
  /private[_-]?key/i,
  /signing[_-]?key/i,
  /bearer/i,
];

/**
 * Returns true if the value looks like a plaintext secret that must not be
 * stored in the repo or runtime fixtures.
 */
export function looksLikePlaintextSecret(value: unknown): boolean {
  if (typeof value !== "string" || value.length < 8) return false;
  return SECRET_VALUE_PATTERNS.some((p) => p.test(value));
}

/**
 * Throws unconditionally if any field name or value in the provided record
 * contains a plaintext secret. Call this before storing any credential data.
 * Does not leak the secret value in the error message.
 */
export function assertNoPlaintextSecret(
  record: Record<string, unknown> | null | undefined,
  context?: string,
): void {
  if (!record) return;
  const ctx = context ? ` in ${context}` : "";

  for (const [key, value] of Object.entries(record)) {
    if (SECRET_KEY_PATTERNS.some((p) => p.test(key))) {
      throw new Error(
        `Plaintext secret rejected${ctx}: field "${key}" matches a secret-key pattern. ` +
          "Use a CredentialSecretRef instead.",
      );
    }
    if (typeof value === "string" && looksLikePlaintextSecret(value)) {
      throw new Error(
        `Plaintext secret rejected${ctx}: value in field "${key}" matches a known secret pattern. ` +
          "Use a CredentialSecretRef instead.",
      );
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      assertNoPlaintextSecret(value as Record<string, unknown>, `${ctx}/${key}`);
    }
  }
}

// ── Redaction ────────────────────────────────────────────────────────────────

/**
 * Redact a field name for safe display. Secret-like key names are replaced.
 */
export function redactCredentialKey(key: string): string {
  if (SECRET_KEY_PATTERNS.some((p) => p.test(key))) {
    return "[REDACTED_KEY]";
  }
  return key;
}

/**
 * Redact a credential record into a client-safe shape. All secret references
 * are replaced with the literal "[REDACTED]". Metadata fields are preserved.
 */
export function redactCredentialRecord(record: CredentialRecord): RedactedCredential {
  return {
    id: record.id,
    providerId: record.metadata.providerId,
    accountLabel: record.metadata.accountLabel,
    status: record.metadata.status,
    scopes: record.metadata.scopes,
    secretRef: record.secretRef ? "[REDACTED]" : null,
    createdAt: record.metadata.createdAt,
    updatedAt: record.metadata.updatedAt,
  };
}

/**
 * Recursively redact any secret-like keys or values from a metadata object.
 * Returns a new object — does not mutate the input.
 */
export function redactCredentialMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const redactedKey = redactCredentialKey(key);
    if (typeof value === "string" && looksLikePlaintextSecret(value)) {
      result[redactedKey] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[redactedKey] = redactCredentialMetadata(value as Record<string, unknown>);
    } else {
      result[redactedKey] = value;
    }
  }
  return result;
}

// ── Mock record factory ──────────────────────────────────────────────────────

/**
 * Create a safe mock credential record for demo/development use. The mock
 * record has status "mock", no secret reference, and is clearly labeled as
 * non-production.
 */
export function createMockCredentialRecord(
  providerId: string,
  scopes: CredentialScope[] = [],
): CredentialRecord {
  const now = new Date().toISOString();
  const id = `cred-mock-${providerId}-${Date.now()}`;

  return {
    id,
    metadata: {
      id,
      providerId,
      accountLabel: `mock-${providerId}@demo.local`,
      status: "mock",
      scopes,
      createdAt: now,
      updatedAt: now,
      lastValidatedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
    secretRef: null,
  };
}

// ── Metadata validation ──────────────────────────────────────────────────────

/**
 * Validate credential metadata against structural rules. Does not check
 * whether the credential is usable for live execution — that check is in
 * live-readiness.ts.
 */
export function validateCredentialMetadata(
  metadata: CredentialMetadata,
): CredentialValidationResult {
  const now = new Date().toISOString();
  const issues: string[] = [];

  if (!metadata.id || metadata.id.trim().length === 0) {
    issues.push("Credential id is empty or missing");
  }
  if (!metadata.providerId || metadata.providerId.trim().length === 0) {
    issues.push("Provider id is empty or missing");
  }
  if (metadata.status === "missing") {
    issues.push("Credential status is 'missing' — no record should exist with this status");
  }
  if (metadata.status === "blocked") {
    issues.push("Credential status is 'blocked' by policy");
  }

  // Status-specific validation
  if (metadata.status === "expired" && !metadata.lastValidatedAt) {
    issues.push("Expired credential has no lastValidatedAt timestamp");
  }
  if (metadata.status === "revoked" && !metadata.lastErrorAt) {
    issues.push("Revoked credential has no lastErrorAt timestamp");
  }

  if (issues.length > 0) {
    return {
      valid: false,
      status: "invalid",
      reason: issues.join("; "),
      validatedAt: now,
      providerId: metadata.providerId,
    };
  }

  return {
    valid: true,
    status: metadata.status,
    reason: "Credential metadata passes validation",
    validatedAt: now,
    providerId: metadata.providerId,
  };
}
