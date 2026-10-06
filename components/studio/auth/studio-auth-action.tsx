"use client";

/**
 * S4C — Studio auth-on-action gate (public UI + authenticated actions).
 *
 * Anonymous visitors browse Studio freely; protected actions (Generate,
 * Run, Save, Create, review/publish, agent execution) require a session.
 * This module is the single funnel:
 *
 * - `useAuthActionGate().runAuthed(action)` pre-gates a submit against the
 *   Studio identity state: signed-in runs immediately, signed-out opens
 *   the Clerk sign-in modal WITHOUT navigating (composer drafts survive),
 *   and identity-pending/unavailable opens the identity-pending dialog.
 * - `requestStudioSignIn()` is the hook-free escape hatch for plain API
 *   clients: on a 401 they dispatch the event instead of surfacing a raw
 *   auth error, and the provider routes it the same way.
 * - `StudioAuthActionProvider` (mounted once in the workbench chrome)
 *   listens for the event and calls Clerk `openSignIn()` (modal, Studio
 *   stays visible behind it) — but NEVER for a Clerk-signed-in user, for
 *   whom `openSignIn()` no-ops (the P0 trap); they get the
 *   identity-pending UI instead. If the modal API is unavailable it falls
 *   back to a `/sign-in?redirect_url=` navigation.
 * - `StudioAuthRequiredError` marks the cancelled submission so callers
 *   treat it as "awaiting sign-in", never as a failed generation — and
 *   never retry it automatically (no double-submit).
 */

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth as useClerkAuth, useClerk } from "@clerk/nextjs";
import {
  STUDIO_REQUIRE_AUTH_EVENT,
  requestStudioSignIn,
  type StudioRequireAuthDetail,
} from "./studio-auth-action-core";
import {
  STUDIO_IDENTITY_PENDING_EVENT,
  requestStudioIdentityPending,
  routeSignInRequest,
  type StudioIdentityPendingDetail,
  type StudioIdentityStatus,
} from "./identity-state";
import { useStudioIdentity } from "./use-studio-identity";
import { useStudioSignOut } from "./use-studio-sign-out";

// Re-export the framework-free cores so consumers have one import root.
export {
  STUDIO_REQUIRE_AUTH_EVENT,
  isStudioAuthFailure,
  isStudioAuthRequiredError,
  requestStudioSignIn,
  StudioAuthRequiredError,
  translateStudioAuthFailure,
} from "./studio-auth-action-core";
export type { StudioRequireAuthDetail } from "./studio-auth-action-core";
export {
  STUDIO_IDENTITY_PENDING_EVENT,
  accountMenuActionForIdentity,
  parseAccountIdentityState,
  requestStudioIdentityPending,
  resolveStudioIdentityStatus,
  routeSignInRequest,
  sidebarAccountForIdentity,
  studioIdentityFromMapping,
} from "./identity-state";
export type {
  StudioAccountMenuAction,
  StudioIdentityPendingDetail,
  StudioIdentityState,
  StudioIdentityStatus,
} from "./identity-state";

/** Same configured check as EthenAuthProvider (client-safe, no hooks). */
export function isStudioClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export function StudioAuthActionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const openModal = React.useCallback(
    (detail?: StudioRequireAuthDetail) => {
      // Registered by ClerkModalBridge once mounted inside ClerkProvider.
      const opener = (window as unknown as { __ethenStudioClerkOpener?: (detail?: StudioRequireAuthDetail) => boolean })
        .__ethenStudioClerkOpener;
      if (typeof opener === "function") {
        try {
          if (opener(detail)) return;
        } catch {
          // Fall through to the route fallback below.
        }
      }
      const returnPath = pathname ?? "/studio";
      router.push(`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`);
    },
    [router, pathname],
  );

  React.useEffect(() => {
    const onRequireAuth = (event: Event) => {
      openModal((event as CustomEvent<StudioRequireAuthDetail>).detail);
    };
    window.addEventListener(STUDIO_REQUIRE_AUTH_EVENT, onRequireAuth);
    return () => window.removeEventListener(STUDIO_REQUIRE_AUTH_EVENT, onRequireAuth);
  }, [openModal]);

  const clerkConfigured = isStudioClerkConfigured();
  return (
    <>
      {clerkConfigured ? <ClerkModalBridge /> : null}
      {clerkConfigured ? <StudioIdentityPendingDialog /> : null}
      {children}
    </>
  );
}

/**
 * Registers the window-level Clerk modal opener. Rendered only when Clerk
 * is configured, which is exactly when the tree sits inside ClerkProvider
 * (see EthenAuthProvider), so the hooks below are always legal here.
 *
 * RC1: when Clerk already has a session, a sign-in request means the P0
 * identity split (server unmapped) — dispatch the identity-pending UI
 * instead of calling `openSignIn()`, which would silently no-op.
 */
