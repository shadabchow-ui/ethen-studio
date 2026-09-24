/**
 * Gateway audit events, structured health signals, and correlation helpers.
 * Never blocks the caller. Provider errors must remain errors.
 */
function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,(c)=>{const r=(Math.random()*16)|0;return(c==="x"?r:(r&0x3)|0x8).toString(16)});
}
export type GatewayAuditEventType =
  | "gateway.request.routed" | "gateway.request.completed" | "gateway.request.failed"
  | "gateway.key.created" | "gateway.key.revoked" | "gateway.provider.connected"
  | "gateway.provider.failed" | "gateway.rate.limited" | "gateway.budget.exceeded"
  | "gateway.health";
export interface GatewayAuditEvent {
  eventId: string; correlationId: string; eventType: GatewayAuditEventType;
  timestamp: string; tenantId: string | null; message: string; data: Record<string, unknown>;
}
export function emitGatewayAuditEvent(p: {
  correlationId: string; eventType: GatewayAuditEventType; tenantId?: string|null;
  message: string; data?: Record<string, unknown>;
}): GatewayAuditEvent {
  const e: GatewayAuditEvent = {eventId:uuid(),correlationId:p.correlationId,eventType:p.eventType,timestamp:new Date().toISOString(),tenantId:p.tenantId??null,message:p.message,data:p.data??{}};
  console.log(`[gateway:audit] ${e.eventType} [${e.correlationId}] ${e.message}`);
  return e;
}
export interface GatewayHealthSignal {
  status: "healthy" | "degraded" | "unavailable"; timestamp: string;
  providersAvailable: string[]; keyManagementActive: boolean;
  rateLimitingActive: boolean; budgetTrackingActive: boolean;
  pricingActive: boolean; message: string;
}
// Health/readiness are derived from adapter registration + credential state + circuit + limiter + stream store via lib/gateway/platform/health.ts
// This helper remains for audit emission; prefer getGatewayHealth() for live derivation.
export function gatewayHealthSignal(o?: Partial<GatewayHealthSignal>): GatewayHealthSignal {
  return {status:"healthy",timestamp:new Date().toISOString(),providersAvailable:["openai","anthropic","deepseek"],keyManagementActive:true,rateLimitingActive:true,budgetTrackingActive:true,pricingActive:true,message:"Gateway is operational with governed model routing, BYOK, provenance, pricing, and usage tracking. Provider adapters are implemented; provider certification is incomplete.",...o};
}
export function createGatewayCorrelationId(): string { return `gw-${uuid()}`; }
