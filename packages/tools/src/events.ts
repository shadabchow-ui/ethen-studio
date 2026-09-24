import type { ToolApprovalState } from "@ethen/contracts/tools/types";

// Typed tool event lifecycle for Phase 6.2.
// These types cover the full state machine for a single tool invocation trace.
// Real tool execution is out of scope; these types scaffold the persistence model.

export type ToolEventState =
  | "queued"
  | "started"
  | "progress"
  | "completed"
  | "failed"
  | "skipped"
  | "approval_required"
  | "blocked";            // tool is policy-blocked; execution was never attempted

/** A single append-only event within a tool trace. */
export interface ToolEvent {
  id: string;
  trace_id: string;
  state: ToolEventState;
  occurred_at: string; // ISO 8601
  detail?: string | null;
}

/** Sanitized summary stored with a trace — must never contain secrets or large payloads. */
export interface ToolTraceSummary {
  inputSummary?: string | null;
  outputSummary?: string | null;
  errorSummary?: string | null;
  approvalState?: ToolApprovalState | null;
}

/** Persisted record of one tool invocation. Append-only; state reflects latest event. */
export interface ToolTrace {
  id: string;
  session_id: string;
  message_id: string | null;
  tool_id: string;           // matches CodingToolId or any future tool id
  state: ToolEventState;
  started_at: string;        // ISO 8601
  completed_at: string | null;
  summary: ToolTraceSummary;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  /**
   * P12 canonical execution binding. Null on legacy session-only traces.
   * Correlation only — never authorization, never secret material.
   */
  attempt_id?: string | null;
  run_id?: string | null;
  trace_id?: string | null;
  job_id?: string | null;
  context_set_id?: string | null;
  connector_id?: string | null;
  credential_ref_id?: string | null;
}

export type CreateToolTraceInput = Pick<
  ToolTrace,
  "session_id" | "tool_id" | "summary"
> & {
  message_id?: string | null;
  state?: ToolEventState;
  metadata?: Record<string, unknown> | null;
  attempt_id?: string | null;
  run_id?: string | null;
  trace_id?: string | null;
  job_id?: string | null;
  context_set_id?: string | null;
  connector_id?: string | null;
  credential_ref_id?: string | null;
};
