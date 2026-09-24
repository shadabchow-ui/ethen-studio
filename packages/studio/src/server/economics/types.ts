/** Studio V5 economics — shared types (STUDIO_04 owns this folder). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import type { VersionPins } from "../../contracts/versions";
import type { IcuAmount, ProviderMinorAmount } from "../../contracts/money";
import type { ProjectScope } from "../../contracts/scope";

/** Meter units are integer quantities only — never fractional. */
export type MeterUnit =
  | "task_unit"
  | "image"
  | "second"
  | "character"
  | "child_unit"
  | "connected_second";

export type ReservationState =
  | "held"
  | "settled"
  | "released"
  | "reconciling"
  | "refunded";

export type EconomicsErrorCode =
  | "ADMISSION_CLOSED"
  | "APPROVAL_REQUIRED"
  | "QUOTE_EXPIRED"
  | "QUOTE_CONFLICT"
  | "RESERVATION_CONFLICT"
  | "SETTLE_CONFLICT"
  | "SETTLE_INVALID"
  | "RELEASE_INVALID"
  | "INSUFFICIENT_BALANCE"
  | "QUOTA_EXCEEDED"
  | "QUOTA_CONCURRENCY"
  | "QUOTA_UNCONFIGURED"
  | "QUOTA_DISABLED"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INTERNAL";

export class EconomicsError extends Error {
  readonly code: EconomicsErrorCode;
  constructor(code: EconomicsErrorCode, message: string) {
    super(message);
    this.name = "EconomicsError";
    this.code = code;
  }
}

export const ECONOMICS_ERROR_STATUS: Readonly<Record<EconomicsErrorCode, number>> = {
  ADMISSION_CLOSED: 503,
  APPROVAL_REQUIRED: 409,
  QUOTE_EXPIRED: 410,
  QUOTE_CONFLICT: 409,
  RESERVATION_CONFLICT: 409,
  SETTLE_CONFLICT: 409,
  SETTLE_INVALID: 422,
  RELEASE_INVALID: 422,
  INSUFFICIENT_BALANCE: 402,
  QUOTA_EXCEEDED: 429,
  QUOTA_CONCURRENCY: 429,
  QUOTA_UNCONFIGURED: 503,
  QUOTA_DISABLED: 503,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  INTERNAL: 500,
};

/**
 * Immutable versioned quote. Price snapshot, meter units and cap are frozen
 * at creation; any re-quote is a new row, never a mutation.
 */
export interface VersionedQuote {
  readonly quoteId: string;
  readonly task: TaskName;
  readonly scope: ProjectScope;
  readonly pins: VersionPins;
  readonly endpointId: string;
  readonly estimatedCostIcu: IcuAmount;
  readonly capIcu: IcuAmount;
  readonly hardCap: boolean;
  readonly meterUnit: MeterUnit;
  readonly meterQuantity: number;
  readonly priceVersion: string;
  readonly skuRate: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}

/** Versioned price configuration. Absence closes paid admission (fail-closed). */
export interface PriceConfig {
  readonly task: TaskName;
  readonly endpointId: string;
  readonly priceVersion: string;
  readonly meterUnit: MeterUnit;
  readonly unitPriceIcu: IcuAmount;
  /** Provider minor units per 1 ICU; fixed precision applied once at settlement. */
  readonly minorPerIcu: number;
  readonly skuRate: number;
  readonly effectiveAt: string;
  readonly retiredAt: string | null;
}

export interface Reservation {
  readonly reservationId: string;
  readonly quoteId: string;
  readonly scope: ProjectScope;
  readonly jobId: string | null;
  readonly parentReservationId: string | null;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly state: ReservationState;
  readonly heldIcu: IcuAmount;
  readonly settledIcu: IcuAmount;
  readonly capIcu: IcuAmount;
  readonly priceVersion: string;
  readonly providerEvidenceHash: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replayed: boolean;
}

/** Provider-cost ledger entry. Internal cost; never shown as customer charge. */
export interface ProviderCost {
  readonly entryId: string;
  readonly reservationId: string;
  readonly scope: ProjectScope;
  readonly providerId: string;
  readonly amountMinor: ProviderMinorAmount;
  readonly minorPerIcu: number;
  readonly amountIcu: IcuAmount;
  /** Overrun above the customer cap absorbed by the platform. */
  readonly absorbedIcu: IcuAmount;
  readonly reconciling: boolean;
  readonly createdAt: string;
}

/** Customer-credit ledger entry. Debit never exceeds the approved cap. */
export interface CustomerDebit {
  readonly entryId: string;
  readonly reservationId: string;
  readonly scope: ProjectScope;
  readonly entryType: "hold" | "debit" | "release" | "refund";
  readonly amountIcu: IcuAmount;
  readonly balanceAfterIcu: IcuAmount;
  readonly createdAt: string;
}

export interface UsageReport {
  readonly meterUnit: MeterUnit;
  /** Integer quantity. Null means unknown — stays reconciling, never guessed. */
  readonly quantity: number | null;
  readonly providerMinor: number | null;
  readonly providerEvidenceHash: string | null;
}

export interface CreditBalance {
  readonly scope: ProjectScope;
  readonly balanceIcu: IcuAmount;
  readonly heldIcu: IcuAmount;
}

export interface QuotaPolicy {
  readonly projectId: string;
  readonly maxConcurrentJobs: number;
  readonly dailyIcu: IcuAmount;
  readonly enforced: boolean;
}

export interface QuotaClaim {
  readonly projectId: string;
  readonly windowStart: string;
  readonly concurrentCount: number;
  readonly icuConsumed: IcuAmount;
}

/** Terminal receipt: charged outputs, release and remaining investigation. */
export interface SettlementReceipt {
  readonly receiptId: string;
  readonly reservationId: string;
  readonly jobId: string | null;
  readonly scope: ProjectScope;
  readonly estimatedIcu: IcuAmount;
  readonly chargedIcu: IcuAmount;
  readonly releasedIcu: IcuAmount;
  readonly absorbedProviderIcu: IcuAmount;
  readonly reconcilingChildren: readonly string[];
  readonly settledAt: string;
}

/** Quote/receipt display model for 09/18 renderers. Amounts pre-localized. */
export interface QuoteReceiptDisplay {
  readonly kind: "quote" | "receipt";
  readonly title: string;
  readonly localizedAmount: string;
  readonly localizedUnit: string;
  readonly localizedCap: string;
  readonly charged: ReadonlyArray<{ label: string; localizedAmount: string }>;
  readonly released: ReadonlyArray<{ label: string; localizedAmount: string }>;
  readonly reconciling: ReadonlyArray<{ label: string; localizedAmount: string }>;
  readonly state: ReservationState | "quoted" | "expired";
}
