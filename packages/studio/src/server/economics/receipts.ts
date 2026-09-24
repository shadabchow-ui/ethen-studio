/** Studio V5 economics — terminal receipts + display model (STUDIO_04). */
import "server-only";
import { randomUUID } from "node:crypto";
import { asIcu, icuToDollarsString, type IcuAmount } from "../../contracts/money";
import type { Reservation, SettlementReceipt } from "./types";

export interface ReceiptInput {
  reservation: Reservation;
  estimatedIcu: IcuAmount;
  absorbedProviderIcu: IcuAmount;
  children: readonly Reservation[];
}

/**
 * Build the terminal receipt: charged outputs, released hold and remaining
 * investigation (reconciling children). Parent failure/cancel never makes
 * successful settled children free — their charges stand on this receipt.
 */
export function buildReceipt(input: ReceiptInput): SettlementReceipt {
  const { reservation } = input;
  const childCharged = input.children
    .filter((c) => c.state === "settled")
    .reduce((sum, c) => sum + c.settledIcu, 0);
  const reconcilingChildren = input.children
    .filter((c) => c.state === "reconciling" || c.state === "held")
    .map((c) => c.reservationId);
  return {
    receiptId: randomUUID(),
    reservationId: reservation.reservationId,
    jobId: reservation.jobId,
    scope: reservation.scope,
    estimatedIcu: input.estimatedIcu,
    chargedIcu: asIcu(reservation.settledIcu + childCharged),
    releasedIcu: asIcu(Math.max(0, reservation.heldIcu - reservation.settledIcu)),
    absorbedProviderIcu: input.absorbedProviderIcu,
    reconcilingChildren,
    settledAt: new Date().toISOString(),
  };
}

/** Localized display model for 09/18 renderers (single formatting point). */
export function receiptDisplay(receipt: SettlementReceipt, children: readonly Reservation[]) {
  const unit = "USD";
  return {
    kind: "receipt" as const,
    title: "Studio receipt",
    localizedAmount: `$${icuToDollarsString(receipt.chargedIcu)}`,
    localizedUnit: unit,
    localizedCap: `$${icuToDollarsString(receipt.estimatedIcu)}`,
    charged: children
      .filter((c) => c.state === "settled")
      .map((c) => ({ label: c.idempotencyKey, localizedAmount: `$${icuToDollarsString(c.settledIcu)}` })),
    released: [
      { label: "unused hold", localizedAmount: `$${icuToDollarsString(receipt.releasedIcu)}` },
    ],
    reconciling: children
      .filter((c) => c.state === "reconciling" || c.state === "held")
      .map((c) => ({ label: c.idempotencyKey, localizedAmount: `$${icuToDollarsString(c.heldIcu)}` })),
    state: "settled" as const,
  };
}

/** Localized display model for a live quote (estimate + cap, no charges yet). */
export function quoteDisplay(input: {
  idempotencyKey: string;
  estimatedIcu: IcuAmount;
  capIcu: IcuAmount;
  expired: boolean;
}) {
  return {
    kind: "quote" as const,
    title: "Studio estimate",
    localizedAmount: `$${icuToDollarsString(input.estimatedIcu)}`,
    localizedUnit: "USD",
    localizedCap: `$${icuToDollarsString(input.capIcu)}`,
    charged: [],
    released: [],
    reconciling: [],
    state: (input.expired ? "expired" : "quoted") as "expired" | "quoted",
  };
}
