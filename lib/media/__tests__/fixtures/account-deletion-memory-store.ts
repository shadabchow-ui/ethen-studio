/**
 * STUDIO-DEL-01 test fixture — in-memory AccountDeletionStore. No network,
 * no database. Models two-account isolation, retained/anonymized records,
 * frozen credits, asynchronous blob deletion and injected failures.
 */
import type {
  AccountDeletionStore,
  DeletionRequest,
  DeletionStep,
  StoredDisposition,
  SubscriptionView,
} from "../../../../app/api/settings/account/delete/_lib/handler";
import type { LedgerRow } from "../../../../app/api/settings/account/delete/_lib/rules";

export interface FixtureAccount {
  clerkUserId: string;
  accountId: string;
  subscription: SubscriptionView | null;
  ledger: LedgerRow[];
  icuBalance: number;
  /** Rows deleted by deleteContent. */
  content: string[];
  /** Blob ids owned by the account. */
  objectIds: string[];
}

export interface RefundReview {
  requestId: string;
  accountId: string;
  purchasedFrozen: number;
  icuFrozen: number;
}

export class MemoryDeletionStore implements AccountDeletionStore {
  readonly accounts = new Map<string, FixtureAccount>();
  readonly requests = new Map<string, DeletionRequest>();
  /** Every account id any mutating call was made with. */
  readonly touchedAccountIds = new Set<string>();
  readonly deletedContent = new Map<string, string[]>();
  readonly liveObjects = new Set<string>();
  readonly capturedObjects = new Map<string, Set<string>>();
  readonly deletedObjects = new Set<string>();
  readonly refundReviews: RefundReview[] = [];
  readonly expiredPromotional = new Map<string, number>();
  /** Retained restricted records: ledger rows kept with anonymized identifiers. */
  readonly retainedLedger = new Map<string, { rows: LedgerRow[]; anonymized: boolean }>();
  readonly anonymizedAccounts = new Set<string>();
  readonly calls: string[] = [];
  /** Object ids whose deletion throws (simulates async blob failure). */
  readonly failingObjects = new Set<string>();
  /** Step name that throws once, then recovers. */
  failOnceAt: string | null = null;

  addAccount(account: FixtureAccount): void {
    this.accounts.set(account.clerkUserId, account);
    for (const id of account.objectIds) this.liveObjects.add(id);
  }

  private account(accountId: string): FixtureAccount {
    for (const account of this.accounts.values()) if (account.accountId === accountId) return account;
    throw new Error("unknown account");
  }

  private maybeFail(point: string): void {
    if (this.failOnceAt === point) {
      this.failOnceAt = null;
      throw new Error(`injected failure at ${point}`);
    }
  }

  async findRequest(clerkUserId: string): Promise<DeletionRequest | null> {
    this.calls.push("findRequest");
    return this.requests.get(clerkUserId) ?? null;
  }

  async resolveAccountId(clerkUserId: string): Promise<string | null> {
    return this.accounts.get(clerkUserId)?.accountId ?? null;
  }

  async getSubscription(accountId: string): Promise<SubscriptionView | null> {
    return this.account(accountId).subscription;
  }

  async readCreditLedger(accountId: string): Promise<LedgerRow[]> {
    return [...this.account(accountId).ledger];
  }

  async readIcuBalance(accountId: string): Promise<number> {
    return this.account(accountId).icuBalance;
  }

  async createRequest(input: {
    requestId: string;
    clerkUserId: string;
    accountId: string;
    createdAt: string;
    disposition: StoredDisposition;
  }): Promise<DeletionRequest> {
    this.calls.push("createRequest");
    this.touchedAccountIds.add(input.accountId);
    const existing = this.requests.get(input.clerkUserId);
    if (existing) return existing;
    const created: DeletionRequest = {
      requestId: input.requestId,
      clerkUserId: input.clerkUserId,
      accountId: input.accountId,
      createdAt: input.createdAt,
      finalizedAt: null,
      disposition: input.disposition,
      completedSteps: [],
    };
    this.requests.set(input.clerkUserId, created);
    return created;
  }

  private byRequestId(requestId: string): DeletionRequest {
    for (const request of this.requests.values()) if (request.requestId === requestId) return request;
    throw new Error("unknown request");
  }

  async markStep(requestId: string, step: DeletionStep): Promise<void> {
    const request = this.byRequestId(requestId);
    if (!request.completedSteps.includes(step)) {
      this.requests.set(request.clerkUserId, { ...request, completedSteps: [...request.completedSteps, step] });
    }
  }

  async freezeCredits(requestId: string, accountId: string, disposition: StoredDisposition): Promise<void> {
    this.calls.push("freezeCredits");
    this.touchedAccountIds.add(accountId);
    this.maybeFail("freeze_credits");
    if (this.refundReviews.some((r) => r.requestId === requestId)) return;
    // Referral only: no refund is issued and nothing is forfeited here.
    this.refundReviews.push({
      requestId,
      accountId,
      purchasedFrozen: disposition.purchasedFrozen,
      icuFrozen: disposition.icuFrozen,
    });
  }

  async captureObjects(requestId: string, accountId: string): Promise<void> {
    this.calls.push("captureObjects");
    this.touchedAccountIds.add(accountId);
    if (this.capturedObjects.has(requestId)) return;
    this.capturedObjects.set(requestId, new Set(this.account(accountId).objectIds));
  }

  async deleteContent(accountId: string): Promise<void> {
    this.calls.push("deleteContent");
    this.touchedAccountIds.add(accountId);
    this.maybeFail("delete_content");
    const account = this.account(accountId);
    this.deletedContent.set(accountId, [...account.content]);
    account.content = [];
  }

  async pendingObjects(requestId: string): Promise<string[]> {
    return [...(this.capturedObjects.get(requestId) ?? [])].filter((id) => !this.deletedObjects.has(id));
  }

  async deleteObject(_requestId: string, objectId: string): Promise<void> {
    this.calls.push(`deleteObject:${objectId}`);
    if (this.failingObjects.has(objectId)) throw new Error("blob store unavailable");
    this.liveObjects.delete(objectId);
    this.deletedObjects.add(objectId);
  }

  async anonymizeRetained(accountId: string): Promise<void> {
    this.calls.push("anonymizeRetained");
    this.touchedAccountIds.add(accountId);
    this.anonymizedAccounts.add(accountId);
    // Ledger rows and invoices are retained (restricted) with identifiers removed.
    this.retainedLedger.set(accountId, { rows: [...this.account(accountId).ledger], anonymized: true });
  }

  async expirePromotionalCredits(requestId: string, accountId: string, amount: number): Promise<void> {
    this.calls.push("expirePromotionalCredits");
    this.touchedAccountIds.add(accountId);
    if (this.expiredPromotional.has(requestId)) return;
    this.expiredPromotional.set(requestId, amount);
  }

  async finalize(requestId: string, at: string): Promise<void> {
    this.calls.push("finalize");
    const request = this.byRequestId(requestId);
    this.requests.set(request.clerkUserId, { ...request, finalizedAt: at });
  }
}
