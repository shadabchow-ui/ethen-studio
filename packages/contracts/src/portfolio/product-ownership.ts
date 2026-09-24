/**
 * Authoritative Product Ownership Manifest and Deployment Target Boundary.
 *
 * Implements the 5/9 flagship split between Ethen Chat and Ethen Platform:
 * - Ethen Chat (5 flagships): research, voice, studio, designer, founder
 * - Ethen Platform (9 flagships): ethen-auto (console), code, computer-use,
 *   automation, sentinel, local-models, model-intelligence, gateway, gpu-compute
 *
 * Provides typed deployment-target boundary evaluation, enforcing fail-closed
 * routing at the request edge and build-time scoping during target builds.
 */

import {
  CANONICAL_FLAGSHIP_RUNTIME_MAP,
  type FlagshipOwner,
  type FlagshipRuntimeMapping,
  listFlagshipsByOwner,
} from "./flagship-map";

export type DeploymentTarget = "chat" | "platform";

export interface RouteDecision {
  allowed: boolean;
  status?: 200 | 307 | 308 | 404;
  redirectUrl?: string;
  code?: string;
  reason?: string;
  target?: DeploymentTarget;
}

/**
 * Resolves the currently configured deployment target from environment variables or hostname.
 * Checks ETHEN_DEPLOYMENT_TARGET first, then DEPLOYMENT_TARGET, then hostname.
 */
export function resolveDeploymentTarget(hostname?: string | null): DeploymentTarget | null {
  const raw = (process.env.ETHEN_DEPLOYMENT_TARGET ?? process.env.DEPLOYMENT_TARGET)?.trim().toLowerCase();
  if (raw === "chat") return "chat";
  if (raw === "platform") return "platform";
  if (hostname) {
    const host = hostname.toLowerCase().split(":")[0];
    if (host.startsWith("chat.") || host === "chat.upcube.ai") return "chat";
    if (host.startsWith("platform.") || host === "platform.upcube.ai") return "platform";
  }
  return null;
}

/**
 * Flagships owned by Ethen Chat (5 flagships).
 */
export const CHAT_FLAGSHIPS: readonly FlagshipRuntimeMapping[] =
  listFlagshipsByOwner("chat");

/**
 * Flagships owned by Ethen Platform (9 flagships).
 */
export const PLATFORM_FLAGSHIPS: readonly FlagshipRuntimeMapping[] =
  listFlagshipsByOwner("platform");

/**
 * Canonical product root routes for Chat.
 */
export const CHAT_CANONICAL_ROUTES: readonly string[] = [
  "/chat",
  ...CHAT_FLAGSHIPS.map((f) => f.canonicalRoute),
];

/**
 * Canonical product root routes for Platform.
 */
export const PLATFORM_CANONICAL_ROUTES: readonly string[] = [
  "/console",
  ...PLATFORM_FLAGSHIPS.map((f) => f.canonicalRoute),
];

/**
 * Route prefixes owned by Chat product target.
 */
export const CHAT_ROUTE_PREFIXES: readonly string[] = [
  "/chat",
  "/research",
  "/voice",
  "/studio",
  "/designer",
  "/founder-agent",
  "/agents/designer-agent",
  "/agents/founder-agent",
  "/agents/research-agent",
  "/agents/media-agent",
  // Chat APIs. Each entry pairs with a Chat page prefix above; an owned page
  // whose API is unclassified is a 404 product, so the pairing must be kept.
  "/api/chat",
  "/api/voice",
  "/api/research",
  "/api/studio",
  "/api/designer",
  // Founder flagship (/founder-agent) — its command centre calls these.
  "/api/founder-agent",
  // Studio flagship (/studio) — assets, jobs, canvas and provider status.
  "/api/media",
  // Chat runtime transport used by hooks/use-chatbot-chat.ts.
  "/api/chatbot-agent",
  // Attachment pipeline (Job 7). Shared with Platform: Chat reaches it from
  // hooks/use-chatbot-chat.ts, Console from components/console/ConsoleComposer.tsx,
  // so it is deliberately owned by BOTH targets rather than foreign to one.
  "/api/attachments",
];

/**
 * Route prefixes owned by Platform product target.
 * Note reconciled drift:
 * - Computer is /browser + /api/computer-use
 * - Automation is /workflow-agent + /api/flows
 */
