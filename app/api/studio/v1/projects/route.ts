import { requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { parseStudioPagination, readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { decodeCursor, encodeCursor } from "@ethen/studio-core/server/data";
import {
  DataError,
  ensureDefaultProject,
  isSetupError,
  listActorProjects,
  resolveActorTenant,
} from "../_lib/supabase-data";
import { createStudioLocalProject, isStudioLocalRequest, listStudioLocalProjects, localProject } from "@/lib/studio-local-project";

export const dynamic = "force-dynamic";

/**
 * STUDIO_02 — V1 projects adapter. GET lists actor-visible projects;
 * POST creates the authenticated default project idempotently.
 * States: empty / forbidden / setup_required / error are explicit.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const actorId = session.actorId;
    if (!actorId) return studioError("UNAUTHORIZED", "Authenticated actor is required.");
    const page = parseStudioPagination(new URL(request.url));
    const offset = decodeCursor(page.cursor);
    if (await isStudioLocalRequest()) {
      const projects = listStudioLocalProjects();
      const items = projects.slice(offset, offset + page.limit).map(localProject);
      const next = offset + items.length;
      return studioSuccess({ state: "ready", items, nextCursor: next < projects.length ? encodeCursor(next) : null, total: projects.length });
    }
    const { items, total } = await listActorProjects(actorId, page.limit, offset);
    const next = offset + items.length;
    return studioSuccess({
      state: items.length === 0 && total === 0 ? "empty" : "ready",
      items,
      nextCursor: next < total ? encodeCursor(next) : null,
      total,
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Projects need the Studio data service.");
    if (setup) return setup;
    if (isSetupError(error)) {
      return studioError("SETUP_REQUIRED", "Projects need the Studio data service.", undefined, { dependency: "supabase" });
    }
    if (error instanceof DataError) {
      return studioError(error.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_ERROR", error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Project list failed.");
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const actorId = session.actorId;
    if (!actorId) return studioError("UNAUTHORIZED", "Authenticated actor is required.");
    const body = await readStudioJson(request);
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!idempotencyKey) return studioError("VALIDATION_ERROR", "idempotencyKey is required.");
    const name = typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim() : "Untitled project";
    if (name.length > 120) return studioError("VALIDATION_ERROR", "name exceeds 120 characters.");
    const workspaceId =
      typeof body.workspaceId === "string" && body.workspaceId.trim().length > 0
        ? body.workspaceId.trim()
        : "default";
    if (await isStudioLocalRequest()) {
      const result = createStudioLocalProject(idempotencyKey, name);
      return studioSuccess({ state: "ready", project: localProject(result.project), replayed: result.replayed }, undefined, result.replayed ? 200 : 201);
    }
    const tenantId = await resolveActorTenant(actorId);
    if (!tenantId) {
      return studioError("SETUP_REQUIRED", "No tenant membership resolves for this actor.");
    }
    const { project, replayedHint } = await ensureDefaultProject({
      ownerId: actorId,
      tenantId,
      workspaceId,
      key: idempotencyKey,
      name,
    });
    return studioSuccess({ state: "ready", project, replayed: replayedHint }, undefined, replayedHint ? 200 : 201);
  } catch (error) {
    const setup = setupRequiredResponse(error, "Projects need the Studio data service.");
    if (setup) return setup;
    if (isSetupError(error)) {
      return studioError("SETUP_REQUIRED", "Projects need the Studio data service.", undefined, { dependency: "supabase" });
    }
    if (error instanceof DataError) {
      return studioError(error.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_ERROR", error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Default project creation failed.");
  }
}
