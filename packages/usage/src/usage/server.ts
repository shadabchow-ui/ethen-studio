import "server-only";

import { createClient } from "@ethen/database/server";
import { conditionalDebit, ensureFreeTierGrant, checkCreditBalance, refundCreditsForUsage } from "../credits/server";

export interface UsageEventPayload {
  user_id: string;
  session_id?: string | null;
  agent_id?: string | null;
  event_type: string;
  model_route?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  credit_cost?: number;
  job_status?: "completed" | "failed" | "setup_required" | "canceled" | "pending";
  metadata?: Record<string, unknown> | null;
}

export interface UsageEventResult {
  ok: boolean;
  error: string | null;
  /**
   * Where the usage event was stored.
   * - "supabase" — persisted to the live usage_events table
   * - "skipped-mock" — user is a mock/demo user, event not persisted
   * - "skipped-no-client" — Supabase client unavailable, event not persisted
   * - "unknown" — could not determine
   */
  persistence: "supabase" | "skipped-mock" | "skipped-no-client" | "unknown";
}

export async function preflightCreditCheck(
  userId: string,
  estimatedCost: number,
): Promise<{ sufficient: boolean; balance: number; estimatedCost: number; reason: string | null }> {
  return checkCreditBalance(userId, estimatedCost);
}

export async function createUsageEvent(payload: UsageEventPayload): Promise<UsageEventResult> {
  const userId = payload.user_id;
  const isMockUser =
    !userId ||
    userId.startsWith("mock-") ||
    userId.startsWith("demo-") ||
    userId === "local-dev";

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
      return { ok: false, error: "usage persistence unavailable", persistence: "skipped-no-client" };
    }
    return { ok: true, error: null, persistence: "skipped-no-client" };
  }

  if (isMockUser) {
    return { ok: true, error: null, persistence: "skipped-mock" };
  }

  const { data, error } = await supabase
    .from("usage_events")
    .insert({
      user_id: userId,
      session_id: payload.session_id ?? null,
      agent_id: payload.agent_id ?? null,
      event_type: payload.event_type,
      model_route: payload.model_route ?? null,
      input_tokens: payload.input_tokens ?? null,
      output_tokens: payload.output_tokens ?? null,
      credit_cost: payload.credit_cost ?? 0,
      metadata: payload.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[usage] insertUsageEvent failed:", error.message);
    return { ok: false, error: error.message, persistence: "unknown" };
  }

  const usageEventId: string = data?.id;
  const creditCost = payload.credit_cost ?? 0;

  if (usageEventId && creditCost > 0) {
    void ensureFreeTierGrant(userId);

    const jobStatus = payload.job_status ?? "completed";
    void conditionalDebit(
      userId,
      creditCost,
      usageEventId,
      jobStatus,
      `${payload.event_type} (${payload.model_route ?? "unknown route"})`
    );
  }

  return { ok: true, error: null, persistence: "supabase" };
}

export async function insertUsageEvent(payload: UsageEventPayload): Promise<void> {
  void createUsageEvent(payload);
}

export async function refundUsageCredits(
  userId: string,
  amount: number,
  usageEventId: string,
  note?: string,
): Promise<void> {
  void refundCreditsForUsage(userId, amount, usageEventId, note);
}

export interface UsageEventRecord {
  id: string;
  user_id: string;
  session_id: string | null;
  agent_id: string | null;
  event_type: string;
  model_route: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  credit_cost: number;
  created_at: string;
}

export async function getUsageEvents(
  userId: string,
  limit = 25,
): Promise<UsageEventRecord[]> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return [];
  }

  const { data, error } = await supabase
    .from("usage_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[usage] getUsageEvents failed:", error.message);
    return [];
  }

  return (data ?? []) as UsageEventRecord[];
}
