/** Studio V5 economics — memory store + EconomicsPort adapter (STUDIO_04). */
import "server-only";
import { randomUUID } from "node:crypto";
import { asIcu, ZERO_ICU, type IcuAmount } from "../../contracts/money";
import type { ProjectScope } from "../../contracts/scope";
import { sameScope, serializeScope } from "../../contracts/scope";
import type { EconomicsPort } from "../ports/operations";
import {
  EconomicsError,
  type CreditBalance,
  type CustomerDebit,
  type PriceConfig,
  type ProviderCost,
  type Reservation,
  type SettlementReceipt,
  type UsageReport,
  type VersionedQuote,
} from "./types";
import type { PriceCatalog } from "./pricing";
import type { QuoteRepository } from "./quotes";
import { assertQuoteLive } from "./quotes";
import { validateUsage } from "./metering";
import { settleProviderMinor } from "./quote-math";
import {
  checkHoldReplay,
  checkHoldTerms,
  checkReleasable,
  checkSettleReplay,
  settleOutcome,
} from "./ledger";
import { buildReceipt } from "./receipts";
import { MemoryQuotaService, tryReleaseDuplicateQuota, tryReleaseQuota } from "./quotas";

export interface HoldInput {
  scope: ProjectScope;
  quoteId: string;
  jobId: string | null;
  parentReservationId: string | null;
  idempotencyKey: string;
  actorId: string;
}

export interface SettleInput {
  scope: ProjectScope;
  idempotencyKey: string;
  actualIcu: IcuAmount;
  usage: UsageReport;
  providerId: string;
  minorPerIcu: number;
}

export interface ReleaseInput {
  scope: ProjectScope;
  idempotencyKey: string;
  reason: string;
}

/**
 * Memory economics store. Single-process test/dev adapter that mirrors the
 * j04 SQL guards: atomic serialized holds per scope (mutex), idempotent
 * replay with conflict on mismatched terms, terminal-state protection,
 * no-negative-balance, cap clamping with absorbed provider cost.
 */
export class MemoryEconomicsStore implements PriceCatalog, QuoteRepository {
  private readonly prices = new Map<string, PriceConfig>();
  private readonly quotes = new Map<string, VersionedQuote>();
  private readonly reservations = new Map<string, Reservation>();
  private readonly balances = new Map<string, CreditBalance>();
  private readonly customerEntries: CustomerDebit[] = [];
  private readonly providerEntries: ProviderCost[] = [];
  private readonly receipts = new Map<string, SettlementReceipt>();
  private readonly locks = new Map<string, Promise<void>>();
  readonly quotas = new MemoryQuotaService();

  private priceKey(task: string, endpointId: string, priceVersion: string): string {
    return `${task}::${endpointId}::${priceVersion}`;
  }

  private reservationKey(scope: ProjectScope, idempotencyKey: string): string {
    return `${serializeScope(scope)}::${idempotencyKey}`;
  }

  /** Serialize mutations per scope so concurrent holds cannot overspend. */
  private async withScopeLock<T>(scope: ProjectScope, work: () => Promise<T> | T): Promise<T> {
    const key = serializeScope(scope);
    const prior = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(key, prior.then(() => current));
    await prior;
    try {
      return await work();
    } finally {
      release();
      if (this.locks.get(key) === prior.then(() => current)) this.locks.delete(key);
    }
  }

  seedPrice(config: PriceConfig): void {
    this.prices.set(this.priceKey(config.task, config.endpointId, config.priceVersion), config);
  }

  async resolve(task: PriceConfig["task"], endpointId: string, priceVersion: string): Promise<PriceConfig | null> {
    return this.prices.get(this.priceKey(task, endpointId, priceVersion)) ?? null;
  }

  async insert(quote: VersionedQuote): Promise<VersionedQuote> {
    if (this.quotes.has(quote.quoteId)) {
      throw new EconomicsError("QUOTE_CONFLICT", `Quote ${quote.quoteId} already exists; quotes are immutable.`);
    }
    this.quotes.set(quote.quoteId, quote);
    return quote;
  }

  async get(scope: ProjectScope, quoteId: string): Promise<VersionedQuote | null> {
    const quote = this.quotes.get(quoteId) ?? null;
    if (!quote || !sameScope(quote.scope, scope)) return null;
    return quote;
  }

