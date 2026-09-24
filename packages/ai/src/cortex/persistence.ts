import "server-only";

import { createClient } from "@ethen/database/server";
import { hasSupabaseEnv } from "@ethen/config/runtime-flags";
import { redactCortexRouteReceipt } from "./route-receipt";
import type { CortexSpan, EthenRouteReceipt } from "./types";

// ── Persisted shapes ────────────────────────────────────────────────────────
// Mirrors the cortex_runs / cortex_run_spans tables added in
// supabase/migrations/0012_cortex_runs.sql. Only redacted-safe receipt JSON
// is ever stored — no raw provider keys, chain-of-thought, hidden prompts,
// or system messages.

export interface CortexRunRecord {
  id: string;
  user_id: string | null;
  session_id: string | null;
  project_id: string | null;
  request_id: string;
  run_id: string;
  selected_mode: string | null;
  effective_mode: string | null;
  intent: string | null;
  route_profile: string | null;
  route_class: string | null;
  provider_id: string | null;
  model_id: string | null;
  provider_visible: boolean;
  model_visible: boolean;
  fallback_attempted: boolean;
  fallback_used: boolean;
  fallback_status: string | null;
  verifier_used: boolean;
  verifier_status: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  time_to_first_token_ms: number | null;
  status: string;
  receipt: EthenRouteReceipt;
  created_at: string;
}

export interface RecordCortexRunParams {
  userId?: string | null;
  sessionId?: string | null;
  projectId?: string | null;
  selectedMode?: string | null;
  receipt: EthenRouteReceipt;
  spans?: CortexSpan[];
  latencyMs?: number | null;
  /**
   * Slice D: canonical P09/P30 correlation ids. Written when supplied;
   * requires migration 20260904150031 applied. Never synthesized — absent
   * means unbound, never fake-bound.
   */
  canonicalRunId?: string | null;
  canonicalAttemptId?: string | null;
  canonicalOutcomeId?: string | null;
}

export interface RecordCortexRunResult {
  ok: boolean;
  skipped: boolean;
  runRecordId: string | null;
  error: string | null;
}

function isRealId(value: string | null | undefined): boolean {
  if (!value) return false;
  return !value.startsWith("mock-") && !value.startsWith("demo-") && value !== "local-dev";
}

function resolveRunStatus(receipt: EthenRouteReceipt): string {
  if (receipt.fallback.finalStatus === "failed") return "failed";
  if (receipt.verifier.status === "failed") return "failed";
  if (receipt.verifier.status === "warned") return "warning";
  return "completed";
}

/**
 * Persist a single Cortex run (route receipt + optional trace spans) to
 * Supabase. Safe to call unconditionally:
 *  - skips silently when Supabase env is not configured (mock mode / local dev)
 *  - skips silently when userId is missing or a mock/demo sentinel
 *  - never throws; persistence failures must not interrupt the chat response
 */
export async function recordCortexRun(
  params: RecordCortexRunParams
): Promise<RecordCortexRunResult> {
  const {
    userId,
    sessionId,
    projectId,
    selectedMode,
    receipt,
    spans,
    latencyMs,
    canonicalRunId,
    canonicalAttemptId,
    canonicalOutcomeId,
  } = params;

  if (!hasSupabaseEnv()) {
    return { ok: true, skipped: true, runRecordId: null, error: null };
  }

  if (!isRealId(userId)) {
    return { ok: true, skipped: true, runRecordId: null, error: null };
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let supabase;
  try {
    if (userId && UUID_RE.test(userId)) {
      const { createBridgedClient } = await import("@ethen/database/server");
      supabase = createBridgedClient(userId);
    } else {
      supabase = await createClient();
    }
  } catch {
    return { ok: false, skipped: false, runRecordId: null, error: "Cortex persistence client unavailable." };
  }

  // Store the "advanced" redaction tier: provider/model names are kept for
  // server-side observability but cost/score fields follow the receipt's
  // own redaction policy. This never includes prompts or hidden reasoning.
  const safeReceipt = redactCortexRouteReceipt(receipt, "advanced");

  const insertPayload = {
    user_id: userId,
    session_id: isRealId(sessionId) ? sessionId : null,
    project_id: projectId ?? null,
    request_id: receipt.requestId,
    run_id: receipt.runId,
    selected_mode: selectedMode ?? null,
    effective_mode: receipt.mode,
    intent: receipt.intent,
    route_profile: receipt.routeProfile,
    route_class: receipt.routeClass,
    provider_id: safeReceipt.provider.selectedProvider,
    model_id: safeReceipt.provider.selectedModel ?? null,
    provider_visible: receipt.provider.providerVisible,
    model_visible: receipt.provider.modelVisible,
    fallback_attempted: receipt.fallback.attempted,
    fallback_used: receipt.fallback.used,
    fallback_status: receipt.fallback.finalStatus,
    verifier_used: receipt.verifier.used,
    verifier_status: receipt.verifier.status ?? null,
    input_tokens: receipt.usage.inputTokens ?? null,
    output_tokens: receipt.usage.outputTokens ?? null,
    total_tokens: receipt.usage.totalTokens ?? null,
    estimated_cost_usd: receipt.usage.estimatedCostUsd ?? null,
    latency_ms: latencyMs ?? receipt.usage.latencyMs ?? null,
    time_to_first_token_ms: receipt.usage.timeToFirstTokenMs ?? null,
    status: resolveRunStatus(receipt),
    receipt: safeReceipt,
    // Slice D binding columns (migration 20260904150031). Only set when a
    // real canonical id was supplied — never a placeholder.
    ...(canonicalRunId ? { canonical_run_id: canonicalRunId } : {}),
    ...(canonicalAttemptId ? { canonical_attempt_id: canonicalAttemptId } : {}),
    ...(canonicalOutcomeId ? { canonical_outcome_id: canonicalOutcomeId } : {}),
  };

  let runRecordId: string;
  try {
    const { data, error } = await supabase
      .from("cortex_runs")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error || typeof data?.id !== "string" || data.id.trim() === "") {
      return { ok: false, skipped: false, runRecordId: null, error: "Cortex run persistence was not confirmed." };
    }
    runRecordId = data.id;
  } catch {
    return { ok: false, skipped: false, runRecordId: null, error: "Cortex run persistence failed." };
  }

  if (runRecordId && spans && spans.length > 0) {
    const { error: spanError } = await supabase.from("cortex_run_spans").insert(
      spans.map((span) => ({
        run_id: runRecordId,
        span_id: span.spanId,
        parent_span_id: span.parentSpanId ?? null,
        type: span.type,
        label: span.label,
        status: span.status,
        started_at: span.startedAt,
        ended_at: span.endedAt ?? null,
        metadata: span.metadata ?? {},
      }))
    );

    if (spanError) {
      // Non-fatal: the run row is already persisted; spans are best-effort.
      console.error("[cortex] recordCortexRun span insert failed:", spanError.message);
    }
  }

  return { ok: true, skipped: false, runRecordId, error: null };
}

