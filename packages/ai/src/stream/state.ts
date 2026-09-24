/**
 * FJ-11 — Deterministic stream UI state reducer.
 *
 * Consumers reduce `StreamEventEnvelope`s into a small UI state:
 *   - phase "pending" — set IMMEDIATELY on message-start / reasoning-status
 *     (the UI must render a pending/thinking surface before any text token);
 *   - phase "streaming" — from the first text-delta onward;
 *   - phase "terminal" — completion / cancellation / non-recoverable error.
 *
 * Text accumulation, tool/citation/artifact/approval collections, and
 * terminal metadata are exposed as plain data. Pure + testable.
 */

import type {
  StreamEvent,
  StreamEventEnvelope,
} from "./contract";

export type StreamPhase = "pending" | "streaming" | "terminal";

export interface ToolRecord {
  tool: string;
  callId: string;
  ok: boolean | null;
  label?: string;
}

export interface StreamUiState {
  phase: StreamPhase;
  messageId: string | null;
  text: string;
  reasoning: { status: string; summary?: string } | null;
  tools: ToolRecord[];
  citations: Array<{ index: number; title: string; url?: string }>;
  artifacts: Array<{ artifactId: string; kind: string }>;
  approvals: Array<{ approvalId: string; tool: string }>;
  /** Set once a terminal event arrives. */
  terminal: "complete" | "cancelled" | "error" | null;
  /** Last sequence seen — stable ordering anchor. */
  lastSequence: number;
  /** True once at least one envelope was applied. */
  hydrated: boolean;
}

export function createInitialStreamState(): StreamUiState {
  return {
    phase: "pending",
    messageId: null,
    text: "",
    reasoning: null,
    tools: [],
    citations: [],
    artifacts: [],
    approvals: [],
    terminal: null,
    lastSequence: -1,
    hydrated: false,
  };
}

function applyEvent(state: StreamUiState, event: StreamEvent): StreamUiState {
  const next: StreamUiState = { ...state };
  if (event.context.sequence > state.lastSequence) {
    next.lastSequence = event.context.sequence;
  }
  next.hydrated = true;

  switch (event.type) {
    case "message-start":
      next.messageId = event.messageId;
      if (next.phase === "pending") next.phase = "pending";
      break;
    case "reasoning-status":
      next.messageId = event.messageId;
      next.reasoning = { status: event.data.status, summary: event.data.summary };
      // Pending surface stays until the first text token.
      if (next.phase === "pending") next.phase = "pending";
      break;
    case "text-delta":
      next.messageId = event.messageId;
      next.text += event.delta;
      // Terminal is sticky: late deltas after completion/cancellation/error
      // must not resurrect the streaming phase.
      if (next.terminal === null) next.phase = "streaming";
      break;
    case "tool-dispatch":
      next.tools.push({ tool: event.tool, callId: event.callId, ok: null, label: event.label });
      break;
    case "tool-result": {
      const existing = next.tools.find((t) => t.callId === event.callId);
      if (existing) existing.ok = event.ok;
      else next.tools.push({ tool: event.tool, callId: event.callId, ok: event.ok });
      break;
    }
    case "citation":
      next.citations.push({ index: event.index, title: event.title, url: event.url });
      break;
    case "artifact-update":
      next.artifacts.push({ artifactId: event.artifactId, kind: event.kind });
      break;
    case "approval-pending":
      next.approvals.push({ approvalId: event.approvalId, tool: event.tool });
      break;
    case "completion":
      next.terminal = "complete";
      next.phase = "terminal";
      break;
    case "cancellation":
      next.terminal = "cancelled";
      next.phase = "terminal";
      break;
    case "error":
      next.terminal = "error";
      next.phase = "terminal";
      break;
    case "ping":
    case "unknown":
      break;
  }
  return next;
}

/**
 * Reduce an envelope into UI state. Returns a NEW state object; the input
 * state is never mutated.
 */
export function reduceStreamEvent(
  state: StreamUiState,
  envelope: StreamEventEnvelope,
): StreamUiState {
  return applyEvent(state, envelope.event);
}

/**
 * Convenience: reduce a batch of envelopes (e.g. a snapshot replay) into
 * state, honoring stable sequence ordering.
 */
export function reduceStreamEvents(
  state: StreamUiState,
  envelopes: StreamEventEnvelope[],
): StreamUiState {
  let next = state;
  for (const envelope of envelopes) {
    next = reduceStreamEvent(next, envelope);
  }
  return next;
}

/** True when the state is terminal. */
export function isStreamTerminal(state: StreamUiState): boolean {
  return state.phase === "terminal" && isTerminalEventState(state);
}

function isTerminalEventState(state: StreamUiState): boolean {
  return state.terminal !== null;
}
