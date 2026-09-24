import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import { getMemoryIdentityRepository } from "../../_lib/memory-identity";
import { resolveProjectScope } from "../../_lib/supabase-data";
import {
  IdentityError,
  createVoiceBinding,
  getIdentityHead,
  listVoiceBindings,
} from "../../_lib/supabase-identity";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((entry) => typeof entry !== "string")) return null;
  return [...value];
}

/**
 * STUDIO_10 — V1 voice bindings adapter. GET lists the provider
 * bindings of one identity version (pending bindings included with
 * explicit state, never as usable); POST attaches a provider voice.
 * Binding pins provider + LoRA refs separately from consent: consent
 * is checked at use via j03, never implied by the binding row.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const params = request.nextUrl.searchParams;
    const projectId = params.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const identityId = params.get("identityId");
    if (!identityId) return studioError("VALIDATION_ERROR", "identityId is required.");
    const memory = (await isStudioLocalRequest()) ? getMemoryIdentityRepository() : null;
    const head = memory ? memory.getIdentity(resolved.scope, identityId) : await getIdentityHead(resolved, identityId);
    if (!head) return studioError("NOT_FOUND", `Identity ${identityId} was not found.`);
    const versionParam = params.get("version");
    const version = versionParam === null ? null : Number(versionParam);
    if (version !== null && (!Number.isInteger(version) || version < 1)) {
      return studioError("VALIDATION_ERROR", "version must be a positive integer.");
    }
    const bindings = memory ? memory.listBindings(identityId, version) : await listVoiceBindings(resolved, identityId, version);
    return studioSuccess({
      identityId,
      bindings: bindings.map((binding) => ({
        bindingId: binding.bindingId,
        identityVersion: binding.identityVersion,
        providerId: binding.providerId,
        providerVoiceId: binding.providerVoiceId,
        endpointId: binding.endpointId,
        adapterVersion: binding.adapterVersion,
        compatibleModelIds: [...binding.compatibleModelIds],
        loraRefs: [...binding.loraRefs],
        state: binding.revokedAt !== null ? "revoked" : binding.endpointId === null ? "pending" : "bound",
        revokedAt: binding.revokedAt,
        createdAt: binding.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof IdentityError) return studioError(error.status, error.message);
    const setup = setupRequiredResponse(error, "Voices need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Voice binding listing failed.");
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    if (!(authorization.actorId ?? session.actorId)) return studioError("UNAUTHORIZED", "actor is required.");
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const identityId = asString(body.identityId);
    if (!identityId) return studioError("VALIDATION_ERROR", "identityId is required.");
    const identityVersion = body.identityVersion;
    if (!Number.isInteger(identityVersion) || (identityVersion as number) < 1) {
      return studioError("VALIDATION_ERROR", "identityVersion must be a positive integer.");
    }
    const compatibleModelIds = body.compatibleModelIds === undefined ? [] : asStringArray(body.compatibleModelIds);
    if (compatibleModelIds === null) return studioError("VALIDATION_ERROR", "compatibleModelIds must be a string array.");
    const loraRefs = body.loraRefs === undefined ? [] : asStringArray(body.loraRefs);
    if (loraRefs === null) return studioError("VALIDATION_ERROR", "loraRefs must be a string array.");
    const binding = await createVoiceBinding({
      resolved,
      identityId,
      identityVersion: identityVersion as number,
      providerId: asString(body.providerId) ?? "",
      providerVoiceId: asString(body.providerVoiceId) ?? "",
      endpointId: body.endpointId === null || body.endpointId === undefined ? null : asString(body.endpointId),
      adapterVersion: asString(body.adapterVersion) ?? "",
      compatibleModelIds,
      loraRefs,
    });
    return studioSuccess({ bindingId: binding.bindingId, state: binding.endpointId === null ? "pending" : "bound" }, crypto.randomUUID(), 201);
  } catch (error) {
    if (error instanceof IdentityError) return studioError(error.status, error.message);
    const setup = setupRequiredResponse(error, "Voices need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Voice binding creation failed.");
  }
}