  fund(scope: ProjectScope, balanceIcu: IcuAmount): void {
    if (!Number.isInteger(balanceIcu) || balanceIcu < 0) {
      throw new EconomicsError("INVALID_INPUT", "Funding amount must be a non-negative ICU integer.");
    }
    this.balances.set(serializeScope(scope), { scope, balanceIcu, heldIcu: ZERO_ICU });
  }

  getBalance(scope: ProjectScope): CreditBalance {
    return (
      this.balances.get(serializeScope(scope)) ?? { scope, balanceIcu: ZERO_ICU, heldIcu: ZERO_ICU }
    );
  }

  getReservation(scope: ProjectScope, idempotencyKey: string): Reservation | null {
    const row = this.reservations.get(this.reservationKey(scope, idempotencyKey)) ?? null;
    if (!row || !sameScope(row.scope, scope)) return null;
    return row;
  }

  listChildren(parentReservationId: string): readonly Reservation[] {
    return [...this.reservations.values()].filter((r) => r.parentReservationId === parentReservationId);
  }

  listCustomerEntries(reservationId: string): readonly CustomerDebit[] {
    return this.customerEntries.filter((e) => e.reservationId === reservationId);
  }

  listProviderEntries(reservationId: string): readonly ProviderCost[] {
    return this.providerEntries.filter((e) => e.reservationId === reservationId);
  }

  getReceipt(receiptId: string): SettlementReceipt | null {
    return this.receipts.get(receiptId) ?? null;
  }

  findReservation(scope: ProjectScope, reservationId: string): Reservation | null {
    const found = [...this.reservations.values()].find((r) => r.reservationId === reservationId);
    if (!found || !sameScope(found.scope, scope)) return null;
    return found;
  }

  getReceiptForReservation(reservationId: string): SettlementReceipt | null {
    for (const receipt of this.receipts.values()) {
      if (receipt.reservationId === reservationId) return receipt;
    }
    return null;
  }

  private appendCustomerEntry(
    scope: ProjectScope,
    reservationId: string,
    entryType: CustomerDebit["entryType"],
    amountIcu: IcuAmount,
  ): CustomerDebit {
    const balance = this.getBalance(scope);
    const entry: CustomerDebit = {
      entryId: randomUUID(),
      reservationId,
      scope,
      entryType,
      amountIcu,
      balanceAfterIcu: balance.balanceIcu,
      createdAt: new Date().toISOString(),
    };
    this.customerEntries.push(entry);
    return entry;
  }

  /** Idempotent hold: quota claim + balance hold + reservation, atomically. */
  async hold(input: HoldInput): Promise<Reservation> {
    return this.withScopeLock(input.scope, async () => {
      const key = this.reservationKey(input.scope, input.idempotencyKey);
      const quote = this.quotes.get(input.quoteId) ?? null;
      if (!quote || !sameScope(quote.scope, input.scope)) {
        throw new EconomicsError("NOT_FOUND", `Quote ${input.quoteId} not found in this scope.`);
      }
      assertQuoteLive(quote);
      checkHoldTerms({ heldIcu: quote.estimatedCostIcu, capIcu: quote.capIcu });
      const existing = this.reservations.get(key);
      if (existing) {
        checkHoldReplay(existing, quote.estimatedCostIcu, quote.capIcu);
        return { ...existing, replayed: true };
      }
      if (input.parentReservationId) {
        const parent = [...this.reservations.values()].find((r) => r.reservationId === input.parentReservationId);
        if (!parent || !sameScope(parent.scope, input.scope)) {
          throw new EconomicsError("NOT_FOUND", "Parent reservation not found in this scope.");
        }
      }
      // Quota claim mirrors studio_v5_allocate_hold order (replay first, so
      // retries never double-claim). A later failure rolls the claim back,
      // matching the SQL single-transaction atomicity.
      const projectId = input.scope.projectId as string;
      await this.quotas.claim(projectId, quote.estimatedCostIcu);
      try {
        return this.insertHold(input, key, quote);
      } catch (error) {
        await tryReleaseDuplicateQuota(this.quotas, projectId, quote.estimatedCostIcu);
        throw error;
      }
    });
  }

