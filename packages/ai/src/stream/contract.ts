/**
 * FJ-11 — Ethen frontend-visible streaming event contract.
 *
 * One typed event envelope shared by every live stream producer/consumer:
 * coding runs, Cortex chat, Gateway completions, and AI-SDK UI message
 * streams. Producers emit (or adapt to) `StreamEventEnvelope`; consumers
 * parse and reduce it. Unknown variants are preserved through the `unknown`
 * kind rather than silently dropped — load-bearing events must never vanish.
 *
 * Compatibility strategy (see artifacts/frontend-modernization/streaming-event-contract.md):
 *   - Producers keep their mature wire formats; `lib/stream/adapters.ts`
 *     maps each producer's events into this envelope (one producer per
 *     bounded migration pass).
 *   - Consumers reduce `StreamEventEnvelope`; legacy formats are parsed by
 *     the same adapters at the edge.
 *   - Immediate "pending/thinking" state is `reasoning-status` with
 *     `status: "thinking"` — emitted before the first `text-delta`.
 *   - Cancellation is idempotent via `lib/stream/cancellation.ts`; replay /
 *     reconnect sequence resolution lives in `lib/stream/replay.ts`.
 */

export const STREAM_EVENT_CONTRACT_VERSION = 1 as const;

/** Stable stream-scoped identity. */
export interface StreamEventContext {
  /** Producer-scoped stream id (runId, streamId, requestId, sessionId…). */
  streamId: string;
  /** Monotonic per-stream sequence. Persisted ordering must stay stable. */
  sequence: number;
  /** ISO-8601 timestamp at emission. */
  at: string;
}

/** User-safe reasoning summary — NEVER private chain-of-thought. */
export type ReasoningStatusKind = "thinking" | "working" | "searching" | "writing" | "reviewing" | "waiting";

export interface ReasoningStatusData {
  status: ReasoningStatusKind;
  /** Coarse, user-safe label ("Searching sources…"). Raw CoT is forbidden. */
  summary?: string;
  /** Tool/route context (mode, route class) — already-redacted fields only. */
  context?: Record<string, string | number | boolean>;
}

export type StreamEventType =
  | "message-start"
  | "text-delta"
  | "reasoning-status"
  | "tool-dispatch"
  | "tool-result"
  | "citation"
  | "artifact-update"
  | "approval-pending"
  | "completion"
  | "cancellation"
  | "error"
  | "ping"
  | "unknown";

interface StreamEventBase {
  type: StreamEventType;
  context: StreamEventContext;
}

export interface MessageStartEvent extends StreamEventBase {
  type: "message-start";
  /** Assistant message id (stable across retries? no — new id per generation). */
  messageId: string;
  model?: string;
}

export interface TextDeltaEvent extends StreamEventBase {
  type: "text-delta";
  messageId: string;
  delta: string;
}

export interface ReasoningStatusEvent extends StreamEventBase {
  type: "reasoning-status";
  messageId: string;
  data: ReasoningStatusData;
}

export interface ToolDispatchEvent extends StreamEventBase {
  type: "tool-dispatch";
  messageId: string;
  tool: string;
  callId: string;
  /** Coarse label only; arguments may be omitted or redacted. */
  label?: string;
}

export interface ToolResultEvent extends StreamEventBase {
  type: "tool-result";
  messageId: string;
  tool: string;
  callId: string;
  ok: boolean;
  /** Truncated/redacted result summary. */
  summary?: string;
}

export interface CitationEvent extends StreamEventBase {
  type: "citation";
  messageId: string;
  index: number;
  title: string;
  url?: string;
}

export interface ArtifactUpdateEvent extends StreamEventBase {
  type: "artifact-update";
  messageId: string;
  artifactId: string;
  kind: string;
}

export interface ApprovalPendingEvent extends StreamEventBase {
  type: "approval-pending";
  messageId: string;
  approvalId: string;
  tool: string;
  /** Deny-by-default boundary: consumers must NOT auto-approve. */
  requiresDecision: true;
}

export interface CompletionEvent extends StreamEventBase {
  type: "completion";
  messageId: string;
  finishReason: "stop" | "tool" | "error" | "aborted" | "length";
  model?: string;
  usage?: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
}

