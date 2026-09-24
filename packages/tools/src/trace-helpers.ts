import { createClient } from "@ethen/database/client";
import type { CreateToolTraceInput, ToolTrace, ToolEventState } from "./events";

/** Insert a new tool trace row. Failure must not crash calling code. */
export async function createToolTrace(
  input: CreateToolTraceInput
): Promise<ToolTrace | null> {
  try {
    const supabase = createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("tool_traces")
      .insert({
        session_id: input.session_id,
        message_id: input.message_id ?? null,
        tool_id: input.tool_id,
        state: input.state ?? "queued",
        started_at: now,
        completed_at: null,
        summary: input.summary,
        metadata: input.metadata ?? null,
        attempt_id: input.attempt_id ?? null,
        run_id: input.run_id ?? null,
        trace_id: input.trace_id ?? null,
        job_id: input.job_id ?? null,
        context_set_id: input.context_set_id ?? null,
        connector_id: input.connector_id ?? null,
        credential_ref_id: input.credential_ref_id ?? null,
      })
      .select()
      .single();
    if (error) {
      console.warn("[tool-trace] insert failed:", error.message);
      return null;
    }
    return data as ToolTrace;
  } catch (err) {
    console.warn("[tool-trace] unexpected error:", err);
    return null;
  }
}

/** Advance a trace to a new state (completed_at set when terminal). */
export async function updateToolTraceState(
  traceId: string,
  state: ToolEventState,
  patch?: Partial<Pick<ToolTrace, "summary" | "metadata">>
): Promise<boolean> {
  try {
    const supabase = createClient();
    const terminal: ToolEventState[] = ["completed", "failed", "skipped"];
    const { error } = await supabase
      .from("tool_traces")
      .update({
        state,
        completed_at: terminal.includes(state) ? new Date().toISOString() : null,
        ...(patch?.summary ? { summary: patch.summary } : {}),
        ...(patch?.metadata ? { metadata: patch.metadata } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", traceId);
    if (error) {
      console.warn("[tool-trace] update failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[tool-trace] unexpected error:", err);
    return false;
  }
}

/** Fetch all traces for a session, ordered oldest-first. */
export async function getSessionToolTraces(
  sessionId: string
): Promise<ToolTrace[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tool_traces")
      .select("*")
      .eq("session_id", sessionId)
      .order("started_at", { ascending: true });
    if (error) {
      console.warn("[tool-trace] fetch failed:", error.message);
      return [];
    }
    return (data ?? []) as ToolTrace[];
  } catch (err) {
    console.warn("[tool-trace] unexpected error:", err);
    return [];
  }
}
