import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import { getMemoryIdentityRepository } from "../../../_lib/memory-identity";
import { resolveProjectScope } from "../../../_lib/supabase-data";
import {
  IdentityError,
  appendIdentityVersion,
  getIdentityHead,
  listIdentityVersions,
} from "../../../_lib/supabase-identity";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * STUDIO_10 — V1 identity versions adapter. GET lists immutable
 * versions; POST appends the next version (CAS on the head pointer).
 * No update/delete surface exists: versions are append-only history.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ identityId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { identityId } = await context.params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const memory = (await isStudioLocalRequest()) ? getMemoryIdentityRepository() : null;
    const head = memory ? memory.getIdentity(resolved.scope, identityId) : await getIdentityHead(resolved, identityId);
    if (!head) return studioError("NOT_FOUND", `Identity ${identityId} was not found.`);
    const versions = memory ? memory.listVersions(resolved.scope, identityId) : await listIdentityVersions(resolved, identityId);
    return studioSuccess({
      identity: { identityId: head.identityId, name: head.name, kind: head.kind, origin: head.origin, currentVersion: head.currentVersion },
      versions: versions.map((row) => ({
        version: row.version,
        contentHash: row.contentHash,
        consentGrantId: row.consentGrantId,
        revokedAt: row.revokedAt,
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof IdentityError) return studioError(error.status, error.message);
    const setup = setupRequiredResponse(error, "Identities need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Identity version listing failed.");
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ identityId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { identityId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    if (!(authorization.actorId ?? session.actorId)) return studioError("UNAUTHORIZED", "actor is required.");
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};
    const appended = await appendIdentityVersion({
      resolved,
      identityId,
      payload,
      consentGrantId: asString(body.consentGrantId),
    });
    return studioSuccess(
      {
        identityId: appended.record.identityId,
        currentVersion: appended.record.currentVersion,
        version: { version: appended.version.version, contentHash: appended.version.contentHash },
      },
      crypto.randomUUID(),
      201,
    );
  } catch (error) {
    if (error instanceof IdentityError) return studioError(error.status, error.message);
    const setup = setupRequiredResponse(error, "Identities need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Identity version append failed.");
  }
}
