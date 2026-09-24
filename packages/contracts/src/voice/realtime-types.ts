export type RealtimeSessionState =
  | "idle"
  | "requesting_mic"
  | "mic_denied"
  | "connecting"
  | "connected"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "ended"
  | "failed";

/** Core transcript/system event (unchanged from v1). */
export type RealtimeTranscriptEvent = {
  id: string;
  type: "user_transcript" | "agent_transcript" | "system" | "error";
  text: string;
  timestamp: string;
};

/** Tool call event types added for tool-calling observability. */
export type ToolEventType =
  | "tool.called"
  | "tool.completed"
  | "tool.failed";

/** Handoff event types added for handoff observability. */
export type HandoffEventType =
  | "handoff.requested"
  | "handoff.completed";

/** Union of all realtime event types (transcript + tool + handoff). */
export type RealtimeEventType =
  | RealtimeTranscriptEvent["type"]
  | ToolEventType
  | HandoffEventType;

/**
 * Extended realtime event. For transcript events, `text` is the message.
 * For tool/handoff events, `text` is a human-readable summary and
 * the structured payload lives in `details`.
 */
export type RealtimeEvent = {
  id: string;
  type: RealtimeEventType;
  text: string;
  timestamp: string;
  /** Structured payload for tool call and handoff events. */
  details?: RealtimeEventDetails;
};

/** Structured payload carried by tool-call and handoff events. */
export type RealtimeEventDetails = {
  /** Tool name (for tool.* events) */
  toolName?: string;
  /** Tool safety labels */
  safetyLabels?: string[];
  /** Tool call status */
  toolStatus?: "called" | "completed" | "failed" | "awaiting_approval" | "rejected";
  /** Approval status for tool calls */
  approvalStatus?: "not_required" | "pending" | "approved" | "rejected";
  /** Mock request payload */
  request?: Record<string, unknown>;
  /** Mock response payload */
  response?: Record<string, unknown>;
  /** Handoff trigger (for handoff.* events) */
  handoffTrigger?: string;
  /** Handoff target */
  handoffTarget?: string;
  /** Handoff status */
  handoffStatus?: "requested" | "queued" | "assigned" | "completed" | "cancelled";
  /** Duration in milliseconds */
  durationMs?: number;
};
