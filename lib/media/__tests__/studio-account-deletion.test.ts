/**
 * STUDIO-DEL-01 — in-app account deletion: behaviour tests (fixtures only).
 *
 * Each test names the owner data rule it proves ("RULE: ..."). No network,
 * no database, no Clerk: identity, storage and session revocation are fakes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleDelete,
  handleEligibility,
  type AccountDeletionDeps,
  type Subject,
} from "../../../app/api/settings/account/delete/_lib/handler";
import {
  CONFIRMATION_WORD,
  DELETION_CATEGORIES,
  RETENTION_SCHEDULE,
  computeCreditDisposition,
  freezeIcuBalance,
  subscriptionBlocksDeletion,
} from "../../../app/api/settings/account/delete/_lib/rules";
import { MemoryDeletionStore, type FixtureAccount } from "./fixtures/account-deletion-memory-store";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NOW = "2026-10-11T00:00:00.000Z";

function accountA(overrides: Partial<FixtureAccount> = {}): FixtureAccount {
  return {
    clerkUserId: "clerk_A",
    accountId: "acct_A",
    subscription: { state: "inactive", planKey: null },
    ledger: [
      { entryType: "grant", amount: 50 },
      { entryType: "purchase", amount: 20 },
      { entryType: "usage", amount: -10 },
    ],
    icuBalance: 0,
    content: ["profile:A", "prefs:A", "prompt:A1", "generation:A1", "project:A1"],
    objectIds: ["obj_A1", "obj_A2"],
    ...overrides,
  };
}

function accountB(): FixtureAccount {
  return {
    clerkUserId: "clerk_B",
    accountId: "acct_B",
    subscription: { state: "active", planKey: "pro" },
    ledger: [{ entryType: "purchase", amount: 500 }],
    icuBalance: 900,
    content: ["profile:B", "project:B1"],
    objectIds: ["obj_B1"],
  };
}

interface Harness {
  store: MemoryDeletionStore;
  deps: AccountDeletionDeps;
  revoked: string[];
  setSubject(subject: Subject): void;
}

function harness(opts: { subject?: Subject; withStore?: boolean; accounts?: FixtureAccount[] } = {}): Harness {
  const store = new MemoryDeletionStore();
  for (const account of opts.accounts ?? [accountA(), accountB()]) store.addAccount(account);
  const revoked: string[] = [];
  let subject: Subject = opts.subject ?? { kind: "clerk", clerkUserId: "clerk_A" };
  let n = 0;
  const deps: AccountDeletionDeps = {
    resolveSubject: async () => subject,
    store: opts.withStore === false ? null : store,
    revokeSessions: async (id) => {
      revoked.push(id);
    },
    now: () => NOW,
    newRequestId: () => `req_${++n}`,
  };
  return { store, deps, revoked, setSubject: (s) => { subject = s; } };
}

const CONFIRM = { confirm: CONFIRMATION_WORD };

// ── Authentication / ownership ──────────────────────────────────────────

test("auth: unauthenticated GET and POST are rejected (401) and touch nothing", async () => {
  const h = harness({ subject: { kind: "anonymous" } });
  const get = await handleEligibility(h.deps);
  const post = await handleDelete(h.deps, CONFIRM);
  assert.equal(get.status, 401);
  assert.equal(post.status, 401);
  assert.equal(post.body.code, "unauthenticated");
  assert.deepEqual(h.store.calls, []);
  assert.equal(h.store.touchedAccountIds.size, 0);
  assert.equal(h.revoked.length, 0);
});

test("auth: synthetic (dev/mock) identities have no deletable account (403)", async () => {
  const h = harness({ subject: { kind: "synthetic" } });
  const post = await handleDelete(h.deps, CONFIRM);
  assert.equal(post.status, 403);
  assert.equal(post.body.code, "synthetic_identity");
  const get = await handleEligibility(h.deps);
  assert.equal(get.status, 200);
  assert.equal(get.body.eligible, false);
  assert.deepEqual(h.store.calls, []);
});

test("ownership: a request naming another account is rejected and the other account is untouched", async () => {
  const h = harness(); // signed in as A
  for (const body of [
    { ...CONFIRM, accountId: "acct_B" },
    { ...CONFIRM, userId: "clerk_B" },
    { ...CONFIRM, clerkUserId: "clerk_B" },
    { ...CONFIRM, targetAccountId: "acct_B" },
    { ...CONFIRM, accountId: 42 },
  ]) {
    const result = await handleDelete(h.deps, body);
    assert.equal(result.status, 403, JSON.stringify(body));
    assert.equal(result.body.code, "foreign_account");
  }
  assert.equal(h.store.touchedAccountIds.size, 0, "no mutating call for any account");
  assert.deepEqual(h.store.calls.filter((c) => c !== "findRequest"), []);
  assert.equal(h.store.accounts.get("clerk_B")!.content.length, 2);
  assert.equal(h.store.liveObjects.has("obj_B1"), true);
  assert.equal(h.revoked.length, 0);
});

test("ownership: naming your own ids is accepted; every mutating call carries only your account id", async () => {
  const h = harness();
  const result = await handleDelete(h.deps, { ...CONFIRM, accountId: "acct_A", clerkUserId: "clerk_A" });
  assert.equal(result.status, 200);
  assert.deepEqual([...h.store.touchedAccountIds], ["acct_A"]);
});

test("confirmation: missing or wrong confirmation is rejected (400) before any change", async () => {
  const h = harness();
  for (const body of [{}, { confirm: "delete" }, { confirm: true }, null, "DELETE", []]) {
    const result = await handleDelete(h.deps, body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(result.body.code, "confirmation_required");
  }
  assert.equal(h.store.touchedAccountIds.size, 0);
  assert.equal(h.store.requests.size, 0);
});

// ── Rule: permanent deletion of user content ────────────────────────────

test("RULE delete: an authenticated delete removes content, generated media and blobs of that account only", async () => {
  const h = harness();
  const result = await handleDelete(h.deps, CONFIRM);
  assert.equal(result.status, 200);
  assert.equal(result.body.state, "finalized");
  // Account, profile, preferences, prompts, generations, projects.
  assert.deepEqual(h.store.deletedContent.get("acct_A"), [
    "profile:A", "prefs:A", "prompt:A1", "generation:A1", "project:A1",
  ]);
  assert.deepEqual(h.store.accounts.get("clerk_A")!.content, []);
  // Uploaded + generated media blobs.
  assert.equal(h.store.liveObjects.has("obj_A1"), false);
  assert.equal(h.store.liveObjects.has("obj_A2"), false);
  // Other account fully intact.
  assert.deepEqual(h.store.accounts.get("clerk_B")!.content, ["profile:B", "project:B1"]);
  assert.equal(h.store.liveObjects.has("obj_B1"), true);
  assert.equal(h.store.deletedContent.has("acct_B"), false);
  // Sessions end after finalization, for the caller only.
  assert.deepEqual(h.revoked, ["clerk_A"]);
});

test("RULE anonymize/retain: analytics and identifiers are anonymized; ledger and invoices are retained under restriction", async () => {
  const h = harness();
  await handleDelete(h.deps, CONFIRM);
  assert.equal(h.store.anonymizedAccounts.has("acct_A"), true);
  const retained = h.store.retainedLedger.get("acct_A");
  assert.ok(retained, "credit transactions are retained, not deleted");
  assert.equal(retained.anonymized, true);
  assert.equal(retained.rows.length, 3);
  assert.equal(h.store.anonymizedAccounts.has("acct_B"), false);
  // The manifest marks exactly these categories.
  const byAction = (action: string) => DELETION_CATEGORIES.filter((c) => c.action === action).map((c) => c.id);
  assert.deepEqual(byAction("anonymize"), ["usage_analytics", "operational_identifiers"]);
  assert.deepEqual(byAction("retain_restricted"), ["invoices_payments", "credit_transactions"]);
  assert.ok(byAction("delete").includes("generations") && byAction("delete").includes("uploaded_assets"));
});

test("RULE retention schedule: no duration is invented (UNKNOWN until the owner sets it)", () => {
  assert.equal(RETENTION_SCHEDULE, "UNKNOWN");
});

// ── Rule: credits ───────────────────────────────────────────────────────

test("RULE credits: unused purchased credits are frozen for manual refund review; promotional expire at finalization; nothing is refunded", async () => {
  const h = harness(); // grant 50, purchase 20, usage -10 => balance 60
  const result = await handleDelete(h.deps, CONFIRM);
  assert.deepEqual(result.body.credits, { purchasedFrozen: 20, promotionalExpiring: 40, icuFrozen: 0 });
  assert.deepEqual(h.store.refundReviews, [
    { requestId: "req_1", accountId: "acct_A", purchasedFrozen: 20, icuFrozen: 0 },
  ]);
  assert.equal(h.store.expiredPromotional.get("req_1"), 40);
  assert.equal(
    h.store.calls.some((c) => /refund|payout|charge/i.test(c)),
    false,
    "no automatic refund or forfeiture call exists",
  );
});

test("RULE credits: fully-consumed purchases freeze only what is left; all-promotional balances freeze nothing", () => {
  assert.deepEqual(
    computeCreditDisposition([
      { entryType: "grant", amount: 50 },
      { entryType: "purchase", amount: 100 },
      { entryType: "usage", amount: -70 },
    ]),
    { balance: 80, purchasedFrozen: 80, promotionalExpiring: 0 },
    "ambiguous attribution freezes (never forfeits) possibly-purchased credit",
  );
  assert.deepEqual(computeCreditDisposition([{ entryType: "grant", amount: 50 }]), {
    balance: 50, purchasedFrozen: 0, promotionalExpiring: 50,
  });
  assert.deepEqual(
    computeCreditDisposition([{ entryType: "purchase", amount: 10 }, { entryType: "usage", amount: -30 }]),
    { balance: 0, purchasedFrozen: 0, promotionalExpiring: 0 },
    "negative balance never creates frozen or expiring credit",
  );
  assert.deepEqual(computeCreditDisposition([]), { balance: 0, purchasedFrozen: 0, promotionalExpiring: 0 });
  assert.deepEqual(
    computeCreditDisposition([{ entryType: "grant", amount: Number.NaN }, { entryType: "grant", amount: 5 }]),
    { balance: 5, purchasedFrozen: 0, promotionalExpiring: 5 },
  );
});

test("RULE credits: Studio ICU balances without provenance are frozen, never expired", async () => {
  assert.equal(freezeIcuBalance(900), 900);
  assert.equal(freezeIcuBalance(-5), 0);
  assert.equal(freezeIcuBalance(Number.NaN), 0);
  const h = harness({ accounts: [accountA({ ledger: [], icuBalance: 300 })] });
  const result = await handleDelete(h.deps, CONFIRM);
  assert.deepEqual(result.body.credits, { purchasedFrozen: 0, promotionalExpiring: 0, icuFrozen: 300 });
  assert.equal(h.store.refundReviews[0]!.icuFrozen, 300);
});

// ── Rule: subscription ──────────────────────────────────────────────────

test("RULE subscription: an uncancelled subscription blocks deletion and the user is told why", async () => {
  for (const state of ["active", "trialing", "past_due", "suspended"]) {
    assert.equal(subscriptionBlocksDeletion(state), true, state);
    const h = harness({ accounts: [accountA({ subscription: { state, planKey: "pro" } })] });
    const preview = await handleEligibility(h.deps);
    assert.equal(preview.body.eligible, false, state);
    assert.match(String(preview.body.blockedReason), /cancel/i);
    const result = await handleDelete(h.deps, CONFIRM);
    assert.equal(result.status, 409, state);
    assert.equal(result.body.code, "subscription_active");
    assert.equal(h.store.touchedAccountIds.size, 0, `${state}: nothing changed`);
    assert.equal(h.store.requests.size, 0);
  }
  for (const state of ["inactive", "canceled", undefined]) {
    assert.equal(subscriptionBlocksDeletion(state), false, String(state));
  }
});

// ── Rule: inform the user ───────────────────────────────────────────────

test("RULE inform: eligibility preview lists what is deleted, retained, outstanding credits and the confirmation word, without mutating", async () => {
  const h = harness();
  const preview = await handleEligibility(h.deps);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.ok, true);
  assert.equal(preview.body.eligible, true);
  assert.equal(preview.body.confirmation, "DELETE");
  assert.deepEqual(preview.body.credits, { purchasedFrozen: 20, promotionalExpiring: 40, icuFrozen: 0 });
  const retained = (preview.body.retained as string[]).join(" | ");
  assert.match(retained, /Invoices and payment records/);
  assert.match(retained, /frozen and referred for manual refund review/);
  assert.match(retained, /expire/);
  assert.ok((preview.body.deletes as string[]).some((d) => /generations/i.test(d)));
  assert.equal(h.store.touchedAccountIds.size, 0);
  assert.deepEqual(h.store.calls.filter((c) => c !== "findRequest"), []);
});

// ── Rule: idempotent + async asset deletion ─────────────────────────────

test("RULE idempotent: a repeated delete returns the same finalized result and performs no further work", async () => {
  const h = harness();
  const first = await handleDelete(h.deps, CONFIRM);
  const callsAfterFirst = h.store.calls.length;
  const second = await handleDelete(h.deps, CONFIRM);
  const third = await handleDelete(h.deps, CONFIRM);
  assert.equal(first.status, 200);
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(h.store.calls.length, callsAfterFirst + 2, "only the two findRequest reads");
  assert.equal(h.store.calls.filter((c) => c === "deleteContent").length, 1);
  assert.equal(h.store.calls.filter((c) => c === "freezeCredits").length, 1);
  assert.equal(h.store.refundReviews.length, 1);
  assert.equal(h.store.expiredPromotional.size, 1);
  assert.equal(h.store.requests.size, 1);
  assert.deepEqual(h.revoked, ["clerk_A"], "sessions revoked once");
});

test("RULE async assets: blob failures leave deletion pending (202), nothing expires or finalizes early, a repeat completes it", async () => {
  const h = harness();
  h.store.failingObjects.add("obj_A2");
  const pending = await handleDelete(h.deps, CONFIRM);
  assert.equal(pending.status, 202);
  assert.equal(pending.body.state, "deleting");
  assert.equal(pending.body.objectsPending, 1);
  // Purchased credits already frozen; promotional NOT yet expired; not finalized.
  assert.equal(h.store.refundReviews.length, 1);
  assert.equal(h.store.expiredPromotional.size, 0);
  assert.equal(h.store.requests.get("clerk_A")!.finalizedAt, null);
  assert.equal(h.store.anonymizedAccounts.has("acct_A"), false);
  assert.equal(h.revoked.length, 0, "sessions stay valid so the user can retry");
  assert.equal(h.store.liveObjects.has("obj_A1"), false);
  assert.equal(h.store.liveObjects.has("obj_A2"), true);
  const preview = await handleEligibility(h.deps);
  assert.equal(preview.body.deletionState, "deleting");
  assert.equal(preview.body.eligible, true);

  h.store.failingObjects.clear();
  const done = await handleDelete(h.deps, CONFIRM);
  assert.equal(done.status, 200);
  assert.equal(done.body.state, "finalized");
  assert.equal(h.store.liveObjects.has("obj_A2"), false);
  assert.equal(h.store.expiredPromotional.get("req_1"), 40);
  assert.equal(h.store.calls.filter((c) => c === "deleteContent").length, 1, "content not deleted twice");
  assert.equal(h.store.calls.filter((c) => c === "freezeCredits").length, 1, "credits not re-frozen");
  assert.equal(h.store.refundReviews.length, 1);
  assert.deepEqual(h.revoked, ["clerk_A"]);
});

test("RULE async/safe: a failure mid-way answers a retryable 503 and a repeat resumes without redoing finished steps", async () => {
  const h = harness();
  h.store.failOnceAt = "delete_content";
  const failed = await handleDelete(h.deps, CONFIRM);
  assert.equal(failed.status, 503);
  assert.equal(failed.body.code, "deletion_incomplete");
  assert.equal(failed.body.retryable, true);
  assert.equal(h.store.requests.get("clerk_A")!.finalizedAt, null);
  assert.deepEqual(h.store.requests.get("clerk_A")!.completedSteps, ["freeze_credits", "capture_objects"]);

  const resumed = await handleDelete(h.deps, CONFIRM);
  assert.equal(resumed.status, 200);
  assert.equal(h.store.calls.filter((c) => c === "freezeCredits").length, 1);
  assert.equal(h.store.calls.filter((c) => c === "captureObjects").length, 1);
});

test("fail closed: with no production store the route claims nothing and deletes nothing", async () => {
  const h = harness({ withStore: false });
  const post = await handleDelete(h.deps, CONFIRM);
  assert.equal(post.status, 503);
  assert.equal(post.body.code, "deletion_unavailable");
  const get = await handleEligibility(h.deps);
  assert.equal(get.body.eligible, false);
  assert.equal(h.store.touchedAccountIds.size, 0);
  assert.equal(h.revoked.length, 0);
});

test("account not ready: a signed-in user with no mapped account gets a clear 409 and nothing changes", async () => {
  const h = harness({ subject: { kind: "clerk", clerkUserId: "clerk_unmapped" } });
  const post = await handleDelete(h.deps, CONFIRM);
  assert.equal(post.status, 409);
  assert.equal(post.body.code, "account_not_ready");
  assert.equal(h.store.requests.size, 0);
});

// ── Route wiring tripwires ──────────────────────────────────────────────

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

test("route wiring: no longer the honest-501 stub; uses the shared Clerk-session helper; exports only GET and POST", () => {
  const route = source("app/api/settings/account/delete/route.ts");
  assert.ok(!route.includes("notAvailableInStudioResponse"), "stub removed");
  assert.ok(route.includes("handleEligibility") && route.includes("handleDelete"));
  const exported = [...route.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map((m) => m[1]);
  assert.deepEqual(exported.sort(), ["GET", "POST"], "Next route modules may only export handlers");
  const deps = source("app/api/settings/account/delete/_lib/deps.ts");
  assert.ok(deps.includes("resolveSessionsPrincipal"), "same auth helper as the sessions routes");
  assert.ok(!/process\.env/.test(deps), "no environment reads or secrets in the wiring");
});
