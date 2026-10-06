/**
 * RC1 — Studio identity state contract (framework-free).
 *
 * The P0 root cause was an identity-state split: Clerk (edge `proxy.ts` and
 * client `useAuth`) can report signed-in while Studio's server identity
 * reports signed-out, because `requireUserSession()` requires a
 * `clerk_user_mappings` row that only an external Clerk webhook writes.
 * Every non-mapped state collapsed into `{signedIn:false}`, so the rail
 * offered "Sign in" to users who already had a Clerk session — and
 * `Clerk.openSignIn()` silently no-ops for an existing session.
 *
 * This module is the single contract both sides share:
 * - the server (`app/api/settings/account`) maps
 *   `resolveClerkSupabaseMapping().state` to `StudioIdentityState`,
 * - the client (`useStudioIdentity`) combines Clerk `useAuth()` with the
 *   account response into one `StudioIdentityStatus`,
 * - sign-in entry points route through `routeSignInRequest`, which never
 *   sends a Clerk-signed-in user to `openSignIn()`.
 *
 * Pure/browser-safe: no React, no Clerk, no Next imports, so unit tests and
 * the server route import it directly.
 */

/** The four Studio identity states. `signedIn` is true only for `signed_in`. */
export type StudioIdentityState =
  | "signed_out"
  | "identity_pending"
  | "identity_unavailable"
  | "signed_in";

/** Client resolution adds `loading` while either identity source settles. */
export type StudioIdentityStatus = "loading" | StudioIdentityState;

/**
 * Structural mirror of `ClerkSupabaseMappingState`
 * (`packages/database/src/clerk-supabase.ts`). Mirrored — not imported — so
 * this module stays free of the server-only mapping implementation.
 */
export type StudioMappingState =
  | "setup_required"
  | "unauthenticated"
  | "mapped"
  | "unmapped";

/**
 * Map a durable-mapping outcome to the Studio identity contract:
 * mapped → signed_in, unauthenticated → signed_out,
 * unmapped → identity_pending (Clerk session exists, Studio setup pending),
 * setup_required / thrown → identity_unavailable.
 */
export function studioIdentityFromMapping(
  state: StudioMappingState | null,
): StudioIdentityState {
  if (state === "mapped") return "signed_in";
  if (state === "unauthenticated") return "signed_out";
  if (state === "unmapped") return "identity_pending";
  return "identity_unavailable";
}

export interface StudioAccountSnapshot {
  state: StudioIdentityState;
  /** Backward-compatible flag: true only when state is `signed_in`. */
  signedIn: boolean;
  actorId: string | null;
  /** Short code only (mapping state); never reason-string internals. */
  code: string;
}

/**
 * Build the `GET /api/settings/account` snapshot from injected
 * dependencies. The route supplies the real dev-bypass check and the real
 * `resolveClerkSupabaseMapping()`; tests inject fakes. No JIT provisioning
 * here (owner decision OD-1): an unmapped Clerk user stays
 * `identity_pending` with honest UI, never silently provisioned.
 */
export async function resolveStudioAccountSnapshot(deps: {
  bypassActorId: string | null;
  resolveMapping: () => Promise<{
    state: StudioMappingState;
    supabaseUserId: string | null;
  }>;
}): Promise<StudioAccountSnapshot> {
  if (deps.bypassActorId) {
    return {
      state: "signed_in",
      signedIn: true,
      actorId: deps.bypassActorId,
      code: "dev_bypass",
    };
  }
  let mapping: { state: StudioMappingState; supabaseUserId: string | null };
  try {
    mapping = await deps.resolveMapping();
  } catch {
    return {
      state: "identity_unavailable",
      signedIn: false,
      actorId: null,
      code: "unavailable",
    };
  }
  const state = studioIdentityFromMapping(mapping.state);
  const signedIn = state === "signed_in";
  return {
    state,
    signedIn,
    actorId: signedIn ? mapping.supabaseUserId : null,
    code: mapping.state,
  };
}

const IDENTITY_STATES: readonly StudioIdentityState[] = [
  "signed_out",
  "identity_pending",
  "identity_unavailable",
  "signed_in",
];

function isStudioIdentityState(value: unknown): value is StudioIdentityState {
  return (
    typeof value === "string" &&
    (IDENTITY_STATES as readonly string[]).includes(value)
  );
}

/**
 * Parse the account response's identity state. Prefers the `state` field;
 * falls back to the legacy `signedIn` boolean for responses that predate
 * the contract; returns null when neither is usable (→ unavailable, never
 * perpetual loading).
 */
