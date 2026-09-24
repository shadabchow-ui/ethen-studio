import "server-only";

/**
 * STUDIO_04 route-adapter economics access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed price catalog, quote store and receipt reads over the j04
 * schema, plus RPC wrappers for the atomic hold/settle/release functions.
 * Service-role bypasses RLS, so every call binds explicit project scope.
 */
import { requireServiceClient } from "./supabase-data";
import {
  EconomicsError,
  type CreditBalance,
  type MeterUnit,
  type PriceConfig,
  type Reservation,
  type SettlementReceipt,
  type VersionedQuote,
} from "@ethen/studio-core/server/economics";
import type { PriceCatalog } from "@ethen/studio-core/server/economics";
import type { QuoteRepository } from "@ethen/studio-core/server/economics";
import type { ProjectScope } from "@ethen/studio-core/contracts";
import type { TaskName } from "@ethen/studio-core/contracts";
import { asIcu } from "@ethen/studio-core/contracts";

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function int(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function strArray(row: Row, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toPrice(row: Row): PriceConfig {
  return {
    task: str(row, "task_name") as TaskName,
    endpointId: str(row, "endpoint_id"),
    priceVersion: str(row, "price_version"),
    meterUnit: str(row, "meter_unit") as MeterUnit,
    unitPriceIcu: asIcu(int(row, "unit_price_icu")),
    minorPerIcu: int(row, "minor_per_icu"),
    skuRate: int(row, "sku_rate"),
    effectiveAt: str(row, "effective_at"),
    retiredAt: nullableStr(row, "retired_at"),
  };
}

function toQuote(scope: ProjectScope, row: Row): VersionedQuote {
  const pins = row.pins;
  return {
    quoteId: str(row, "quote_id"),
    task: str(row, "task_name") as TaskName,
    scope,
    pins: (pins && typeof pins === "object" ? pins : {}) as VersionedQuote["pins"],
    endpointId: str(row, "endpoint_id"),
    estimatedCostIcu: asIcu(int(row, "estimated_icu")),
    capIcu: asIcu(int(row, "cap_icu")),
    hardCap: row.hard_cap !== false,
    meterUnit: str(row, "meter_unit") as MeterUnit,
    meterQuantity: int(row, "meter_quantity"),
    priceVersion: str(row, "price_version"),
    skuRate: int(row, "sku_rate"),
    createdAt: str(row, "created_at"),
    expiresAt: str(row, "expires_at"),
  };
}

function toReservation(scope: ProjectScope, row: Row): Reservation {
  return {
    reservationId: str(row, "reservation_id"),
    quoteId: str(row, "quote_id"),
    scope,
    jobId: nullableStr(row, "job_id"),
    parentReservationId: nullableStr(row, "parent_reservation_id"),
    idempotencyKey: str(row, "idempotency_key"),
    actorId: str(row, "actor_id"),
    state: str(row, "state") as Reservation["state"],
    heldIcu: asIcu(int(row, "held_icu")),
    settledIcu: asIcu(int(row, "settled_icu")),
    capIcu: asIcu(int(row, "cap_icu")),
    priceVersion: str(row, "price_version"),
    providerEvidenceHash: nullableStr(row, "provider_evidence_hash"),
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
    replayed: false,
  };
}

function toReceipt(scope: ProjectScope, row: Row): SettlementReceipt {
  return {
    receiptId: str(row, "receipt_id"),
    reservationId: str(row, "reservation_id"),
    jobId: nullableStr(row, "job_id"),
    scope,
    estimatedIcu: asIcu(int(row, "estimated_icu")),
    chargedIcu: asIcu(int(row, "charged_icu")),
    releasedIcu: asIcu(int(row, "released_icu")),
    absorbedProviderIcu: asIcu(int(row, "absorbed_provider_icu")),
    reconcilingChildren: strArray(row, "reconciling_children"),
    settledAt: str(row, "settled_at"),
  };
}

function rpcError(prefix: string, message: string): EconomicsError {
  if (/ADMISSION_CLOSED/i.test(message)) return new EconomicsError("ADMISSION_CLOSED", message);
  if (/QUOTE_EXPIRED/i.test(message)) return new EconomicsError("QUOTE_EXPIRED", message);
  if (/APPROVAL_REQUIRED/i.test(message)) return new EconomicsError("APPROVAL_REQUIRED", message);
  if (/RESERVATION_CONFLICT/i.test(message)) return new EconomicsError("RESERVATION_CONFLICT", message);
  if (/SETTLE_CONFLICT/i.test(message)) return new EconomicsError("SETTLE_CONFLICT", message);
  if (/SETTLE_INVALID/i.test(message)) return new EconomicsError("SETTLE_INVALID", message);
  if (/RELEASE_INVALID/i.test(message)) return new EconomicsError("RELEASE_INVALID", message);
  if (/INSUFFICIENT_BALANCE/i.test(message)) return new EconomicsError("INSUFFICIENT_BALANCE", message);
  if (/QUOTA_CONCURRENCY/i.test(message)) return new EconomicsError("QUOTA_CONCURRENCY", message);
  if (/QUOTA_EXCEEDED/i.test(message)) return new EconomicsError("QUOTA_EXCEEDED", message);
  if (/QUOTA_UNCONFIGURED/i.test(message)) return new EconomicsError("QUOTA_UNCONFIGURED", message);
  if (/QUOTA_DISABLED/i.test(message)) return new EconomicsError("QUOTA_DISABLED", message);
  return new EconomicsError("INTERNAL", `${prefix}: ${message}`);
}

export class SupabasePriceCatalog implements PriceCatalog {
  async resolve(task: TaskName, endpointId: string, priceVersion: string): Promise<PriceConfig | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_price_configs")
      .select()
      .eq("task_name", task)
      .eq("endpoint_id", endpointId)
      .eq("price_version", priceVersion)
      .maybeSingle();
    if (error) throw new EconomicsError("INTERNAL", `Failed to load price config: ${error.message}`);
    return data ? toPrice(data as Row) : null;
  }
}

export class SupabaseQuoteRepository implements QuoteRepository {
  async insert(quote: VersionedQuote): Promise<VersionedQuote> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_quotes")
      .insert({
        quote_id: quote.quoteId,
        tenant_id: (quote.scope.tenantId as string) || null,
        workspace_id: quote.scope.workspaceId as string,
        project_id: quote.scope.projectId as string,
        task_name: quote.task,
        endpoint_id: quote.endpointId,
        pins: { ...quote.pins },
        estimated_icu: quote.estimatedCostIcu,
        cap_icu: quote.capIcu,
        hard_cap: quote.hardCap,
        meter_unit: quote.meterUnit,
        meter_quantity: quote.meterQuantity,
        price_version: quote.priceVersion,
        sku_rate: quote.skuRate,
        expires_at: quote.expiresAt,
      })
      .select()
      .single();
    if (error) {
      if (/unique|duplicate|23505/i.test(error.message)) {
        throw new EconomicsError("QUOTE_CONFLICT", "Quote already exists; quotes are immutable.");
      }
      throw new EconomicsError("INTERNAL", `Failed to record quote: ${error.message}`);
    }
    return toQuote(quote.scope, data as Row);
  }

  async get(scope: ProjectScope, quoteId: string): Promise<VersionedQuote | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_quotes")
      .select()
      .eq("quote_id", quoteId)
      .eq("project_id", scope.projectId as string)
      .maybeSingle();
    if (error) throw new EconomicsError("INTERNAL", `Failed to load quote: ${error.message}`);
    return data ? toQuote(scope, data as Row) : null;
  }
}

