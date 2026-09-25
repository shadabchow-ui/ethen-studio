/**
 * Studio V2 Final Closure — standalone private-alpha access guard.
 *
 * Pure, edge-safe decision module for the standalone `apps/studio`
 * deployable. Mirrors the monolith authority in
 * `lib/portfolio/studio-private-alpha.ts` (kill → auth → enrollment →
 * readiness) without importing monolith `lib/` into the edge bundle and
 * without creating a second entitlement database.
 *
 * Enrollment authority (interim, canonical pattern):
 * - There is no enrollment store yet (see
 *   `lib/portfolio/studio-access-context.ts`: `enrolledOrganizationId`
 *   stays null until a trusted adapter exists).
 * - Until that store lands, enrollment is operator-configured via
 *   environment allowlists, mirroring `ETHEN_ADMIN_ALLOWLIST`
 *   (`packages/ai/src/platform/auth/admin-policy.ts`):
 *     ETHEN_STUDIO_ENROLLED_ORG_IDS  — comma-separated Clerk org IDs
 *     ETHEN_STUDIO_ENROLLED_USER_IDS — comma-separated Clerk user IDs
 * - Empty/unset allowlists enroll nobody (fail closed). No user IDs are
 *   hardcoded in code; the operator sets them per deployment.
 * - Registry authority: `@ethen/contracts/portfolio/registry` keeps
 *   `studio` at lifecycle `private-alpha` with HIDDEN visibility. This
 *   guard enforces the enrolled-only boundary that lifecycle implies.
 *   A behavioral test pins guard/registry alignment (no drift).
 *
 * Route classification (public review preserved):
 * - AUTHENTICATED_WORKBENCH — `/studio` and `/studio/*` EXCEPT public review
 * - PUBLIC_REVIEW_PAGE      — `/studio/review` + `/studio/review/<token>`
 * - PUBLIC_REVIEW_API       — `GET /api/studio/v1/collaboration/public/reviews/<token>` (token resolve)
 * - PUBLIC_HEALTH           — `GET /api/studio/v1/health` (liveness, no secrets)
 * - PUBLIC_ROOT             — `/` (standalone landing)
 * - AUTH_ENTRY              — `/sign-in`, `/sign-up`, `/__clerk/*`
 * - API_WORKBENCH           — all other `/api/studio/v1/*` (session + project
 *   guards downstream via `requireUserSession`/`requireProject`)
 *
 * Local-only UI-inspection bypass (`ETHEN_STUDIO_LOCAL_AUTH_BYPASS`):
 * - Strictly for owner inspection on a loopback dev origin. Activates ONLY
 *   when the flag is `"true"` AND the runtime is non-production
 *   (`NODE_ENV !== "production"`, `VERCEL_ENV` not production/preview) AND
 *   the request host is loopback (`localhost`, `127.0.0.1`, `::1`).
 * - Sits between kill-switch and auth: the kill switch still wins (incident
 *   response stays meaningful everywhere); auth/enrollment/readiness are
 *   skipped for local inspection only.
 * - Production fail-closed: with `NODE_ENV=production` the flag is ignored
 *   (decision proceeds as if unset). Default OFF. Never certification
 *   evidence; never a substitute for the enrolled Clerk session.
 */

export type StudioRouteClass =
  | "AUTHENTICATED_WORKBENCH"
  | "PUBLIC_REVIEW_PAGE"
  | "PUBLIC_REVIEW_API"
  | "PUBLIC_HEALTH"
  | "PUBLIC_ROOT"
  | "AUTH_ENTRY"
  | "API_WORKBENCH"
  | "REDIRECT"
  | "UNKNOWN";

export type StudioAccessDecision =
  | { allowed: true; routeClass: StudioRouteClass }
  | {
      allowed: false;
      status: 401 | 403 | 503;
      code: string;
      error: string;
      routeClass: StudioRouteClass;
    };

export type StudioAccessEnvironment = Readonly<
  Record<string, string | undefined>
>;

export const STUDIO_READINESS_KEYS = [
  "ETHEN_STUDIO_PRIVATE_ALPHA",
  "ETHEN_STUDIO_STORAGE_READY",
  "ETHEN_STUDIO_WORKER_READY",
  "ETHEN_STUDIO_POLICY_READY",
  "ETHEN_STUDIO_OPENAI_READY",
  "ETHEN_STUDIO_FAL_READY",
] as const;

const AUTH_ENTRY_PREFIXES = ["/sign-in", "/sign-up", "/__clerk"] as const;

/** Loopback hosts eligible for local inspection (mirrors standalone-edge). */
const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);

export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.trim().split(":")[0]?.toLowerCase() ?? "";
  return LOOPBACK_HOSTNAMES.has(hostname);
}

/**
 * Strict local-dev UI-inspection bypass. ALL must hold:
 * flag `"true"` + non-production runtime (NODE_ENV and VERCEL_ENV) +
 * loopback request host. Default OFF; production always ignores the flag.
 */