  private insertHold(
    input: HoldInput,
    key: string,
    quote: VersionedQuote,
  ): Reservation {
      const balance = this.getBalance(input.scope);
      const available = balance.balanceIcu - balance.heldIcu;
      if (quote.estimatedCostIcu > available) {
        throw new EconomicsError("INSUFFICIENT_BALANCE", "Insufficient credit balance for this hold.");
      }
      const now = new Date().toISOString();
      const row: Reservation = {
        reservationId: randomUUID(),
        quoteId: quote.quoteId,
        scope: input.scope,
        jobId: input.jobId,
        parentReservationId: input.parentReservationId,
        idempotencyKey: input.idempotencyKey,
        actorId: input.actorId,
        state: "held",
        heldIcu: quote.estimatedCostIcu,
        settledIcu: ZERO_ICU,
        capIcu: quote.capIcu,
        priceVersion: quote.priceVersion,
        providerEvidenceHash: null,
        createdAt: now,
        updatedAt: now,
        replayed: false,
      };
      this.reservations.set(key, row);
      this.balances.set(serializeScope(input.scope), {
        scope: input.scope,
        balanceIcu: balance.balanceIcu,
        heldIcu: asIcu(balance.heldIcu + quote.estimatedCostIcu),
      });
      this.appendCustomerEntry(input.scope, row.reservationId, "hold", quote.estimatedCostIcu);
      return { ...row };
  }

  /**
   * Idempotent settle. Unknown usage (null quantity/minor) moves the
   * reservation to reconciling instead of settling — never a guessed charge.
   */
  async settle(input: SettleInput): Promise<Reservation> {
    return this.withScopeLock(input.scope, async () => {
      const key = this.reservationKey(input.scope, input.idempotencyKey);
      const row = this.reservations.get(key);
      if (!row || !sameScope(row.scope, input.scope)) {
        throw new EconomicsError("NOT_FOUND", "No reservation for this key in this scope.");
      }
      if (row.state === "settled") {
        checkSettleReplay(row, input.actualIcu);
        return { ...row, replayed: true };
      }
      const quote = this.quotes.get(row.quoteId);
      if (quote) validateUsage(quote.task, input.usage);
      if (input.usage.quantity === null || input.usage.providerMinor === null) {
        const reconciling: Reservation = { ...row, state: "reconciling", updatedAt: new Date().toISOString(), replayed: false };
        this.reservations.set(key, reconciling);
        this.providerEntries.push({
          entryId: randomUUID(),
          reservationId: row.reservationId,
          scope: row.scope,
          providerId: input.providerId,
          amountMinor: 0 as ProviderCost["amountMinor"],
          minorPerIcu: input.minorPerIcu,
          amountIcu: ZERO_ICU,
          absorbedIcu: ZERO_ICU,
          reconciling: true,
          createdAt: new Date().toISOString(),
        });
        return { ...reconciling };
      }
      const provider = settleProviderMinor(input.usage.providerMinor, input.minorPerIcu);
      const outcome = settleOutcome(row, { actualIcu: input.actualIcu, providerIcu: provider.amountIcu });
      const now = new Date().toISOString();
      const settled: Reservation = {
        ...row,
        state: "settled",
        settledIcu: outcome.customerIcu,
        providerEvidenceHash: input.usage.providerEvidenceHash,
        updatedAt: now,
        replayed: false,
      };
      const balance = this.getBalance(input.scope);
      if (balance.balanceIcu - outcome.customerIcu < 0) {
        throw new EconomicsError("INTERNAL", "Settlement would drive the balance negative; aborted.");
      }
      this.reservations.set(key, settled);
      this.balances.set(serializeScope(input.scope), {
        scope: input.scope,
        balanceIcu: asIcu(balance.balanceIcu - outcome.customerIcu),
        heldIcu: asIcu(balance.heldIcu - row.heldIcu),
      });
      this.appendCustomerEntry(input.scope, row.reservationId, "debit", outcome.customerIcu);
      if (outcome.releasedIcu > 0) {
        this.appendCustomerEntry(input.scope, row.reservationId, "release", outcome.releasedIcu);
      }
      this.providerEntries.push({
        entryId: randomUUID(),
        reservationId: row.reservationId,
        scope: row.scope,
        providerId: input.providerId,
        amountMinor: provider.amountMinor,
        minorPerIcu: input.minorPerIcu,
        amountIcu: provider.amountIcu,
        absorbedIcu: outcome.absorbedIcu,
        reconciling: false,
        createdAt: now,
      });
      const receipt = buildReceipt({
        reservation: settled,
        estimatedIcu: quote?.estimatedCostIcu ?? row.heldIcu,
        absorbedProviderIcu: outcome.absorbedIcu,
        children: this.listChildren(settled.reservationId),
      });
      this.receipts.set(receipt.receiptId, receipt);
      await tryReleaseQuota(this.quotas, input.scope.projectId as string);
      return { ...settled };
    });
  }

