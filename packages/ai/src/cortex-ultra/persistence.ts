import "server-only";

import { createClient } from "@ethen/database/server";
import { hasSupabaseEnv } from "@ethen/config/runtime-flags";
import { buildTeamReceipt } from "./team-receipt";
import type { CortexUltraRun, CortexUltraTeamReceipt } from "./ultra-types";

// ── Persisted shape ────────────────────────────────────────────────────────
// Mirrors supabase/migrations/0024_cortex_ultra_runs.sql.
// Only user-safe receipt JSON is stored in cortex_ultra_runs.
// Raw prompts, chain-of-thought, and provider keys are never persisted.

export interface CortexUltraRunRecord {
  id: string;
  run_id: string;
  request_id: string;
  user_id: string | null;
  session_id: string | null;
  project_id: string | null;
  state: string;
  intent_summary: string | null;
  worker_count: number;
  workers_succeeded: number;
  total_tool_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_estimated_cost_usd: number;
  degraded: boolean;
  aborted: boolean;
  abort_reason: string | null;
  stopping_trigger: string | null;
  duration_ms: number | null;
  receipt: CortexUltraTeamReceipt;
  created_at: string;
  completed_at: string | null;
}

export interface RecordUltraRunParams {
  run: CortexUltraRun;
  userId?: string | null;
  sessionId?: string | null;
  projectId?: string | null;
}

export interface RecordUltraRunResult {
  ok: boolean;
  skipped: boolean;
  runRecordId: string | null;
  error: string | null;
}

function isRealUserId(value: string | null | undefined): value is string {
  return Boolean(value && !value.startsWith("mock-") && !value.startsWith("demo-"));
}

// ── Persist ────────────────────────────────────────────────────────────────

export async function recordUltraRun(
  params: RecordUltraRunParams
): Promise<RecordUltraRunResult> {
  if (!hasSupabaseEnv()) {
    return { ok: true, skipped: true, runRecordId: null, error: null };
  }

  const { run } = params;
  const userId = params.userId ?? run.userId ?? null;
  // An Ultra receipt is only durable when it has a tenant owner. Skipping
  // ownerless mock/local runs prevents cross-tenant history leakage.
  if (!isRealUserId(userId)) {
    return { ok: true, skipped: true, runRecordId: null, error: null };
  }
  const receipt = buildTeamReceipt(run, "summary");

  const record: Omit<CortexUltraRunRecord, "id" | "created_at"> = {
    run_id: run.runId,
    request_id: run.requestId,
    user_id: userId,
    session_id: params.sessionId ?? run.sessionId ?? null,
    project_id: params.projectId ?? run.projectId ?? null,
    state: run.state,
    intent_summary: run.intentSummary,
    worker_count: run.workers.length,
    workers_succeeded: run.workers.filter((w) => w.status === "complete").length,
    total_tool_calls: run.workers.reduce((n, w) => n + w.toolCalls.length, 0),
    total_input_tokens: receipt.totalInputTokens,
    total_output_tokens: receipt.totalOutputTokens,
    total_estimated_cost_usd: receipt.totalEstimatedCostUsd,
    degraded: run.state === "DEGRADED_COMPLETE",
    aborted: run.state === "ABORTED",
    abort_reason: run.stoppingRule?.detail ?? null,
    stopping_trigger: run.stoppingRule?.trigger ?? null,
    duration_ms: receipt.durationMs,
    receipt,
    completed_at: run.completedAt,
  };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cortex_ultra_runs")
      .insert(record)
      .select("id")
      .single();

    if (error) {
      return { ok: false, skipped: false, runRecordId: null, error: error.message };
    }

    return { ok: true, skipped: false, runRecordId: data?.id ?? null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, skipped: false, runRecordId: null, error: message };
  }
}

// ── Fetch ──────────────────────────────────────────────────────────────────

export async function fetchUltraRunRecord(
  runId: string
): Promise<CortexUltraRunRecord | null> {
  if (!hasSupabaseEnv()) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cortex_ultra_runs")
      .select("*")
      .eq("run_id", runId)
      .single();

    if (error || !data) return null;
    return data as CortexUltraRunRecord;
  } catch {
    return null;
  }
}

export async function fetchUltraRunsBySession(
  sessionId: string,
  limit = 20
): Promise<CortexUltraRunRecord[]> {
  if (!hasSupabaseEnv()) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cortex_ultra_runs")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as CortexUltraRunRecord[];
  } catch {
    return [];
  }
}