export function parseAccountIdentityState(body: unknown): StudioIdentityState | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (isStudioIdentityState(record.state)) return record.state;
  if (typeof record.signedIn === "boolean") {
    return record.signedIn ? "signed_in" : "signed_out";
  }
  return null;
}

export interface StudioIdentityResolutionInput {
  clerkLoading: boolean;
  clerkSignedIn: boolean;
  accountLoading: boolean;
  /** Parsed server state once the account request settled with data. */
  accountState: StudioIdentityState | null;
}

/**
 * Combine Clerk client state with the settled server account state:
 * - either source still loading → `loading`,
 * - Clerk signed-in but the server says signed_out/pending → the split that
 *   caused the P0 → `identity_pending`,
 * - settled without usable data (network error, bad shape) →
 *   `identity_unavailable` — never perpetual "Checking session",
 * - otherwise the server state (including `signed_in` under the dev bypass,
 *   where no Clerk session exists).
 */
export function resolveStudioIdentityStatus(
  input: StudioIdentityResolutionInput,
): StudioIdentityStatus {
  if (input.clerkLoading || input.accountLoading) return "loading";
  if (!input.accountState) return "identity_unavailable";
  if (
    input.clerkSignedIn &&
    (input.accountState === "signed_out" ||
      input.accountState === "identity_pending")
  ) {
    return "identity_pending";
  }
  return input.accountState;
}

/** Where a sign-in request must go. `modal` needs `Clerk.openSignIn()`. */
export type SignInRequestTarget =
  | "identity_pending"
  | "modal"
  | "route_fallback";

/**
 * Route a sign-in request. A Clerk-signed-in user must NEVER be sent to
 * `openSignIn()` (it no-ops for an existing session — the P0 trap); they
 * get the identity-pending UI instead.
 */
export function routeSignInRequest(input: {
  clerkSignedIn: boolean;
  modalAvailable: boolean;
}): SignInRequestTarget {
  if (input.clerkSignedIn) return "identity_pending";
  return input.modalAvailable ? "modal" : "route_fallback";
}

/** Which account-menu action the rail offers for an identity status. */
export type StudioAccountMenuAction = "signin" | "finish-setup" | "signout";

/**
 * Derive the rail account-menu action. No Clerk-signed-in state ever offers
 * the no-op "Sign in": pending/unavailable offer "Finish setup" (the
 * pending dialog with Retry + Sign out) when Clerk is configured. Without
 * Clerk, unavailable degrades to "Sign in", whose fallback lands on
 * `/sign-in`'s honest unavailable page. While loading, keep the historical
 * "Sign out" slot rather than flashing a sign-in entry.
 */
export function accountMenuActionForIdentity(
  status: StudioIdentityStatus,
  clerkConfigured: boolean,
): StudioAccountMenuAction {
  if (status === "signed_out") return "signin";
  if (status === "signed_in" || status === "loading") return "signout";
  return clerkConfigured ? "finish-setup" : "signin";
}

export interface StudioSidebarAccountState {
  name: string;
  detail: string;
  initial: string;
}

/**
 * Rail account-footer content per identity status. `loading` renders only
 * while a source is actually loading; errors settle to `identity_pending`
 * or `identity_unavailable`, never to perpetual "Checking session".
 */
export function sidebarAccountForIdentity(
  status: StudioIdentityStatus,
  opts: { profileName: string | null; ownerReview: boolean },
): StudioSidebarAccountState {
  switch (status) {
    case "loading":
      return { name: "Loading…", detail: "Checking session", initial: "…" };
    case "signed_out":
      return { name: "Not signed in", detail: "Sign in required", initial: "?" };
    case "identity_pending":
      return {
        name: "Finishing setup…",
        detail: "Studio account setup",
        initial: "…",
      };
    case "identity_unavailable":
      return {
        name: "Unavailable",
        detail: "Session check failed",
        initial: "!",
      };
    case "signed_in": {
      const name = opts.profileName ?? "Signed in";
      return {
        name,
        detail: opts.ownerReview ? "Local review" : "Ethen Studio",
        initial: name.slice(0, 1).toUpperCase(),
      };
    }
  }
}

export const STUDIO_IDENTITY_PENDING_EVENT = "ethen:studio:identity-pending";

export interface StudioIdentityPendingDetail {
  /** Stable action label for telemetry/debugging (never user data). */
  action?: string;
}

/** Dispatch an identity-pending UI request (browser only; no-op on server). */
export function requestStudioIdentityPending(
  detail: StudioIdentityPendingDetail = {},
): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(
    new CustomEvent<StudioIdentityPendingDetail>(STUDIO_IDENTITY_PENDING_EVENT, {
      detail,
    }),
  );
}
