/**
 * Studio cost lifecycle contract. The in-memory implementation is test-only;
 * a production repository must execute the same transitions transactionally.
 */
export type StudioChargeState = "reserved" | "settled" | "released" | "refunded";
export type StudioCreditBlock = "ethen_credit_exhausted" | "provider_account_locked" | "quota_exceeded" | "approval_required";

export interface StudioPricingInput {
  providerId: string; modelId: string; capability: string; pricingVersion: string;
  quantity: number; resolution?: string; durationSeconds?: number; quality?: string;
  unitCredits: number;
}
export interface StudioCostEstimate { pricingVersion: string; totalCredits: number; input: Readonly<StudioPricingInput>; }
export interface StudioQuota { creditBalance: number; projectCeiling?: number; projectConsumed?: number; dailyLimit?: number; dailyConsumed?: number; concurrentLimit?: number; activeJobs?: number; }
export interface StudioReservation {
  jobId: string; projectId: string; organizationId: string; actorId: string; idempotencyKey: string;
  estimate: StudioCostEstimate; approvedCeiling: number; state: StudioChargeState; reservedCredits: number; settledCredits: number; createdAt: string; settledAt: string | null;
}

export function estimateStudioCost(input: StudioPricingInput): StudioCostEstimate {
  if (!input.providerId || !input.modelId || !input.capability || !input.pricingVersion) throw new Error("Provider, model, capability, and pricing version are required.");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isFinite(input.unitCredits) || input.unitCredits < 0) throw new Error("Pricing quantity and unit credits must be valid.");
  return { pricingVersion: input.pricingVersion, totalCredits: Math.ceil(input.quantity * input.unitCredits), input: Object.freeze({ ...input }) };
}

export function checkStudioQuota(quota: StudioQuota, estimate: StudioCostEstimate): StudioCreditBlock | null {
  if (estimate.totalCredits > quota.creditBalance) return "ethen_credit_exhausted";
  if ((quota.projectConsumed ?? 0) + estimate.totalCredits > (quota.projectCeiling ?? Number.POSITIVE_INFINITY)) return "quota_exceeded";
  if ((quota.dailyConsumed ?? 0) + estimate.totalCredits > (quota.dailyLimit ?? Number.POSITIVE_INFINITY)) return "quota_exceeded";
  if ((quota.activeJobs ?? 0) >= (quota.concurrentLimit ?? Number.POSITIVE_INFINITY)) return "quota_exceeded";
  return null;
}

/** Explicit local/test adapter; not a production persistence authority. */
export class InMemoryStudioSettlementService {
  private readonly entries = new Map<string, StudioReservation>();

  reserve(input: Omit<StudioReservation, "state" | "reservedCredits" | "settledCredits" | "createdAt" | "settledAt">, quota: StudioQuota): StudioReservation {
    const existing = this.entries.get(input.idempotencyKey);
    if (existing) return { ...existing };
    const block = checkStudioQuota(quota, input.estimate);
    if (block) throw new Error(block);
    if (input.estimate.totalCredits > input.approvedCeiling) throw new Error("approval_required");
    const entry: StudioReservation = { ...input, estimate: { ...input.estimate, input: { ...input.estimate.input } }, state: "reserved", reservedCredits: input.estimate.totalCredits, settledCredits: 0, createdAt: new Date().toISOString(), settledAt: null };
    this.entries.set(input.idempotencyKey, entry);
    return { ...entry };
  }

  settle(idempotencyKey: string, actualCredits: number): StudioReservation {
    const entry = this.requireReserved(idempotencyKey);
    if (!Number.isFinite(actualCredits) || actualCredits < 0 || actualCredits > entry.reservedCredits) throw new Error("Actual usage must be within the approved reservation.");
    entry.state = "settled"; entry.settledCredits = actualCredits; entry.settledAt = new Date().toISOString(); return { ...entry };
  }
  release(idempotencyKey: string): StudioReservation { const entry = this.requireReserved(idempotencyKey); entry.state = "released"; entry.settledAt = new Date().toISOString(); return { ...entry }; }
  refund(idempotencyKey: string): StudioReservation { const entry = this.requireReserved(idempotencyKey); entry.state = "refunded"; entry.settledAt = new Date().toISOString(); return { ...entry }; }
  get(idempotencyKey: string): StudioReservation | null { const entry = this.entries.get(idempotencyKey); return entry ? { ...entry } : null; }
  private requireReserved(key: string): StudioReservation { const entry = this.entries.get(key); if (!entry) throw new Error("Reservation not found."); if (entry.state !== "reserved") throw new Error("Reservation has already been finalized."); return entry; }
}
