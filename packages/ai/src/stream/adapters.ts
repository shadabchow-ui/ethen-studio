/**
 * FJ-11 — Adapters from live producer formats to the shared
 * `StreamEventEnvelope` (lib/stream/contract.ts).
 *
 * Each adapter maps ONE producer's mature wire format into the canonical
 * envelope. Producers themselves are NOT rewritten in this pass (bounded
 * migration); consumers may parse either the raw format or the canonical
 * envelope. Adapters must never drop load-bearing fields: unknown producer
 * events are preserved via the `unknown` kind.
 *
 * Mapped producers:
 *   - Coding run protocol  → fromCodingStreamMessage
 *   - Cortex execution     → fromCortexExecutionEvent
 *   - Chatbot agent SSE    → fromChatbotSseFrame
 *   - Gateway completions  → fromGatewayChunk
 */

import type { CodingStreamMessage } from "@ethen/contracts/coding/protocol-types";
import type { CortexExecutionEvent } from "../cortex/execution-events";
import { STREAM_EVENT_CONTRACT_VERSION } from "./contract";
import type {
  StreamEvent,
  StreamEventEnvelope,
  StreamEventContext,
} from "./contract";

// ── Shared helpers ────────────────────────────────────────────────────────

function context(streamId: string, sequence: number, at?: string): StreamEventContext {
  return { streamId, sequence, at: at ?? new Date().toISOString() };
}

/** Distributive Omit keeps each union member's own fields minus `context`. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** StreamEvent without the injected context — callers pass event fields only. */
type StreamEventFields = DistributiveOmit<StreamEvent, "context">;

function envelope(streamId: string, sequence: number, event: StreamEventFields, at?: string): StreamEventEnvelope {
  return {
    v: STREAM_EVENT_CONTRACT_VERSION,
    event: { ...event, context: context(streamId, sequence, at) } as StreamEvent,
  };
}

/** Preserve any producer event we do not understand instead of dropping it. */
function unknownEnvelope(
  streamId: string,
  sequence: number,
  originalType: string,
  raw: Record<string, unknown>,
  at?: string,
): StreamEventEnvelope {
  return {
    v: STREAM_EVENT_CONTRACT_VERSION,
    event: {
      type: "unknown",
      context: context(streamId, sequence, at),
      originalType,
      raw,
    },
  };
}

// ── Coding run protocol ───────────────────────────────────────────────────

/**
 * Map a `CodingStreamMessage` (snapshot/event/frame/error/ping) into
 * canonical envelopes. A snapshot expands into its contained events.
 */
