/** Studio V5 economics — integer-only quote math (STUDIO_04). Server-only. */
import "server-only";
import {
  asIcu,
  needsNewApproval,
  type IcuAmount,
  type ProviderMinorAmount,
} from "../../contracts/money";
import { EconomicsError, type MeterUnit } from "./types";

export function assertIntegerQuantity(unit: MeterUnit, quantity: number): void {
  void unit;
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new EconomicsError("INVALID_INPUT", `Meter quantity must be a non-negative integer, got ${quantity}.`);
  }
}

/** Integer estimate: quantity × unit price. No floats anywhere. */
export function estimateCost(quantity: number, unitPriceIcu: IcuAmount): IcuAmount {
  assertIntegerQuantity("task_unit", quantity);
  if (!Number.isInteger(unitPriceIcu) || unitPriceIcu < 0) {
    throw new EconomicsError("INVALID_INPUT", `Unit price must be a non-negative ICU integer.`);
  }
  return asIcu(quantity * unitPriceIcu);
}

/**
 * Provider minor units → ICU once, at settlement. Fixed precision with
 * half-up rounding on the integer boundary (documented, deterministic).
 */
export function settleProviderMinor(
  minor: number,
  minorPerIcu: number,
): { amountIcu: IcuAmount; amountMinor: ProviderMinorAmount } {
  if (!Number.isInteger(minor) || minor < 0) {
    throw new EconomicsError("INVALID_INPUT", `Provider usage must be non-negative integer minor units.`);
  }
  if (!Number.isInteger(minorPerIcu) || minorPerIcu <= 0) {
    throw new EconomicsError("INVALID_INPUT", `Provider precision divisor must be a positive integer.`);
  }
  const rounded = Math.floor((minor + minorPerIcu / 2) / minorPerIcu);
  return { amountIcu: asIcu(rounded), amountMinor: minor as ProviderMinorAmount };
}

/** Integer SKU → ICU conversion (skuRate credits per ICU unit block). */
export function skuToIcu(skuCredits: number, skuRate: number): IcuAmount {
  if (!Number.isInteger(skuCredits) || skuCredits < 0) {
    throw new EconomicsError("INVALID_INPUT", `SKU credits must be a non-negative integer.`);
  }
  if (!Number.isInteger(skuRate) || skuRate <= 0) {
    throw new EconomicsError("INVALID_INPUT", `SKU rate must be a positive integer.`);
  }
  return asIcu(Math.floor(skuCredits / skuRate));
}

/**
 * Reapproval rule: a new estimate exceeding the prior quote by >10%, or any
 * hard-cap breach, requires renewed approval. No tolerance overrides a hard
 * cap — the hard-cap check runs first and is absolute.
 */
export function requiresReapproval(
  priorQuoteIcu: IcuAmount,
  capIcu: IcuAmount,
  newEstimateIcu: IcuAmount,
  hardCap: boolean,
): boolean {
  if (hardCap && newEstimateIcu > capIcu) return true;
  return needsNewApproval(priorQuoteIcu, capIcu, newEstimateIcu);
}
