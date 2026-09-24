import "server-only";

import { isMockModeAllowed } from "@ethen/config/env-contract";
import { createServiceClient } from "./service";
import { hasConfiguredSupabasePublicEnv } from "@ethen/config/env";

function clerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export type ClerkSupabaseMappingState =
  | "setup_required"
  | "unauthenticated"
  | "mapped"
  | "unmapped";

export interface ClerkSupabaseMappingResult {
  state: ClerkSupabaseMappingState;
  clerkUserId: string | null;
  supabaseUserId: string | null;
  reason: string | null;
}

/**
 * Resolve a Clerk-authenticated user identity to a Supabase user identity.
 *
 * Steps:
 * 1. If mock mode is enabled, return a mapped mock identity.
 * 2. If Clerk is not configured, return setup_required.
 * 3. Resolve the Clerk user ID from the server context.
 * 4. Attempt to find a matching Supabase user via:
 *    a. auth.users table lookup if the service role key is available.
 *    b. A dedicated user_mappings table if it exists.
 * 5. If no mapping exists, return unmapped so project authorization fails
 *    closed until the verified Clerk webhook provisions the mapping.
 *
 * The additive `clerk_user_mappings` migration is the only accepted bridge
 * between Clerk identity and the Supabase/RLS authority.
 */
export async function resolveClerkSupabaseMapping(): Promise<ClerkSupabaseMappingResult> {
  if (isMockModeAllowed()) {
    return {
      state: "mapped",
      clerkUserId: "mock-clerk-user",
      supabaseUserId: "mock-user",
      reason: null,
    };
  }

  if (!clerkConfigured()) {
    return {
      state: "setup_required",
      clerkUserId: null,
      supabaseUserId: null,
      reason:
        "Clerk is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in environment to enable Clerk authentication.",
    };
  }

  let clerkUserId: string | null = null;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    clerkUserId = userId ?? null;
  } catch {
    return {
      state: "unauthenticated",
      clerkUserId: null,
      supabaseUserId: null,
      reason:
        "Unable to resolve Clerk authentication context. This may occur in non-request contexts.",
    };
  }

  if (!clerkUserId) {
    return {
      state: "unauthenticated",
      clerkUserId: null,
      supabaseUserId: null,
      reason:
        "User is not authenticated. Sign in via Clerk to access project-scoped resources.",
    };
  }

  if (!hasConfiguredSupabasePublicEnv()) {
    return {
      state: "setup_required",
      clerkUserId,
      supabaseUserId: null,
      reason:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable durable project access.",
    };
  }

  const service = createServiceClient({
    reason: "clerk_user_mapping_lookup",
    actorId: clerkUserId,
    tables: ["clerk_user_mappings"],
  });
  if (!service) {
    return {
      state: "setup_required",
      clerkUserId,
      supabaseUserId: null,
      reason:
        "SUPABASE_SERVICE_ROLE_KEY is required to look up user mappings. Set it in environment.",
    };
  }

  // The additive migration owns this durable compatibility mapping. It is the
  // only accepted bridge from Clerk identity to the Supabase/RLS authority.
  try {
    const { data: mappingData, error: mappingError } = await service
      .from("clerk_user_mappings")
      .select("supabase_user_id, email")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (!mappingError && mappingData?.supabase_user_id) {
      return {
        state: "mapped",
        clerkUserId,
        supabaseUserId: mappingData.supabase_user_id,
        reason: null,
      };
    }
  } catch {
    // Database availability is represented as an unavailable mapping below.
  }

  return {
    state: "unmapped",
    clerkUserId,
    supabaseUserId: null,
    reason:
      "Clerk user is authenticated but has no durable Supabase identity mapping. " +
      "Project access is denied until the verified Clerk webhook provisions the mapping.",
  };
}

/**
 * Convenience: check if the Clerk-Supabase mapping is usable.
 * Returns true when the mapping is in a state where project auth can proceed
 * (mapped, or the caller should fall through to Supabase SSR auth).
 */
export function isMappingUsable(
  result: ClerkSupabaseMappingResult,
): result is { state: "mapped"; clerkUserId: string; supabaseUserId: string; reason: null } {
  return result.state === "mapped";
}

/**
 * Build an HTTP error response from a failed mapping result.
 */
export function mappingErrorResponse(result: ClerkSupabaseMappingResult): {
  status: number;
  body: Record<string, unknown>;
} {
  const status =
    result.state === "unauthenticated"
      ? 401
      : result.state === "setup_required"
        ? 503
        : result.state === "unmapped"
          ? 503
          : 500;
  return {
    status,
    body: {
      ok: false,
      error: result.reason ?? "Access denied.",
      state: result.state,
      clerkConfigured: clerkConfigured(),
      mappingAvailable: result.state === "mapped",
    },
  };
}

/**
 * Whether Clerk is configured in the current environment.
 */
export function isClerkConfigured(): boolean {
  return clerkConfigured();
}