export function fromCodingStreamMessage(
  message: CodingStreamMessage,
): StreamEventEnvelope[] {
  const streamId =
    message.kind === "ping" ? "coding" : (message.runId ?? "coding");
  switch (message.kind) {
    case "snapshot": {
      const events: StreamEventEnvelope[] = [];
      for (const runEvent of message.events) {
        // Route known terminal/load-bearing types through the same mapping
        // as live events; unrecognized types are preserved via `unknown`
        // (never silently dropped).
        const asEvent: CodingStreamMessage = {
          kind: "event",
          runId: streamId,
          event: runEvent,
        };
        events.push(...fromCodingStreamMessage(asEvent));
      }
      return events;
    }
    case "event": {
      const runEvent = message.event;
      const seq = runEvent.sequence ?? 0;
      const messageId = String(runEvent.id ?? `ev-${seq}`);
      switch (runEvent.type) {
        case "user_message":
          return [envelope(streamId, seq, { type: "message-start", messageId }, runEvent.timestamp)];
        case "tool_started":
          return [envelope(streamId, seq, {
            type: "tool-dispatch",
            messageId,
            tool: runEvent.toolName ?? "tool",
            callId: String(runEvent.id ?? `call-${seq}`),
            label: runEvent.summary,
          }, runEvent.timestamp)];
        case "tool_completed":
          return [envelope(streamId, seq, {
            type: "tool-result",
            messageId,
            tool: runEvent.toolName ?? "tool",
            callId: String(runEvent.id ?? `call-${seq}`),
            ok: true,
            summary: runEvent.summary,
          }, runEvent.timestamp)];
        case "tool_failed":
          return [envelope(streamId, seq, {
            type: "tool-result",
            messageId,
            tool: runEvent.toolName ?? "tool",
            callId: String(runEvent.id ?? `call-${seq}`),
            ok: false,
            summary: runEvent.summary,
          }, runEvent.timestamp)];
        case "approval_requested":
          return [envelope(streamId, seq, {
            type: "approval-pending",
            messageId,
            approvalId: String(runEvent.id ?? `approval-${seq}`),
            tool: runEvent.toolName ?? "action",
            requiresDecision: true,
          }, runEvent.timestamp)];
        case "run_completed":
          return [envelope(streamId, seq, {
            type: "completion",
            messageId,
            finishReason: "stop",
          }, runEvent.timestamp)];
        case "run_failed":
          return [envelope(streamId, seq, {
            type: "error",
            messageId,
            message: runEvent.summary,
            code: "run_failed",
            recoverable: true,
          }, runEvent.timestamp)];
        case "verification_succeeded":
          return [envelope(streamId, seq, {
            type: "citation",
            messageId,
            index: seq,
            title: runEvent.summary,
          }, runEvent.timestamp)];
        default:
          // Preserve: any other RunEvent type becomes a reasoning-status
          // summary (user-safe) — the raw event is retained in `context`.
          return [unknownEnvelope(streamId, seq, `run_event:${runEvent.type}`, {
            ...runEvent,
            type: runEvent.type,
          }, runEvent.timestamp)];
      }
    }
    case "frame": {
      // Ephemeral frames: assistant_delta → text-delta; terminal output →
      // preserved as unknown (terminal streams are not part of the
      // frontend text contract).
      if (message.frameKind === "assistant_delta") {
        try {
          const parsed = JSON.parse(message.payload) as { text?: string };
          if (typeof parsed.text === "string") {
            return [envelope(streamId, 0, {
              type: "text-delta",
              messageId: streamId,
              delta: parsed.text,
            }, message.timestamp)];
          }
        } catch {
          // fall through to unknown
        }
        return [unknownEnvelope(streamId, 0, "frame:assistant_delta", { payload: message.payload }, message.timestamp)];
      }
      return [unknownEnvelope(streamId, 0, `frame:${message.frameKind}`, { payload: message.payload }, message.timestamp)];
    }
    case "error":
      return [envelope(streamId, 0, {
        type: "error",
        messageId: streamId,
        message: message.message,
        code: "stream_error",
        recoverable: true,
      })];
    case "ping":
      return [envelope(streamId, 0, { type: "ping" }, message.timestamp)];
    default:
      return [unknownEnvelope(streamId, 0, `coding:${(message as { kind?: string }).kind ?? "unknown"}`, message as unknown as Record<string, unknown>)];
  }
}

// ── Cortex execution events ───────────────────────────────────────────────

const CORTEX_REASONING_KIND: Record<string, "thinking" | "working" | "searching" | "writing" | "reviewing"> = {
  "run-start": "thinking",
  "mode-selection": "thinking",
  plan: "working",
  "worker-state": "working",
  "tool-state": "working",
  evidence: "searching",
  fallback: "reviewing",
  verification: "reviewing",
  synthesis: "writing",
  receipt: "reviewing",
};

/**
 * Map a `CortexExecutionEvent` (ethen.cortex.execution.v1) into canonical
 * envelopes. Data is already public/redacted at the producer boundary
 * (lib/cortex/execution-events.ts) — never raw chain-of-thought.
 */