export const PLATFORM_ROUTE_PREFIXES: readonly string[] = [
  "/console",
  "/workspace",
  "/code",
  "/browser",
  "/computer-use",
  "/workflow-agent",
  "/workflows",
  "/workflow-runs",
  "/workflow-automation",
  "/sentinel",
  "/security",
  "/policies",
  "/local-models",
  "/model-intelligence",
  "/ai-gateway",
  "/compute",
  // Platform utilities and consoles
  "/settings",
  "/logs",
  "/sessions",
  "/projects",
  "/artifacts",
  "/evals",
  "/audit-log",
  "/environment-variables",
  "/agent-runs",
  "/runs",
  "/observability",
  "/marketplace",
  "/admin",
  "/billing",
  "/usage",
  "/platform-status",
  "/operator",
  "/model-library",
  // Platform APIs
  "/api/gateway",
  "/api/flows",
  "/api/computer-use",
  "/api/code",
  "/api/local-models",
  "/api/models",
  "/api/sessions",
  "/api/projects",
  "/api/artifacts",
  "/api/runs",
  "/api/logs",
  "/api/evals",
  "/api/sentinel",
  "/api/compute",
  "/api/admin",
  "/api/billing",
  "/api/usage",
  // Attachment pipeline (Job 7) — shared with Chat; see the Chat list.
  "/api/attachments",
  // Console surface (/console): composer voice transcription and the
  // Auto/Cortex runtime behind the console.
  "/api/console",
  "/api/cortex",
  // Code flagship (/code) — the coding run APIs live under /api/coding.
  "/api/coding",
  // Local Models flagship (/local-models) — repo/terminal/context bridges.
  "/api/local",
  // Model workspace and model library surfaces.
  "/api/workspace",
  "/api/model-library",
  // Automation flagship (/workflow-agent) — connector actions and webhooks.
  "/api/connector",
  // Platform operations surfaces read by the console shell and settings.
  "/api/platform-status",
  "/api/runtime-status",
  "/api/storage-health",
  "/api/security",
];

/**
 * Infrastructure and system routes permitted on ALL targets.
 */
export const SHARED_INFRASTRUCTURE_PREFIXES: readonly string[] = [
  "/sign-in",
  "/sign-up",
  "/__clerk",
  "/_next",
  "/api/auth",
  "/api/health",
  "/api/ready",
  "/api/status",
  "/api/webhooks",
  "/api/trpc",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
];

/**
 * Marketing route prefixes (disallowed on scoped product deployment targets).
 */
export const MARKETING_ROUTE_PREFIXES: readonly string[] = [
  "/pricing",
  "/about",
  "/careers",
  "/blog",
  "/contact",
  "/terms",
  "/privacy",
  "/enterprise",
  "/products",
  "/press",
  "/docs",
  "/company",
];

/**
 * Dev, test, and fixture routes (disallowed on production deployment targets).
 */
