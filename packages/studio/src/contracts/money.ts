/** Studio V5 kernel — integer money. 1 ICU = $0.001. No float arithmetic. */

export type IcuAmount = number & { readonly __brand: "IcuAmount" };
export type ProviderMinorAmount = number & { readonly __brand: "ProviderMinorAmount" };

export function asIcu(value: number): IcuAmount {
  if (!Number.isInteger(value)) throw new Error(`ICU must be an integer: ${value}`);
  return value as IcuAmount;
}

/**
 * M2 — the one honest zero. Genuine zero balances/accumulators use this
 * constant; quote estimates must use PRICE_UNKNOWN instead of $0.
 */
export const ZERO_ICU: IcuAmount = 0 as IcuAmount;

export function dollarsToIcu(dollars: number): IcuAmount {
  return asIcu(Math.round(dollars * 1000));
}

/** Single fixed-precision formatting at the boundary only. */
export function icuToDollarsString(amount: IcuAmount): string {
  return (amount / 1000).toFixed(3);
}

export function addIcu(a: IcuAmount, b: IcuAmount): IcuAmount {
  return asIcu(a + b);
}

export function subIcu(a: IcuAmount, b: IcuAmount): IcuAmount {
  return asIcu(a - b);
}

/** Provider minor units convert to ICU once at settlement with explicit precision. */
export function providerMinorToIcu(
  minor: number,
  minorPerIcu: number,
): IcuAmount {
  if (!Number.isInteger(minor) || !Number.isInteger(minorPerIcu) || minorPerIcu <= 0) {
    throw new Error("provider settlement requires integer minor units and divisor");
  }
  return asIcu(Math.round(minor / minorPerIcu));
}

/** New estimate >10% over prior quote, or any hard-cap breach, needs reapproval. */
export function needsNewApproval(
  priorQuoteIcu: IcuAmount,
  capIcu: IcuAmount,
  newEstimateIcu: IcuAmount,
): boolean {
  if (newEstimateIcu > capIcu) return true;
  return newEstimateIcu * 10 > priorQuoteIcu * 11;
}
