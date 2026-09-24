import { getTokens, isVaultConfigured } from "./vault";
import type { SafeConnection } from "./types";
import { redactAccountLabel } from "./redact";

// ── Token availability check ──────────────────────────────────────────────

export interface TokenCheckResult {
  hasToken: boolean;
  reason: string;
}

/**
 * Check whether a live provider token is available through the vault.
 * The vault is fail-closed until encryption infrastructure is deployed,
 * so this will always return `hasToken: false` in the current repo state.
 */
export async function checkProviderToken(
  connectionId: string,
  providerLabel: string,
): Promise<TokenCheckResult> {
  if (!isVaultConfigured()) {
    return { hasToken: false, reason: "Token storage unavailable — no encryption infrastructure is configured on this server." };
  }

  const tokens = await getTokens(connectionId);
  if (!tokens?.accessToken) {
    return { hasToken: false, reason: `No valid ${providerLabel} token found for connection ${connectionId}.` };
  }

  return { hasToken: true, reason: "ok" };
}

/**
 * Return a fail-closed result for a provider that is not configured.
 * All business-ops providers currently fail closed because the token vault
 * is not backed by encryption infrastructure.
 */
export function notConfiguredResult(
  providerId: string,
  providerLabel: string,
): {
  configured: false;
  reason: string;
} {
  return {
    configured: false,
    reason: `${providerLabel} is not configured. The token vault is fail-closed — no live provider tokens are available on this server. Connect a token encryption backend to enable live ${providerLabel} actions.`,
  };
}

// ── Sensitive field redaction for provider payloads ────────────────────────

const SENSITIVE_FIELD_PATTERNS = [
  /secret/i,
  /token/i,
  /key/i,
  /password/i,
  /credential/i,
  /authorization/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /ssn/i,
  /social/i,
  /tax[_-]?id/i,
  /ein/i,
  /passport/i,
  /credit[_-]?card/i,
  /cvv/i,
  /card[_-]?number/i,
  /bank[_-]?account/i,
  /routing/i,
  /iban/i,
  /swift/i,
  /bic/i,
];

/**
 * Deep-redact sensitive fields from any provider payload.
 * Returns a new object with sensitive values replaced by "[REDACTED]".
 */
export function redactSensitiveFields(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!input) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_FIELD_PATTERNS.some((p) => p.test(key))) {
      result[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactSensitiveFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) =>
        typeof v === "object" && v !== null
          ? redactSensitiveFields(v as Record<string, unknown>)
          : v,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Minimise email for client display.
 * "jane.doe@example.com" → "j***@***example.com"
 */
export function minimiseEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex >= email.length - 1) return email.slice(0, 2) + "***";
  const prefix = email.slice(0, Math.min(2, atIndex));
  const domain = email.slice(email.lastIndexOf("."));
  const domainName = email.slice(atIndex + 1, email.lastIndexOf("."));
  return `${prefix}***@***${domainName ? domain : ""}${domain}`;
}

/**
 * Minimise phone for client display.
 * "+1 (555) 123-4567" → "***-4567"
 */
export function minimisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return `***-${digits.slice(-4)}`;
}

/**
 * Build a safe connection summary for the provider detail UI.
 * Strips all sensitive data.
 */
export function buildSafeConnectionSummary(
  connection: SafeConnection | null,
  providerLabel: string,
): Record<string, unknown> {
  if (!connection) {
    return {
      provider: providerLabel,
      connected: false,
      reason: "No connection found. Connect your account to enable live actions.",
    };
  }
  return {
    provider: providerLabel,
    connected: connection.status === "active",
    status: connection.status,
    scopes: connection.scopesGranted,
    accountLabel: redactAccountLabel(connection.accountLabel),
    lastHealthCheck: connection.lastHealthCheckAt,
  };
}

// ── Draft payload builders ─────────────────────────────────────────────────

export interface DraftNotePayload {
  content: string;
  targetId: string;
  targetType: "account" | "contact" | "deal" | "ticket" | "order" | "invoice";
}

export interface DraftReplyPayload {
  content: string;
  ticketId: string;
  /** Whether the reply should be public (visible to requester) or internal. */
  visibility: "public" | "internal";
}

export interface DraftActionSummary {
  action: string;
  targetId: string;
  payload: Record<string, unknown>;
  requiresApproval: boolean;
  approvalReason: string | null;
}
