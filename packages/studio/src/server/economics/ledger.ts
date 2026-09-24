/**
 * Studio V5 economics — ledger transition rules (STUDIO_04). Server-only.
 * Pure validators shared by the memory store; the j04 SQL functions mirror
 * these guards field-for-field (see migration header mapping).
 */
import "server-only";
import { asIcu, type IcuAmount } from "../../contracts/money";
import { EconomicsError, type Reservation, type ReservationState } from "./types";

export interface HoldTerms {
  heldIcu: IcuAmount;
  capIcu: IcuAmount;
}

export function checkHoldTerms(input: HoldTerms): void {
  if (!Number.isInteger(input.heldIcu) || input.heldIcu < 0) {
    throw new EconomicsError("INVALID_INPUT", "Hold amount must be a non-negative ICU integer.");
  }
  if (!Number.isInteger(input.capIcu) || input.capIcu < 0) {
    throw new EconomicsError("INVALID_INPUT", "Cap must be a non-negative ICU integer.");
  }
  if (input.heldIcu > input.capIcu) {
    throw new EconomicsError("APPROVAL_REQUIRED", "Hold exceeds the approved cap; renewed approval is required.");
  }
}

/** Idempotent hold replay: identical terms replay, mismatched terms conflict. */
export function checkHoldReplay(existing: Reservation, heldIcu: IcuAmount, capIcu: IcuAmount): void {
  if (existing.heldIcu !== heldIcu || existing.capIcu !== capIcu) {
    throw new EconomicsError(
      "RESERVATION_CONFLICT",
      "Idempotency key already held with different terms.",
    );
  }
}

export interface SettleTerms {
  actualIcu: IcuAmount;
  providerIcu: IcuAmount;
}

/**
 * Settle outcome: customer debit is clamped to actuals and the cap; any
 * provider cost above the customer charge is platform-absorbed, reported
 * separately and never added to the customer debit.
 */
export interface SettleOutcome {
  readonly customerIcu: IcuAmount;
  readonly absorbedIcu: IcuAmount;
  readonly releasedIcu: IcuAmount;
}

export function settleOutcome(
  reservation: Reservation,
  input: SettleTerms,
): SettleOutcome {
  if (!Number.isInteger(input.actualIcu) || input.actualIcu < 0) {
    throw new EconomicsError("SETTLE_INVALID", "Actual charge must be a non-negative ICU integer.");
  }
  if (!Number.isInteger(input.providerIcu) || input.providerIcu < 0) {
    throw new EconomicsError("SETTLE_INVALID", "Provider cost must be a non-negative ICU integer.");
  }
  if (reservation.state !== "held" && reservation.state !== "reconciling") {
    throw new EconomicsError(
      "SETTLE_INVALID",
      `Reservation is not settleable (state=${reservation.state}).`,
    );
  }
  if (input.actualIcu > reservation.heldIcu) {
    throw new EconomicsError("SETTLE_INVALID", "Actual charge exceeds the held amount.");
  }
  const customerIcu = asIcu(Math.min(input.actualIcu, reservation.capIcu));
  const absorbedIcu = asIcu(Math.max(0, input.providerIcu - customerIcu));
  const releasedIcu = asIcu(reservation.heldIcu - customerIcu);
  return { customerIcu, absorbedIcu, releasedIcu };
}

/** Duplicate settle: identical amounts replay, different amounts conflict. */
export function checkSettleReplay(reservation: Reservation, actualIcu: IcuAmount): void {
  if (reservation.settledIcu !== actualIcu) {
    throw new EconomicsError("SETTLE_CONFLICT", "Already settled for a different amount.");
  }
}

export function checkReleasable(reservation: Reservation): void {
  if (reservation.state !== "held" && reservation.state !== "reconciling") {
    throw new EconomicsError(
      "RELEASE_INVALID",
      `Reservation is not releasable (state=${reservation.state}).`,
    );
  }
}

export const TERMINAL_RESERVATION_STATES: readonly ReservationState[] = [
  "settled",
  "released",
  "refunded",
] as const;

export function isTerminalState(state: ReservationState): boolean {
  return (TERMINAL_RESERVATION_STATES as readonly string[]).includes(state);
}
