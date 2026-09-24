import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import {
  MemoryRateLimiter,
  assertIdempotencyKeyShape,
  buildIdempotencyRecord,
  compareIdempotency,
  compatPins,
  legacyTaskFor,
  toCompatAdmission,
} from "@ethen/studio-core/server/gateway";
import { RuntimeError } from "@ethen/studio-core/server/runtime";
import { requireKeyOrSession, gatewayFailure } from "../../../_lib/gateway-auth";
import { SupabaseGatewayStore } from "../../../_lib/supabase-gateway";
import { SupabaseRuntimeRepository } from "../../../_lib/supabase-runtime";

export const dynamic = "force-dynamic";

const limiter = new MemoryRateLimiter();

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_19 — legacy media-generate compatibility adapter. Accepts the
 * existing media client shape (modality/capability/prompt/params),
 * authenticates an API key or session, translates onto canonical task
 * admission, and returns the legacy response shape. Same kernel, same
 * idempotency: nothing executes twice.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const modality = asString(body.modality);
    if (!modality) return studioError("VALIDATION_ERROR", "modality is required.");
    const capability = typeof body.capability === "string" ? body.capability : null;
    const prompt = asString(body.prompt);
    if (!prompt) return studioError("VALIDATION_ERROR", "prompt is required.");
    const task = legacyTaskFor({ modality, capability });
    const authed = await requireKeyOrSession(request, { projectId, task });
    if ("response" in authed) return authed.response;
    limiter.assertAllowed({ subject: `compat:${authed.actorId}`, route: "admit" });
    const compat = toCompatAdmission({
      projectId,
      modality,
      capability,
      prompt,
      modelId: asString(body.modelId),
      imageUrl: asString(body.imageUrl),
      params: body.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : null,
      idempotencyKey: asString(body.idempotencyKey),
      quoteId: asString(body.quoteId),
      endpointId: asString(body.endpointId),
    });
    const idempotencyKey = asString(body.idempotencyKey);
    const quoteId = asString(body.quoteId);
    const endpointId = asString(body.endpointId);
    if (!idempotencyKey) return studioError("VALIDATION_ERROR", "idempotencyKey is required.");
    if (!quoteId) return studioError("VALIDATION_ERROR", "quoteId is required.");
    if (!endpointId) return studioError("VALIDATION_ERROR", "endpointId is required.");
    assertIdempotencyKeyShape(idempotencyKey);
    const gateway = new SupabaseGatewayStore();
    const scopeKey = `${authed.tenantId}:${projectId}`;
    const stored = await gateway.readIdempotency(scopeKey, idempotencyKey);
    const outcome = compareIdempotency(stored, compat.requestHash);
    if (outcome.kind === "conflict") {
      return studioError("CONFLICT", "Idempotency key was already used with a different payload.");
    }
    const repository = new SupabaseRuntimeRepository();
    let admitted;
    try {
      admitted = await repository.admit({
        scope: authed.resolved,
        task: compat.task,
        actorId: authed.actorId,
        idempotencyKey,
        requestHash: compat.requestHash,
        quoteId,
        pins: compatPins(),
        endpointId,
        parameters: compat.parameters,
      });
    } catch (error) {
      if (error instanceof RuntimeError) {
        if (error.code === "ADMISSION_CONFLICT" || error.code === "QUOTE_CONFLICT") {
          return studioError("CONFLICT", error.message);
        }
        if (error.code === "ADMISSION_CLOSED") return studioError("PROVIDER_UNAVAILABLE", error.message);
        if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
        if (error.code === "INVALID_INPUT") return studioError("VALIDATION_ERROR", error.message);
        return studioError("INTERNAL_ERROR", error.message);
      }
      throw error;
    }
    if (outcome.kind === "fresh") {
      await gateway.writeIdempotency(
        scopeKey,
        buildIdempotencyRecord({
          key: idempotencyKey,
          requestHash: compat.requestHash,
          statusCode: admitted.replayed ? 200 : 201,
          response: { jobId: admitted.jobId, task: compat.task, replayed: admitted.replayed },
        }),
      );
    }
    return studioSuccess(
      {
        ok: true,
        jobId: admitted.jobId,
        status: "QUEUED",
        task: compat.task,
        idempotencyKey,
        replayed: admitted.replayed,
      },
      undefined,
      admitted.replayed ? 200 : 201,
    );
  } catch (error) {
    return gatewayFailure(error);
  }
}
