/** Studio V5 economics — immutable quotes (STUDIO_04). Server-only. */
import "server-only";
import { randomUUID } from "node:crypto";
import type { TaskName } from "../../contracts/tasks";
import type { VersionPins } from "../../contracts/versions";
import { asIcu, type IcuAmount } from "../../contracts/money";
import type { ProjectScope } from "../../contracts/scope";
import { EconomicsError, type MeterUnit, type PriceConfig, type VersionedQuote } from "./types";
import { assertIntegerQuantity, estimateCost } from "./quote-math";
import { requirePrice, validatePriceConfig, type PriceCatalog } from "./pricing";

export interface QuoteInput {
  task: TaskName;
  scope: ProjectScope;
  pins: VersionPins;
  endpointId: string;
  priceVersion: string;
  meterQuantity: number;
  /** Approved cap. Defaults to the estimate (exact approval, no headroom). */
  capIcu?: IcuAmount;
  hardCap?: boolean;
  ttlMs?: number;
}

export interface QuoteRepository {
  insert(quote: VersionedQuote): Promise<VersionedQuote>;
  get(scope: ProjectScope, quoteId: string): Promise<VersionedQuote | null>;
}

/**
 * Create an immutable versioned quote. The returned object is frozen; the
 * repository must reject any later mutation of the row (SQL trigger + memory
 * guard). Missing/retired price config throws ADMISSION_CLOSED.
 */
export async function createVersionedQuote(
  catalog: PriceCatalog,
  quotes: QuoteRepository,
  input: QuoteInput,
): Promise<VersionedQuote> {
  const price: PriceConfig = await requirePrice(catalog, input.task, input.endpointId, input.priceVersion);
  validatePriceConfig(price);
  assertIntegerQuantity(price.meterUnit, input.meterQuantity);
  if (input.pins.priceVersion !== input.priceVersion) {
    throw new EconomicsError("INVALID_INPUT", "Quote pins.priceVersion must match the requested price version.");
  }
  const estimated = estimateCost(input.meterQuantity, price.unitPriceIcu);
  const cap = input.capIcu ?? estimated;
  if (!Number.isInteger(cap) || cap < 0) {
    throw new EconomicsError("INVALID_INPUT", "Quote cap must be a non-negative ICU integer.");
  }
  if (estimated > cap) {
    throw new EconomicsError("APPROVAL_REQUIRED", "Estimate exceeds the approved cap; renewed approval is required.");
  }
  const now = new Date();
  const ttl = input.ttlMs ?? 15 * 60 * 1000;
  const quote: VersionedQuote = Object.freeze({
    quoteId: randomUUID(),
    task: input.task,
    scope: input.scope,
    pins: { ...input.pins },
    endpointId: input.endpointId,
    estimatedCostIcu: estimated,
    capIcu: asIcu(cap),
    hardCap: input.hardCap ?? true,
    meterUnit: price.meterUnit satisfies MeterUnit,
    meterQuantity: input.meterQuantity,
    priceVersion: input.priceVersion,
    skuRate: price.skuRate,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
  });
  return quotes.insert(quote);
}

export function assertQuoteLive(quote: VersionedQuote, nowIso?: string): void {
  const now = nowIso ?? new Date().toISOString();
  if (quote.expiresAt <= now) {
    throw new EconomicsError("QUOTE_EXPIRED", `Quote ${quote.quoteId} expired at ${quote.expiresAt}.`);
  }
}