export interface CancellationEvent extends StreamEventBase {
  type: "cancellation";
  messageId: string;
  reason: "user_stop" | "timeout" | "client_disconnect" | "server_abort";
  /** True when this cancellation was the first (idempotency anchor). */
  first: boolean;
}

export interface ErrorEvent extends StreamEventBase {
  type: "error";
  messageId: string;
  /** User-safe message; never raw provider internals. */
  message: string;
  code?: string;
  /** True when a retry/regenerate is safe. */
  recoverable?: boolean;
}

export interface PingEvent extends StreamEventBase {
  type: "ping";
}

/** Fail-safe preservation: unrecognized event kept verbatim, never dropped. */
export interface UnknownEvent extends StreamEventBase {
  type: "unknown";
  originalType: string;
  /** Raw payload preserved for compatibility handling. */
  raw: Record<string, unknown>;
}

export type StreamEvent =
  | MessageStartEvent
  | TextDeltaEvent
  | ReasoningStatusEvent
  | ToolDispatchEvent
  | ToolResultEvent
  | CitationEvent
  | ArtifactUpdateEvent
  | ApprovalPendingEvent
  | CompletionEvent
  | CancellationEvent
  | ErrorEvent
  | PingEvent
  | UnknownEvent;

/** Wire envelope: versioned so future breaking changes are detectable. */
export interface StreamEventEnvelope {
  v: typeof STREAM_EVENT_CONTRACT_VERSION;
  event: StreamEvent;
}

export const STREAM_EVENT_TYPES: readonly StreamEventType[] = [
  "message-start",
  "text-delta",
  "reasoning-status",
  "tool-dispatch",
  "tool-result",
  "citation",
  "artifact-update",
  "approval-pending",
  "completion",
  "cancellation",
  "error",
  "ping",
  "unknown",
] as const;

const KNOWN_TYPES: ReadonlySet<string> = new Set(STREAM_EVENT_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContext(value: unknown): value is StreamEventContext {
  return (
    isRecord(value) &&
    typeof value.streamId === "string" &&
    typeof value.sequence === "number" &&
    typeof value.at === "string"
  );
}

/**
 * Parse a wire envelope (already JSON-decoded) into a validated
 * `StreamEventEnvelope`. Unknown or malformed types degrade to the
 * `unknown` kind with the raw payload preserved — never dropped.
 */
export function parseStreamEventEnvelope(
  raw: unknown,
): StreamEventEnvelope | null {
  if (!isRecord(raw) || raw.v !== STREAM_EVENT_CONTRACT_VERSION) return null;
  const event = raw.event;
  if (!isRecord(event) || typeof event.type !== "string") return null;
  const context = isContext(event.context) ? event.context : null;
  if (!context) return null;

  if (event.type === "unknown") {
    return {
      v: STREAM_EVENT_CONTRACT_VERSION,
      event: {
        type: "unknown",
        context,
        originalType:
          typeof event.originalType === "string" ? event.originalType : "unknown",
        raw: (event.raw as Record<string, unknown>) ?? {},
      },
    };
  }

  if (!KNOWN_TYPES.has(event.type)) {
    // Unknown variant: preserve verbatim instead of dropping.
    return {
      v: STREAM_EVENT_CONTRACT_VERSION,
      event: {
        type: "unknown",
        context,
        originalType: String(event.type),
        raw: event,
      },
    };
  }

  return { v: STREAM_EVENT_CONTRACT_VERSION, event: event as unknown as StreamEvent };
}

/**
 * Parse a wire envelope from a JSON string (e.g. an SSE `data:` line).
 * Malformed JSON returns null (caller decides fail-safe handling).
 */
export function parseStreamEventEnvelopeJson(raw: string): StreamEventEnvelope | null {
  try {
    return parseStreamEventEnvelope(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Convenience: first-event lookup helpers for reducers. */
export function isTerminal(event: StreamEvent): boolean {
  return (
    event.type === "completion" ||
    event.type === "cancellation" ||
    (event.type === "error" && event.recoverable !== true)
  );
}
