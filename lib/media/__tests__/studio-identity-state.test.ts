import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STUDIO_IDENTITY_PENDING_EVENT,
  accountMenuActionForIdentity,
  parseAccountIdentityState,
  requestStudioIdentityPending,
  resolveStudioAccountSnapshot,
  resolveStudioIdentityStatus,
  routeSignInRequest,
  sidebarAccountForIdentity,
  studioIdentityFromMapping,
} from "../../../components/studio/auth/identity-state";

// ── RC1: mapping → identity contract ───────────────────────────────────

test("RC1 mapping states map to the Studio identity contract", () => {
  assert.equal(studioIdentityFromMapping("mapped"), "signed_in");
  assert.equal(studioIdentityFromMapping("unauthenticated"), "signed_out");
  assert.equal(studioIdentityFromMapping("unmapped"), "identity_pending");
  assert.equal(studioIdentityFromMapping("setup_required"), "identity_unavailable");
  assert.equal(studioIdentityFromMapping(null), "identity_unavailable");
});

test("RC1 account snapshot honors the dev bypass without touching Clerk", async () => {
  let calls = 0;
  const snapshot = await resolveStudioAccountSnapshot({
    bypassActorId: "dev-auth-bypass",
    resolveMapping: async () => {
      calls += 1;
      return { state: "unmapped", supabaseUserId: null };
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(snapshot, {
    state: "signed_in",
    signedIn: true,
    actorId: "dev-auth-bypass",
    code: "dev_bypass",
  });
});

test("RC1 account snapshot matrix (no state collapse)", async () => {
  const run = (state: "mapped" | "unauthenticated" | "unmapped" | "setup_required") =>
    resolveStudioAccountSnapshot({
      bypassActorId: null,
      resolveMapping: async () => ({ state, supabaseUserId: state === "mapped" ? "supa-1" : null }),
    });
  assert.deepEqual(await run("mapped"), {
    state: "signed_in",
    signedIn: true,
    actorId: "supa-1",
    code: "mapped",
  });
  assert.deepEqual(await run("unauthenticated"), {
    state: "signed_out",
    signedIn: false,
    actorId: null,
    code: "unauthenticated",
  });
  // The P0 case: unmapped is pending, never collapsed into signed_out.
  assert.deepEqual(await run("unmapped"), {
    state: "identity_pending",
    signedIn: false,
    actorId: null,
    code: "unmapped",
  });
  assert.deepEqual(await run("setup_required"), {
    state: "identity_unavailable",
    signedIn: false,
    actorId: null,
    code: "setup_required",
  });
});

test("RC1 account snapshot treats a thrown mapping lookup as unavailable", async () => {
  const snapshot = await resolveStudioAccountSnapshot({
    bypassActorId: null,
    resolveMapping: async () => {
      throw new Error("db down");
    },
  });
  assert.deepEqual(snapshot, {
    state: "identity_unavailable",
    signedIn: false,
    actorId: null,
    code: "unavailable",
  });
});

test("RC1 snapshot codes are short codes, never reason internals", async () => {
  for (const state of ["mapped", "unauthenticated", "unmapped", "setup_required"] as const) {
    const snapshot = await resolveStudioAccountSnapshot({
      bypassActorId: null,
      resolveMapping: async () => ({ state, supabaseUserId: null }),
    });
    assert.equal(snapshot.code, state);
    assert.ok(!snapshot.code.includes(" "), "code must be a single token");
    assert.ok(
      ["mapped", "unauthenticated", "unmapped", "setup_required"].includes(snapshot.code),
      "code must be exactly the mapping-state token, never reason prose",
    );
  }
});

// ── RC1: response parsing ──────────────────────────────────────────────

test("RC1 parseAccountIdentityState prefers state, falls back to signedIn", () => {
  assert.equal(parseAccountIdentityState({ state: "identity_pending", signedIn: false }), "identity_pending");
  assert.equal(parseAccountIdentityState({ state: "signed_in", signedIn: true }), "signed_in");
  // Legacy responses without `state` degrade via the boolean.
  assert.equal(parseAccountIdentityState({ signedIn: true }), "signed_in");
  assert.equal(parseAccountIdentityState({ signedIn: false }), "signed_out");
  // State wins over a stale boolean.
  assert.equal(parseAccountIdentityState({ state: "signed_out", signedIn: true }), "signed_out");
  // Unusable shapes → null (unavailable, never perpetual loading).
  assert.equal(parseAccountIdentityState(null), null);
  assert.equal(parseAccountIdentityState({}), null);
  assert.equal(parseAccountIdentityState({ state: "bogus" }), null);
  assert.equal(parseAccountIdentityState({ state: "bogus", signedIn: "yes" }), null);
});

// ── RC1: client resolution (Clerk × server) ────────────────────────────

test("RC1 identity resolution reports loading while either source settles", () => {
  const base = { clerkSignedIn: false as boolean, accountState: null as null };
  assert.equal(
    resolveStudioIdentityStatus({ ...base, clerkLoading: true, accountLoading: false }),
    "loading",
  );
  assert.equal(
    resolveStudioIdentityStatus({ ...base, clerkLoading: false, accountLoading: true }),
    "loading",
  );
  assert.equal(
    resolveStudioIdentityStatus({
      clerkLoading: false,
      clerkSignedIn: true,
      accountLoading: true,
      accountState: null,
    }),
    "loading",
  );
});

test("RC1 identity resolution settles failures to unavailable, never loading", () => {
  assert.equal(
    resolveStudioIdentityStatus({
      clerkLoading: false,
      clerkSignedIn: false,
      accountLoading: false,
      accountState: null,
    }),
    "identity_unavailable",
  );
  assert.equal(
    resolveStudioIdentityStatus({
      clerkLoading: false,
      clerkSignedIn: true,
      accountLoading: false,
      accountState: null,
    }),
    "identity_unavailable",
  );
});

test("RC1 identity resolution detects the P0 split (Clerk in, server out)", () => {
  // Clerk session present while the server reports signed_out/pending →
  // identity_pending, never signed_out (which would offer the no-op modal).
  assert.equal(
    resolveStudioIdentityStatus({
      clerkLoading: false,
      clerkSignedIn: true,
      accountLoading: false,
      accountState: "signed_out",
    }),
    "identity_pending",
  );
  assert.equal(
    resolveStudioIdentityStatus({
      clerkLoading: false,
      clerkSignedIn: true,
      accountLoading: false,
      accountState: "identity_pending",
    }),
    "identity_pending",
  );
  // Agreeing states pass through.
  assert.equal(
    resolveStudioIdentityStatus({
      clerkLoading: false,
      clerkSignedIn: true,
      accountLoading: false,
      accountState: "signed_in",
    }),
    "signed_in",
  );
  assert.equal(
    resolveStudioIdentityStatus({
      clerkLoading: false,
      clerkSignedIn: true,
      accountLoading: false,
      accountState: "identity_unavailable",
    }),
    "identity_unavailable",
  );
});

test("RC1 identity resolution trusts the server when Clerk is signed out", () => {
  for (const accountState of ["signed_out", "identity_pending", "identity_unavailable", "signed_in"] as const) {
    assert.equal(
      resolveStudioIdentityStatus({
        clerkLoading: false,
        clerkSignedIn: false,
        accountLoading: false,
        accountState,
      }),
      accountState,
      `server ${accountState} must pass through (covers the dev bypass)`,
    );
  }
});

// ── RC1: sign-in routing (never openSignIn for a Clerk session) ────────

test("RC1 sign-in requests from a Clerk session route to pending, never the modal", () => {
  // The exact P0 regression: modal availability must not matter here.
  assert.equal(routeSignInRequest({ clerkSignedIn: true, modalAvailable: true }), "identity_pending");
  assert.equal(routeSignInRequest({ clerkSignedIn: true, modalAvailable: false }), "identity_pending");
  assert.equal(routeSignInRequest({ clerkSignedIn: false, modalAvailable: true }), "modal");
  assert.equal(routeSignInRequest({ clerkSignedIn: false, modalAvailable: false }), "route_fallback");
});

test("RC1 ClerkModalBridge routes through the pending branch (source tripwire)", () => {
  // The bridge itself is React (browser-verified locally); this trips if
  // anyone rewires it back to an unconditional openSignIn().
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const source = readFileSync(join(root, "components/studio/auth/studio-auth-action.tsx"), "utf8");
  assert.ok(source.includes("routeSignInRequest({"), "bridge must route via routeSignInRequest");
  assert.ok(source.includes('target === "identity_pending"'), "bridge must handle the pending target");
  assert.ok(source.includes("requestStudioIdentityPending("), "bridge must dispatch the pending UI");
});

test("RC1 identity-pending event dispatch carries the action label", () => {
  const seen: Array<{ type: string; action?: string }> = [];
  const target = new EventTarget();
  (globalThis as unknown as { window: unknown }).window = target;
  try {
    target.addEventListener(STUDIO_IDENTITY_PENDING_EVENT, (event) => {
      seen.push({ type: event.type, action: (event as CustomEvent<{ action?: string }>).detail?.action });
    });
    requestStudioIdentityPending({ action: "project-new" });
    requestStudioIdentityPending();
    assert.deepEqual(seen, [
      { type: STUDIO_IDENTITY_PENDING_EVENT, action: "project-new" },
      { type: STUDIO_IDENTITY_PENDING_EVENT, action: undefined },
    ]);
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});

// ── RC1: rail footer + account menu ────────────────────────────────────

test("RC1 rail footer content per identity status", () => {
  assert.deepEqual(sidebarAccountForIdentity("loading", { profileName: null, ownerReview: false }), {
    name: "Loading…",
    detail: "Checking session",
    initial: "…",
  });
  assert.deepEqual(sidebarAccountForIdentity("signed_out", { profileName: null, ownerReview: false }), {
    name: "Not signed in",
    detail: "Sign in required",
    initial: "?",
  });
  assert.deepEqual(
    sidebarAccountForIdentity("identity_pending", { profileName: null, ownerReview: false }),
    { name: "Finishing setup…", detail: "Studio account setup", initial: "…" },
  );
  assert.deepEqual(
    sidebarAccountForIdentity("identity_unavailable", { profileName: null, ownerReview: false }),
    { name: "Unavailable", detail: "Session check failed", initial: "!" },
  );
  // Errors settle to their own states — "Checking session" appears only
  // while loading.
  for (const status of ["signed_out", "identity_pending", "identity_unavailable", "signed_in"] as const) {
    const footer = sidebarAccountForIdentity(status, { profileName: null, ownerReview: false });
    assert.notEqual(footer.detail, "Checking session", `${status} must not show the loading detail`);
  }
  assert.deepEqual(sidebarAccountForIdentity("signed_in", { profileName: null, ownerReview: false }), {
    name: "Signed in",
    detail: "Ethen Studio",
    initial: "S",
  });
  assert.deepEqual(sidebarAccountForIdentity("signed_in", { profileName: "Ada", ownerReview: true }), {
    name: "Ada",
    detail: "Local review",
    initial: "A",
  });
});

test("RC1 account menu never offers a no-op Sign in to a Clerk session", () => {
  assert.equal(accountMenuActionForIdentity("signed_out", true), "signin");
  assert.equal(accountMenuActionForIdentity("signed_in", true), "signout");
  assert.equal(accountMenuActionForIdentity("loading", true), "signout");
  assert.equal(accountMenuActionForIdentity("identity_pending", true), "finish-setup");
  assert.equal(accountMenuActionForIdentity("identity_unavailable", true), "finish-setup");
  // Without Clerk there is no session to trap: unavailable degrades to the
  // sign-in fallback, which lands on /sign-in's honest unavailable page.
  assert.equal(accountMenuActionForIdentity("identity_pending", false), "signin");
  assert.equal(accountMenuActionForIdentity("identity_unavailable", false), "signin");
});
