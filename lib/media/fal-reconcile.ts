/**
 * Studio V3 Job 3 — fal-media reconciliation sweep.
 *
 * Indeterminate fal-media jobs (dispatch happened, outcome unknown) are
 * resolved against the authoritative fal queue state: COMPLETED reconciles
 * to completed, terminal provider failures to failed, anything else
 * escalates for operator review. Non-fal-media candidates are left
 * untouched for their owning lane (reported, never resolved here).
 */

import "server-only";

import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { createPlatformJobRepository } from "@ethen/ai/platform/jobs/factory";
import {
  sweepReconciliationCandidates,
  type ExternalOperationState,
  type ReconciliationSweepResult,
} from "@ethen/ai/platform/jobs/reconciler";
import type { JobRecord } from "@ethen/ai/platform/jobs/index";

import { getFalVerifiedRouteByEndpoint } from "./fal-routes";
import { pollFalMediaStatus } from "./providers/fal";

function stripFalMediaMarker(marker: string | null): string | null {
  if (!marker || !marker.startsWith("falmedia:")) return null;
  const requestId = marker.slice("falmedia:".length);
  return requestId ? requestId : null;
}

/**
 * Authoritative fal state for one candidate. Throws for non-fal-media jobs
 * so the sweeper records them as untouched (no state change, no escalation
 * from this lane).
 */
export async function queryFalMediaProviderState(
  operationKey: string,
  job: JobRecord,
  poll: typeof pollFalMediaStatus = pollFalMediaStatus,
): Promise<ExternalOperationState> {
  const payload = job.payload as Record<string, unknown>;
  if (payload["kind"] !== "fal-media" || typeof payload["endpointId"] !== "string") {
    throw new Error(`job ${job.id} is not a fal-media job; owned by its own lane.`);
  }
  const route = getFalVerifiedRouteByEndpoint(payload["endpointId"] as string);
  const requestId = stripFalMediaMarker(operationKey);
  if (!route || route.handlerKind !== "fal-media" || !requestId) {
    throw new Error(`job ${job.id} carries an unverified fal route marker; operator review required.`);
  }
  const observed = await poll(route.endpointId, requestId);
  if (observed.status === "COMPLETED") return "succeeded";
  if (observed.status === "ERROR" || observed.status === "FAILED" || observed.status === "CANCELLED") return "failed";
  return "unknown";
}

export async function sweepFalMediaReconciliation(input: {
  projectId: string;
  workerId: string;
  limit?: number;
  poll?: typeof pollFalMediaStatus;
}): Promise<ReconciliationSweepResult> {
  const service = new DurableJobService({ repository: createPlatformJobRepository() });
  return sweepReconciliationCandidates(
    {
      service,
      queryProviderState: (operationKey, job) => queryFalMediaProviderState(operationKey, job, input.poll),
      workerId: input.workerId,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    },
    { projectId: input.projectId },
  );
}
