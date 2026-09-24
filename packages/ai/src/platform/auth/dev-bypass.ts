import "server-only";

/**
 * Dev-only sign-in bypass for local flagship-route testing.
 *
 * This never activates in production. It only lets `requireAuth()` resolve a
 * synthetic authorized actor instead of requiring a real Clerk/Supabase
 * session, so a developer can exercise the 14 flagship routes locally
 * without configuring an auth provider. It does not touch production
 * authentication code and does not weaken any authorization decision made
 * once an actor is resolved (roles, project membership, admin allowlists,
 * enrollment, and kill switches all still run against the synthetic actor
 * exactly as they would a real one).
 *
 * Sibling mechanism: `lib/platform/local-design-preview.ts` bypasses
 * product-availability gates (frozen products, private-alpha, enrollment).
 * This module only ever answers "who is making this request" — never
 * "is this product available."
 */

export type EnvironmentLike = Readonly<Record<string, string | undefined>>;

/** Stable synthetic actor id — recognizable in logs, never a real user id. */
export const DEV_AUTH_BYPASS_ACTOR_ID = "dev-auth-bypass";

export function isDevAuthBypassEnabled(
  environment: EnvironmentLike = process.env,
): boolean {
  return (
    environment.ETHEN_DEV_AUTH_BYPASS === "1" &&
    environment.NODE_ENV === "development" &&
    // Fail closed on ANY deployed lane — production AND preview. The bypass is
    // for a developer's local machine only (NODE_ENV=development with no
    // VERCEL_ENV), never for a Vercel deployment.
    environment.VERCEL_ENV !== "production" &&
    environment.VERCEL_ENV !== "preview"
  );
}

/** Returns the synthetic actor id when the bypass is active, else null. */
export function resolveDevAuthBypassActorId(
  environment: EnvironmentLike = process.env,
): string | null {
  return isDevAuthBypassEnabled(environment) ? DEV_AUTH_BYPASS_ACTOR_ID : null;
}
