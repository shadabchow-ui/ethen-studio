import type { RunEvent, CodingAgentRun } from "./runtime-types";

// ─── Stream frame kinds (ephemeral — not persisted as ledger events) ────────

export type StreamFrameKind =
  | "assistant_delta"
  | "terminal_stdout"
  | "terminal_stderr"
  | "heartbeat";

// ─── Stream message kinds (envelope wrappers sent over SSE/WebSocket) ────────

export type CodingStreamMessageKind =
  | "snapshot"     // Initial batch of events on connect
  | "event"        // Single persisted RunEvent
  | "frame"        // Ephemeral stream frame
  | "error"        // Transport-level error
  | "ping";        // Keepalive

export interface SnapshotMessage {
  kind: "snapshot";
  runId: string;
  lastSequence: number;
  events: RunEvent[];
  run?: Pick<CodingAgentRun, "id" | "status" | "title">;
}

export interface EventMessage {
  kind: "event";
  runId: string;
  event: RunEvent;
}

export interface FrameMessage {
  kind: "frame";
  runId: string;
  frameKind: StreamFrameKind;
  payload: string;
  timestamp: string;
}

export interface ErrorMessage {
  kind: "error";
  runId: string;
  message: string;
}

export interface PingMessage {
  kind: "ping";
  timestamp: string;
}

export type CodingStreamMessage =
  | SnapshotMessage
  | EventMessage
  | FrameMessage
  | ErrorMessage
  | PingMessage;

/** Safely parse a SSE data line into a CodingStreamMessage. Unknown kinds return null. */
export function parseCodingStreamMessage(
  raw: string
): CodingStreamMessage | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const kind = parsed.kind as string | undefined;
    if (
      kind === "snapshot" ||
      kind === "event" ||
      kind === "frame" ||
      kind === "error" ||
      kind === "ping"
    ) {
      return parsed as unknown as CodingStreamMessage;
    }
    return null;
  } catch {
    return null;
  }
}
