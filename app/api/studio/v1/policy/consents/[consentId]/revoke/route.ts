import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { POLICY_ERROR_STATUS, toRevocationEvent } from "@ethen/studio-core/server/policy";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { PolicyError, SupabaseConsentRepository } from "../../../../_lib/supabase-policy";

export const dynamic = "force-dynamic";

/**
 * STUDIO_03 — immediate consent revocation adapter. Appends a revocation
 * event (the grant row is never mutated) and returns the event for runtime
 * cancel/quarantine dispatch. Runtime binding of cancel/quarantine ports
 * arrives with STUDIO_05; until then revocation blocks new admission and
 * fresh delivery decisions immediately.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ consentId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { consentId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!consentId || !consentId.trim()) return studioError("VALIDATION_ERROR", "consentId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const actorId = authorization.actorId ?? session.actorId;
    if (!actorId) return studioError("UNAUTHORIZED", "actor is required.");
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return studioError("VALIDATION_ERROR", "reason is required.");

    const repo = new SupabaseConsentRepository();
    const revocation = await repo.appendRevocation(resolved.scope, {
      grantId: consentId,
      reason,
      actorId,
    });
    return studioSuccess({ state: "ready", event: toRevocationEvent(revocation), revocation }, undefined, 201);
  } catch (error) {
    const setup = setupRequiredResponse(error, "Policy decisions need the Studio data service.");
    if (setup) return setup;
    if (error instanceof PolicyError) {
      const status = POLICY_ERROR_STATUS[error.code] ?? 500;
      const code = status === 404 ? "NOT_FOUND" : status === 403 ? "FORBIDDEN" : status === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR";
      return studioError(code, error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Revocation failed.");
  }
}
