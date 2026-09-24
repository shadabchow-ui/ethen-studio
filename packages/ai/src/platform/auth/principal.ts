import "server-only";

import { isMockModeAllowed } from "@ethen/config/env-contract";
import { resolveTrustedActor } from "./actor";
import { isClerkConfigured, resolveClerkSupabaseMapping } from "@ethen/database/clerk-supabase";
import { createClient } from "@ethen/database/server";
import {
  rejectClientSuppliedIdentity,
  type PrincipalRequestHints,
} from "./identity-hints";

export { rejectClientSuppliedIdentity, type PrincipalRequestHints } from "./identity-hints";

export type TrustedPrincipalState =
  | "resolved"
  | "unauthenticated"
  | "mapping_unavailable"
  | "setup_required"
  | "spoof_denied";

export interface TrustedPrincipal {
  state: TrustedPrincipalState;
  clerkUserId: string | null;
  supabaseUserId: string | null;
  clerkOrgId: string | null;
  projectId: string | null;
  source: "supabase" | "clerk_mapping" | "mock" | null;
  reason: string | null;
}

export async function resolveTrustedPrincipal(
  hints: PrincipalRequestHints = {},
): Promise<TrustedPrincipal> {
  const spoof = rejectClientSuppliedIdentity(hints);
  if (spoof.denied) {
    return {
      state: "spoof_denied",
      clerkUserId: null,
      supabaseUserId: null,
      clerkOrgId: null,
      projectId: null,
      source: null,
      reason: spoof.reason,
    };
  }

  if (isMockModeAllowed()) {
    return {
      state: "resolved",
      clerkUserId: "mock-clerk-user",
      supabaseUserId: "mock-user",
      clerkOrgId: null,
      projectId: hints.bodyProjectId ?? null,
      source: "mock",
      reason: null,
    };
  }

  const production = process.env.NODE_ENV === "production";

  if (isClerkConfigured()) {
    const mapping = await resolveClerkSupabaseMapping();
    if (mapping.state === "unauthenticated") {
      return {
        state: "unauthenticated",
        clerkUserId: null,
        supabaseUserId: null,
        clerkOrgId: null,
        projectId: null,
        source: null,
        reason: mapping.reason,
      };
    }
    if (mapping.state === "setup_required") {
      return {
        state: "setup_required",
        clerkUserId: mapping.clerkUserId,
        supabaseUserId: null,
        clerkOrgId: null,
        projectId: null,
        source: null,
        reason: mapping.reason,
      };
    }

    const actor = resolveTrustedActor({
      supabaseUserId: null,
      clerkMappedSupabaseUserId: mapping.supabaseUserId,
      clerkMappingRequired: true,
      production,
    });

    if (actor.state !== "resolved" || !actor.supabaseUserId) {
      return {
        state: actor.state === "mapping_unavailable" ? "mapping_unavailable" : "unauthenticated",
        clerkUserId: mapping.clerkUserId,
        supabaseUserId: null,
        clerkOrgId: null,
        projectId: null,
        source: null,
        reason: actor.reason,
      };
    }

    return {
      state: "resolved",
      clerkUserId: mapping.clerkUserId,
      supabaseUserId: actor.supabaseUserId,
      clerkOrgId: null,
      projectId: hints.bodyProjectId ?? null,
      source: "clerk_mapping",
      reason: null,
    };
  }

  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    const supabaseUserId = error ? null : data.user?.id ?? null;
    const actor = resolveTrustedActor({
      supabaseUserId,
      clerkMappedSupabaseUserId: null,
      clerkMappingRequired: false,
      production,
    });
    if (actor.state !== "resolved" || !actor.supabaseUserId) {
      return {
        state: "unauthenticated",
        clerkUserId: null,
        supabaseUserId: null,
        clerkOrgId: null,
        projectId: null,
        source: null,
        reason: actor.reason,
      };
    }
    return {
      state: "resolved",
      clerkUserId: null,
      supabaseUserId: actor.supabaseUserId,
      clerkOrgId: null,
      projectId: hints.bodyProjectId ?? null,
      source: "supabase",
      reason: null,
    };
  } catch {
    return {
      state: "setup_required",
      clerkUserId: null,
      supabaseUserId: null,
      clerkOrgId: null,
      projectId: null,
      source: null,
      reason: "Supabase server client is unavailable in this environment.",
    };
  }
}
