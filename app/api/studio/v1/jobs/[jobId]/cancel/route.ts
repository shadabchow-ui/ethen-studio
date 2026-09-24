import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  RUNTIME_ERROR_STATUS,
  RuntimeError,
  jobStatusLabel,
} from "@ethen/studio-core/server/runtime";
import { requireServiceClient, resolveProjectScope } from "../../../_lib/supabase-data";
import { SupabaseRuntimeRepository } from "../../../_lib/supabase-runtime";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import { isStudioFixtureLane } from "../../../_lib/local-lane";
import { getFixtureLane } from "@ethen/studio-core/server/runtime/fixture-lane";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function runtimeStatus(error: RuntimeError): { code: Parameters<typeof studioError>[0]; status: number } {
  const status = RUNTIME_ERROR_STATUS[error.code] ?? 500;
  if (error.code === "NOT_FOUND") return { code: "NOT_FOUND", status };
  if (error.code === "INVALID_INPUT") return { code: "VALIDATION_ERROR", status };
  return { code: "INTERNAL_ERROR", status };
}

/**
 * STUDIO_05 — V1 job cancel adapter. Cooperative cancellation: unleased
 * jobs cancel immediately; leased jobs move to CANCEL_REQUESTED for the
 * worker to acknowledge. When the job reaches CANCELLED with no
 * reservation use, the unused hold is released exactly once (idempotent
 * release RPC; replay collapses).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { jobId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!jobId) return studioError("VALIDATION_ERROR", "jobId is required.");
    const reason = asString(body.reason);
    if (!reason) return studioError("VALIDATION_ERROR", "reason is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      // Same source jobs/route.ts admits into: cooperative fixture cancel.
      const job = await getFixtureLane().cancel(resolved.scope, jobId, reason);
      return studioSuccess({
        job: {
          jobId: job.jobId,
          status: job.status,
          statusLabel: jobStatusLabel(job.status),
          cancelReason: job.cancelReason,
          releasedUnusedHold: job.status === "CANCELLED",
          updatedAt: job.updatedAt,
        },
      });
    }
    if (await isStudioLocalRequest()) return studioError("NOT_FOUND", "Job not found in this local project.");

    const repository = new SupabaseRuntimeRepository();
    const job = await repository.requestCancel(jobId, resolved.scope, reason);
    let released = false;
    if (job.status === "CANCELLED") {
      const client = requireServiceClient();
      const { error } = await client.rpc("studio_v5_release_reservation", {
        p_project_id: resolved.projectId,
        p_idempotency_key: job.idempotencyKey,
        p_reason: `job-cancelled: ${reason.slice(0, 120)}`,
      });
      // Release is best-effort here: a settled reservation (usable children
      // billed) stays settled — only the unused hold is released.
      released = !error;
    }
    return studioSuccess({
      job: {
        jobId: job.jobId,
        status: job.status,
        statusLabel: jobStatusLabel(job.status),
        cancelReason: job.cancelReason,
        releasedUnusedHold: released,
        updatedAt: job.updatedAt,
      },
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Jobs need the Studio data service.");
    if (setup) return setup;
    if (error instanceof RuntimeError) {
      const mapped = runtimeStatus(error);
      return studioError(mapped.code, error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Cancel failed.");
  }
}