export function fromCortexExecutionEvent(
  event: CortexExecutionEvent,
  sequence: number,
): StreamEventEnvelope[] {
  const streamId = event.runId;
  const at = event.at;
  const messageId = `run-${event.runId}`;

  switch (event.type) {
    case "completion":
    case "degraded-completion":
      return [envelope(streamId, sequence, {
        type: "completion",
        messageId,
        finishReason: event.type === "degraded-completion" ? "error" : "stop",
        usage: typeof event.data.status === "string" ? undefined : undefined,
      }, at)];
    case "error":
      return [envelope(streamId, sequence, {
        type: "error",
        messageId,
        message: typeof event.data.message === "string" ? event.data.message : "Run failed.",
        code: "cortex_error",
        recoverable: true,
      }, at)];
    case "evidence":
      return [envelope(streamId, sequence, {
        type: "citation",
        messageId,
        index: typeof event.data.evidenceCount === "number" ? event.data.evidenceCount : sequence,
        title: `Evidence: ${String(event.data.evidenceCount ?? "n/a")} sources`,
      }, at)];
    default: {
      const kind = CORTEX_REASONING_KIND[event.type] ?? "working";
      const summary = summarizeCortexEvent(event);
      return [envelope(streamId, sequence, {
        type: "reasoning-status",
        messageId,
        data: { status: kind, summary, context: event.data as unknown as Record<string, string | number | boolean> },
      }, at)];
    }
  }
}

function summarizeCortexEvent(event: CortexExecutionEvent): string {
  const data = event.data;
  switch (event.type) {
    case "run-start":
      return `Starting ${String(data.effectiveMode ?? "auto")} run.`;
    case "mode-selection":
      return `Using ${String(data.effectiveMode ?? "auto")} mode (${String(data.intent ?? "auto")}).`;
    case "plan":
      return "Planning the response.";
    case "worker-state":
      return `${String(data.workerCount ?? "?")} workers active.`;
    case "tool-state":
      return data.state === "failed" ? "A tool failed — recovering." : "Tool completed.";
    case "fallback":
      return data.used ? "Falling back to a different route." : "Primary route confirmed.";
    case "verification":
      return `Verification ${String(data.status ?? "pending")}.`;
    case "synthesis":
      return data.state === "degraded" ? "Synthesizing (degraded)." : "Synthesizing results.";
    case "receipt":
      return "Finalizing run.";
    default:
      return "Working…";
  }
}

// ── Chatbot agent SSE (lib/cortex/chatbot-agent-route.ts) ─────────────────

/**
 * Map one chatbot-agent SSE frame (`{t}`, `{done}`, `{error}`) into a
 * canonical envelope. The producer also sets X-Ethen-* headers carrying the
 * redacted receipt — those remain header-side and are not duplicated here.
 */
export function fromChatbotSseFrame(
  payload: Record<string, unknown>,
  streamId: string,
  sequence: number,
): StreamEventEnvelope {
  const messageId = streamId;
  if (typeof payload.error === "string") {
    return envelope(streamId, sequence, {
      type: "error",
      messageId,
      message: payload.error,
      code: typeof payload.errorCode === "string" ? payload.errorCode : "chatbot_error",
      recoverable: true,
    });
  }
  if (payload.done === true) {
    return envelope(streamId, sequence, {
      type: "completion",
      messageId,
      finishReason: "stop",
      model: typeof payload.model === "string" ? payload.model : undefined,
    });
  }
  if (typeof payload.t === "string") {
    return envelope(streamId, sequence, {
      type: "text-delta",
      messageId,
      delta: payload.t,
    });
  }
  return unknownEnvelope(streamId, sequence, "chatbot:sse", payload);
}

// ── Gateway completions chunk ─────────────────────────────────────────────

export interface GatewayChunkLike {
  id?: string;
  object?: string;
  choices?: Array<{
    index?: number;
    delta?: { role?: string; content?: string | null };
    finish_reason?: string | null;
  }>;
  /** OpenAI-style usage object on the final chunk. */
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  ethen?: {
    request_id?: string;
    stream_id?: string;
    sequence?: number;
    char_offset?: number;
    ttft_ms?: number;
  };
}

/**
 * Map one Gateway `chat.completion.chunk` into a canonical envelope.
 * The `ethen` metadata block provides stream identity and sequence.
 */
