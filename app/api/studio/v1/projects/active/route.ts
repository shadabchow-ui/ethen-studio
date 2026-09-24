import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest, NextResponse } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { DataError, isSetupError, listActorProjects } from "../../_lib/supabase-data";
import { isStudioLocalRequest, listStudioLocalProjects } from "@/lib/studio-local-project";
import {
  normalizeProjectId,
  resolveActiveProject,
  STUDIO_ACTIVE_PROJECT_COOKIE,
  STUDIO_ACTIVE_PROJECT_MAX_AGE,
} from "@/lib/studio-v5/active-project";

export const dynamic = "force-dynamic";

const MEMBERSHIP_READ_LIMIT = 500;

type ProjectSummary = { projectId: string; name: string };

async function listVisibleProjects(actorId: string): Promise<ProjectSummary[]> {
  if (await isStudioLocalRequest()) {
    return listStudioLocalProjects().map((project) => ({ projectId: project.id, name: project.name }));
  }
  const { items } = await listActorProjects(actorId, MEMBERSHIP_READ_LIMIT, 0);
  return items.map((item) => ({ projectId: item.projectId, name: item.name }));
}

async function withCookie(source: Response, projectId: string | null): Promise<NextResponse> {
  // Buffer the JSON envelope: re-wrapping the lazy source stream leaves the
  // response open until a client reads it.
  const response = new NextResponse(await source.text(), { status: source.status, headers: source.headers });
  if (projectId) {
    response.cookies.set(STUDIO_ACTIVE_PROJECT_COOKIE, projectId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: STUDIO_ACTIVE_PROJECT_MAX_AGE,
    });
  } else {
    response.cookies.delete(STUDIO_ACTIVE_PROJECT_COOKIE);
  }
  return response;
}

function failure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Projects need the Studio data service.");
  if (setup) return setup;
  if (isSetupError(error)) {
    return studioError("SETUP_REQUIRED", "Projects need the Studio data service.", undefined, { dependency: "supabase" });
  }
  if (error instanceof DataError) return studioError("VALIDATION_ERROR", error.message);
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Active project resolution failed.");
}

/**
 * Studio V5 M1 — canonical active project.
 * GET resolves (URL `?projectId` override → saved cookie → single-project
 * auto-select) against the actor's visible projects, persisting or clearing
 * the saved selection as the resolution requires.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    if (!session.actorId) return studioError("UNAUTHORIZED", "Authenticated actor is required.");
    const projects = await listVisibleProjects(session.actorId);
    const resolution = resolveActiveProject({
      urlProjectId: request.nextUrl.searchParams.get("projectId"),
      cookieProjectId: request.cookies.get(STUDIO_ACTIVE_PROJECT_COOKIE)?.value,
      memberships: projects.map((project) => project.projectId),
    });
    const active = projects.find((project) => project.projectId === resolution.projectId) ?? null;
    const response = studioSuccess({
      projectId: resolution.projectId,
      source: resolution.source,
      rejected: resolution.rejected,
      project: active,
      projects,
    });
    if (resolution.persist) return await withCookie(response, resolution.projectId);
    if (resolution.clear) return await withCookie(response, null);
    return response;
  } catch (error) {
    return failure(error);
  }
}

/** PUT `{ projectId }` — select a project the actor can access. */
export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = normalizeProjectId(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    return await withCookie(studioSuccess({ projectId, source: "cookie" }), projectId);
  } catch (error) {
    return failure(error);
  }
}

/** DELETE — clear the saved selection. */
export async function DELETE(): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    return await withCookie(studioSuccess({ projectId: null, source: "none" }), null);
  } catch (error) {
    return failure(error);
  }
}
