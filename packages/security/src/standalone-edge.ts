import {
  expectedProductionOriginForTarget,
  resolveRuntimeLane,
  type DeploymentTarget,
} from "@ethen/config/env-contract";
import { evaluateAppPerimeter, type PerimeterAppName } from "./perimeter";

export type StandaloneAppName = "chat-core" | "platform-core";

export type StandaloneRequestDecision =
  | { allowed: true; requiresAuth: boolean; allowedOrigin: string | null }
  | {
      allowed: false;
      status: 403 | 404;
      code: "DEV_ROUTE_DENIED" | "ORIGIN_MISSING" | "ORIGIN_MISMATCH" | "ORIGIN_UNCONFIGURED";
      allowedOrigin: string | null;
    };

const AUTH_ENTRY_PREFIXES = ["/sign-in", "/sign-up", "/__clerk"] as const;
const SIGNATURE_AUTHENTICATED_PATHS = [
  "/api/billing/webhook",
  "/api/connector/webhook/incoming",
] as const;

export function isStandaloneAuthEntry(pathname: string): boolean {
  return AUTH_ENTRY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isSignatureAuthenticatedPath(pathname: string): boolean {
  return SIGNATURE_AUTHENTICATED_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function requiresStandaloneAuth(
  app: StandaloneAppName,
  pathname: string,
): boolean {
  if (isStandaloneAuthEntry(pathname) || isSignatureAuthenticatedPath(pathname)) {
    return false;
  }
  if (app === "chat-core" && pathname === "/") return false;
  return true;
}

/** Only same-origin relative paths can be carried through the sign-in flow. */
export function safeStandaloneReturnPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  const trimmed = raw.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    /[\u0000-\u001f\u007f\\]/.test(trimmed)
  ) {
    return "/";
  }
  return trimmed;
}

function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveStandaloneAllowedOrigin(
  target: DeploymentTarget,
  env: Record<string, string | undefined> = process.env,
): string | null {
  // A Preview trusts only Vercel's immutable deployment host, never Host.
  if (env.VERCEL_ENV === "preview") return normalizeOrigin(env.VERCEL_URL);
  if (resolveRuntimeLane(env) === "production") {
    return expectedProductionOriginForTarget(target);
  }
  return normalizeOrigin(env.ETHEN_PRODUCTION_ORIGIN ?? env.NEXT_PUBLIC_APP_URL);
}

function isStateChanging(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

export function evaluateStandaloneRequest(input: {
  app: StandaloneAppName;
  target: DeploymentTarget;
  pathname: string;
  method: string;
  origin: string | null;
  referer: string | null;
  hasCookie: boolean;
  env?: Record<string, string | undefined>;
}): StandaloneRequestDecision {
  const env = input.env ?? process.env;
  const perimeter = evaluateAppPerimeter(
    input.pathname,
    input.app as PerimeterAppName,
    { nodeEnv: env.NODE_ENV },
  );
  const allowedOrigin = resolveStandaloneAllowedOrigin(input.target, env);
  if (!perimeter.allowed) {
    return { allowed: false, status: 404, code: "DEV_ROUTE_DENIED", allowedOrigin };
  }

  if (
    isStateChanging(input.method) &&
    input.hasCookie &&
    !isSignatureAuthenticatedPath(input.pathname)
  ) {
    const presented = normalizeOrigin(input.origin) ?? normalizeOrigin(input.referer);
    if (!allowedOrigin) {
      return { allowed: false, status: 403, code: "ORIGIN_UNCONFIGURED", allowedOrigin };
    }
    if (!presented) {
      return { allowed: false, status: 403, code: "ORIGIN_MISSING", allowedOrigin };
    }
    if (presented !== allowedOrigin) {
      return { allowed: false, status: 403, code: "ORIGIN_MISMATCH", allowedOrigin };
    }
  }

  return {
    allowed: true,
    requiresAuth: requiresStandaloneAuth(input.app, input.pathname),
    allowedOrigin,
  };
}

function configuredOrigin(
  raw: string | undefined,
  env: Record<string, string | undefined>,
): string | null {
  const origin = normalizeOrigin(raw);
  if (!origin) return null;
  if (
    resolveRuntimeLane(env) === "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(new URL(origin).hostname)
  ) {
    return null;
  }
  return origin;
}

function configuredClerkFrontendApiOrigin(key: string | undefined): string | null {
  const trimmed = key?.trim();
  if (!trimmed) return null;
  const encoded = trimmed.replace(/^pk_(?:test|live)_/, "");
  if (encoded === trimmed) return null;
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      Math.ceil(encoded.length / 4) * 4,
      "=",
    );
    let host = atob(padded);
    // Clerk appends a "$" sentinel to the Frontend API hostname before
    // base64-encoding it into the publishable key (e.g. "clerk.upcube.ai$").
    // Strip exactly one trailing sentinel so custom domains validate; the
    // strict hostname check below still rejects anything else unexpected.
    if (host.endsWith("$")) host = host.slice(0, -1);
    if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null;
    return new URL(`https://${host}`).origin;
  } catch {
    return null;
  }
}