/**
 * Fire-and-forget wrapper for callers (e.g. the chatbot streaming route)
 * that must never block or fail their response on persistence.
 */
export function recordCortexRunAsync(params: RecordCortexRunParams): void {
  void recordCortexRun(params)
    .then((result) => {
      if (!result.ok) console.error("[cortex] recordCortexRunAsync persistence failed:", result.error);
    })
    .catch(() => {
      console.error("[cortex] recordCortexRunAsync unexpected persistence error.");
    });
}

export interface ListCortexRunsParams {
  userId: string;
  limit?: number;
}

/**
 * List recent Cortex runs for a user, most recent first. Returns an empty
 * array (never throws) when Supabase is unavailable or the query fails.
 */
export async function listCortexRuns(
  params: ListCortexRunsParams
): Promise<CortexRunRecord[]> {
  const { userId, limit = 50 } = params;

  if (!hasSupabaseEnv() || !isRealId(userId)) {
    return [];
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cortex_runs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[cortex] listCortexRuns error:", error.message);
      return [];
    }

    return (data ?? []) as CortexRunRecord[];
  } catch {
    return [];
  }
}

export interface GetCortexRunByRunIdParams {
  userId: string;
  runId: string;
}

/**
 * Fetch a single Cortex run by its receipt-level run_id (the id embedded in
 * EthenRouteReceipt.runId, known to the client before persistence happens),
 * rather than the Supabase row id. Used by the finalized-receipt fetch route
 * so the client can poll for the post-stream verifier result without ever
 * needing the database row id. Returns null on any failure or miss.
 */
export async function getCortexRunByRunId(
  params: GetCortexRunByRunIdParams
): Promise<CortexRunRecord | null> {
  const { userId, runId } = params;

  if (!hasSupabaseEnv() || !isRealId(userId) || !runId) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cortex_runs")
      .select("*")
      .eq("run_id", runId)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as CortexRunRecord;
  } catch {
    return null;
  }
}

export interface GetCortexRunParams {
  userId: string;
  runRecordId: string;
}

/**
 * Fetch a single Cortex run (with its trace spans) for detail views.
 * Returns null on any failure rather than throwing.
 */
export async function getCortexRunDetail(
  params: GetCortexRunParams
): Promise<{ run: CortexRunRecord; spans: CortexSpan[] } | null> {
  const { userId, runRecordId } = params;

  if (!hasSupabaseEnv() || !isRealId(userId)) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { data: run, error: runError } = await supabase
      .from("cortex_runs")
      .select("*")
      .eq("id", runRecordId)
      .eq("user_id", userId)
      .single();

    if (runError || !run) {
      return null;
    }

    const { data: spanRows } = await supabase
      .from("cortex_run_spans")
      .select("*")
      .eq("run_id", runRecordId)
      .order("started_at", { ascending: true });

    const spans: CortexSpan[] = (spanRows ?? []).map((row) => ({
      spanId: row.span_id,
      parentSpanId: row.parent_span_id ?? undefined,
      type: row.type,
      label: row.label,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      status: row.status,
      metadata: row.metadata ?? {},
    }));

    return { run: run as CortexRunRecord, spans };
  } catch {
    return null;
  }
}
