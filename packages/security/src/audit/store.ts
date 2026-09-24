import type { AuditEvent, AuditEventType } from "./types";
import type { ToolId } from "@ethen/contracts/tools/types";
import { redactStructuredValue } from "../redact";

// ── In-memory store ─────────────────────────────────────────────────────

const events: AuditEvent[] = [];
let eventCounter = 0;

function nextId(): string {
  eventCounter += 1;
  return `audit-${eventCounter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function recordAuditEvent(
  eventType: AuditEventType,
  toolId: ToolId,
  sessionId: string | null,
  metadata?: Record<string, unknown> | null,
): AuditEvent {
  const redactedMeta = metadata
    ? redactStructuredValue(metadata) as Record<string, unknown>
    : null;
  const event: AuditEvent = {
    id: nextId(),
    eventType,
    toolId,
    sessionId,
    metadata: redactedMeta,
    createdAt: nowIso(),
  };
  events.push(event);
  return event;
}

export function getAuditEvents(options?: {
  sessionId?: string;
  eventType?: AuditEventType;
  toolId?: ToolId;
  limit?: number;
}): AuditEvent[] {
  let result = [...events];

  if (options?.sessionId) {
    result = result.filter((e) => e.sessionId === options.sessionId);
  }
  if (options?.eventType) {
    result = result.filter((e) => e.eventType === options.eventType);
  }
  if (options?.toolId) {
    result = result.filter((e) => e.toolId === options.toolId);
  }

  result.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );

  if (options?.limit && options.limit > 0) {
    result = result.slice(0, options.limit);
  }

  return result;
}

export function getAuditEventsForSession(
  sessionId: string,
  limit?: number,
): AuditEvent[] {
  return getAuditEvents({ sessionId, limit });
}

export function getRecentAuditEvents(limit = 50): AuditEvent[] {
  return getAuditEvents({ limit });
}

export function clearAuditEvents(): void {
  events.length = 0;
  eventCounter = 0;
}
