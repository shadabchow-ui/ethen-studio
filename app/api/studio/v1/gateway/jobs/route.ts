import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { DEFAULT_VERSION_PINS, TASK_NAMES, type TaskName, type VersionPins } from "@ethen/studio-core/contracts";
import {
  MemoryRateLimiter,
  assertIdempotencyKeyShape,
  buildIdempotencyRecord,
  compareIdempotency,
  rateLimitHeaders,
} from "@ethen/studio-core/server/gateway";
import {
  RUNTIME_ERROR_STATUS,
  RuntimeError,
  jobStatusLabel,
} from "@ethen/studio-core/server/runtime";
import { requireKeyPrincipal, gatewayFailure } from "../../_lib/gateway-auth";
import { SupabaseGatewayStore } from "../../_lib/supabase-gateway";
import { SupabaseRuntimeRepository } from "../../_lib/supabase-runtime";

export const dynamic = "force-dynamic";

const limiter = new MemoryRateLimiter();

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asPins(value: unknown): VersionPins {
  if (!value || typeof value !== "object") return { ...DEFAULT_VERSION_PINS };
  const pins = value as Record<string, unknown>;
  return {
    taskSchemaVersion: typeof pins.taskSchemaVersion === "string" ? pins.taskSchemaVersion : DEFAULT_VERSION_PINS.taskSchemaVersion,
    endpointSchemaVersion: typeof pins.endpointSchemaVersion === "string" ? pins.endpointSchemaVersion : DEFAULT_VERSION_PINS.endpointSchemaVersion,
    priceVersion: typeof pins.priceVersion === "string" ? pins.priceVersion : DEFAULT_VERSION_PINS.priceVersion,
    adapterVersion: typeof pins.adapterVersion === "string" ? pins.adapterVersion : DEFAULT_VERSION_PINS.adapterVersion,
  };
}

function runtimeStatus(error: RuntimeError): { code: Parameters<typeof studioError>[0]; status: number } {
  const status = RUNTIME_ERROR_STATUS[error.code] ?? 500;
  if (error.code === "ADMISSION_CLOSED") return { code: "PROVIDER_UNAVAILABLE", status };
  if (error.code === "ADMISSION_CONFLICT" || error.code === "QUOTE_CONFLICT") return { code: "CONFLICT", status };
  if (error.code === "NOT_FOUND") return { code: "NOT_FOUND", status };
  if (error.code === "INVALID_INPUT") return { code: "VALIDATION_ERROR", status };
  return { code: "INTERNAL_ERROR", status };
}

/**
 * STUDIO_19 — V1 gateway job admission facade. Authenticates a scoped
 * API key, then admits through the identical kernel path the UI uses
 * (j05 `studio_v5_admit_job`: job + quota + reservation + outbox in
 * one transaction). Same key + same hash replays; changed payload
 * conflicts. No separate billing path.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const task = asString(body.task);
    if (!task || !(TASK_NAMES as readonly string[]).includes(task)) {
      return studioError("VALIDATION_ERROR", "task is unknown.");
    }
    const keyed = await requireKeyPrincipal(request, { projectId, task });
    if ("response" in keyed) return keyed.response;
    const rate = limiter.assertAllowed({ subject: `key:${keyed.principal.keyId}`, route: "admit" });
    const idempotencyKey = asString(body.idempotencyKey);
    const requestHash = asString(body.requestHash);
    const quoteId = asString(body.quoteId);
    const endpointId = asString(body.endpointId);
    if (!idempotencyKey) return studioError("VALIDATION_ERROR", "idempotencyKey is required.");
    if (!requestHash) return studioError("VALIDATION_ERROR", "requestHash is required.");
    if (!quoteId) return studioError("VALIDATION_ERROR", "quoteId is required.");
    if (!endpointId) return studioError("VALIDATION_ERROR", "endpointId is required.");
    assertIdempotencyKeyShape(idempotencyKey);
    const parameters = body.parameters && typeof body.parameters === "object"
      ? (body.parameters as Record<string, unknown>)
      : {};
    const gateway = new SupabaseGatewayStore();
    const scopeKey = `${keyed.resolved.tenantId}:${projectId}`;
    const stored = await gateway.readIdempotency(scopeKey, idempotencyKey);
    const outcome = compareIdempotency(stored, requestHash);
    if (outcome.kind === "conflict") {
      return studioError("CONFLICT", "Idempotency key was already used with a different payload.");
    }
    const repository = new SupabaseRuntimeRepository();
    let admitted;
    try {
      admitted = await repository.admit({
        scope: keyed.resolved,
        task: task as TaskName,
        actorId: keyed.principal.actorId,
        idempotencyKey,
        requestHash,
        quoteId,
        pins: asPins(body.pins),
        endpointId,
        parameters,
      });
    } catch (error) {
      if (error instanceof RuntimeError) {
        const mapped = runtimeStatus(error);
        return studioError(mapped.code, error.message);
      }
      throw error;
    }
    if (outcome.kind === "fresh") {
      await gateway.writeIdempotency(
        scopeKey,
        buildIdempotencyRecord({
          key: idempotencyKey,
          requestHash,
          statusCode: admitted.replayed ? 200 : 201,
          response: { jobId: admitted.jobId, replayed: admitted.replayed },
        }),
      );
    }
    const job = await repository.get(admitted.jobId, keyed.resolved.scope);
    if (!job) return studioError("INTERNAL_ERROR", "admitted job is not readable.");
    const response = studioSuccess(
      {
        job: {
          jobId: job.jobId,
          task: job.task,
          status: job.status,
          statusLabel: jobStatusLabel(job.status),
          idempotencyKey: job.idempotencyKey,
          quoteId: job.quoteId,
          reservationId: admitted.reservationId,
          endpointId: job.endpointId,
          replayed: admitted.replayed,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        },
      },
      undefined,
      admitted.replayed ? 200 : 201,
    );
    const headers = rateLimitHeaders(rate);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  } catch (error) {
    return gatewayFailure(error);
  }
}
