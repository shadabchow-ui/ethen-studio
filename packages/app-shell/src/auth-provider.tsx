import type { ReactNode } from "react";

import { resolveClerkAllowedRedirectOrigins } from "@ethen/security/canonical-origin";

/**
 * `EthenAuthProvider` — the smallest reusable auth-provider contract (B1).
 *
 * Every deployable authenticates the same way: when Clerk is configured the
 * document is wrapped in `ClerkProvider` with the canonical redirect origins;
 * when it is not, the tree renders unwrapped exactly as before. Moved verbatim
 * from the root layout — the fallback branch, the dynamic import and the env
 * defaults are unchanged, so auth behaviour is identical.
 *
 * The security perimeter itself stays where it is: `@ethen/security` owns the
 * evaluation and each deployable's middleware invokes it.
 */

export function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export interface EthenAuthProviderProps {
  nonce: string;
  children: ReactNode;
}

export async function EthenAuthProvider({ nonce, children }: EthenAuthProviderProps) {
  if (!isClerkConfigured()) return <>{children}</>;

  const { ClerkProvider } = await import("@clerk/nextjs");
  const signInUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in";
  const signUpUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? "/sign-up";
  const afterSignInUrl = process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL ?? "/";
  const afterSignUpUrl = process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL ?? "/";
  const allowedRedirectOrigins = resolveClerkAllowedRedirectOrigins();

  return (
    <ClerkProvider
      nonce={nonce || undefined}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      signInFallbackRedirectUrl={afterSignInUrl}
      signUpFallbackRedirectUrl={afterSignUpUrl}
      allowedRedirectOrigins={allowedRedirectOrigins}
      dynamic
    >
      {children}
    </ClerkProvider>
  );
}
