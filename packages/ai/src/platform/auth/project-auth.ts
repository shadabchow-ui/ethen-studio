import "server-only";

import { isMockModeAllowed } from "@ethen/config/env-contract";
import { createClient } from "@ethen/database/server";
import { createServiceClient } from "@ethen/database/service";
import { hasConfiguredSupabasePublicEnv } from "@ethen/config/env";
import { isClerkConfigured, resolveClerkSupabaseMapping } from "@ethen/database/clerk-supabase";
import { resolveTrustedActor } from "./actor";

export type ProjectAuthState =
  | "setup_required"
  | "unauthenticated"
  | "authorized"
  | "forbidden";

export interface ProjectAuthResult {
  state: ProjectAuthState;
  userId: string | null;
  projectId: string | null;
  reason: string | null;
}

/**
 * Resolve project-level authentication for a given projectId.
 *
 * Auth resolution order:
 * 1. Mock mode → returns authorized with mock user.
 * 2. Clerk-configured → requires a durable Clerk-to-Supabase mapping.
 * 3. Supabase SSR cookies → resolves the canonical auth.users identity.
 * 4. If neither path yields an authenticated user, returns setup_required or
 *    unauthenticated.
 *
 * Production/hardened-mode: if Supabase is not configured, returns setup_required.
 * If the user is not authenticated by any path, returns unauthenticated.
 * If project access is denied, returns forbidden.
 *
 * Clerk cannot itself authorize database access. In production, a configured
 * Clerk front end without a durable mapping fails closed.
 */
export async function resolveProjectAuth(
  projectId: string,
): Promise<ProjectAuthResult> {
  if (isMockModeAllowed()) {
    return {
      state: "authorized",
      userId: "mock-user",
      projectId,
      reason: "Mock mode enabled — project authorization bypassed for testing.",
    };
  }

  // Fail closed before any DB query: projects.id is a UUID column. A
  // synthetic/non-UUID projectId (e.g. an actor id like "dev-auth-bypass")
  // can never name a real project and must not reach Postgres as a predicate
  // (would surface as a UUID cast error). Mirrors the invariant in
  // lib/coding/runtime/repository.ts and lib/platform/jobs/supabase-repository.ts.
  const PROJECT_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!PROJECT_UUID_RE.test(projectId)) {
    return {
      state: "forbidden",
      userId: null,
      projectId,
      reason: `Project "${projectId}" not found or not accessible.`,
    };
  }

  if (!hasConfiguredSupabasePublicEnv()) {
    return {
      state: "setup_required",
      userId: null,
      projectId,
      reason:
        "Supabase environment variables are not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to enable project auth.",
    };
  }

  let resolvedUserId: string | null = null;
  const production = process.env.NODE_ENV === "production";

  if (isClerkConfigured()) {
    const clerkMapping = await resolveClerkSupabaseMapping();
    if (clerkMapping.state === "unauthenticated") {
      return {
        state: "unauthenticated",
        userId: null,
        projectId,
        reason: clerkMapping.reason,
      };
    }
    const actor = resolveTrustedActor({
      supabaseUserId: null,
      clerkMappedSupabaseUserId: clerkMapping.supabaseUserId,
      clerkMappingRequired: true,
      production,
    });
    if (actor.state === "mapping_unavailable") {
      return {
        state: "setup_required",
        userId: null,
        projectId,
        reason: actor.reason,
      };
    }
    resolvedUserId = actor.supabaseUserId;
  }

  // If Clerk mapping did not produce a usable Supabase user ID, fall through
  // to the existing Supabase SSR cookie auth path.
  if (!resolvedUserId) {
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return {
        state: "setup_required",
        userId: null,
        projectId,
        reason: "Supabase server client is unavailable in this environment.",
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        state: "unauthenticated",
        userId: null,
        projectId,
        reason:
          "Authentication required. Sign in to access project-scoped resources.",
      };
    }

    const actor = resolveTrustedActor({
      supabaseUserId: user.id,
      clerkMappedSupabaseUserId: null,
      clerkMappingRequired: false,
      production,
    });
    resolvedUserId = actor.supabaseUserId;
  }

  const service = createServiceClient({
    reason: "project_membership_lookup",
    actorId: resolvedUserId,
    tables: ["projects", "project_members"],
  });
  if (!service) {
    return {
      state: "setup_required",
      userId: resolvedUserId,
      projectId,
      reason:
        "SUPABASE_SERVICE_ROLE_KEY is required to verify project membership. Set it in .env.local.",
    };
  }

  const { data: project, error } = await service
    .from("projects")
    .select("id, owner_user_id")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    return {
      state: "forbidden",
      userId: resolvedUserId,
      projectId,
      reason: `Project "${projectId}" not found or not accessible.`,
    };
  }

  const isOwner = project.owner_user_id === resolvedUserId;
  let isMember = false;

  if (!isOwner) {
    const { data: membership } = await service
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", resolvedUserId)
      .maybeSingle();
    isMember = Boolean(membership);
  }

  if (!isOwner && !isMember) {
    return {
      state: "forbidden",
      userId: resolvedUserId,
      projectId,
      reason:
        "You do not have access to this project. Project access is restricted to owners and members.",
    };
  }

  return {
    state: "authorized",
    userId: resolvedUserId,
    projectId,
    reason: null,
  };
}