export function fromGatewayChunk(
  chunk: GatewayChunkLike,
  fallbackStreamId: string,
  fallbackSequence: number,
): StreamEventEnvelope {
  const streamId = chunk.ethen?.stream_id ?? chunk.ethen?.request_id ?? fallbackStreamId;
  const sequence = typeof chunk.ethen?.sequence === "number" ? chunk.ethen.sequence : fallbackSequence;
  const messageId = chunk.id ?? streamId;
  const choice = chunk.choices?.[0];

  if (choice?.finish_reason) {
    return envelope(streamId, sequence, {
      type: "completion",
      messageId,
      finishReason: choice.finish_reason === "stop" ? "stop" : choice.finish_reason === "length" ? "length" : choice.finish_reason === "tool_calls" ? "tool" : "stop",
      usage: chunk.usage
        ? {
            inputTokens: chunk.usage.prompt_tokens ?? null,
            outputTokens: chunk.usage.completion_tokens ?? null,
            totalTokens: chunk.usage.total_tokens ?? null,
          }
        : undefined,
    });
  }

  const delta = choice?.delta;
  if (typeof delta?.content === "string" && delta.content.length > 0) {
    return envelope(streamId, sequence, {
      type: "text-delta",
      messageId,
      delta: delta.content,
    });
  }
  if (typeof delta?.role === "string") {
    return envelope(streamId, sequence, {
      type: "message-start",
      messageId,
    });
  }
  return unknownEnvelope(streamId, sequence, "gateway:chunk", chunk as unknown as Record<string, unknown>);
}

/**
 * Map a Chat lane event (`ChatStreamEvent`) into a canonical StreamEventEnvelope.
 */
export function fromChatStreamEvent(
  event: {
    type: "working" | "tool-activity" | "sources" | "chunk" | "completed" | "failed" | "stopped";
    runId: string;
    sequence?: number;
    text?: string;
    steps?: readonly { id: string; label: string; detail?: string; state: "running" | "done" | "failed" }[];
    sources?: readonly { id: string; title: string; origin?: string; detail?: string }[];
    error?: { title: string; detail: string; action: string };
    transcriptHash?: string;
    timestamp?: string;
  },
  fallbackSequence = 0,
): StreamEventEnvelope[] {
  const streamId = event.runId;
  const seq = event.sequence ?? fallbackSequence;
  const messageId = `msg-${event.runId}`;
  const at = event.timestamp ?? new Date().toISOString();

  switch (event.type) {
    case "working":
      return [
        envelope(
          streamId,
          seq,
          {
            type: "reasoning-status",
            messageId,
            data: { status: "working", summary: "Working on your request" },
          },
          at,
        ),
      ];
    case "tool-activity": {
      const results: StreamEventEnvelope[] = [];
      const steps = event.steps ?? [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        results.push(
          envelope(
            streamId,
            seq + i,
            {
              type: "tool-dispatch",
              messageId,
              tool: step.label,
              callId: step.id,
              label: step.detail || step.label,
            },
            at,
          ),
        );
      }
      return results.length > 0 ? results : [envelope(streamId, seq, { type: "ping" }, at)];
    }
    case "sources": {
      const results: StreamEventEnvelope[] = [];
      const sources = event.sources ?? [];
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        results.push(
          envelope(
            streamId,
            seq + i,
            {
              type: "citation",
              messageId,
              index: i + 1,
              title: source.title,
              url: source.detail,
            },
            at,
          ),
        );
      }
      return results;
    }
    case "chunk":
      return [
        envelope(
          streamId,
          seq,
          {
            type: "text-delta",
            messageId,
            delta: event.text ?? "",
          },
          at,
        ),
      ];
    case "completed":
      return [
        envelope(
          streamId,
          seq,
          {
            type: "completion",
            messageId,
            finishReason: "stop",
          },
          at,
        ),
      ];
    case "failed":
      return [
        envelope(
          streamId,
          seq,
          {
            type: "error",
            messageId,
            message: event.error?.detail ?? event.error?.title ?? "Generation failed",
            recoverable: true,
          },
          at,
        ),
      ];
    case "stopped":
      return [
        envelope(
          streamId,
          seq,
          {
            type: "cancellation",
            messageId,
            reason: "user_stop",
            first: true,
          },
          at,
        ),
      ];
    default:
      return [unknownEnvelope(streamId, seq, `chat:${(event as { type: string }).type}`, event as unknown as Record<string, unknown>, at)];
  }
}

