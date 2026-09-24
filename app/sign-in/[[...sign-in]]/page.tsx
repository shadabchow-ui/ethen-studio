import { SignIn } from "@clerk/nextjs";

/**
 * Studio standalone sign-in (canonical Clerk App Router pattern).
 *
 * Standalone-deployable canonical Clerk App Router pattern (same shape as
 * the sibling chat deployable's sign-in route) with the monolith's
 * fail-closed unconfigured guard.
 * The catch-all segment also serves `/sign-in/sso-callback` for the SSO
 * handshake. Post-auth landing is the Studio workbench (`/studio`).
 */

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

export default function StudioSignInPage() {
  if (!clerkConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">Sign In Unavailable</h1>
          <p className="mt-2 text-sm opacity-70">
            Authentication is not configured for this deployment.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/studio"
      />
    </main>
  );
}
