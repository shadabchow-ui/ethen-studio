/**
 * STUDIO-DEL-01 — owner data rules for in-app account deletion, as code.
 * Pure and framework-free so unit tests cover it without Clerk/Supabase.
 *
 * Rule source: the owner's DATA RULES for this job. Anything the rules do not
 * decide is a named assumption below and is listed for owner review; no
 * retention duration is invented (UNKNOWN until the owner sets it).
 */

/** What happens to a category of data when deletion is finalized. */
export type DeletionAction = "delete" | "anonymize" | "retain_restricted" | "freeze" | "expire";

export interface DeletionCategory {
  id: string;
  action: DeletionAction;
  /** Plain-language user-facing description (public copy: owner review). */
  description: string;
}

export const DELETION_CATEGORIES: readonly DeletionCategory[] = [
  { id: "account_profile", action: "delete", description: "Your Studio account and profile" },
  { id: "preferences", action: "delete", description: "Your personal preferences and settings" },
  { id: "prompts", action: "delete", description: "Your prompts" },
  { id: "generations", action: "delete", description: "Your generations" },
  { id: "uploaded_assets", action: "delete", description: "Assets you uploaded" },
  { id: "generated_media", action: "delete", description: "Generated images, video and audio" },
  { id: "projects", action: "delete", description: "Your projects and other content you own" },
  { id: "usage_analytics", action: "anonymize", description: "Usage analytics (personal identifiers removed)" },
  { id: "operational_identifiers", action: "anonymize", description: "Non-essential personal identifiers in retained operational records" },
  { id: "invoices_payments", action: "retain_restricted", description: "Invoices and payment records required by law" },
  { id: "credit_transactions", action: "retain_restricted", description: "Minimal credit transactions kept for accounting, refunds, disputes and fraud prevention" },
  { id: "purchased_credits", action: "freeze", description: "Unused purchased credits are frozen and referred for manual refund review" },
  { id: "promotional_credits", action: "expire", description: "Unused promotional credits expire when deletion is finalized" },
];

/** Retention duration for restricted records: the owner has not set one. */
export const RETENTION_SCHEDULE = "UNKNOWN" as const;

export type LedgerEntryType = "grant" | "purchase" | "usage" | "refund" | "adjustment";

export interface LedgerRow {
  entryType: LedgerEntryType;
  amount: number;
}

export interface CreditDisposition {
  /** Current balance, floored at 0. */
  balance: number;
  /** Frozen for manual refund review; never forfeited automatically. */
  purchasedFrozen: number;
  /** Expires at finalization. */
  promotionalExpiring: number;
}

/**
 * Split an unused balance into purchased (frozen) and promotional (expiring).
 *
 * The ledger does not record which credits a usage debit consumed, so the
 * split is an ASSUMPTION flagged for owner review: frozen = min(balance,
 * total purchased). That is the largest purchased remainder any consumption
 * order could leave, so no possibly-purchased credit is ever forfeited
 * automatically (rule: "no automatic forfeiture or refund").
 */
export function computeCreditDisposition(rows: readonly LedgerRow[]): CreditDisposition {
  let sum = 0;
  let purchased = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.amount)) continue;
    sum += row.amount;
    if (row.entryType === "purchase" && row.amount > 0) purchased += row.amount;
  }
  const balance = Math.max(0, sum);
  const purchasedFrozen = Math.min(balance, purchased);
  return { balance, purchasedFrozen, promotionalExpiring: balance - purchasedFrozen };
}

/**
 * Studio ICU project balances carry no promotional/purchased provenance, so
 * under the same no-forfeiture rule every positive balance is frozen.
 */
export function freezeIcuBalance(balanceIcu: number): number {
  return Number.isFinite(balanceIcu) && balanceIcu > 0 ? balanceIcu : 0;
}

/** Subscription states that still require the user to cancel first. */
const SUBSCRIPTION_CLEARED = new Set(["inactive", "canceled"]);

export function subscriptionBlocksDeletion(state: string | null | undefined): boolean {
  return state != null && !SUBSCRIPTION_CLEARED.has(state);
}

export const CONFIRMATION_WORD = "DELETE" as const;
