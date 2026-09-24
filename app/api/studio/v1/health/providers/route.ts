import { requireUserSession } from "@ethen/ai/platform/auth/guards";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import { checkProvidersHealth } from "../../_lib/provider-health";

export const dynamic = "force-dynamic";

/**
 * STUDIO M4 — measured provider health. Reports probes, never flags:
 * key presence, unauthenticated reachability (60s cached), registry
 * membership, catalog qualification, worker heartbeat freshness, and
 * object-store write/read. Booleans only; no secret material.
 */
export async function GET(): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const report = await checkProvidersHealth({ localLane: await isStudioLocalRequest() });
    return studioSuccess({ health: report });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Provider health needs the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Provider health failed.");
  }
}