export function isLocalAuthBypassActive(
  input: { host?: string | null },
  env: StudioAccessEnvironment = process.env,
): boolean {
  if (env.ETHEN_STUDIO_LOCAL_AUTH_BYPASS !== "true") return false;
  if (env.NODE_ENV !== "development") return false;
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
    return false;
  }
  return isLoopbackHost(input.host);
}

export function isAuthEntryPath(pathname: string): boolean {
  return AUTH_ENTRY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isPublicReviewPage(pathname: string): boolean {
  return (
    pathname === "/studio/review" ||
    pathname.startsWith("/studio/review/")
  );
}

/**
 * Public token-resolution API. Only the single-token GET is public; the
 * collection routes stay authenticated (session + project membership
 * downstream).
 */
export function isPublicReviewApi(
  pathname: string,
  method: string,
): boolean {
  if (method.toUpperCase() !== "GET") return false;
  const prefix = "/api/studio/v1/collaboration/public/reviews/";
  if (!pathname.startsWith(prefix)) return false;
  const token = pathname.slice(prefix.length).split("/")[0] ?? "";
  return token.trim().length > 0;
}

export function isPublicHealthApi(pathname: string): boolean {
  return pathname === "/api/studio/v1/health";
}

export function isStudioWorkbenchPage(pathname: string): boolean {
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    return !isPublicReviewPage(pathname);
  }
  return false;
}

export function isStudioWorkbenchApi(pathname: string): boolean {
  return pathname.startsWith("/api/studio/v1/");
}

/**
 * S4C public-read allowlist (auth-on-action).
 *
 * Project-less catalog/templates GETs serve release content only (generated
 * registry / frozen templates — no user data) and bypass the API session
 * gate. Everything else under `/api/studio/v1/` still requires a session.
 * The route handlers re-enforce session + membership whenever a projectId
 * IS present, so this predicate must stay in lockstep with them.
 */
export function isPublicAnonymousApiRead(pathname: string, method: string, hasProjectId: boolean): boolean {
  if (method.toUpperCase() !== "GET") return false;
  if (hasProjectId) return false;
  return pathname === "/api/studio/v1/catalog" || pathname === "/api/studio/v1/composites/templates";
}

export function classifyStudioRoute(
  pathname: string,
  method = "GET",
): StudioRouteClass {
  if (pathname === "/") return "PUBLIC_ROOT";
  if (isAuthEntryPath(pathname)) return "AUTH_ENTRY";
  if (isPublicReviewPage(pathname)) return "PUBLIC_REVIEW_PAGE";
  if (isPublicReviewApi(pathname, method)) return "PUBLIC_REVIEW_API";
  if (isPublicHealthApi(pathname)) return "PUBLIC_HEALTH";
  if (pathname === "/studio/canvas") return "REDIRECT";
  if (isStudioWorkbenchPage(pathname)) return "AUTHENTICATED_WORKBENCH";
  if (isStudioWorkbenchApi(pathname)) return "API_WORKBENCH";
  return "UNKNOWN";
}

/** Returns true for routes that need no session (token/consent/expiry governed). */
export function isPublicStudioPath(
  pathname: string,
  method = "GET",
): boolean {
  const routeClass = classifyStudioRoute(pathname, method);
  return (
    routeClass === "PUBLIC_REVIEW_PAGE" ||
    routeClass === "PUBLIC_REVIEW_API" ||
    routeClass === "PUBLIC_HEALTH" ||
    routeClass === "PUBLIC_ROOT" ||
    routeClass === "AUTH_ENTRY"
  );
}

export function parseAllowlist(
  raw: string | null | undefined,
): ReadonlySet<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

/**
 * Interim enrolled-only check. Enrolled when the actor's Clerk org is in
 * `ETHEN_STUDIO_ENROLLED_ORG_IDS` OR the actor's user ID is in
 * `ETHEN_STUDIO_ENROLLED_USER_IDS`. Fail-closed when both are unset.
 */
export function isStudioEnrolled(
  input: { actorId: string | null; organizationId: string | null },
  env: StudioAccessEnvironment = process.env,
): boolean {
  const orgAllowlist = parseAllowlist(env.ETHEN_STUDIO_ENROLLED_ORG_IDS);
  if (input.organizationId && orgAllowlist.has(input.organizationId)) return true;
  const userAllowlist = parseAllowlist(env.ETHEN_STUDIO_ENROLLED_USER_IDS);
  if (input.actorId && userAllowlist.has(input.actorId)) return true;
  return false;
}

export interface StudioAccessInput {
  pathname: string;
  method?: string;
  actorId: string | null;
  organizationId: string | null;
  /** Request host (hostname[:port]) — required for the loopback bypass. */
  host?: string | null;
  env?: StudioAccessEnvironment;
}

