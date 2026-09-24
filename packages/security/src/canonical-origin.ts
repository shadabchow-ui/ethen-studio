import {
  resolveProductionOrigin,
  resolveRuntimeLane,
} from "@ethen/config/env-contract";

/**
 * Origins Clerk may redirect back to after sign-in/sign-up. Production only
 * ever trusts the canonical origin. Non-production Vercel lanes additionally
 * trust the platform's own deployment origin (`VERCEL_URL`) and the current
 * branch's stable origin (`VERCEL_BRANCH_URL`) when Vercel has set them, so a
 * Preview deployment's own host is allowed without widening based on the
 * incoming request. Never derived from a request header.
 */
export function resolveClerkAllowedRedirectOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const canonical = resolveCanonicalAppOrigin(env);
  const origins = new Set<string>();
  if (canonical.origin) origins.add(canonical.origin);

  if (resolveRuntimeLane(env) !== "production") {
    for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
      const trimmed = host?.trim();
      if (!trimmed) continue;
      try {
        origins.add(new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).origin);
      } catch {
        // Malformed platform value; ignored rather than trusted.
      }
    }
  }
  return [...origins];
}

export type CanonicalOriginResolution = {
  origin: string | null;
  source: "ETHEN_PRODUCTION_ORIGIN" | "NEXT_PUBLIC_APP_URL" | "development-default" | "missing";
  productionSafe: boolean;
  reason: string;
};

function parseOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Single origin resolver for metadata, sitemap, robots, auth, and Stripe return URLs.
 * Production and preview refuse localhost and unparseable values.
 */
export function resolveCanonicalAppOrigin(
  env: Record<string, string | undefined> = process.env,
): CanonicalOriginResolution {
  const lane = resolveRuntimeLane(env);
  const explicit = parseOrigin(env.ETHEN_PRODUCTION_ORIGIN?.trim() ?? null);
  if (explicit) {
    const local = isLocalOrigin(explicit);
    if ((lane === "production" || lane === "preview") && local) {
      return {
        origin: null,
        source: "ETHEN_PRODUCTION_ORIGIN",
        productionSafe: false,
        reason: "Production/preview cannot use a localhost canonical origin.",
      };
    }
    return {
      origin: explicit,
      source: "ETHEN_PRODUCTION_ORIGIN",
      productionSafe: !local,
      reason: "Using ETHEN_PRODUCTION_ORIGIN.",
    };
  }

  const fromAppUrl = parseOrigin(resolveProductionOrigin(env));
  if (fromAppUrl && env.NEXT_PUBLIC_APP_URL?.trim()) {
    const local = isLocalOrigin(fromAppUrl);
    if ((lane === "production" || lane === "preview") && local) {
      return {
        origin: null,
        source: "NEXT_PUBLIC_APP_URL",
        productionSafe: false,
        reason: "Production/preview cannot use a localhost NEXT_PUBLIC_APP_URL.",
      };
    }
    return {
      origin: fromAppUrl,
      source: "NEXT_PUBLIC_APP_URL",
      productionSafe: !local,
      reason: "Using NEXT_PUBLIC_APP_URL.",
    };
  }

  if (lane === "development" || lane === "test") {
    return {
      origin: "http://localhost:3000",
      source: "development-default",
      productionSafe: false,
      reason: "Development default origin. Not valid for production metadata.",
    };
  }

  return {
    origin: null,
    source: "missing",
    productionSafe: false,
    reason: "Canonical origin is required in preview/production (ETHEN_PRODUCTION_ORIGIN or NEXT_PUBLIC_APP_URL).",
  };
}

/** Origin for metadataBase. Never silently emits upcube.ai or a production localhost. */
export function metadataBaseUrl(
  env: Record<string, string | undefined> = process.env,
): URL {
  const resolved = resolveCanonicalAppOrigin(env);
  if (resolved.origin) return new URL(resolved.origin);
  // Missing production origin is a startup/deploy failure (`instrumentation.ts`),
  // not a compile-time crash. `next build` sets NODE_ENV=production.
  return new URL("http://localhost:3000");
}
