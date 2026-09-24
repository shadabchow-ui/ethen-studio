/**
 * Studio V2 Job 02 — image credit ledger.
 * One interface, two adapters with identical state guards:
 * idempotent reserve replay (mismatch conflicts), settle clamping,
 * terminal states, release-only-when-reserved. The Supabase adapter calls
 * the atomic studio_*_credits RPCs; the memory adapter mirrors their guards
 * for tests and local runs.
 */

import "server-only";

import { createServiceClient } from "@ethen/database/service";

export type CreditReservationState = "reserved" | "settled" | "released" | "refunded";

export interface CreditReservation {
  id: string;
  organizationId: string;
  projectId: string;
  jobId: string | null;
  idempotencyKey: string;
  pricingVersionId: string;
  approvedCeiling: number;
  reservedCredits: number;
  state: CreditReservationState;
  settledCredits: number;
  providerEvidenceHash: string | null;
  replayed: boolean;
}

export interface ReserveInput {
  organizationId: string;
  projectId: string;
  jobId: string | null;
  actorId: string;
  idempotencyKey: string;
  pricingVersionId: string;
  approvedCeiling: number;
  reservedCredits: number;
}

export interface ImageCreditLedger {
  reserve(input: ReserveInput): Promise<CreditReservation>;
  settle(projectId: string, idempotencyKey: string, actualCredits: number, providerEvidenceHash: string): Promise<CreditReservation>;
  release(projectId: string, idempotencyKey: string, reason: string): Promise<CreditReservation>;
  get(projectId: string, idempotencyKey: string): Promise<CreditReservation | null>;
}

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|duplicate|23505|already reserved|already exists/i.test(message);
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(parsed) ? (parsed as number) : fallback;
}

/** Explicit local/test adapter. Mirrors the SQL guards field-for-field. */
export class MemoryImageCreditLedger implements ImageCreditLedger {
  private rows = new Map<string, CreditReservation>();
  private key(projectId: string, idempotencyKey: string): string { return `${projectId}:${idempotencyKey}`; }

  async reserve(input: ReserveInput): Promise<CreditReservation> {
    if (input.reservedCredits < 0 || input.approvedCeiling < 0) throw new Error("STUDIO_RESERVE_INVALID: amounts must be >= 0.");
    if (input.reservedCredits > input.approvedCeiling) throw new Error("STUDIO_APPROVAL_REQUIRED: quote exceeds the approved ceiling");
    const existing = this.rows.get(this.key(input.projectId, input.idempotencyKey));
    if (existing) {
      if (existing.reservedCredits !== input.reservedCredits || existing.approvedCeiling !== input.approvedCeiling) {
        throw new Error("STUDIO_RESERVATION_CONFLICT: idempotency key already reserved with different terms");
      }
      return { ...existing, replayed: true };
    }
    const row: CreditReservation = {
      id: `res_${Date.now().toString(36)}_${this.rows.size}`,
      organizationId: input.organizationId, projectId: input.projectId, jobId: input.jobId,
      idempotencyKey: input.idempotencyKey, pricingVersionId: input.pricingVersionId,
      approvedCeiling: input.approvedCeiling, reservedCredits: input.reservedCredits,
      state: "reserved", settledCredits: 0, providerEvidenceHash: null, replayed: false,
    };
    this.rows.set(this.key(input.projectId, input.idempotencyKey), row);
    return { ...row };
  }

  async settle(projectId: string, idempotencyKey: string, actualCredits: number, providerEvidenceHash: string): Promise<CreditReservation> {
    if (actualCredits < 0) throw new Error("STUDIO_SETTLE_INVALID: actual credits must be >= 0.");
    const row = this.rows.get(this.key(projectId, idempotencyKey));
    if (!row) throw new Error("STUDIO_SETTLE_INVALID: no reservation for this key");
    if (row.state === "settled") {
      if (row.settledCredits !== actualCredits) throw new Error("STUDIO_SETTLE_CONFLICT: already settled for a different amount");
      return { ...row, replayed: true };
    }
    if (row.state !== "reserved") throw new Error(`STUDIO_SETTLE_INVALID: reservation is not settleable (state=${row.state})`);
    if (actualCredits > row.reservedCredits) throw new Error("STUDIO_SETTLE_INVALID: actual exceeds reserved");
    const updated: CreditReservation = { ...row, state: "settled", settledCredits: actualCredits, providerEvidenceHash, replayed: false };
    this.rows.set(this.key(projectId, idempotencyKey), updated);
    return { ...updated };
  }

