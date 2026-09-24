// ── Usage Ledger Foundation ──────────────────────────────────────────────────
// Conservative beta-grade credit ledger. Tracks reserved → charged / refunded /
// failed_no_charge / failed_charged_by_provider states.
//
// This is an in-memory implementation for beta. Replace with a durable store
// (database table or Supabase) before public launch. Does not implement Stripe,
// billing, or real payment flows.

import { STORAGE_STATUS_LOCAL_FS } from "./usage/types";

export type LedgerSettlementStatus =
  | "reserved"
  | "charged"
  | "refunded"
  | "failed_no_charge"
  | "failed_charged_by_provider";

export const LEDGER_SETTLEMENT_LABELS: Record<LedgerSettlementStatus, string> = {
  reserved: "Reserved (pending)",
  charged: "Charged",
  refunded: "Refunded",
  failed_no_charge: "Failed — no charge",
  failed_charged_by_provider: "Failed — provider may have charged",
};

export interface UsageLedgerEntry {
  id: string;
  jobId: string;
  assetId?: string | null;
  providerId: string;
  modelId?: string | null;
  capability: string;
  estimatedCredits: number;
  chargedCredits: number;
  settlementStatus: LedgerSettlementStatus;
  reason?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  settledAt?: string | null;
}

export interface LedgerReserveInput {
  jobId: string;
  estimatedCredits: number;
  providerId: string;
  modelId?: string | null;
  capability: string;
  sessionId?: string | null;
}

export interface LedgerSettleInput {
  jobId: string;
  status: LedgerSettlementStatus;
  chargedCredits?: number;
  reason?: string | null;
  assetId?: string | null;
}

let ledger: UsageLedgerEntry[] = [];
let nextLedgerId = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `ledger-${nextLedgerId++}-${Date.now()}`;
}

export function reserveCredits(input: LedgerReserveInput): UsageLedgerEntry {
  const entry: UsageLedgerEntry = {
    id: generateId(),
    jobId: input.jobId,
    providerId: input.providerId,
    modelId: input.modelId ?? null,
    capability: input.capability,
    estimatedCredits: input.estimatedCredits,
    chargedCredits: 0,
    settlementStatus: "reserved",
    sessionId: input.sessionId ?? null,
    createdAt: nowIso(),
  };
  ledger.unshift(entry);
  return entry;
}

export function settleCredits(input: LedgerSettleInput): UsageLedgerEntry | null {
  const existing = ledger.find((e) => e.jobId === input.jobId);
  if (!existing) {
    // Create a new entry if none exists
    const entry: UsageLedgerEntry = {
      id: generateId(),
      jobId: input.jobId,
      providerId: "unknown",
      capability: "unknown",
      estimatedCredits: 0,
      chargedCredits: input.chargedCredits ?? 0,
      settlementStatus: input.status,
      reason: input.reason ?? null,
      assetId: input.assetId ?? null,
      createdAt: nowIso(),
      settledAt: nowIso(),
    };
    ledger.unshift(entry);
    return entry;
  }

  existing.settlementStatus = input.status;
  existing.chargedCredits = input.chargedCredits ?? existing.estimatedCredits;
  existing.reason = input.reason ?? null;
  existing.assetId = input.assetId ?? existing.assetId;
  existing.settledAt = nowIso();

  return { ...existing };
}

export function getLedgerEntryByJob(jobId: string): UsageLedgerEntry | undefined {
  return ledger.find((e) => e.jobId === jobId);
}

export function getLedgerEntries(options?: {
  sessionId?: string | null;
  status?: LedgerSettlementStatus;
}): UsageLedgerEntry[] {
  let filtered = [...ledger];
  if (options?.sessionId) {
    filtered = filtered.filter((e) => e.sessionId === options.sessionId);
  }
  if (options?.status) {
    filtered = filtered.filter((e) => e.settlementStatus === options.status);
  }
  return filtered;
}

export function getLedgerSummary(options?: { sessionId?: string | null }): {
  totalEstimated: number;
  totalCharged: number;
  totalRefunded: number;
  totalFailedNoCharge: number;
  totalFailedCharged: number;
  totalReserved: number;
  entryCount: number;
} {
  const entries = options?.sessionId
    ? ledger.filter((e) => e.sessionId === options.sessionId)
    : ledger;

  return {
    totalEstimated: entries.reduce((sum, e) => sum + e.estimatedCredits, 0),
    totalCharged: entries
      .filter((e) => e.settlementStatus === "charged")
      .reduce((sum, e) => sum + e.chargedCredits, 0),
    totalRefunded: entries
      .filter((e) => e.settlementStatus === "refunded")
      .reduce((sum, e) => sum + e.estimatedCredits, 0),
    totalFailedNoCharge: entries
      .filter((e) => e.settlementStatus === "failed_no_charge")
      .reduce((sum, e) => sum + e.estimatedCredits, 0),
    totalFailedCharged: entries
      .filter((e) => e.settlementStatus === "failed_charged_by_provider")
      .reduce((sum, e) => sum + e.estimatedCredits, 0),
    totalReserved: entries
      .filter((e) => e.settlementStatus === "reserved")
      .reduce((sum, e) => sum + e.estimatedCredits, 0),
    entryCount: entries.length,
  };
}

export function clearLedger(): void {
  ledger = [];
  nextLedgerId = 1;
}

export const LEDGER_STORE_DURABILITY = STORAGE_STATUS_LOCAL_FS;

// ─── Durable storage hooks (called by server-side sync layer) ────────────

export function hydrateLedgerStore(newLedger: UsageLedgerEntry[], newNextId: number): void {
  ledger = newLedger;
  nextLedgerId = newNextId;
}

export function snapshotLedgerStore(): UsageLedgerEntry[] {
  return [...ledger];
}

export function snapshotLedgerNextId(): number {
  return nextLedgerId;
}