function ClerkModalBridge(): null {
  const clerk = useClerk();
  const { isSignedIn } = useClerkAuth();
  React.useEffect(() => {
    const opener = (detail?: StudioRequireAuthDetail): boolean => {
      const target = routeSignInRequest({
        clerkSignedIn: isSignedIn === true,
        modalAvailable: typeof clerk?.openSignIn === "function",
      });
      if (target === "identity_pending") {
        requestStudioIdentityPending(detail?.action ? { action: detail.action } : {});
        return true;
      }
      if (target === "modal") {
        clerk.openSignIn({});
        return true;
      }
      return false;
    };
    (window as unknown as { __ethenStudioClerkOpener?: (detail?: StudioRequireAuthDetail) => boolean }).__ethenStudioClerkOpener =
      opener;
    return () => {
      delete (window as unknown as { __ethenStudioClerkOpener?: (detail?: StudioRequireAuthDetail) => boolean })
        .__ethenStudioClerkOpener;
    };
  }, [clerk, isSignedIn]);
  return null;
}

/**
 * RC1 — identity-pending dialog ("Finishing your Studio account setup" +
 * Retry + Sign out). Opens whenever a Clerk-signed-in user hits a Studio
 * auth requirement their server identity can't satisfy. Retry re-checks
 * the server identity (the mapping may have just been provisioned); Sign
 * out ends the Clerk session so the user can start clean.
 */
function StudioIdentityPendingDialog(): React.ReactNode {
  const [open, setOpen] = React.useState(false);
  const identity = useStudioIdentity();
  const { signOut } = useStudioSignOut();
  const [signingOut, setSigningOut] = React.useState(false);

  React.useEffect(() => {
    const onPending = () => {
      setOpen(true);
    };
    window.addEventListener(STUDIO_IDENTITY_PENDING_EVENT, onPending);
    return () => window.removeEventListener(STUDIO_IDENTITY_PENDING_EVENT, onPending);
  }, []);

  // Opening re-checks the server mapping immediately (provisioning may have
  // just landed); resolving to signed_in dismisses the dialog.
  React.useEffect(() => {
    if (open) void identity.refresh();
    // Refresh once per open; the refresh callback is stable per fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);
  React.useEffect(() => {
    if (open && identity.status === "signed_in") setOpen(false);
  }, [open, identity.status]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  if (!open) return null;
  const checking = identity.status === "loading";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-identity-pending-title"
      data-testid="studio-identity-pending"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.55)",
        padding: 16,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          borderRadius: 12,
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          padding: 20,
        }}
      >
        <h2 id="studio-identity-pending-title" style={{ margin: 0, fontSize: 16 }}>
          Finishing your Studio account setup
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          You are signed in, but Studio is still setting up your account on its servers. This usually
          finishes within a minute. Retry to check again, or sign out and back in.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => void identity.refresh()}
            disabled={checking || signingOut}
            style={{
              minHeight: 44,
              padding: "0 16px",
              borderRadius: 8,
              border: "1px solid var(--border-default)",
              background: "var(--bg-raised, var(--bg-surface))",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: checking || signingOut ? "wait" : "pointer",
            }}
          >
            {checking ? "Checking…" : "Retry"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSigningOut(true);
              void signOut();
            }}
            disabled={checking || signingOut}
            style={{
              minHeight: 44,
              padding: "0 16px",
              borderRadius: 8,
              border: "1px solid var(--border-default)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 13,
              cursor: checking || signingOut ? "wait" : "pointer",
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={signingOut}
            style={{
              minHeight: 44,
              padding: "0 12px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export interface AuthActionGate {
  /** True only when the Studio identity is signed_in (server truth). */
  signedIn: boolean;
  /** Full identity status for callers that distinguish pending/loading. */
  status: StudioIdentityStatus;
  /**
   * Run an authenticated action: executes immediately when signed in,
   * otherwise opens the sign-in modal (signed-out) or the identity-pending
   * dialog (pending/unavailable) and DROPS the action (caller state is
   * untouched, so the user retries from the identical prepared state after
   * signing in — never auto-resubmitted, never double-submitted).
   */
  runAuthed: (action: () => void, actionLabel?: string) => void;
}

/**
 * Pre-gate for submit paths (Generate/Run/Save/...). Prefer this over
 * fire-then-translate so anonymous attempts never hit protected APIs.
 * Safe with or without a ClerkProvider (missing provider degrades to
 * signed-out and the modal request falls back to /sign-in, which renders
 * its honest "unavailable" state on such deployments).
 */
export function useAuthActionGate(): AuthActionGate {
  const identity = useStudioIdentity();
  const { status, signedIn, clerkSignedIn } = identity;
  const runAuthed = React.useCallback(
    (action: () => void, actionLabel?: string) => {
      if (status === "signed_in") {
        action();
        return;
      }
      if (status === "signed_out") {
        requestStudioSignIn(actionLabel ? { action: actionLabel } : {});
        return;
      }
      if (status === "loading") {
        // Identity still resolving: preserve the historical Clerk-based
        // behavior; the 401 translator routes failures to the pending UI.
        if (clerkSignedIn) {
          action();
          return;
        }
        requestStudioSignIn(actionLabel ? { action: actionLabel } : {});
        return;
      }
      requestStudioIdentityPending(actionLabel ? { action: actionLabel } : {});
    },
    [status, clerkSignedIn],
  );
  return { signedIn, status, runAuthed };
}
