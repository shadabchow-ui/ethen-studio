/**
 * STUDIO-DEL-01 — account deletion orchestration behind a storage port.
 *
 * Framework-free: the route supplies the real subject resolver and store; the
 * tests supply fixtures. Every store call is made with the identifiers of the
 * authenticated subject only, so a request can never reach another account.
 *
 * Flow (each step is persisted and skipped when already done, so a repeated
 * delete is idempotent and a failed one resumes):
 *   accept -> freeze credits -> capture objects -> delete content ->
 *   delete blobs (async-safe) -> anonymize retained -> expire promo credits ->
 *   finalize -> end sessions.
 */
import {
  CONFIRMATION_WORD,
  DELETION_CATEGORIES,
  computeCreditDisposition,
  freezeIcuBalance,
  subscriptionBlocksDeletion,
  type CreditDisposition,
  type LedgerRow,
} from "./rules";

export type Subject =
  | { kind: "anonymous" }
  | { kind: "synthetic" }
  | { kind: "clerk"; clerkUserId: string };

export type DeletionStep =
  | "freeze_credits"
  | "capture_objects"
  | "delete_content"
  | "delete_blobs"
  | "anonymize_retained"
  | "expire_promotional"
  | "finalize";

export interface StoredDisposition {
  purchasedFrozen: number;
  promotionalExpiring: number;
  icuFrozen: number;
}

export interface DeletionRequest {
  requestId: string;
  clerkUserId: string;
  accountId: string;
  createdAt: string;
  finalizedAt: string | null;
  disposition: StoredDisposition;
  completedSteps: readonly DeletionStep[];
}

export interface SubscriptionView {
  state: string;
  planKey: string | null;
}

/** Persistence port. The production adapter is NOT part of this job. */
export interface AccountDeletionStore {
  findRequest(clerkUserId: string): Promise<DeletionRequest | null>;
  resolveAccountId(clerkUserId: string): Promise<string | null>;
  getSubscription(accountId: string): Promise<SubscriptionView | null>;
  readCreditLedger(accountId: string): Promise<LedgerRow[]>;
  readIcuBalance(accountId: string): Promise<number>;
  /** Create-if-absent; returns the existing request when one already exists. */
  createRequest(input: {
    requestId: string;
    clerkUserId: string;
    accountId: string;
    createdAt: string;
    disposition: StoredDisposition;
  }): Promise<DeletionRequest>;
  markStep(requestId: string, step: DeletionStep): Promise<void>;
  /** Freeze purchased credits and open the manual refund review (idempotent). */
  freezeCredits(requestId: string, accountId: string, disposition: StoredDisposition): Promise<void>;
  /** Record every blob owned by the account for deletion (idempotent). */
  captureObjects(requestId: string, accountId: string): Promise<void>;
  /** Delete database content owned by the account. */
  deleteContent(accountId: string): Promise<void>;
  pendingObjects(requestId: string): Promise<string[]>;
  deleteObject(requestId: string, objectId: string): Promise<void>;
  anonymizeRetained(accountId: string): Promise<void>;
  expirePromotionalCredits(requestId: string, accountId: string, amount: number): Promise<void>;
  finalize(requestId: string, at: string): Promise<void>;
}

export interface AccountDeletionDeps {
  resolveSubject(): Promise<Subject>;
  /** Null = no production store configured: the route fails closed. */
  store: AccountDeletionStore | null;
  /** Ends the subject's sessions (best effort, after finalization). */
  revokeSessions(clerkUserId: string): Promise<void>;
  now(): string;
  newRequestId(): string;
}

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

const RETAINED = DELETION_CATEGORIES.filter(
  (c) => c.action === "retain_restricted" || c.action === "anonymize" || c.action === "freeze" || c.action === "expire",
).map((c) => c.description);
const DELETED = DELETION_CATEGORIES.filter((c) => c.action === "delete").map((c) => c.description);

const SUBSCRIPTION_NOTICE =
  "An active subscription must be cancelled before your account can be deleted.";