  /** Idempotent release of an unused hold. Settled rows are terminal. */
  async release(input: ReleaseInput): Promise<Reservation> {
    return this.withScopeLock(input.scope, async () => {
      const key = this.reservationKey(input.scope, input.idempotencyKey);
      const row = this.reservations.get(key);
      if (!row || !sameScope(row.scope, input.scope)) {
        throw new EconomicsError("NOT_FOUND", "No reservation for this key in this scope.");
      }
      if (row.state === "released" || row.state === "refunded") {
        return { ...row, replayed: true };
      }
      checkReleasable(row);
      const now = new Date().toISOString();
      const released: Reservation = { ...row, state: "released", updatedAt: now, replayed: false };
      this.reservations.set(key, released);
      const balance = this.getBalance(input.scope);
      this.balances.set(serializeScope(input.scope), {
        scope: input.scope,
        balanceIcu: balance.balanceIcu,
        heldIcu: asIcu(Math.max(0, balance.heldIcu - row.heldIcu)),
      });
      this.appendCustomerEntry(input.scope, row.reservationId, "release", row.heldIcu);
      void input.reason;
      await tryReleaseQuota(this.quotas, input.scope.projectId as string);
      return { ...released };
    });
  }
}

export function createMemoryEconomicsStore(): MemoryEconomicsStore {
  return new MemoryEconomicsStore();
}

/**
 * Kernel EconomicsPort adapter over the memory store. Quote creation needs
 * catalog + meter inputs, so `quote` reads the meter quantity from the
 * request parameters (meterQuantity, non-negative integer).
 */
export function adaptEconomicsPort(store: MemoryEconomicsStore): EconomicsPort {
  return {
    async quote(request) {
      const quantity = request.parameters["meterQuantity"];
      if (!Number.isInteger(quantity) || (quantity as number) < 0) {
        throw new EconomicsError("INVALID_INPUT", "ExecutionRequest.parameters.meterQuantity must be a non-negative integer.");
      }
      const { createVersionedQuote } = await import("./quotes");
      const versioned = await createVersionedQuote(store, store, {
        task: request.task,
        scope: request.scope,
        pins: request.pins,
        endpointId: request.endpointId ?? "auto",
        priceVersion: request.pins.priceVersion,
        meterQuantity: quantity as number,
      });
      return {
        quoteId: versioned.quoteId,
        task: versioned.task,
        scope: versioned.scope,
        pins: versioned.pins,
        endpointId: versioned.endpointId,
        estimatedCostIcu: versioned.estimatedCostIcu,
        capIcu: versioned.capIcu,
        meterUnit: versioned.meterUnit,
        meterQuantity: versioned.meterQuantity,
        priceVersion: versioned.priceVersion,
        expiresAt: versioned.expiresAt,
      };
    },
    async reserve(quoteId, scope) {
      const reservation = await store.hold({
        scope,
        quoteId,
        jobId: null,
        parentReservationId: null,
        idempotencyKey: quoteId,
        actorId: "economics-port",
      });
      return reservation.reservationId;
    },
    async settle(reservationId, scope, actualIcu) {
      const found = store.findReservation(scope, reservationId);
      if (!found) throw new EconomicsError("NOT_FOUND", "Reservation not found in this scope.");
      const quote = await store.get(scope, found.quoteId);
      const settled = await store.settle({
        scope,
        idempotencyKey: found.idempotencyKey,
        actualIcu,
        usage: {
          meterUnit: quote?.meterUnit ?? "task_unit",
          quantity: quote?.meterQuantity ?? 0,
          providerMinor: actualIcu,
          providerEvidenceHash: null,
        },
        providerId: "port-default",
        minorPerIcu: 1,
      });
      return settled.reservationId;
    },
    async release(reservationId, scope) {
      const found = store.findReservation(scope, reservationId);
      if (!found) throw new EconomicsError("NOT_FOUND", "Reservation not found in this scope.");
      await store.release({ scope, idempotencyKey: found.idempotencyKey, reason: "economics-port release" });
    },
  };
}
