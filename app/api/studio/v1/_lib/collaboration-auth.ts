import "server-only";

/**
 * STUDIO_18 collaboration route context: session + project membership +
 * Studio role mapping. Membership authority is Platform; a missing
 * Platform membership denies even with a reviewer grant.
 */
import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextResponse } from "next/server";
import { mapPlatformRole } from "@ethen/studio-core/server/collaboration";
import type { StudioRole } from "@ethen/studio-core/server/collaboration";
import { resolveProjectScope, type ResolvedScope } from "./supabase-data";
import { platformRoleFor, reviewerGrantFor } from "./supabase-collaboration";
import { isStudioFixtureLane } from "./local-lane";

export interface CollaborationContext {
  resolved: ResolvedScope;
  actorId: string;
  role: StudioRole;
}

export async function resolveCollaborationContext(
  projectId: string | null,
): Promise<{ context: CollaborationContext } | { response: NextResponse }> {
  const session = await requireUserSession();
  if (session.response) return { response: session.response };
  if (!projectId) {
    return {
      response: NextResponse.json(
        { ok: false, error: "VALIDATION_ERROR", code: "VALIDATION_ERROR", message: "projectId is required." },
        { status: 400 },
      ),
    };
  }
  const authorization = await requireProject({ api: true, projectId });
  if (authorization.response) return { response: authorization.response };
  const actorId = authorization.actorId ?? session.actorId;
  if (!actorId) {
    return {
      response: NextResponse.json(
        { ok: false, error: "unauthenticated", code: "unauthenticated" },
        { status: 401 },
      ),
    };
  }
  const resolved = await resolveProjectScope(projectId);
  if (!resolved) {
    return {
      response: NextResponse.json(
        {
          ok: false,
          error: "SETUP_REQUIRED",
          code: "SETUP_REQUIRED",
          message: "Project has no Studio data scope yet.",
        },
        { status: 503 },
      ),
    };
  }
  // P03 fixture lane: the loopback actor owns the synthetic local project
  // (the memory store is seeded the same way). Supabase membership is
  // unreachable here, so the role is admin by lane construction.
  if (await isStudioFixtureLane()) {
    return { context: { resolved, actorId, role: "admin" } };
  }
  const platformRole = await platformRoleFor(projectId, actorId);
  if (!platformRole) {
    return {
      response: NextResponse.json(
        { ok: false, error: "forbidden", code: "forbidden", message: "Not a project member." },
        { status: 403 },
      ),
    };
  }
  const grant = await reviewerGrantFor(resolved, actorId);
  return { context: { resolved, actorId, role: mapPlatformRole(platformRole, grant) } };
}