  async release(projectId: string, idempotencyKey: string, reason: string): Promise<CreditReservation> {
    void reason; // Release terms are fixed by the reservation; the reason is recorded in the usage entry by the SQL path.
    const row = this.rows.get(this.key(projectId, idempotencyKey));
    if (!row) throw new Error("STUDIO_RELEASE_INVALID: no reservation for this key");
    if (row.state === "released" || row.state === "refunded") return { ...row, replayed: true };
    if (row.state !== "reserved") throw new Error(`STUDIO_RELEASE_INVALID: reservation is not releasable (state=${row.state})`);
    const updated: CreditReservation = { ...row, state: "released", replayed: false };
    this.rows.set(this.key(projectId, idempotencyKey), updated);
    return { ...updated };
  }

  async get(projectId: string, idempotencyKey: string): Promise<CreditReservation | null> {
    return this.rows.get(this.key(projectId, idempotencyKey)) ?? null;
  }
}

function mapRow(row: Record<string, unknown>, replayed: boolean): CreditReservation {
  return {
    id: String(row.reservation_id ?? row.id),
    organizationId: String(row.organization_id ?? ""),
    projectId: String(row.project_id ?? ""),
    jobId: row.job_id ? String(row.job_id) : null,
    idempotencyKey: String(row.idempotency_key ?? ""),
    pricingVersionId: String(row.pricing_version_id ?? ""),
    approvedCeiling: toNumber(row.approved_ceiling),
    reservedCredits: toNumber(row.reserved_credits),
    state: (row.reservation_state ?? row.state) as CreditReservationState,
    settledCredits: toNumber(row.settled_credits),
    providerEvidenceHash: row.provider_evidence_hash ? String(row.provider_evidence_hash) : null,
    replayed,
  };
}

/** Production adapter over the atomic studio_*_credits RPCs. */
export class SupabaseImageCreditLedger implements ImageCreditLedger {
  private client() {
    const client = createServiceClient();
    if (!client) throw new Error("Image credit ledger requires a configured service client.");
    return client;
  }

  async reserve(input: ReserveInput): Promise<CreditReservation> {
    const { data, error } = await this.client().rpc("studio_reserve_credits", {
      p_organization_id: input.organizationId, p_project_id: input.projectId, p_job_id: input.jobId,
      p_actor_id: input.actorId, p_idempotency_key: input.idempotencyKey, p_pricing_version_id: input.pricingVersionId,
      p_approved_ceiling: input.approvedCeiling, p_reserved_credits: input.reservedCredits,
    });
    if (error) throw new Error(`Credit reservation failed: ${error.message}`);
    const receipt = (Array.isArray(data) ? data[0] : data) as { reservation_id: string; reservation_state: string; replayed: boolean };
    const current = await this.get(input.projectId, input.idempotencyKey);
    if (!current) throw new Error("Credit reservation is not readable after reserve.");
    return { ...current, replayed: receipt.replayed === true };
  }

  async settle(projectId: string, idempotencyKey: string, actualCredits: number, providerEvidenceHash: string): Promise<CreditReservation> {
    const { data, error } = await this.client().rpc("studio_settle_credits", {
      p_project_id: projectId, p_idempotency_key: idempotencyKey,
      p_actual_credits: actualCredits, p_provider_evidence_hash: providerEvidenceHash,
    });
    if (error) throw new Error(`Credit settlement failed: ${error.message}`);
    const receipt = (Array.isArray(data) ? data[0] : data) as { replayed: boolean };
    const current = await this.get(projectId, idempotencyKey);
    if (!current) throw new Error("Credit reservation is not readable after settle.");
    return { ...current, replayed: receipt.replayed === true };
  }

  async release(projectId: string, idempotencyKey: string, reason: string): Promise<CreditReservation> {
    const { data, error } = await this.client().rpc("studio_release_credits", {
      p_project_id: projectId, p_idempotency_key: idempotencyKey, p_reason: reason,
    });
    if (error) {
      // A duplicate release racing a settle winner surfaces as unique/invalid;
      // re-read so callers observe the terminal truth instead of a raw error.
      if (isUniqueViolation(error)) {
        const current = await this.get(projectId, idempotencyKey);
        if (current) return { ...current, replayed: true };
      }
      throw new Error(`Credit release failed: ${error.message}`);
    }
    const receipt = (Array.isArray(data) ? data[0] : data) as { replayed: boolean };
    const current = await this.get(projectId, idempotencyKey);
    if (!current) throw new Error("Credit reservation is not readable after release.");
    return { ...current, replayed: receipt.replayed === true };
  }

  async get(projectId: string, idempotencyKey: string): Promise<CreditReservation | null> {
    const { data, error } = await this.client().from("studio_credit_reservations")
      .select("*").eq("project_id", projectId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (error) throw new Error(`Credit reservation read failed: ${error.message}`);
    return data ? mapRow(data as Record<string, unknown>, false) : null;
  }
}
