import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CollaborationError, projectJobTruth } from "@ethen/studio-core/server/collaboration";
import { resolveCollaborationContext } from "../../_lib/collaboration-auth";
import {
  getTruthJob,
  listTruthAttempts,
  listTruthJobs,
  receiptForTruthJob,
  truthChildren,
} from "../../_lib/supabase-collaboration";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureGetJobTruth, fixtureListJobTruth } from "../../_lib/collaboration-lane";
import { stageFixtureJobAssets } from "../../_lib/fixture-assets";
import { getFixtureLane } from "@ethen/studio-core/server/runtime/fixture-lane";

export const dynamic = "force-dynamic";

function asFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Collaboration needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof CollaborationError) {
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Jobs truth failed.");
}

/**
 * STUDIO_18 — V1 jobs truth. Read-only canonical projection over the
 * j05 job/attempt and j04 receipt read models: canonical stage,
 * attempts with ambiguity, reconciliation state, charges (including
 * failed children), and safe retry/cancel from the kernel policy.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    const jobId = request.nextUrl.searchParams.get("jobId");
    const auth = await resolveCollaborationContext(projectId);
    if ("response" in auth) return auth.response;
    const { resolved } = auth.context;
    if (await isStudioFixtureLane()) {
      // Same source jobs/route.ts admits into (RC-10): create → History.
      const lane = getFixtureLane();
      // P07 RD-01: History polls also materialize completed outputs into
      // Assets (same idempotent bridge the Assets list uses).
      await stageFixtureJobAssets(lane, resolved, localStores().keys);
      if (jobId) {
        const view = await fixtureGetJobTruth(lane, resolved.scope, jobId);
        if (!view) return studioError("NOT_FOUND", "Job was not found in this project.");
        return studioSuccess({ job: view });
      }
      return studioSuccess({ jobs: await fixtureListJobTruth(lane, resolved.scope, projectId ?? "", 25) });
    }
    if (jobId) {
      const job = await getTruthJob(resolved, jobId);
      if (!job) return studioError("NOT_FOUND", "Job was not found in this project.");
      const attempts = await listTruthAttempts(resolved, jobId);
      const receipt = await receiptForTruthJob(resolved, jobId);
      const children = receipt ? await truthChildren(resolved, receipt.reconcilingChildren) : null;
      const view = projectJobTruth({
        job,
        attempts,
        receipt,
        childReceipts: children?.receipts,
        childStatuses: children?.statuses,
      });
      return studioSuccess({ job: view });
    }
    const jobs = await listTruthJobs(resolved, 25);
    const views = [];
    for (const job of jobs) {
      const attempts = await listTruthAttempts(resolved, job.jobId);
      const receipt = await receiptForTruthJob(resolved, job.jobId);
      const children = receipt ? await truthChildren(resolved, receipt.reconcilingChildren) : null;
      views.push(
        projectJobTruth({
          job,
          attempts,
          receipt,
          childReceipts: children?.receipts,
          childStatuses: children?.statuses,
        }),
      );
    }
    return studioSuccess({ jobs: views });
  } catch (error) {
    return asFailure(error);
  }
}
