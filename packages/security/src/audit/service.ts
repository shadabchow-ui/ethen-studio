import { AUDIT_EVENT_LABELS, type AuditEventType, type AuditEntry } from "./types";
import type { ToolId } from "@ethen/contracts/tools/types";
import {
  recordAuditEvent as storeRecord,
  getAuditEventsForSession,
  getRecentAuditEvents,
  getAuditEvents,
  clearAuditEvents,
} from "./store";

export type { AuditEventType } from "./types";

export function recordAuditEvent(
  eventType: AuditEventType,
  toolId: ToolId,
  sessionId: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return storeRecord(eventType, toolId, sessionId, metadata);
}

export function getSessionAuditLog(sessionId: string, limit?: number) {
  return getAuditEventsForSession(sessionId, limit);
}

export function getRecentActivityLog(limit?: number) {
  return getRecentAuditEvents(limit);
}

export function getFilteredAuditLog(options?: {
  sessionId?: string;
  eventType?: AuditEventType;
  toolId?: ToolId;
  limit?: number;
}) {
  return getAuditEvents(options);
}

export function resetAuditLog() {
  clearAuditEvents();
}

/**
 * Map a persistence/domain AuditEvent into an admin-facing AuditEntry.
 * Never invents actor, decision, or timestamps — only projects fields present.
 */
export function mapAuditEventToEntry(event: {
  id: string;
  eventType: AuditEventType | string;
  toolId?: string;
  sessionId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}): AuditEntry {
  const eventType = event.eventType as AuditEventType;
  const label =
    eventType in AUDIT_EVENT_LABELS
      ? AUDIT_EVENT_LABELS[eventType]
      : String(event.eventType);

  const meta = event.metadata;
  const actorFromMeta =
    typeof meta?.actor === "string"
      ? meta.actor
      : typeof meta?.actorId === "string"
        ? meta.actorId
        : null;

  const summaryFromMeta =
    typeof meta?.summary === "string"
      ? meta.summary
      : typeof meta?.reason === "string"
        ? meta.reason
        : typeof meta?.result === "string"
          ? meta.result
          : label;

  return {
    id: event.id,
    sessionId: event.sessionId,
    eventType,
    label,
    summary: summaryFromMeta,
    actor: actorFromMeta,
    metadata: meta,
    createdAt: event.createdAt,
  };
}

export function listAuditEntries(options?: {
  sessionId?: string;
  eventType?: AuditEventType;
  limit?: number;
}): AuditEntry[] {
  const events = getAuditEvents({
    sessionId: options?.sessionId,
    eventType: options?.eventType,
    limit: options?.limit,
  });

  return events.map(mapAuditEventToEntry);
}

// ── Credential audit helpers ─────────────────────────────────────────────────
//
// These record credential lifecycle events in the audit log. No secret values
// are ever passed as metadata — the audit store's redaction layer provides a
// second safety net, but callers must also guard against plaintext secrets.

const CREDENTIAL_TOOL_ID: ToolId = "system/credential-vault";

/** Record a credential registration event. Metadata must not contain secrets. */
export function recordCredentialRegistered(metadata?: Record<string, unknown> | null) {
  return storeRecord("credential_metadata_registered", CREDENTIAL_TOOL_ID, null, metadata);
}

/** Record a credential validation failure. Metadata must not contain secrets. */
export function recordCredentialValidationFailed(metadata?: Record<string, unknown> | null) {
  return storeRecord("credential_validation_failed", CREDENTIAL_TOOL_ID, null, metadata);
}

/** Record a live readiness check. Metadata must not contain secrets. */
export function recordLiveReadinessChecked(metadata?: Record<string, unknown> | null) {
  return storeRecord("live_readiness_checked", CREDENTIAL_TOOL_ID, null, metadata);
}

/** Record a plaintext secret rejection at the vault boundary. */
export function recordPlaintextSecretRejected(metadata?: Record<string, unknown> | null) {
  return storeRecord("plaintext_secret_rejected", CREDENTIAL_TOOL_ID, null, metadata);
}
