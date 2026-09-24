import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { EconomicsError } from "@ethen/studio-core/server/economics";
import { getFixtureLane } from "@ethen/studio-core/server/runtime/fixture-lane";
import { DEFAULT_VERSION_PINS, TASK_NAMES, type TaskName, type VersionPins } from "@ethen/studio-core/contracts";
import {
  RUNTIME_ERROR_STATUS,
  RuntimeError,
  jobStatusLabel,
} from "@ethen/studio-core/server/runtime";
import { requireServiceClient, resolveProjectScope } from "../_lib/supabase-data";
import { SupabaseRuntimeRepository } from "../_lib/supabase-runtime";
import { isStudioLocalRequest } from "@/lib/studio-local-project";

/**
 * M4 credentials gate: resolves the endpoint's adapter from the catalog
 * (source of truth, one indexed read). Unknown endpoints and lookup
 * failures proceed — admission surfaces the real error downstream.
 */
async function isFalQueueEndpoint(endpointId: string): Promise<boolean> {
  try {
    const client = requireServiceClient();
    const { data } = await client.from("studio_v5_endpoints").select("adapter_name").eq("endpoint_id", endpointId).limit(1);
    const row = (data ?? [])[0] as { adapter_name?: unknown } | undefined;
    return row?.adapter_name === "fal-queue";
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

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
 * STUDIO_05 — V1 job admission adapter. Authenticates, resolves scope, and
 * admits through the atomic j05 SQL wrapper (job + quota + reservation +
 * dispatch outbox in one transaction). Same key + same hash replays the
 * same job; a changed payload conflicts.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const task = asString(body.task);
    if (!task || !(TASK_NAMES as readonly string[]).includes(task)) {
      return studioError("VALIDATION_ERROR", "task is unknown.");
    }
    const idempotencyKey = asString(body.idempotencyKey);
    const requestHash = asString(body.requestHash);
    const quoteId = asString(body.quoteId);
    const endpointId = asString(body.endpointId);
    if (!idempotencyKey) return studioError("VALIDATION_ERROR", "idempotencyKey is required.");
    if (!requestHash) return studioError("VALIDATION_ERROR", "requestHash is required.");
    if (!quoteId) return studioError("VALIDATION_ERROR", "quoteId is required.");
    if (!endpointId) return studioError("VALIDATION_ERROR", "endpointId is required.");
    const parameters = body.parameters && typeof body.parameters === "object"
      ? (body.parameters as Record<string, unknown>)
      : {};

    // Local project context is real for inspection. Without fixture
    // mode no billing/worker runtime is attached to this memory lane,
    // so never touch remote Supabase there.
    const localLane = await isStudioLocalRequest();
    const fixtureLane = localLane && process.env.STUDIO_LOCAL_RUNTIME === "fixture";
    if (localLane && !fixtureLane) {
      return studioError("PROVIDER_UNAVAILABLE", "Local Studio job execution is not configured.");
    }
    if (fixtureLane) {
      const lane = getFixtureLane();
      const admitted = await lane.admit({
        scope: resolved.scope,
        task: task as TaskName,
        actorId: authorization.actorId ?? "unknown",
        idempotencyKey,
        requestHash,
        quoteId,
        pins: asPins(body.pins),
        endpointId,
        parameters,
      });
      void lane.drainScope(resolved.scope).catch(() => null);
      return studioSuccess(
        {
          job: {
            jobId: admitted.job.jobId,
            task: admitted.job.task,
            status: admitted.job.status,
            statusLabel: jobStatusLabel(admitted.job.status),
            idempotencyKey: admitted.job.idempotencyKey,
            quoteId: admitted.job.quoteId,
            reservationId: admitted.reservationId,
            endpointId: admitted.job.endpointId,
            replayed: admitted.replayed,
            createdAt: admitted.job.createdAt,
            updatedAt: admitted.job.updatedAt,
          },
        },
        undefined,
        admitted.replayed ? 200 : 201,
      );
    }

    if (!process.env.FAL_KEY?.trim() && (await isFalQueueEndpoint(endpointId))) {
      return studioError("SETUP_REQUIRED", "FAL credentials not configured.");
    }

    const repository = new SupabaseRuntimeRepository();
    const admitted = await repository.admit({
      scope: resolved,
      task: task as TaskName,
      actorId: authorization.actorId ?? "unknown",
      idempotencyKey,
      requestHash,
      quoteId,
      pins: asPins(body.pins),
      endpointId,
      parameters,
    });
    const job = await repository.get(admitted.jobId, resolved.scope);
    if (!job) return studioError("INTERNAL_ERROR", "admitted job is not readable.");
    return studioSuccess(
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
  } catch (error) {
    const setup = setupRequiredResponse(error, "Jobs need the Studio data service.");
    if (setup) return setup;
    if (error instanceof RuntimeError) {
      const mapped = runtimeStatus(error);
      return studioError(mapped.code, error.message);
    }
    if (error instanceof EconomicsError) {
      if (error.code === "NOT_FOUND") return studioError("VALIDATION_ERROR", error.message);
      if (error.code === "INSUFFICIENT_BALANCE") return studioError("INSUFFICIENT_CREDITS", error.message);
      if (error.code === "ADMISSION_CLOSED") return studioError("PROVIDER_UNAVAILABLE", error.message);
      if (error.code === "QUOTA_EXCEEDED" || error.code === "QUOTA_CONCURRENCY") {
        return studioError("RATE_LIMITED", error.message);
      }
      return studioError("INTERNAL_ERROR", error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Admission failed.");
  }
}
