import type { ConnectionMetadata, SafeConnection } from "./types";

/** Minimum length of a token before we consider it redactable. */
const MIN_TOKEN_LENGTH = 4;

/**
 * Redact a token string for safe logging / debugging.
 * Keeps at most `keep` prefix chars and `keep` suffix chars.
 */
export function redactToken(token: string, keep = 4): string {
  if (!token || token.length < MIN_TOKEN_LENGTH) return "***";
  if (token.length <= keep * 2) return `${token.slice(0, keep)}…`;
  return `${token.slice(0, keep)}…${token.slice(-keep)}`;
}

/**
 * Redact a provider account label for UI display when full label is unsafe.
 * Returns "****" if the label is nullish or empty.
 */
export function redactAccountLabel(label: string | null | undefined): string {
  if (!label) return "****";
  if (label.length <= 2) return "**";
  const atIndex = label.indexOf("@");
  if (atIndex > 0 && atIndex < label.length - 1) {
    const prefix = label.slice(0, Math.min(atIndex, 2));
    const domain = label.slice(label.lastIndexOf("."));
    return `${prefix}***@***${domain}`;
  }
  return `${label.slice(0, 2)}***`;
}

/**
 * Serialize a ConnectionMetadata row into a client-safe shape.
 * Strips all internal fields and ensures no token data leaks.
 */
export function serializeConnection(
  connection: ConnectionMetadata
): SafeConnection {
  return {
    id: connection.id,
    providerId: connection.providerId,
    accountLabel: connection.accountLabel,
    status: connection.status,
    scopesGranted: connection.scopesGranted,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    lastHealthCheckAt: connection.lastHealthCheckAt,
    providerMeta: connection.providerMeta,
  };
}

/**
 * Serialize a list of connections for UI rendering.
 * Every entry is guaranteed client-safe.
 */
export function serializeConnections(
  connections: ConnectionMetadata[]
): SafeConnection[] {
  return connections.map(serializeConnection);
}
