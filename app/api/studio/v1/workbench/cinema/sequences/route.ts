import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { WorkbenchError, createCinemaSequence } from "@ethen/studio-core/server/workbench";
import { resolveProjectScope } from "../../../_lib/supabase-data";
import { insertEditorialSequence, listEditorialSequences } from "../../../_lib/supabase-workbench";
import { isStudioFixtureLane, localStores } from "../../../_lib/local-lane";
import { fixtureInsertSequence, fixtureListSequences } from "../../../_lib/workbench-lane";

export const dynamic = "force-dynamic";

/**
 * STUDIO_14 — V1 Cinema sequence collection. Sequences organize takes by
 * reference; no creative bytes live here. Rational fps validated by the
 * kernel before insert.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      return studioSuccess({ sequences: fixtureListSequences(localStores().workbench, resolved) });
    }
    return studioSuccess({ sequences: await listEditorialSequences(resolved) });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Cinema needs the Studio data service.");
    if (setup) return setup;
    if (error instanceof WorkbenchError) return studioError("INTERNAL_ERROR", error.message);
    return studioError("INTERNAL_ERROR", "Sequence list failed.");
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = typeof body.projectId === "string" ? body.projectId : null;
    const title = typeof body.title === "string" ? body.title : null;
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!title) return studioError("VALIDATION_ERROR", "title is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const fps = (body.fps ?? {}) as Record<string, unknown>;
    const validated = createCinemaSequence({
      scope: resolved.scope,
      title,
      fps: {
        num: typeof fps.num === "number" ? fps.num : 30,
        den: typeof fps.den === "number" ? fps.den : 1,
      },
    });
    if (await isStudioFixtureLane()) {
      const created = fixtureInsertSequence(localStores().workbench, resolved, validated);
      return studioSuccess({ sequence: created }, crypto.randomUUID(), 201);
    }
    const created = await insertEditorialSequence({
      scope: resolved,
      title: validated.title,
      fpsNum: validated.fps.num,
      fpsDen: validated.fps.den,
    });
    return studioSuccess({ sequence: created }, crypto.randomUUID(), 201);
  } catch (error) {
    const setup = setupRequiredResponse(error, "Cinema needs the Studio data service.");
    if (setup) return setup;
    if (error instanceof WorkbenchError) {
      if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
      return studioError("INTERNAL_ERROR", error.message);
    }
    return studioError("INTERNAL_ERROR", "Sequence create failed.");
  }
}
