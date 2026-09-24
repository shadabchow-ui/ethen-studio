import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { ENDPOINT_ID_PATTERN as SHARED_ID_PATTERN } from "@/lib/media/endpoint-registry";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { getEndpointSpec, listAttestations } from "../../_lib/supabase-catalog";

export const dynamic = "force-dynamic";

/**
 * STUDIO_06 — V1 endpoint detail adapter. Exact-id lookup only (strict
 * allowlist, no traversal); unknown ids are NOT_FOUND, never a guess.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ endpointId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { endpointId } = await params;
    const decoded = decodeURIComponent(endpointId);
    if (!SHARED_ID_PATTERN.test(decoded)) {
      return studioError("VALIDATION_ERROR", "endpointId is invalid.");
    }
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const spec = await getEndpointSpec(decoded);
    if (!spec) return studioError("NOT_FOUND", `Endpoint ${decoded} is not in the catalog.`);
    const attestations = await listAttestations([decoded]);
    return studioSuccess({ endpoint: spec, attestations });
  } catch (error) {
    const setup = setupRequiredResponse(error, "The model catalog needs the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Endpoint detail failed.");
  }
}
