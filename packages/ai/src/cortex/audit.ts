import "server-only";

/**
 * Cortex audit event emitter and structured logger.
 *
 * Produces correlation-ID-linked structured audit entries for every
 * Cortex run. Never blocks the caller on emit — audit failures are
 * logged to stderr and never propagated.
 *
 * This module depends on no external services. In production (Supabase
 * configured), events are persisted; in mock/dev mode, they are
 * console-only and never touch a network.
 */

import { hasSupabaseEnv } from "@ethen/config/runtime-flags";

// ── Types ───────────────────────────────────────────────────────────────────

export type CortexAuditEventType =
  | "cortex.run.started"
  | "cortex.run.classified"
  | "cortex.run.routed"
  | "cortex.run.provider_invoked"
  | "cortex.run.fallback_triggered"
  | "cortex.run.verifier_ran"
  | "cortex.run.completed"
  | "cortex.run.failed"
  | "cortex.run.persisted"
  | "cortex.run.stream_started"
  | "cortex.run.stream_ended"
  | "cortex.health";

export type CortexAuditSeverity = "debug" | "info" | "warn" | "error";

export interface CortexAuditEvent {
  /** Unique event ID (UUID v4). */
  eventId: string;
  /** Correlation ID — same across all events in a single Cortex run. */
  correlationId: string;
  /** Cortex runId (from EthenRouteReceipt.runId). */
  runId: string;
  /** Request ID. */
  requestId: string;
  eventType: CortexAuditEventType;
  severity: CortexAuditSeverity;
  timestamp: string;
  /** Tenant/user context (null in unauthenticated/mock mode). */
  tenantId: string | null;
  /** Session context. */
  sessionId: string | null;
  /** Project context. */
  projectId: string | null;
  /** Human-readable message. */
  message: string;
  /** Structured data payload. */
  data: Record<string, unknown>;
}

// ── UUID shim (no external dependency) ──────────────────────────────────────

/** Simple UUID v4 generation avoiding an extra dependency. */
function generateUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without Web Crypto (unlikely in Node 22+).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Emit ────────────────────────────────────────────────────────────────────

let _persistFn: ((event: CortexAuditEvent) => Promise<void>) | null = null;

/** Override for testing — call with null to reset. */
export function __setCortexAuditPersistFn(
  fn: ((event: CortexAuditEvent) => Promise<void>) | null,
): void {
  _persistFn = fn;
}

function eventToConsole(event: CortexAuditEvent): void {
  const prefix = `[cortex:audit] [${event.severity.toUpperCase()}] [${event.correlationId}]`;
  const payload = JSON.stringify({
    eventType: event.eventType,
    runId: event.runId,
    requestId: event.requestId,
    tenantId: event.tenantId,
    sessionId: event.sessionId,
    projectId: event.projectId,
    message: event.message,
    data: event.data,
  });
  switch (event.severity) {
    case "error":
      console.error(`${prefix} ${payload}`);
      break;
    case "warn":
      console.warn(`${prefix} ${payload}`);
      break;
    default:
      console.log(`${prefix} ${payload}`);
  }
}

/**
 * Emit a Cortex audit event. Non-blocking — emits to console and,
 * when Supabase is configured, persists via the registered persist function.
 */
export function emitCortexAuditEvent(params: {
  correlationId: string;
  runId: string;
  requestId: string;
  eventType: CortexAuditEventType;
  severity?: CortexAuditSeverity;
  tenantId?: string | null;
  sessionId?: string | null;
  projectId?: string | null;
  message: string;
  data?: Record<string, unknown>;
}): CortexAuditEvent {
  const event: CortexAuditEvent = {
    eventId: generateUuid(),
    correlationId: params.correlationId,
    runId: params.runId,
    requestId: params.requestId,
    eventType: params.eventType,
    severity: params.severity ?? "info",
    timestamp: new Date().toISOString(),
    tenantId: params.tenantId ?? null,
    sessionId: params.sessionId ?? null,
    projectId: params.projectId ?? null,
    message: params.message,
    data: params.data ?? {},
  };

  // Console always.
  eventToConsole(event);

  // Persist fire-and-forget (never block).
  if (hasSupabaseEnv() && _persistFn) {
    void _persistFn(event).catch((err) => {
      console.error("[cortex:audit] persist failed:", err);
    });
  }

  return event;
}

/**
 * Create a new correlation ID for a Cortex run.
 */
export function createCortexCorrelationId(): string {
  return `cortex-${generateUuid()}`;
}

/**
 * Create a new Cortex run ID (matches EthenRouteReceipt.runId format).
 */
export function createCortexRunId(): string {
  return `run_${generateUuid().replace(/-/g, "")}`;
}

/**
 * Create a new Cortex request ID.
 */
export function createCortexRequestId(): string {
  return `req_${generateUuid().replace(/-/g, "")}`;
}

// ── Structured health signal ────────────────────────────────────────────────

export interface CortexHealthSignal {
  status: "healthy" | "degraded" | "unavailable";
  timestamp: string;
  providerStates: Record<string, { available: boolean; circuitOpen: boolean; lastCheck: string }>;
  persistenceAvailable: boolean;
  /** Count of runs in the last 5 minutes (0 = unknown/unmeasured). */
  recentRunCount: number;
  /** Count of failed runs in the last 5 minutes. */
  recentFailureCount: number;
  message: string;
}

/** Default health signal when no providers are configured. */
export function cortexHealthSignal(
  overrides?: Partial<CortexHealthSignal>,
): CortexHealthSignal {
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    providerStates: {},
    persistenceAvailable: hasSupabaseEnv(),
    recentRunCount: 0,
    recentFailureCount: 0,
    message: "Cortex is operational. No provider health data available.",
    ...overrides,
  };
}