function reply(status: number, body: Record<string, unknown>): HandlerResult {
  return { status, body };
}

function creditView(d: StoredDisposition): Record<string, number> {
  return {
    purchasedFrozen: d.purchasedFrozen,
    promotionalExpiring: d.promotionalExpiring,
    icuFrozen: d.icuFrozen,
  };
}

async function buildDisposition(store: AccountDeletionStore, accountId: string): Promise<StoredDisposition> {
  const [ledger, icu] = await Promise.all([store.readCreditLedger(accountId), store.readIcuBalance(accountId)]);
  const credits: CreditDisposition = computeCreditDisposition(ledger);
  return {
    purchasedFrozen: credits.purchasedFrozen,
    promotionalExpiring: credits.promotionalExpiring,
    icuFrozen: freezeIcuBalance(icu),
  };
}

function unauthenticated(): HandlerResult {
  return reply(401, { ok: false, code: "unauthenticated", error: "Sign in required." });
}

function syntheticIdentity(): HandlerResult {
  return reply(403, {
    ok: false,
    code: "synthetic_identity",
    error: "This session has no deletable account.",
  });
}

function unavailable(): HandlerResult {
  return reply(503, {
    ok: false,
    code: "deletion_unavailable",
    error: "Account deletion is temporarily unavailable. Nothing was deleted.",
  });
}

/** GET — eligibility preview. Read-only; never mutates. */
export async function handleEligibility(deps: AccountDeletionDeps): Promise<HandlerResult> {
  const subject = await deps.resolveSubject();
  if (subject.kind === "anonymous") return unauthenticated();
  const base = { ok: true, confirmation: CONFIRMATION_WORD, deletes: DELETED, retained: RETAINED };
  if (subject.kind === "synthetic") {
    return reply(200, {
      ...base,
      eligible: false,
      subscription: null,
      blockedReason: "This session has no deletable account.",
    });
  }
  const store = deps.store;
  if (!store) {
    return reply(200, {
      ...base,
      eligible: false,
      subscription: null,
      blockedReason: "Account deletion is temporarily unavailable.",
    });
  }
  try {
    const existing = await store.findRequest(subject.clerkUserId);
    if (existing) {
      const finalized = existing.finalizedAt !== null;
      return reply(200, {
        ...base,
        eligible: !finalized,
        subscription: null,
        blockedReason: finalized ? "This account has already been deleted." : null,
        deletionState: finalized ? "finalized" : "deleting",
        credits: creditView(existing.disposition),
      });
    }
    const accountId = await store.resolveAccountId(subject.clerkUserId);
    if (!accountId) {
      return reply(200, {
        ...base,
        eligible: false,
        subscription: null,
        blockedReason: "Your account is still being set up. Try again shortly.",
      });
    }
    const subscription = await store.getSubscription(accountId);
    const blocked = subscriptionBlocksDeletion(subscription?.state);
    const disposition = await buildDisposition(store, accountId);
    return reply(200, {
      ...base,
      eligible: !blocked,
      subscription,
      blockedReason: blocked ? SUBSCRIPTION_NOTICE : null,
      subscriptionRequirement: SUBSCRIPTION_NOTICE,
      credits: creditView(disposition),
    });
  } catch {
    return unavailable();
  }
}

const CLAIM_KEYS = ["accountId", "userId", "clerkUserId", "targetAccountId"] as const;