/**
 * S4C — public page boundary (auth-on-action).
 *
 * Studio pages render for everyone, including signed-out visitors: only the
 * incident kill switch can block a page render. Auth, enrollment, and lane
 * readiness moved to the API boundary (`evaluateStudioApiAccess`) and to
 * in-product auth-action gates (Clerk modal on Generate/submit). Personal
 * data stays protected because user-scoped APIs still require a session —
 * pages render shells + signed-out states, never private records.
 */
export function evaluateStudioPageAccess(input: StudioAccessInput): StudioAccessDecision {
  const env = input.env ?? process.env;
  const routeClass = classifyStudioRoute(input.pathname, input.method ?? "GET");
  if (env.ETHEN_STUDIO_KILL_SWITCH === "true") {
    return {
      allowed: false,
      status: 503,
      code: "STUDIO_DISABLED",
      error: "Studio is unavailable.",
      routeClass,
    };
  }
  return { allowed: true, routeClass };
}

/**
 * S4C — API boundary (authenticated actions).
 *
 * Mutations and user-scoped reads require: kill switch off, an
 * authenticated actor, and lane readiness. Global enrollment was removed
 * per owner decision (S4C §8): ordinary authenticated access must NOT
 * require manual user-ID enrollment. `isStudioEnrolled` is retained for
 * future per-capability alpha scoping — no capability currently requires
 * it. Intentionally-public reads (health, token reviews, project-less
 * catalog/templates) bypass this via the proxy allowlist, and their route
 * handlers serve only non-user data on the anonymous branch.
 */
export function evaluateStudioApiAccess(input: StudioAccessInput): StudioAccessDecision {
  const env = input.env ?? process.env;
  const routeClass = classifyStudioRoute(input.pathname, input.method ?? "GET");
  if (env.ETHEN_STUDIO_KILL_SWITCH === "true") {
    return {
      allowed: false,
      status: 503,
      code: "STUDIO_DISABLED",
      error: "Studio is unavailable.",
      routeClass,
    };
  }
  if (isLocalAuthBypassActive({ host: input.host }, env)) {
    return { allowed: true, routeClass };
  }
  if (!input.actorId) {
    return {
      allowed: false,
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      error: "Studio requires authentication.",
      routeClass,
    };
  }
  if (STUDIO_READINESS_KEYS.some((key) => env[key] !== "true")) {
    return {
      allowed: false,
      status: 503,
      code: "STUDIO_NOT_READY",
      error: "Studio is unavailable.",
      routeClass,
    };
  }
  return { allowed: true, routeClass };
}

/**
 * Pre-S4C combined evaluator (page wall + global enrollment).
 *
 * @deprecated S4C split this into `evaluateStudioPageAccess` (public pages)
 * and `evaluateStudioApiAccess` (authenticated actions, no global
 * enrollment). Retained for tests auditing the legacy shape; the proxy no
 * longer calls it.
 */
export function evaluateStudioStandaloneAccess(input: StudioAccessInput): StudioAccessDecision {
  const method = input.method ?? "GET";
  const env = input.env ?? process.env;
  const routeClass = classifyStudioRoute(input.pathname, method);

  // Public review/delivery/health/root/auth-entry never reach the workbench gate.
  if (isPublicStudioPath(input.pathname, method)) {
    return { allowed: true, routeClass };
  }

  // Non-studio paths (unknown in this deployable) pass through; Next 404s.
  if (
    routeClass !== "AUTHENTICATED_WORKBENCH" &&
    routeClass !== "API_WORKBENCH" &&
    routeClass !== "REDIRECT"
  ) {
    return { allowed: true, routeClass };
  }

  // Canonical order mirrors lib/portfolio/studio-private-alpha.ts:
  // kill → auth → enrollment → readiness. The local inspection bypass sits
  // directly after the kill switch: incidents still win everywhere, while
  // loopback dev may skip auth/enrollment/readiness for UI inspection.
  if (env.ETHEN_STUDIO_KILL_SWITCH === "true") {
    return {
      allowed: false,
      status: 503,
      code: "STUDIO_DISABLED",
      error: "Studio is unavailable.",
      routeClass,
    };
  }
  if (isLocalAuthBypassActive({ host: input.host }, env)) {
    return { allowed: true, routeClass };
  }
  if (!input.actorId) {
    return {
      allowed: false,
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      error: "Studio requires authentication.",
      routeClass,
    };
  }
  if (
    !isStudioEnrolled(
      { actorId: input.actorId, organizationId: input.organizationId },
      env,
    )
  ) {
    return {
      allowed: false,
      status: 403,
      code: "ENROLLMENT_REQUIRED",
      error: "Studio is in private alpha and requires enrollment.",
      routeClass,
    };
  }
  if (STUDIO_READINESS_KEYS.some((key) => env[key] !== "true")) {
    return {
      allowed: false,
      status: 503,
      code: "STUDIO_NOT_READY",
      error: "Studio is unavailable.",
      routeClass,
    };
  }
  return { allowed: true, routeClass };
}
