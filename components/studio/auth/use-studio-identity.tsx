"use client";

/**
 * RC1 — single client hook for Studio identity.
 *
 * Combines Clerk `useAuth()` with the server account response
 * (`GET /api/settings/account`) into one `StudioIdentityStatus`. Consumed
 * by the rail account footer, Settings → Account, the auth-action gate,
 * and the shared access gate (RC4).
 *
 * Resolution (see `identity-state.ts`): Clerk loading or account loading →
 * `loading`; Clerk signed-in while the server says signed_out/pending →
 * `identity_pending` (the P0 split); settled without usable data →
 * `identity_unavailable` (never perpetual "Checking session"); otherwise
 * the server state.
 */

import * as React from "react";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useAsyncData, type AccountInfo } from "@ethen/ui/settings/settings-data";
import {
  parseAccountIdentityState,
  resolveStudioIdentityStatus,
  type StudioIdentityStatus,
} from "./identity-state";

export interface StudioIdentity {
  status: StudioIdentityStatus;
  /** True only when status is `signed_in`. */
  signedIn: boolean;
  /** Whether Clerk itself reports a session (client-side only). */
  clerkSignedIn: boolean;
  account: AccountInfo | null;
  refresh: () => Promise<void>;
}

export function useStudioIdentity(): StudioIdentity {
  // Unconditional hook call (rules-safe); without a ClerkProvider (Clerk
  // unconfigured) useAuth throws, which degrades to signed-out — the same
  // fallback `useAuthActionGate` already uses.
  let clerkSignedIn = false;
  let clerkLoading = false;
  try {
    const auth = useClerkAuth();
    clerkSignedIn = auth.isSignedIn === true;
    clerkLoading = auth.isLoaded !== true;
  } catch {
    clerkSignedIn = false;
    clerkLoading = false;
  }
  const account = useAsyncData<AccountInfo>("/api/settings/account");
  const accountState = React.useMemo(
    () => (account.data ? parseAccountIdentityState(account.data) : null),
    [account.data],
  );
  const status = resolveStudioIdentityStatus({
    clerkLoading,
    clerkSignedIn,
    accountLoading: account.loading,
    accountState,
  });
  return {
    status,
    signedIn: status === "signed_in",
    clerkSignedIn,
    account: account.data,
    refresh: account.refresh,
  };
}
