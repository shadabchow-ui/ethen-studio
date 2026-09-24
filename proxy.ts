import type { ClerkMiddlewareAuth } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { resolveAccessState, wantsBrowserDocument } from "@ethen/contracts/platform/access-state";
import { renderAccessStateDocument } from "@ethen/contracts/platform/access-state-document";
import { buildStandaloneCsp } from "@ethen/security/standalone-edge";
import {
  evaluateStudioStandaloneAccess,
  isAuthEntryPath,
  isPublicStudioPath,
} from "./lib/studio-access-guard";

/**
 * Ethen Studio — standalone private-alpha edge gate (Final Closure).
 *
 * The standalone `apps/studio` deployable previously shipped with NO
 * proxy/middleware, so a non-enrolled browser received HTTP 200 with
 * Studio navigation on `/studio` (Job 13C Blocker C). This proxy is the
 * smallest canonical fix:
 *
 * - Workbench pages (`/studio`, `/studio/*`) and workbench APIs
 *   (`/api/studio/v1/*`) require: authenticated Clerk session + enrollment
 *   (operator allowlists `ETHEN_STUDIO_ENROLLED_ORG_IDS` /
 *   `ETHEN_STUDIO_ENROLLED_USER_IDS`, mirroring `ETHEN_ADMIN_ALLOWLIST`)
 *   + readiness (`ETHEN_STUDIO_PRIVATE_ALPHA` + `*_READY`) + kill switch.
 *   Decision order mirrors `lib/portfolio/studio-private-alpha.ts`.
 * - Public review/delivery stay token-governed: `/studio/review/*`,
 *   `GET /api/studio/v1/collaboration/public/reviews/<token>`,
 *   `GET /api/studio/v1/health`, `/`, and auth entries pass through
 *   with no session.
 * - Denials use the canonical governance presentation
 *   (`resolveAccessState` + `renderAccessStateDocument`, productId
 *   `studio`): browser documents keep the HTTP status (401/403/503),
 *   API callers receive JSON. No CSS-only hiding, no client-only redirect.
 *
 * No second entitlement database, no hardcoded user IDs. Enrollment values
 * live in deployment env, never in code.
 */

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
);

const DEV_BYPASS_ACTOR_ID = "dev-auth-bypass";

function resolveDevBypassActorId(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return (
    env.ETHEN_DEV_AUTH_BYPASS === "1" &&
    env.NODE_ENV === "development" &&
    env.VERCEL_ENV !== "production" &&
    env.VERCEL_ENV !== "preview"
  )
    ? DEV_BYPASS_ACTOR_ID
    : null;
}

export async function runStudioProxy(
  request: NextRequest,
  clerkAuth: ClerkMiddlewareAuth | null = null,
  options: { clerkConfigured?: boolean } = {},
): Promise<NextResponse> {
  const configured = options.clerkConfigured ?? clerkConfigured;
  const { pathname } = request.nextUrl;
  const method = request.method;
  const nonce = crypto.randomUUID();

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  // STUDIO_16: narrow route-specific microphone permission for the realtime
  // Voice Agents session page only. Every other route keeps microphone
  // disabled; camera stays disabled everywhere.
  const microphonePermission =
    pathname === "/studio/voice-agents" || pathname.startsWith("/studio/voice-agents/")
      ? "microphone=(self)"
      : "microphone=()";
  const secure = (response: NextResponse): NextResponse => {
    response.headers.set("Content-Security-Policy", buildStandaloneCsp(nonce));
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set(
      "Permissions-Policy",
      `camera=(), ${microphonePermission}, geolocation=(), payment=(), usb=()`,
    );
    if (
      process.env.VERCEL_ENV === "production" ||
      process.env.NODE_ENV === "production"
    ) {
      response.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    if (
      pathname.startsWith("/studio") ||
      pathname.startsWith("/api/studio/v1")
    ) {
      response.headers.set("Cache-Control", "private, no-store");
    }
    return response;
  };
  const next = () => secure(NextResponse.next({ request: { headers } }));

  const deny = (
    status: 401 | 403 | 503,
    code: string,
    error: string,
  ): NextResponse => {
    if (wantsBrowserDocument(pathname, request.headers.get("accept"))) {
      const presentation = resolveAccessState({
        code,
        status,
        error,
        productId: "studio",
        title: error,
      });
      return secure(
        new NextResponse(renderAccessStateDocument(presentation), {
          status,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
    return secure(
      NextResponse.json(
        { ok: false, code, error, productId: "studio" },
        { status },
      ),
    );
  };

  // Public review/delivery/health/root/auth-entry: no session required.
  // Token/consent/expiry governance lives in the route handlers.
  // Authenticated callers visiting a sign-in/up page are sent to the
  // workbench (mirrors apps/chat-core + apps/platform-core); the SSO
  // callback must always render so ClerkJS can finalize the session.
  if (isPublicStudioPath(pathname, method)) {
    if (
      isAuthEntryPath(pathname) &&
      !pathname.includes("sso-callback") &&
      configured &&
      clerkAuth
    ) {
      try {
        if ((await clerkAuth()).userId) {
          const url = request.nextUrl.clone();
          url.pathname = "/studio";
          url.search = "";
          return secure(NextResponse.redirect(url));
        }
      } catch {
        // Unverifiable session → fall through to the public page.
      }
    }
    return next();
  }

  // Clerk's Frontend API must always reach clerkMiddleware untouched.
  if (pathname === "/__clerk" || pathname.startsWith("/__clerk/")) {
    return next();
  }

  let actorId: string | null = null;
  let organizationId: string | null = null;
  if (configured && clerkAuth) {
    try {
      const session = await clerkAuth();
      actorId = session.userId ?? null;
      organizationId = session.orgId ?? null;
    } catch {
      actorId = null;
      organizationId = null;
    }
  }
  // Local owner review only: when no Clerk session resolves, the dev-only
  // bypass actor (never active in production/preview) may still identify
  // the caller. Enrollment, readiness, and kill switches still apply to it
  // exactly as to a real actor — this answers "who", never "allowed".
  if (!actorId) {
    actorId = resolveDevBypassActorId();
  }

  const decision = evaluateStudioStandaloneAccess({
    pathname,
    method,
    actorId,
    organizationId,
    host: request.nextUrl.hostname,
    env: process.env,
  });
  if (decision.allowed) return next();
  return deny(decision.status, decision.code, decision.error);
}

export async function proxy(request: NextRequest): Promise<NextResponse>;
export async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
): Promise<NextResponse | Response | undefined>;
export async function proxy(request: NextRequest, event?: NextFetchEvent) {
  if (!clerkConfigured || !event) return runStudioProxy(request);
  const { clerkMiddleware } = await import("@clerk/nextjs/server");
  return clerkMiddleware((auth, clerkRequest) =>
    runStudioProxy(clerkRequest, auth),
  )(request, event);
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
