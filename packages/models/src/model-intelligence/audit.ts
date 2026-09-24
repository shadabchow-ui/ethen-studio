import { loadCanonicalModelRegistry } from "./canonical-registry";
import { getCanonicalModelEvidence } from "./registry-api";
import { evidenceHealthStatus } from "./evidence";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export type ModelIntelligenceAuditEventType =
  | "mi.catalog.updated" | "mi.model.indexed" | "mi.benchmark.recorded"
  | "mi.pricing.updated" | "mi.leaderboard.refreshed" | "mi.provider.connected"
  | "mi.ingestion.started" | "mi.ingestion.completed" | "mi.ingestion.failed" | "mi.health";
export interface ModelIntelligenceAuditEvent {
  eventId: string; correlationId: string; eventType: ModelIntelligenceAuditEventType;
  timestamp: string; tenantId: string | null; message: string; data: Record<string, unknown>;
}
export function emitModelIntelligenceAuditEvent(p: { correlationId: string; eventType: ModelIntelligenceAuditEventType; tenantId?: string | null; message: string; data?: Record<string, unknown> }): ModelIntelligenceAuditEvent {
  const event = { eventId: uuid(), correlationId: p.correlationId, eventType: p.eventType, timestamp: new Date().toISOString(), tenantId: p.tenantId ?? null, message: p.message, data: p.data ?? {} };
  console.log(`[mi:audit] ${event.eventType} [${event.correlationId}] ${event.message}`);
  return event;
}
export interface ModelIntelligenceHealthSignal {
  status: "healthy" | "degraded" | "unavailable"; timestamp: string;
  catalogSize: number; providersTracked: number; benchmarksAvailable: number;
  pricingFreshness: string; leaderboardsAvailable: boolean; message: string;
}
/** Health is evidence-derived; invalid source records cannot report healthy. */
export function modelIntelligenceHealthSignal(o?: Partial<ModelIntelligenceHealthSignal>): ModelIntelligenceHealthSignal {
  const registry = loadCanonicalModelRegistry();
  const evidence = registry.records.map((record) => getCanonicalModelEvidence(record.identity.id)?.identity.verificationState ?? "invalid");
  const invalidEvidence = evidence.filter((state) => state === "invalid" || state === "conflict").length;
  const healthy = registry.issues.length === 0 && evidenceHealthStatus(evidence) === "healthy";
  return { status: healthy ? "healthy" : "degraded", timestamp: new Date().toISOString(), catalogSize: registry.records.length, providersTracked: new Set(registry.records.map((record) => record.identity.providerId)).size, benchmarksAvailable: 0, pricingFreshness: "unknown", leaderboardsAvailable: healthy, message: healthy ? "Model Intelligence authority and evidence are readable." : `Model Intelligence authority is degraded: ${registry.issues.length} invalid profile(s), ${invalidEvidence} invalid/conflicting evidence record(s).`, ...o };
}
export function createModelIntelligenceCorrelationId(): string { return `mi-${uuid()}`; }
