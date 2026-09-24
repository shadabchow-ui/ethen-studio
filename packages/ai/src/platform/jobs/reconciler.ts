import type { DurableJobService, JobAccessScope, JobRecord } from "./index";

/**
 * P09 — deterministic reconciliation sweeper.
 *
 * Canonical recovery control loop over project-scoped reconciliation
 * candidates. Deterministic: the same store state always produces the same
 * outcome. Idempotent: re-running a sweep duplicates no effects (terminal
 * states leave the candidate set; escalated jobs are skipped until an
 * operator acts).
 *
 * Per candidate:
 * - load canonical identity + provider operation marker;
 * - verify tenant/project binding (candidates are already project-scoped;
 *   reconciliation itself re-checks the project);
 * - query provider / authoritative downstream state by the stable operation
 *   key;
 * - resolve: succeeded → completed; failed → failed (or dead_letter per
 *   policy); unknown → escalate; no dispatch marker → escalate; timed_out →
 *   escalate (requires external verification).
 *
 * Never re-dispatches because status is uncertain. Expired claimed/running
 * jobs (crash candidates whose lease lapsed but which were not reclaimed)
 * are left for the claim/reclaim path — the sweeper inspects, never seizes.
 */

export type ExternalOperationState = "succeeded" | "failed" | "unknown";

export interface ReconciliationSweepDeps {
  service: Pick<
    DurableJobService,
    | "findReconciliationCandidates"
    | "reconcileDispatchedJob"
    | "escalateForOperatorReview"
    | "appendJobEvent"
  >;
  /** Authoritative downstream state by stable provider operation key. */
  queryProviderState: (
    operationKey: string,
    job: JobRecord,
  ) => Promise<ExternalOperationState>;
  /** Identity recorded on reconciliation/escalation lifecycle events. */
  workerId: string;
  /** Resolve policy failures to dead_letter instead of failed. */
  deadLetterPolicyFailures?: boolean;
  limit?: number;
}

export interface ReconciliationSweepResult {
  candidates: number;
  completed: number;
  failed: number;
  deadLettered: number;
  escalated: number;
  skipped: number;
  errors: readonly string[];
}

function sweepError(jobId: string, message: string): string {
  return `${jobId}: ${message}`;
}

export async function sweepReconciliationCandidates(
  deps: ReconciliationSweepDeps,
  scope: JobAccessScope,
): Promise<ReconciliationSweepResult> {
  const result: {
    candidates: number;
    completed: number;
    failed: number;
    deadLettered: number;
    escalated: number;
    skipped: number;
    errors: string[];
  } = {
    candidates: 0,
    completed: 0,
    failed: 0,
    deadLettered: 0,
    escalated: 0,
    skipped: 0,
    errors: [],
  };

  const candidates = await deps.service.findReconciliationCandidates(
    scope,
    deps.limit,
  );
  result.candidates = candidates.length;

  for (const job of candidates) {
    try {
      // Project binding is enforced by the scoped candidate query AND by
      // the reconcile/escalate calls below (defense in depth).
      if (job.projectId !== scope.projectId) {
        result.skipped += 1;
        continue;
      }
      // Already surfaced to an operator: the sweeper must not auto-resolve.
      if (job.escalatedAt !== null) {
        result.skipped += 1;
        continue;
      }
      // Crash candidates: lease expired but not yet reclaimed. The
      // claim/reclaim path owns recovery; the sweeper only inspects.
      if (
        (job.status === "claimed" || job.status === "running") &&
        job.providerDispatchStartedAt === null
      ) {
        result.skipped += 1;
        continue;
      }
      if (job.status === "timed_out") {
        await escalate(
          deps,
          scope,
          job,
          "timed_out requires external verification before any resolution",
        );
        result.escalated += 1;
        continue;
      }
      if (job.status !== "indeterminate") {
        result.skipped += 1;
        continue;
      }
      if (!job.providerOperationKey) {
        await escalate(
          deps,
          scope,
          job,
          "indeterminate without a stable provider operation marker cannot be verified",
        );
        result.escalated += 1;
        continue;
      }
      const state = await deps.queryProviderState(job.providerOperationKey, job);
      if (state === "succeeded") {
        const ok = await deps.service.reconcileDispatchedJob(
          job.id,
          deps.workerId,
          { status: "completed", projectId: scope.projectId },
        );
        if (ok) {
          await deps.service.appendJobEvent(job.id, deps.workerId, "reconciled", {
            resolved: "completed",
            operationKey: job.providerOperationKey,
          });
          result.completed += 1;
        } else {
          result.errors.push(sweepError(job.id, "reconcile to completed refused"));
        }
      } else if (state === "failed") {
        const target = deps.deadLetterPolicyFailures ? "dead_letter" : "failed";
        const ok = await deps.service.reconcileDispatchedJob(
          job.id,
          deps.workerId,
          {
            status: target,
            projectId: scope.projectId,
            error: {
              code: "RECONCILED_PROVIDER_FAILURE",
              message: `provider reports failure for operation ${job.providerOperationKey}`,
              retryable: false,
              occurredAt: new Date().toISOString(),
              details: {},
            },
          },
        );
        if (ok) {
          await deps.service.appendJobEvent(job.id, deps.workerId, "reconciled", {
            resolved: target,
            operationKey: job.providerOperationKey,
          });
          if (target === "dead_letter") result.deadLettered += 1;
          else result.failed += 1;
        } else {
          result.errors.push(sweepError(job.id, `reconcile to ${target} refused`));
        }
      } else {
        await escalate(
          deps,
          scope,
          job,
          `provider state unknown for operation ${job.providerOperationKey}; automatic resolution stopped`,
        );
        result.escalated += 1;
      }
    } catch (error) {
      result.errors.push(
        sweepError(job.id, error instanceof Error ? error.message : "unknown sweep error"),
      );
    }
  }

  return result;
}

async function escalate(
  deps: ReconciliationSweepDeps,
  scope: JobAccessScope,
  job: JobRecord,
  reason: string,
): Promise<void> {
  const ok = await deps.service.escalateForOperatorReview(
    scope,
    job.id,
    reason,
  );
  if (ok) {
    await deps.service.appendJobEvent(job.id, deps.workerId, "escalated", {
      reason,
    });
  }
}