export interface HoldReceipt {
  reservationId: string;
  state: Reservation["state"];
  replayed: boolean;
}

/** Atomic hold via the j04 SQL function (same call STUDIO_05 embeds). */
export async function allocateHold(input: {
  scope: ProjectScope;
  quoteId: string;
  jobId: string | null;
  parentReservationId: string | null;
  idempotencyKey: string;
  actorId: string;
}): Promise<HoldReceipt> {
  const client = requireServiceClient();
  const { data, error } = await client.rpc("studio_v5_allocate_hold", {
    p_project_id: input.scope.projectId as string,
    p_tenant_id: (input.scope.tenantId as string) || null,
    p_workspace_id: input.scope.workspaceId as string,
    p_quote_id: input.quoteId,
    p_job_id: input.jobId,
    p_parent_reservation_id: input.parentReservationId,
    p_idempotency_key: input.idempotencyKey,
    p_actor_id: input.actorId,
  });
  if (error) throw rpcError("Hold failed", error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Row;
  return {
    reservationId: str(row, "reservation_id"),
    state: str(row, "reservation_state") as Reservation["state"],
    replayed: row.replayed === true,
  };
}

export async function getReservation(
  scope: ProjectScope,
  idempotencyKey: string,
): Promise<Reservation | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_reservations")
    .select()
    .eq("project_id", scope.projectId as string)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new EconomicsError("INTERNAL", `Failed to load reservation: ${error.message}`);
  return data ? toReservation(scope, data as Row) : null;
}

export async function listChildReservations(
  scope: ProjectScope,
  parentReservationId: string,
): Promise<readonly Reservation[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_reservations")
    .select()
    .eq("project_id", scope.projectId as string)
    .eq("parent_reservation_id", parentReservationId)
    .order("created_at", { ascending: true });
  if (error) throw new EconomicsError("INTERNAL", `Failed to list child reservations: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => toReservation(scope, row));
}

export async function getReceipt(
  scope: ProjectScope,
  receiptId: string,
): Promise<SettlementReceipt | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_receipts")
    .select()
    .eq("receipt_id", receiptId)
    .eq("project_id", scope.projectId as string)
    .maybeSingle();
  if (error) throw new EconomicsError("INTERNAL", `Failed to load receipt: ${error.message}`);
  return data ? toReceipt(scope, data as Row) : null;
}

export async function getBalance(scope: ProjectScope): Promise<CreditBalance | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_credit_balances")
    .select()
    .eq("project_id", scope.projectId as string)
    .maybeSingle();
  if (error) throw new EconomicsError("INTERNAL", `Failed to load balance: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  return { scope, balanceIcu: asIcu(int(row, "balance_icu")), heldIcu: asIcu(int(row, "held_icu")) };
}
