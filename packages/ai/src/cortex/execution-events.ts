import type { EthenRouteReceipt, EthenMode, IntentClassification } from "./types";
import type { RunCortexChatResult } from "./run-cortex-chat";

/** Public, transport-safe execution telemetry for the chat activity surface. */
export const CORTEX_EVENT_PROTOCOL_VERSION = "ethen.cortex.execution.v1" as const;

export type CortexExecutionEventType =
  | "run-start"
  | "mode-selection"
  | "plan"
  | "worker-state"
  | "tool-state"
  | "evidence"
  | "fallback"
  | "verification"
  | "synthesis"
  | "receipt"
  | "completion"
  | "degraded-completion"
  | "error";

type CortexEventData = Record<string, string | number | boolean | null | string[]>;

export interface CortexExecutionEvent {
  protocol: typeof CORTEX_EVENT_PROTOCOL_VERSION;
  type: CortexExecutionEventType;
  runId: string;
  at: string;
  data: CortexEventData;
}

function event(type: CortexExecutionEventType, runId: string, data: CortexEventData): CortexExecutionEvent {
  return { protocol: CORTEX_EVENT_PROTOCOL_VERSION, type, runId, at: new Date().toISOString(), data };
}

/** Serializes only the deliberately small public event shape; it never accepts raw provider/tool data. */
export function serializeCortexExecutionEvent(value: CortexExecutionEvent): string {
  return JSON.stringify(value);
}

export function createCortexStartEvents(
  result: RunCortexChatResult,
  requestedMode: EthenMode | "auto",
): CortexExecutionEvent[] {
  const { receipt, classification } = result;
  const events = [
    event("run-start", receipt.runId, { requestedMode, effectiveMode: result.effectiveMode }),
    event("mode-selection", receipt.runId, {
      requestedMode,
      effectiveMode: result.effectiveMode,
      intent: classification.primaryIntent,
      confidence: classification.confidence,
    }),
    event("plan", receipt.runId, {
      routeClass: receipt.routeClass,
      toolsRequired: classification.requiresTools,
      verificationRequired: classification.requiresVerifier,
    }),
  ];

  if (result.research) {
    events.push(event("tool-state", receipt.runId, {
      toolClass: result.research.toolClass,
      state: result.research.failed ? "failed" : "completed",
    }));
    events.push(event("evidence", receipt.runId, {
      sourceCount: result.research.sourceCount,
      evidenceCount: result.research.evidenceCount,
    }));
  }

  if (result.ultra) {
    events.push(event("worker-state", receipt.runId, {
      workerCount: result.ultra.workerCount,
      state: result.ultra.status,
    }));
    events.push(event("synthesis", receipt.runId, { state: result.ultra.degraded ? "degraded" : "completed" }));
    events.push(event("evidence", receipt.runId, { evidenceCount: result.ultra.evidenceCount }));
  }

  if (receipt.fallback.attempted) {
    events.push(event("fallback", receipt.runId, {
      used: receipt.fallback.used,
      finalStatus: receipt.fallback.finalStatus,
    }));
  }

  events.push(event("verification", receipt.runId, { status: receipt.verifier.status ?? "pending" }));
  return events;
}

export function createCortexCompletionEvents(
  receipt: EthenRouteReceipt,
  streamOk: boolean,
): CortexExecutionEvent[] {
  const safeReceipt = {
    mode: receipt.mode,
    intent: receipt.intent,
    routeProfile: receipt.routeProfile,
    source: receipt.source ?? "unknown",
    verifierStatus: receipt.verifier.status ?? "unknown",
    fallbackUsed: receipt.fallback.used,
  };
  const kind: CortexExecutionEventType = streamOk
    ? receipt.source === "degraded" ? "degraded-completion" : "completion"
    : "error";
  return [
    event("receipt", receipt.runId, safeReceipt),
    event(kind, receipt.runId, streamOk ? { status: "complete" } : { message: "Assistant stream ended unexpectedly." }),
  ];
}
