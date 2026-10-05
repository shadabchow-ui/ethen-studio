import { SignUp } from "@clerk/nextjs";
import { AuthLegalLinks } from "../../auth-legal-links";

/**
 * Studio standalone sign-up (canonical Clerk App Router pattern).
 *
 * Standalone-deployable canonical Clerk App Router pattern (same shape as
 * the sibling chat deployable's sign-up route) with the monolith's
 * fail-closed unconfigured guard. Post-registration landing is
 * the Studio workbench (`/studio`). Note (legal-v1 F-SU-02): the deployed
 * edge proxy checks authentication and readiness flags, not enrollment.
 */

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

export default function StudioSignUpPage() {
  if (!clerkConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">Sign Up Unavailable</h1>
          <p className="mt-2 text-sm opacity-70">
            Authentication is not configured for this deployment.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/studio"
      />
      <AuthLegalLinks intent="sign-up" />
    </main>
  );
}
