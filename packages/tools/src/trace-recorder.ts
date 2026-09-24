import "server-only";

import { hasSupabaseEnv } from "@ethen/config/runtime-flags";
import type { ToolTrace, CreateToolTraceInput, ToolEventState } from "./events";

/**
 * Supported trace run modes:
 * - "live":   trace is persisted in tool_traces table via Supabase
 * - "mock":   trace is stored in an in-memory cache for the current process
 */
type TraceRunMode = "live" | "mock";

let modeCache: TraceRunMode | null = null;

function getTraceRunMode(): TraceRunMode {
  if (modeCache !== null) return modeCache;
  modeCache = hasSupabaseEnv() ? "live" : "mock";
  return modeCache;
}

// ── In-memory mock store ─────────────────────────────────────────────────────

const mockStore = new Map<string, ToolTrace>();
let mockTraceCounter = 0;

function nextMockTraceId(): string {
  mockTraceCounter += 1;
  return `mock-trace-${mockTraceCounter}`;
}

function persistMockTrace(input: CreateToolTraceInput): ToolTrace {
  const now = new Date().toISOString();
  const trace: ToolTrace = {
    id: nextMockTraceId(),
    session_id: input.session_id,
    message_id: input.message_id ?? null,
    tool_id: input.tool_id,
    state: input.state ?? "started",
    started_at: now,
    completed_at: null,
    summary: input.summary ?? {},
    metadata: input.metadata ?? null,
    created_at: now,
    updated_at: now,
  };
  mockStore.set(trace.id, trace);
  return trace;
}

function updateMockTrace(traceId: string, state: ToolEventState, patch?: Partial<Pick<ToolTrace, "summary" | "metadata">>): boolean {
  const trace = mockStore.get(traceId);
  if (!trace) return false;

  const terminal: ToolEventState[] = ["completed", "failed", "skipped"];
  mockStore.set(traceId, {
    ...trace,
    state,
    completed_at: terminal.includes(state) ? new Date().toISOString() : null,
    ...(patch?.summary ? { summary: { ...trace.summary, ...patch.summary } } : {}),
    ...(patch?.metadata ? { metadata: { ...(trace.metadata ?? {}), ...patch.metadata } } : {}),
    updated_at: new Date().toISOString(),
  });
  return true;
}

export function getMockSessionTraces(sessionId: string): ToolTrace[] {
  const traces: ToolTrace[] = [];
  for (const trace of mockStore.values()) {
    if (trace.session_id === sessionId) {
      traces.push(trace);
    }
  }
  return traces.sort((a, b) => a.started_at.localeCompare(b.started_at));
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new tool trace record. Chooses live (Supabase) or mock (in-memory)
 * persistence based on the runtime environment. Never throws — returns null on
 * any persistence failure so callers can continue safely.
 */
export async function recordToolTrace(input: CreateToolTraceInput): Promise<ToolTrace | null> {
  const mode = getTraceRunMode();

  if (mode === "mock") {
    try {
      return persistMockTrace(input);
    } catch {
      return null;
    }
  }

  try {
    const { createToolTrace } = await import("./trace-helpers");
    return await createToolTrace(input);
  } catch {
    return null;
  }
}

/**
 * Advance an existing trace to a new state. Returns false if the trace
 * record could not be found or updated.
 */
export async function advanceTrace(
  traceId: string,
  state: ToolEventState,
  patch?: Partial<Pick<ToolTrace, "summary" | "metadata">>,
): Promise<boolean> {
  const mode = getTraceRunMode();

  if (mode === "mock") {
    return updateMockTrace(traceId, state, patch);
  }

  try {
    const { updateToolTraceState } = await import("./trace-helpers");
    return await updateToolTraceState(traceId, state, patch);
  } catch {
    return false;
  }
}

/**
 * Fetch all traces for a session. Returns empty array on any persistence error.
 */
export async function fetchSessionTraces(sessionId: string): Promise<ToolTrace[]> {
  const mode = getTraceRunMode();

  if (mode === "mock") {
    return getMockSessionTraces(sessionId);
  }

  try {
    const { getSessionToolTraces } = await import("./trace-helpers");
    return await getSessionToolTraces(sessionId);
  } catch {
    return [];
  }
}
