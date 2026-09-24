/** Studio V5 economics — conservation verification (STUDIO_04). Server-only. */
import "server-only";
import type { IcuAmount } from "../../contracts/money";
import type { Reservation } from "./types";

export interface ConservationLine {
  readonly scopeKey: string;
  readonly heldIcu: number;
  readonly settledIcu: number;
  readonly releasedIcu: number;
  readonly balanceIcu: number;
  readonly balanced: boolean;
  readonly detail: string;
}

export interface ConservationReport {
  readonly lines: readonly ConservationLine[];
  readonly balanced: boolean;
}

/**
 * Conservation across a scope: opening balance + funds == closing balance +
 * settled debits, and every reservation's held == settled + released (+
 * still-held when open). Amounts are carried, never recomputed from prices.
 */
export function verifyConservation(input: {
  scopeKey: string;
  openingBalanceIcu: number;
  fundedIcu: number;
  closingBalanceIcu: number;
  reservations: readonly Reservation[];
  customerDebitsIcu: number;
  customerReleasesIcu: number;
}): ConservationReport {
  const open = input.reservations.filter((r) => r.state === "held" || r.state === "reconciling");
  const heldIcu = input.reservations.reduce((s, r) => s + r.heldIcu, 0);
  const settledIcu = input.reservations
    .filter((r) => r.state === "settled")
    .reduce((s, r) => s + r.settledIcu, 0);
  const releasedIcu = input.customerReleasesIcu;
  const expectedClosing = input.openingBalanceIcu + input.fundedIcu - input.customerDebitsIcu;
  const balanceOk = expectedClosing === input.closingBalanceIcu;
  const openHeld = open.reduce((s, r) => s + r.heldIcu, 0);
  const heldOk = heldIcu - settledIcu - releasedIcu === openHeld;
  const line: ConservationLine = {
    scopeKey: input.scopeKey,
    heldIcu,
    settledIcu,
    releasedIcu,
    balanceIcu: input.closingBalanceIcu,
    balanced: balanceOk && heldOk,
    detail: balanceOk && heldOk
      ? "conserved"
      : `drift: expectedClosing=${expectedClosing} actual=${input.closingBalanceIcu} heldResidual=${heldIcu - settledIcu - releasedIcu} openHeld=${openHeld}`,
  };
  return { lines: [line], balanced: line.balanced };
}

export interface LegacyCarryRow {
  readonly legacyTable: string;
  readonly legacyId: string;
  /** Carried historical amount in original minor units — never repriced. */
  readonly carriedMinor: number;
  readonly carriedState: string;
}

/**
 * Backfill conservation: legacy carried totals must equal imported V5
 * totals exactly. Historical charges are carried as-is; new prices never
 * rewrite history.
 */
export function verifyBackfillConservation(
  legacy: readonly LegacyCarryRow[],
  importedTotalMinor: number,
): { legacyTotalMinor: number; importedTotalMinor: number; conserved: boolean } {
  const legacyTotalMinor = legacy.reduce((s, r) => s + r.carriedMinor, 0);
  return {
    legacyTotalMinor,
    importedTotalMinor,
    conserved: legacyTotalMinor === importedTotalMinor,
  };
}

export function sumIcu(values: readonly IcuAmount[]): number {
  return values.reduce((s, v) => s + v, 0);
}