/** POST — confirmed deletion. Idempotent; resumes a partially completed one. */
export async function handleDelete(deps: AccountDeletionDeps, rawBody: unknown): Promise<HandlerResult> {
  const subject = await deps.resolveSubject();
  if (subject.kind === "anonymous") return unauthenticated();
  if (subject.kind === "synthetic") return syntheticIdentity();
  const store = deps.store;
  if (!store) return unavailable();

  const body =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : {};

  try {
    const existing = await store.findRequest(subject.clerkUserId);
    const accountId = existing?.accountId ?? (await store.resolveAccountId(subject.clerkUserId));

    // Ownership: a body may only name the authenticated subject itself.
    const allowed = new Set<string>([subject.clerkUserId]);
    if (accountId) allowed.add(accountId);
    for (const key of CLAIM_KEYS) {
      const claimed = body[key];
      if (claimed === undefined || claimed === null) continue;
      if (typeof claimed !== "string" || !allowed.has(claimed)) {
        return reply(403, {
          ok: false,
          code: "foreign_account",
          error: "You can only delete your own account.",
        });
      }
    }

    if (body.confirm !== CONFIRMATION_WORD) {
      return reply(400, {
        ok: false,
        code: "confirmation_required",
        error: `Type ${CONFIRMATION_WORD} to confirm deletion.`,
      });
    }

    if (existing) {
      if (existing.finalizedAt !== null) return finalizedResult(existing);
      return await resume(deps, store, existing);
    }

    if (!accountId) {
      return reply(409, {
        ok: false,
        code: "account_not_ready",
        error: "Your account is still being set up. Try again shortly.",
      });
    }
    const subscription = await store.getSubscription(accountId);
    if (subscriptionBlocksDeletion(subscription?.state)) {
      return reply(409, {
        ok: false,
        code: "subscription_active",
        error: SUBSCRIPTION_NOTICE,
        subscription,
      });
    }
    const disposition = await buildDisposition(store, accountId);
    const created = await store.createRequest({
      requestId: deps.newRequestId(),
      clerkUserId: subject.clerkUserId,
      accountId,
      createdAt: deps.now(),
      disposition,
    });
    if (created.finalizedAt !== null) return finalizedResult(created);
    return await resume(deps, store, created);
  } catch {
    return reply(503, {
      ok: false,
      code: "deletion_incomplete",
      state: "deleting",
      retryable: true,
      error: "Deletion could not be completed yet. Repeat the request to continue; nothing is lost.",
    });
  }
}

function finalizedResult(request: DeletionRequest): HandlerResult {
  return reply(200, {
    ok: true,
    state: "finalized",
    requestId: request.requestId,
    credits: creditView(request.disposition),
    retained: RETAINED,
  });
}

async function resume(
  deps: AccountDeletionDeps,
  store: AccountDeletionStore,
  request: DeletionRequest,
): Promise<HandlerResult> {
  const done = new Set<DeletionStep>(request.completedSteps);
  const { requestId, accountId, disposition } = request;
  const run = async (step: DeletionStep, action: () => Promise<void>): Promise<void> => {
    if (done.has(step)) return;
    await action();
    await store.markStep(requestId, step);
    done.add(step);
  };

  await run("freeze_credits", () => store.freezeCredits(requestId, accountId, disposition));
  await run("capture_objects", () => store.captureObjects(requestId, accountId));
  await run("delete_content", () => store.deleteContent(accountId));

  if (!done.has("delete_blobs")) {
    for (const objectId of await store.pendingObjects(requestId)) {
      try {
        await store.deleteObject(requestId, objectId);
      } catch {
        // Stays pending; a repeated request retries it.
      }
    }
    const remaining = await store.pendingObjects(requestId);
    if (remaining.length > 0) {
      return reply(202, {
        ok: true,
        state: "deleting",
        requestId,
        objectsPending: remaining.length,
        credits: creditView(disposition),
        retained: RETAINED,
      });
    }
    await store.markStep(requestId, "delete_blobs");
    done.add("delete_blobs");
  }

  await run("anonymize_retained", () => store.anonymizeRetained(accountId));
  await run("expire_promotional", () =>
    store.expirePromotionalCredits(requestId, accountId, disposition.promotionalExpiring),
  );
  await run("finalize", () => store.finalize(requestId, deps.now()));

  try {
    await deps.revokeSessions(request.clerkUserId);
  } catch {
    // Data is already deleted; session end is best effort.
  }
  return reply(200, {
    ok: true,
    state: "finalized",
    requestId,
    credits: creditView(disposition),
    retained: RETAINED,
  });
}
