"use client";

/**
 * S4C — Studio auth-on-action gate (public UI + authenticated actions).
 *
 * Anonymous visitors browse Studio freely; protected actions (Generate,
 * Run, Save, Create, review/publish, agent execution) require a session.
 * This module is the single funnel:
 *
 * - `useAuthActionGate().runAuthed(action)` pre-gates a submit: signed-in
 *   runs immediately, signed-out opens the Clerk sign-in modal WITHOUT
 *   navigating, so composer drafts (React state) survive the transition.
 * - `requestStudioSignIn()` is the hook-free escape hatch for plain API
 *   clients: on a 401 they dispatch the event instead of surfacing a raw
 *   auth error, and the provider opens the same modal.
 * - `StudioAuthActionProvider` (mounted once in the workbench chrome)
 *   listens for the event and calls Clerk `openSignIn()` (modal, Studio
 *   stays visible behind it). If the modal API is unavailable it falls
 *   back to a `/sign-in?redirect_url=` navigation.
 * - `StudioAuthRequiredError` marks the cancelled submission so callers
 *   treat it as "awaiting sign-in", never as a failed generation — and
 *   never retry it automatically (no double-submit).
 */

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth as useClerkAuth, useClerk } from "@clerk/nextjs";
import { STUDIO_REQUIRE_AUTH_EVENT, requestStudioSignIn } from "./studio-auth-action-core";

// Re-export the framework-free core so consumers have one import root.
export {
  STUDIO_REQUIRE_AUTH_EVENT,
  isStudioAuthFailure,
  isStudioAuthRequiredError,
  requestStudioSignIn,
  StudioAuthRequiredError,
  translateStudioAuthFailure,
} from "./studio-auth-action-core";
export type { StudioRequireAuthDetail } from "./studio-auth-action-core";

/** Same configured check as EthenAuthProvider (client-safe, no hooks). */
export function isStudioClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export function StudioAuthActionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const openModal = React.useCallback(() => {
    // Registered by ClerkModalBridge once mounted inside ClerkProvider.
    const opener = (window as unknown as { __ethenStudioClerkOpener?: () => boolean }).__ethenStudioClerkOpener;
    if (typeof opener === "function") {
      try {
        if (opener()) return;
      } catch {
        // Fall through to the route fallback below.
      }
    }
    const returnPath = pathname ?? "/studio";
    router.push(`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`);
  }, [router, pathname]);

  React.useEffect(() => {
    const onRequireAuth = () => openModal();
    window.addEventListener(STUDIO_REQUIRE_AUTH_EVENT, onRequireAuth);
    return () => window.removeEventListener(STUDIO_REQUIRE_AUTH_EVENT, onRequireAuth);
  }, [openModal]);

  return (
    <>
      {isStudioClerkConfigured() ? <ClerkModalBridge /> : null}
      {children}
    </>
  );
}

/**
 * Registers the window-level Clerk modal opener. Rendered only when Clerk
 * is configured, which is exactly when the tree sits inside ClerkProvider
 * (see EthenAuthProvider), so the hook below is always legal here.
 */
function ClerkModalBridge(): null {
  const clerk = useClerk();
  React.useEffect(() => {
    const opener = (): boolean => {
      if (typeof clerk?.openSignIn === "function") {
        clerk.openSignIn({});
        return true;
      }
      return false;
    };
    (window as unknown as { __ethenStudioClerkOpener?: () => boolean }).__ethenStudioClerkOpener = opener;
    return () => {
      delete (window as unknown as { __ethenStudioClerkOpener?: () => boolean }).__ethenStudioClerkOpener;
    };
  }, [clerk]);
  return null;
}

export interface AuthActionGate {
  /** True when a Clerk session is active (false while loading or signed out). */
  signedIn: boolean;
  /**
   * Run an authenticated action: executes immediately when signed in,
   * otherwise opens the sign-in modal and DROPS the action (caller state
   * is untouched, so the user retries from the identical prepared state
   * after signing in — never auto-resubmitted, never double-submitted).
   */
  runAuthed: (action: () => void, actionLabel?: string) => void;
}

/**
 * Pre-gate for submit paths (Generate/Run/Save/...). Prefer this over
 * fire-then-translate so anonymous attempts never hit protected APIs.
 * Safe with or without a ClerkProvider (missing provider degrades to
 * signed-out and the modal request falls back to /sign-in).
 */
export function useAuthActionGate(): AuthActionGate {
  // Unconditional hook call (rules-safe); without a ClerkProvider (Clerk
  // unconfigured) useAuth throws, which degrades to signed-out: the modal
  // request then falls back to /sign-in, which renders its honest
  // "unavailable" state on such deployments.
  let isSignedIn: boolean | undefined;
  try {
    isSignedIn = useClerkAuth().isSignedIn;
  } catch {
    isSignedIn = false;
  }
  const signedIn = isSignedIn === true;
  const runAuthed = React.useCallback(
    (action: () => void, actionLabel?: string) => {
      if (signedIn) {
        action();
        return;
      }
      requestStudioSignIn(actionLabel ? { action: actionLabel } : {});
    },
    [signedIn],
  );
  return { signedIn, runAuthed };
}
