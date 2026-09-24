import "server-only";

/**
 * Research audit events and structured health signals.
 *
 * Produces structured audit entries for research job lifecycle events.
 * Never blocks the caller — audit failures are console-only.
 */

import { hasSupabaseEnv } from "@ethen/config/runtime-flags";

// ── Types ───────────────────────────────────────────────────────────────────

export type ResearchAuditEventType =
  | "research.run.planned"
  | "research.run.started"
  | "research.run.retrieval_complete"
  | "research.run.synthesis_started"
  | "research.run.completed"
  | "research.run.failed"
  | "research.run.cancelled"
  | "research.run.recovered"
  | "research.run.exported"
  | "research.provider.health";

export interface ResearchAuditEvent {
  eventId: string;
  correlationId: string;
  runId?: string;
  eventType: ResearchAuditEventType;
  timestamp: string;
  tenantId: string | null;
  message: string;
  data: Record<string, unknown>;
}

export interface ResearchHealthSignal {
  status: "healthy" | "degraded" | "setup_required" | "unavailable";
  timestamp: string;
  provider: "exa" | "mock" | "none";
  providerConfigured: boolean;
  mockFallbackActive: boolean;
  message: string;
}

// ── UUID ────────────────────────────────────────────────────────────────────

function generateUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Emit ────────────────────────────────────────────────────────────────────

export function emitResearchAuditEvent(params: {
  correlationId: string;
  runId?: string;
  eventType: ResearchAuditEventType;
  tenantId?: string | null;
  message: string;
  data?: Record<string, unknown>;
}): ResearchAuditEvent {
  const event: ResearchAuditEvent = {
    eventId: generateUuid(),
    correlationId: params.correlationId,
    runId: params.runId,
    eventType: params.eventType,
    timestamp: new Date().toISOString(),
    tenantId: params.tenantId ?? null,
    message: params.message,
    data: params.data ?? {},
  };

  console.log(
    `[research:audit] ${event.eventType} [${event.correlationId}] ${event.message}`,
    JSON.stringify(event.data),
  );

  return event;
}

// ── Health ──────────────────────────────────────────────────────────────────

export function researchHealthSignal(params: {
  providerConfigured: boolean;
  mockMode: boolean;
}): ResearchHealthSignal {
  const { providerConfigured, mockMode } = params;

  if (providerConfigured) {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      provider: "exa",
      providerConfigured: true,
      mockFallbackActive: false,
      message: "Research is operational with live Exa provider.",
    };
  }

  if (mockMode) {
    return {
      status: "degraded",
      timestamp: new Date().toISOString(),
      provider: "mock",
      providerConfigured: false,
      mockFallbackActive: true,
      message: "Research is running in mock mode. Set EXA_API_KEY for live search.",
    };
  }

  return {
    status: "setup_required",
    timestamp: new Date().toISOString(),
    provider: "none",
    providerConfigured: false,
    mockFallbackActive: false,
    message: "Research requires configuration. Set EXA_API_KEY or enable NEXT_PUBLIC_ETHEN_MOCK_MODE.",
  };
}

export function createResearchCorrelationId(): string {
  return `research-${generateUuid()}`;
}
