import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CompositeError } from "@ethen/studio-core/server/composites";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { listTemplates } from "../../_lib/supabase-composites";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureListTemplates } from "../../_lib/composites-lane";

export const dynamic = "force-dynamic";

function asCompositeFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Campaigns need the Studio data service.");
  if (setup) return setup;
  if (error instanceof CompositeError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
    if (error.code === "CONSENT_REQUIRED") return studioError("CONSENT_REQUIRED", error.message);
    if (error.code === "POLICY_DENIED") return studioError("MODERATION_BLOCKED", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Composites request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_15 — V1 composition template collection. Templates are immutable
 * and versioned; this route lists them (optionally filtered by kind).
 * projectId is required so template reads stay project-scoped.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const projectId = asString(request.nextUrl.searchParams.get("projectId"));
    const kind = asString(request.nextUrl.searchParams.get("kind"));
    if (kind && kind !== "marketing" && kind !== "influencer") {
      return studioError("VALIDATION_ERROR", "kind must be marketing or influencer.");
    }
    // S4C public templates: release-frozen global rows (no user scoping in
    // the table) are browsable with no session when no project is given.
    // The proxy allowlists exactly this branch; project-scoped reads below
    // still require session + membership.
    if (!projectId) {
      return studioSuccess({ templates: await listTemplates(kind) });
    }
    const session = await requireUserSession();
    if (session.response) return session.response;
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      return studioSuccess({
        templates: fixtureListTemplates(localStores().composites, kind as "marketing" | "influencer" | null),
      });
    }
    return studioSuccess({ templates: await listTemplates(kind) });
  } catch (error) {
    return asCompositeFailure(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    void body;
    return studioError("VALIDATION_ERROR", "Templates are frozen by the Studio release; new versions ship with migrations.");
  } catch (error) {
    return asCompositeFailure(error);
  }
}
