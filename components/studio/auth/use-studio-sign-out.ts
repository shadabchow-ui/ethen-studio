"use client";

/**
 * RC1 — shared Studio sign-out.
 *
 * Ends the Studio session on both sides: best-effort server revocation,
 * then Clerk `signOut()` (the call the old rail handler was missing —
 * without it the proxy bounced `/sign-in` straight back to `/studio`),
 * then a hard landing on the public `/studio` page with no bounce loop.
 * Safe with or without a ClerkProvider.
 */

import * as React from "react";
import { useClerk } from "@clerk/nextjs";

export interface StudioSignOut {
  signOut: () => Promise<void>;
}

export function useStudioSignOut(): StudioSignOut {
  let clerk: ReturnType<typeof useClerk> | null = null;
  try {
    clerk = useClerk();
  } catch {
    clerk = null;
  }
  const signOut = React.useCallback(async () => {
    try {
      await fetch("/api/settings/sessions/current", { method: "DELETE" });
    } catch {
      // Best-effort: the Clerk session end below is the source of truth.
    }
    try {
      await clerk?.signOut();
    } catch {
      // Already signed out (or unavailable): still land cleanly below.
    }
    if (typeof window !== "undefined") window.location.assign("/studio");
  }, [clerk]);
  return { signOut };
}