const THEME_BOOTSTRAP_SHA256 = "'sha256-HYA7M4u2jWZamuSI7ykDHSBSnLfVtTubcOpgRzlIw24='";

export function buildStandaloneCsp(
  nonce: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const development = env.NODE_ENV === "development";
  const clerkOrigin = configuredClerkFrontendApiOrigin(
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
  const scriptSources = [
    "https://challenges.cloudflare.com",
    "https://*.protect.clerk.com",
    ...(clerkOrigin ? [clerkOrigin] : []),
  ];
  const connectSources = [
    "'self'",
    ...(development
      ? [
          "http://127.0.0.1:*",
          "http://localhost:*",
          "ws://127.0.0.1:*",
          "ws://localhost:*",
        ]
      : []),
    "https://clerk.com",
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
    "https://api.clerk.com",
    "https://*.protect.clerk.com:*",
    "https://api.stripe.com",
    "https://js.stripe.com",
    "https://checkout.stripe.com",
    "https://billing.stripe.com",
    "https://m.stripe.network",
  ];
  if (clerkOrigin) connectSources.push(clerkOrigin);
  const supabaseOrigin = configuredOrigin(env.NEXT_PUBLIC_SUPABASE_URL, env);
  if (supabaseOrigin) {
    connectSources.push(supabaseOrigin);
    connectSources.push(supabaseOrigin.replace(/^https:/, "wss:").replace(/^http:/, "ws:"));
  }
  for (const raw of [env.NEXT_PUBLIC_SENTRY_DSN, env.NEXT_PUBLIC_POSTHOG_HOST]) {
    const origin = configuredOrigin(raw, env);
    if (origin) connectSources.push(origin);
  }

  const scriptDirective = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    THEME_BOOTSTRAP_SHA256,
    "'strict-dynamic'",
    ...(development ? ["'unsafe-eval'"] : []),
    ...scriptSources,
  ].join(" ");

  const frameSources = [
    "frame-src 'self'",
    "https://js.stripe.com",
    "https://checkout.stripe.com",
    "https://hooks.stripe.com",
    "https://challenges.cloudflare.com",
    "https://*.protect.clerk.com",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
    // Clerk's custom Frontend API domain serves the Account Portal and
    // challenge iframes; without it frame-src blocks those subframes.
    ...(clerkOrigin ? [clerkOrigin] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https://img.clerk.com https://*.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "form-action 'self'",
    "media-src 'self' blob: data:",
    scriptDirective,
    `connect-src ${connectSources.join(" ")}`,
    frameSources,
    "worker-src 'self' blob:",
  ].join("; ");
}

export function standaloneSecurityHeaders(
  nonce: string,
  options: {
    pathname: string;
    production: boolean;
    protectedResponse: boolean;
    env?: Record<string, string | undefined>;
  },
): Record<string, string> {
  return {
    "Content-Security-Policy": buildStandaloneCsp(nonce, options.env),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ...(options.production
      ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
      : {}),
    ...(options.protectedResponse || options.pathname.startsWith("/api/")
      ? { "Cache-Control": "private, no-store" }
      : {}),
  };
}
