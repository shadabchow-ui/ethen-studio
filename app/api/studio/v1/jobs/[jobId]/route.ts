import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  RUNTIME_ERROR_STATUS,
  RuntimeError,
  jobProgressState,
  jobStatusLabel,
} from "@ethen/studio-core/server/runtime";
import { getFixtureLane } from "@ethen/studio-core/server/runtime/fixture-lane";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { SupabaseRuntimeRepository } from "../../_lib/supabase-runtime";
import { isStudioLocalRequest } from "@/lib/studio-local-project";

export const dynamic = "force-dynamic";

function runtimeStatus(error: RuntimeError): { code: Parameters<typeof studioError>[0]; status: number } {
  const status = RUNTIME_ERROR_STATUS[error.code] ?? 500;
  if (error.code === "NOT_FOUND") return { code: "NOT_FOUND", status };
  return { code: "INTERNAL_ERROR", status };
}

/**
 * STUDIO_05 — V1 job read adapter. Scoped job detail with attempts and the
 * measurable-only progress projection (percent only when truly measured).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { jobId } = await context.params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!jobId) return studioError("VALIDATION_ERROR", "jobId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const localLane = await isStudioLocalRequest();
    const fixtureLane = localLane && process.env.STUDIO_LOCAL_RUNTIME === "fixture";
    if (localLane && !fixtureLane) return studioError("NOT_FOUND", "Job not found in this local project.");

    const reader = fixtureLane ? getFixtureLane() : new SupabaseRuntimeRepository();
    const job = await reader.get(jobId, resolved.scope);
    if (!job) return studioError("NOT_FOUND", "Job not found in this project.");
    const attempts = await reader.listAttempts(jobId, resolved.scope);
    const progress = jobProgressState(job, null);
    return studioSuccess({
      job: {
        jobId: job.jobId,
        task: job.task,
        status: job.status,
        statusLabel: jobStatusLabel(job.status),
        quoteId: job.quoteId,
        reservationId: job.reservationId,
        endpointId: job.endpointId,
        cancelReason: job.cancelReason,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      progress: { state: progress.kind, data: progress.data },
      attempts: attempts.map((attempt) => ({
        attemptId: attempt.attemptId,
        attemptNumber: attempt.attemptNumber,
        phase: attempt.phase,
        status: attempt.status,
        submitAmbiguous: attempt.submitAmbiguous,
        lastError: attempt.lastError,
        createdAt: attempt.createdAt,
      })),
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Jobs need the Studio data service.");
    if (setup) return setup;
    if (error instanceof RuntimeError) {
      const mapped = runtimeStatus(error);
      return studioError(mapped.code, error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Job read failed.");
  }
}