/**
 * Resolve the canonical default project for an authenticated actor.
 *
 * A durable job (durable_jobs.project_id) and an agent session
 * (agent_sessions.project_id) both require a real UUID that references
 * public.projects(id). The actor's own auth id — whether it is a Supabase
 * auth.users UUID, a Clerk id, or the "dev-auth-bypass" synthetic id — is
 * NEVER a project id and must never be written into either column.
 *
 * Resolution order:
 *   1. The oldest project the actor owns (projects.owner_user_id = actorId).
 *   2. The oldest project the actor is a member of (project_members.user_id).
 *
 * Returns the project UUID, or null when no project can be resolved (callers
 * must then surface a typed PROJECT_REQUIRED rather than substituting a
 * non-project identifier).
 */
export async function resolveDefaultProjectIdForActor(
  actorId: string,
): Promise<string | null> {
  if (!actorId) return null;
  // Fail closed before any DB query: projects.owner_user_id and
  // project_members.user_id are UUID columns. A synthetic actor id such as
  // "dev-auth-bypass" can never own or belong to a real project. Short-circuit
  // here rather than letting Postgres raise "invalid input syntax for type uuid"
  // and relying on the catch block.
  const ACTOR_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!ACTOR_UUID_RE.test(actorId)) return null;
  const service = createServiceClient({
    reason: "default_project_resolution",
    actorId,
    tables: ["projects", "project_members"],
  });
  if (!service) return null;

  try {
    const { data: owned, error: ownedError } = await service
      .from("projects")
      .select("id")
      .eq("owner_user_id", actorId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!ownedError && owned) return String(owned.id);

    const { data: membership, error: memberError } = await service
      .from("project_members")
      .select("project_id")
      .eq("user_id", actorId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!memberError && membership) return String(membership.project_id);
  } catch {
    // Database unavailable → no resolvable project; callers fail closed.
  }
  return null;
}

/**
 * Convenience: assert that the project auth result is authorized, throwing
 * a Response-compatible error object if not. Route handlers can catch this
 * and return the appropriate HTTP status.
 */
export function assertProjectAuthorized(
  result: ProjectAuthResult,
): asserts result is { state: "authorized"; userId: string; projectId: string; reason: null } {
  if (result.state !== "authorized") {
    const status =
      result.state === "unauthenticated"
        ? 401
        : result.state === "forbidden"
          ? 403
          : result.state === "setup_required"
            ? 503
            : 500;
    throw Object.assign(new Error(result.reason ?? "Access denied."), {
      status,
      state: result.state,
    });
  }
}

/**
 * Build a route-level error response from a failed ProjectAuthResult.
 */
export function projectAuthErrorResponse(result: ProjectAuthResult): {
  status: number;
  body: Record<string, unknown>;
} {
  const status =
    result.state === "unauthenticated"
      ? 401
      : result.state === "forbidden"
        ? 403
        : result.state === "setup_required"
          ? 503
          : 500;
  return {
    status,
    body: {
      ok: false,
      error: result.reason ?? "Access denied.",
      state: result.state,
    },
  };
}
