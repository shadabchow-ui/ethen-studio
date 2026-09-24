import "server-only";

import { createServiceClient } from "@ethen/database/service";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CreditEntryType = "grant" | "purchase" | "usage" | "refund" | "adjustment";

export interface CreditLedgerEntry {
  id: string;
  user_id: string;
  amount: number;
  entry_type: CreditEntryType;
  usage_event_id: string | null;
  note: string | null;
  created_at: string;
}

export interface CreditPreflightResult {
  sufficient: boolean;
  balance: number;
  estimatedCost: number;
  reason: string | null;
}

// ── Balance ────────────────────────────────────────────────────────────────────

/**
 * Current balance = sum of all ledger amounts for the user.
 * Returns 0 if service client is unavailable (local/mock mode).
 */
export async function getCreditBalance(userId: string): Promise<number> {
  const supabase = createServiceClient();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("credit_ledger")
    .select("amount")
    .eq("user_id", userId);

  if (error) {
    console.error("[credits] getCreditBalance failed:", error.message);
    return 0;
  }

  return (data ?? []).reduce((sum: number, row: { amount: number }) => sum + row.amount, 0);
}

// ── Grant ──────────────────────────────────────────────────────────────────────

/**
 * Insert a positive credit grant for a user (e.g. free-tier starting grant).
 * No-op in local/mock mode. Failure is non-fatal.
 */
export async function grantCredits(
  userId: string,
  amount: number,
  note: string
): Promise<boolean> {
  if (amount <= 0) return false;
  const supabase = createServiceClient();
  if (!supabase) return false;

  const { error } = await supabase.from("credit_ledger").insert({
    user_id: userId,
    amount,
    entry_type: "grant" as CreditEntryType,
    note,
  });

  if (error) {
    console.error("[credits] grantCredits failed:", error.message);
    return false;
  }
  return true;
}

// ── Debit ──────────────────────────────────────────────────────────────────────

/**
 * Insert a negative ledger entry (usage debit) linked to a usage_event_id.
 * Idempotent: skips if a 'usage' entry for the same usage_event_id already exists.
 * No-op in local/mock mode. Failure is non-fatal.
 */
export async function debitCreditsForUsage(
  userId: string,
  creditCost: number,
  usageEventId: string,
  note?: string
): Promise<boolean> {
  if (creditCost <= 0) return false;
  const supabase = createServiceClient();
  if (!supabase) return false;

  // Idempotency check — skip if debit for this event already exists
  const { data: existing, error: checkError } = await supabase
    .from("credit_ledger")
    .select("id")
    .eq("usage_event_id", usageEventId)
    .eq("entry_type", "usage")
    .limit(1);

  if (checkError) {
    console.error("[credits] debit idempotency check failed:", checkError.message);
    return false;
  }

  if (existing && existing.length > 0) {
    // Already debited for this event — no-op
    return true;
  }

  const { error } = await supabase.from("credit_ledger").insert({
    user_id: userId,
    amount: -creditCost,
    entry_type: "usage" as CreditEntryType,
    usage_event_id: usageEventId,
    note: note ?? `usage debit`,
  });

  if (error) {
    console.error("[credits] debitCreditsForUsage failed:", error.message);
    return false;
  }
  return true;
}

// ── Free-tier grant on first use ───────────────────────────────────────────────

/**
 * Starting credit grant for new users.
 *
 * This value is a prototype placeholder. It has no business backing, no
 * monetization model, and no pricing research. Replace with a real
 * grant amount when billing/credits product design is complete.
 */
export const FREE_TIER_STARTING_CREDITS = 50;

/**
 * Ensures a user has at least one ledger entry (starting grant).
 * Call on first session creation or first usage event.
 * No-op if the user already has any ledger history.
 * No-op in local/mock mode.
 */
export async function ensureFreeTierGrant(userId: string): Promise<void> {
  const supabase = createServiceClient();
  if (!supabase) return;

  const { data, error } = await supabase
    .from("credit_ledger")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    console.error("[credits] ensureFreeTierGrant check failed:", error.message);
    return;
  }

  if (data && data.length > 0) return; // already has history

  await grantCredits(
    userId,
    FREE_TIER_STARTING_CREDITS,
    `free tier starting grant (${FREE_TIER_STARTING_CREDITS} credits)`
  );
}

// ── Ledger history ─────────────────────────────────────────────────────────────

/**
 * Fetch recent ledger rows for a user, newest first.
 * Returns [] if service client is unavailable.
 */
export async function getCreditLedger(
  userId: string,
  limit = 25
): Promise<CreditLedgerEntry[]> {
  const supabase = createServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("credit_ledger")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[credits] getCreditLedger failed:", error.message);
    return [];
  }

  return (data ?? []) as CreditLedgerEntry[];
}

// ── Balance preflight ──────────────────────────────────────────────────────────

export async function checkCreditBalance(
  userId: string,
  estimatedCost: number,
): Promise<CreditPreflightResult> {
  if (estimatedCost <= 0) {
    return { sufficient: true, balance: await getCreditBalance(userId), estimatedCost: 0, reason: null };
  }
  const balance = await getCreditBalance(userId);
  if (balance < estimatedCost) {
    return { sufficient: false, balance, estimatedCost, reason: `Insufficient credits: have ${balance}, need ${estimatedCost}.` };
  }
  return { sufficient: true, balance, estimatedCost, reason: null };
}

// ── Refund ─────────────────────────────────────────────────────────────────────

export async function refundCreditsForUsage(
  userId: string,
  amount: number,
  usageEventId: string,
  note?: string,
): Promise<boolean> {
  if (amount <= 0) return false;
  const supabase = createServiceClient();
  if (!supabase) return false;

  const { data: existing } = await supabase
    .from("credit_ledger")
    .select("id")
    .eq("usage_event_id", usageEventId)
    .eq("entry_type", "refund")
    .limit(1);

  if (existing && existing.length > 0) return true;

  const { error } = await supabase.from("credit_ledger").insert({
    user_id: userId,
    amount,
    entry_type: "refund" as CreditEntryType,
    usage_event_id: usageEventId,
    note: note ?? `refund for failed usage`,
  });

  if (error) {
    console.error("[credits] refundCreditsForUsage failed:", error.message);
    return false;
  }
  return true;
}

// ── Conditional debit ──────────────────────────────────────────────────────────

export async function conditionalDebit(
  userId: string,
  creditCost: number,
  usageEventId: string,
  jobStatus: "completed" | "failed" | "setup_required" | "canceled" | "pending",
  note?: string,
): Promise<boolean> {
  if (jobStatus !== "completed") return true;
  return debitCreditsForUsage(userId, creditCost, usageEventId, note);
}