export const DEV_FIXTURE_ROUTE_PREFIXES: readonly string[] = [
  "/dev",
  "/test",
  "/tests",
  "/fixtures",
  "/debug",
  "/approvals",
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesAnyPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

/**
 * Checks whether a route pathname belongs to Chat.
 */
export function isChatOwnedRoute(pathname: string): boolean {
  return matchesAnyPrefix(pathname, CHAT_ROUTE_PREFIXES);
}

/**
 * Checks whether a route pathname belongs to Platform.
 */
export function isPlatformOwnedRoute(pathname: string): boolean {
  return matchesAnyPrefix(pathname, PLATFORM_ROUTE_PREFIXES);
}

/**
 * Checks whether a route pathname is shared infrastructure.
 */
export function isSharedInfrastructureRoute(pathname: string): boolean {
  if (matchesAnyPrefix(pathname, SHARED_INFRASTRUCTURE_PREFIXES)) return true;
  // Static assets with file extensions (e.g. .png, .svg, .ico, .css, .js)
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return true;
  return false;
}

/**
 * Checks whether a route pathname is a dev/test fixture.
 */
export function isDevFixtureRoute(pathname: string): boolean {
  return matchesAnyPrefix(pathname, DEV_FIXTURE_ROUTE_PREFIXES);
}

/**
 * Checks whether a route pathname is a marketing route.
 */
export function isMarketingRoute(pathname: string): boolean {
  if (["/faros", "/labs", "/models", "/download"].includes(pathname)) return true;
  return matchesAnyPrefix(pathname, MARKETING_ROUTE_PREFIXES);
}

/**
 * Evaluates whether a given route is permitted under the active deployment target.
 *
 * FAIL-CLOSED:
 * - If target is unset: all valid application routes are allowed (monolith dev/preview mode).
 * - If target is "chat":
 *   - Chat-owned routes -> ALLOWED
 *   - Root "/" -> ALLOWED (serves Chat)
 *   - Shared infrastructure -> ALLOWED
 *   - Platform routes -> DENIED (404)
 *   - Dev/fixture routes -> DENIED (404)
 *   - Marketing routes -> DENIED (404)
 *   - Any unclassified route -> DENIED (404)
 * - If target is "platform":
 *   - Platform-owned routes -> ALLOWED
 *   - Root "/" -> REDIRECT to /console (307)
 *   - Shared infrastructure -> ALLOWED
 *   - Chat routes -> DENIED (404)
 *   - Dev/fixture routes -> DENIED (404)
 *   - Marketing routes -> DENIED (404)
 *   - Any unclassified route -> DENIED (404)
 */
export function evaluateDeploymentTargetRoute(
  pathname: string,
  targetOverride?: DeploymentTarget | null,
): RouteDecision {
  const target = targetOverride ?? resolveDeploymentTarget();

  // If no deployment target is active, monolith fallback allows all routes.
  if (!target) {
    return { allowed: true };
  }

  // 1. Shared infrastructure is always allowed.
  if (isSharedInfrastructureRoute(pathname)) {
    return { allowed: true, target };
  }

  // 2. Dev and fixture routes are strictly blocked in production targets.
  if (isDevFixtureRoute(pathname)) {
    return {
      allowed: false,
      status: 404,
      code: "TARGET_DEV_ROUTE_DENIED",
      reason: `Route '${pathname}' is a dev/test route and is blocked in '${target}' deployment target`,
      target,
    };
  }

  // 3. Marketing routes are absent from product targets.
  if (isMarketingRoute(pathname)) {
    return {
      allowed: false,
      status: 404,
      code: "TARGET_MARKETING_ROUTE_DENIED",
      reason: `Marketing route '${pathname}' is blocked in '${target}' deployment target`,
      target,
    };
  }

  // 4. Root pathname ("/") handling.
  if (pathname === "/") {
    if (target === "chat") {
      return { allowed: true, target };
    }
    if (target === "platform") {
      return {
        allowed: false,
        status: 307,
        redirectUrl: "/console",
        code: "TARGET_PLATFORM_ROOT_REDIRECT",
        reason: "Platform target redirects '/' to '/console'",
        target,
      };
    }
  }

  // 5. Chat target evaluation
  if (target === "chat") {
    if (isChatOwnedRoute(pathname)) {
      return { allowed: true, target };
    }
    if (isPlatformOwnedRoute(pathname)) {
      return {
        allowed: false,
        status: 404,
        code: "TARGET_FOREIGN_PRODUCT_ROUTE",
        reason: `Platform route '${pathname}' is foreign to '${target}' deployment target`,
        target,
      };
    }
    // Fail-closed for any unclassified route
    return {
      allowed: false,
      status: 404,
      code: "TARGET_UNCLASSIFIED_ROUTE_DENIED",
      reason: `Route '${pathname}' is unclassified and denied under fail-closed '${target}' target boundary`,
      target,
    };
  }

  // 6. Platform target evaluation
  if (target === "platform") {
    if (isPlatformOwnedRoute(pathname)) {
      return { allowed: true, target };
    }
    if (isChatOwnedRoute(pathname)) {
      return {
        allowed: false,
        status: 404,
        code: "TARGET_FOREIGN_PRODUCT_ROUTE",
        reason: `Chat route '${pathname}' is foreign to '${target}' deployment target`,
        target,
      };
    }
    // Fail-closed for any unclassified route
    return {
      allowed: false,
      status: 404,
      code: "TARGET_UNCLASSIFIED_ROUTE_DENIED",
      reason: `Route '${pathname}' is unclassified and denied under fail-closed '${target}' target boundary`,
      target,
    };
  }

  // Fallthrough fail-closed
  return {
    allowed: false,
    status: 404,
    code: "TARGET_BOUNDARY_FAIL_CLOSED",
    reason: `Route '${pathname}' denied by fail-closed target boundary`,
    target,
  };
}
