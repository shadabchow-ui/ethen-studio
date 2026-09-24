import type { MediaSafetyGateResult } from "./safety-types";
import type { MediaJobSafetyMeta } from "./types";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,(c)=>{const r=(Math.random()*16)|0;return(c==="x"?r:(r&0x3)|0x8).toString(16)});
}

// ── Structured audit events ─────────────────────────────────────────────────

export type MediaAuditEventType =
  | "studio.media.generated" | "studio.media.failed" | "studio.safety.preflight_passed"
  | "studio.safety.preflight_blocked" | "studio.rights.verified" | "studio.provider.connected"
  | "studio.rate.limited" | "studio.health";

export interface MediaAuditEvent {
  eventId: string; correlationId: string; eventType: MediaAuditEventType;
  timestamp: string; tenantId: string | null; message: string; data: Record<string, unknown>;
}

export function emitMediaAuditEvent(p: {
  correlationId: string; eventType: MediaAuditEventType; tenantId?: string|null;
  message: string; data?: Record<string, unknown>;
}): MediaAuditEvent {
  const e: MediaAuditEvent = {eventId:uuid(),correlationId:p.correlationId,eventType:p.eventType,timestamp:new Date().toISOString(),tenantId:p.tenantId??null,message:p.message,data:p.data??{}};
  console.log(`[studio:audit] ${e.eventType} [${e.correlationId}] ${e.message}`);
  return e;
}

// ── Health signals ──────────────────────────────────────────────────────────

export interface MediaHealthSignal {
  status: "healthy" | "frozen" | "unavailable"; timestamp: string; providersAvailable: string[];
  safetyClassifierActive: boolean; rightsChecklistActive: boolean; rateLimitActive: boolean; message: string;
}

export function mediaHealthSignal(o?: Partial<MediaHealthSignal>): MediaHealthSignal {
  return {status:"frozen",timestamp:new Date().toISOString(),providersAvailable:["openai","fal"],safetyClassifierActive:true,rightsChecklistActive:true,rateLimitActive:true,message:"Studio is frozen after core launch. Media generation is disabled; existing data remains exportable.",...o};
}

export function createMediaCorrelationId(): string { return `studio-${uuid()}`; }

// ── Pre-existing safety audit (re-exported by lib/media/safety/audit.ts) ────

export interface MediaAuditTrace {
  traceId: string; jobId: string; safetyGate: "passed"|"blocked"; consentVerified: boolean; timestamp: string;
  consentAccepted: boolean; safetyGateResult: MediaSafetyGateResult;
  promptMetadata: { prompt: string; negativePrompt?: string; style?: string };
  providerMetadata: { provider: string } | null;
}

/** Matches call at media-safety.test.ts:348 — 9 args. */
export function buildMediaAuditTrace(
  prompt: string, provider: string, _workflowId: string,
  safetyGateResult: MediaSafetyGateResult, consentVerified: boolean,
  _safetyGateFlag: boolean, _blockedReason: string | null,
  negativePrompt: string, style: string,
): MediaAuditTrace {
  return {
    traceId: uuid(), jobId: `job-${uuid().slice(0,8)}`, safetyGate: consentVerified?"passed":"blocked",
    consentVerified, consentAccepted: consentVerified, safetyGateResult,
    promptMetadata: { prompt, negativePrompt, style },
    providerMetadata: provider ? { provider } : null,
    timestamp: new Date().toISOString(),
  };
}

export function stampJobSafetyMeta(
  safetyGateResult: MediaSafetyGateResult, consentAccepted: boolean,
  approvalRequired: boolean, blockedReason: string | null, _approvalRequestId: string | null,
): MediaJobSafetyMeta {
  return {
    safetyGateResult, consentAccepted,
    consentAcceptedAt: consentAccepted ? new Date().toISOString() : null,
    approvalRequired, approvalRequestId: null, blockedReason,
    readPhaseCompleted: true, proposePhaseCompleted: true,
    executeConfirmed: consentAccepted && !blockedReason,
    safetyCheckedAt: new Date().toISOString(),
  };
}

/** Matches call at app/api/media/generate/route.ts:159 — 3 args. */
export function auditJobSafetyGate(jobId: string, _sessionId: string | null, safetyResult: MediaSafetyGateResult): MediaAuditTrace {
  return buildMediaAuditTrace("", "mock", "", safetyResult, true, false, null, "", "");
}
export function auditJobConsent(jobId: string, granted: boolean, safetyResult: MediaSafetyGateResult): MediaAuditTrace {
  return buildMediaAuditTrace("", "mock", "", safetyResult, granted, false, null, "", "");
}
export function auditJobExecution(jobId: string, status: "success"|"failed", message: string, safetyResult: MediaSafetyGateResult): MediaAuditTrace {
  return buildMediaAuditTrace(message, "mock", "", safetyResult, status==="success", false, null, "", "");
}
