import "server-only";

export type TrustedActorState = "resolved" | "unauthenticated" | "mapping_unavailable";

export interface TrustedActor {
  state: TrustedActorState;
  /** Always the Supabase auth.users UUID; never a Clerk or body-supplied ID. */
  supabaseUserId: string | null;
  source: "supabase" | "clerk_mapping" | null;
  reason: string | null;
}

export interface TrustedActorSources {
  supabaseUserId: string | null;
  clerkMappedSupabaseUserId: string | null;
  clerkMappingRequired: boolean;
  production: boolean;
}

/**
 * Resolve the only identity allowed to reach database and RLS decisions.
 * This deliberately accepts no request body or caller-provided identity.
 */
export function resolveTrustedActor(sources: TrustedActorSources): TrustedActor {
  if (sources.supabaseUserId) {
    return {
      state: "resolved",
      supabaseUserId: sources.supabaseUserId,
      source: "supabase",
      reason: null,
    };
  }

  if (sources.clerkMappedSupabaseUserId) {
    return {
      state: "resolved",
      supabaseUserId: sources.clerkMappedSupabaseUserId,
      source: "clerk_mapping",
      reason: null,
    };
  }

  if (sources.production && sources.clerkMappingRequired) {
    return {
      state: "mapping_unavailable",
      supabaseUserId: null,
      source: null,
      reason: "Clerk identity mapping is unavailable; production access is denied.",
    };
  }

  return {
    state: "unauthenticated",
    supabaseUserId: null,
    source: null,
    reason: "Authentication required.",
  };
}
