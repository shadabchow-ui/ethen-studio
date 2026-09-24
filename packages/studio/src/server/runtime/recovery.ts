/** Studio V5 runtime — reconciliation, late output and cancellation (STUDIO_05). Server-only. */
import "server-only";
import type { ProjectScope } from "../../contracts/scope";
import type { ProviderAdapterPort } from "../ports/provider-adapter";
import type { RuntimeRepository } from "./memory";
import { RuntimeError, type RuntimeAttempt, type RuntimeJob } from "./types";

export interface ReconcileOutcome {
  jobId: string;
  action: "requeued" | "completed" | "failed" | "cancelled" | "awaiting_provider" | "skipped";
  detail: string;
}

/**
 * Deterministic reconciliation sweep for one project. For each candidate:
 * - ambiguous submit → query the provider by persisted operation key; a
 *   proven terminal state resolves, UNKNOWN stays reconciling — NEVER an
 *   automatic resubmit;
 * - expired lease on an active job → requeue for reclaim (generation fence
 *   protects the stale worker);
 * - cancel-requested with no live lease → settle to CANCELLED.
 */
export async function sweepReconciliationCandidates(input: {
  store: RuntimeRepository;
  scope: ProjectScope;
  provider: Pick<ProviderAdapterPort, "reconcile"> | null;
  limit?: number;
}): Promise<readonly ReconcileOutcome[]> {
  const { store, scope, provider } = input;
  const candidates = await store.findReconciliationCandidates(scope.projectId as string, input.limit ?? 50);
  const outcomes: ReconcileOutcome[] = [];
  for (const job of candidates) {
    outcomes.push(await reconcileJob(store, scope, provider, job));
  }
  return outcomes;
}

async function reconcileJob(
  store: RuntimeRepository,
  scope: ProjectScope,
  provider: Pick<ProviderAdapterPort, "reconcile"> | null,
  job: RuntimeJob,
): Promise<ReconcileOutcome> {
  const attempts = await store.listAttempts(job.jobId, scope);
  const ambiguous = attempts.filter((a) => a.submitAmbiguous);
  if (ambiguous.length > 0) {
    const attempt = ambiguous[ambiguous.length - 1];
    if (!provider || !attempt.providerOperationId) {
      return { jobId: job.jobId, action: "awaiting_provider", detail: "ambiguous submit; no reconcile proof yet." };
    }
    const proven = await provider.reconcile(attempt.providerOperationId, attempt.operationKey);
    if (proven === "SUCCEEDED") {
      await store.updateAttempt(attempt.attemptId, scope, { submitAmbiguous: false, phase: "poll" });
      await store.forceTransition(job.jobId, scope, "RUNNING").catch(() => null);
      return { jobId: job.jobId, action: "requeued", detail: "ambiguous submit proven; resumed." };
    }
    if (proven === "FAILED" || proven === "CANCELED") {
      await store.updateAttempt(attempt.attemptId, scope, { submitAmbiguous: false, status: "FAILED" });
      return { jobId: job.jobId, action: "failed", detail: `ambiguous submit proven ${proven}.` };
    }
    if (job.status !== "RECONCILING") {
      await store.forceTransition(job.jobId, scope, "RECONCILING").catch(() => null);
    }
    return { jobId: job.jobId, action: "awaiting_provider", detail: "submit still unknown; not resubmitted." };
  }
  if (job.status === "CANCEL_REQUESTED" && !job.leaseOwner) {
    await store.forceTransition(job.jobId, scope, "CANCELLED").catch(() => null);
    return { jobId: job.jobId, action: "cancelled", detail: "cancel settled; no live lease." };
  }
  if (job.status === "RECONCILING") {
    await store.forceTransition(job.jobId, scope, "QUEUED").catch(() => null);
    return { jobId: job.jobId, action: "requeued", detail: "reconciling job requeued for reclaim." };
  }
  if (!job.leaseOwner || (job.leaseExpiresAt && job.leaseExpiresAt <= new Date().toISOString())) {
    if (job.status === "RUNNING" || job.status === "OUTPUT_READY" || job.status === "INGESTING" || job.status === "SETTLING") {
      await store.forceTransition(job.jobId, scope, "RECONCILING").catch(() => null);
      await store.forceTransition(job.jobId, scope, "QUEUED").catch(() => null);
      return { jobId: job.jobId, action: "requeued", detail: "expired lease requeued for reclaim." };
    }
  }
  return { jobId: job.jobId, action: "skipped", detail: `no recovery action for ${job.status}.` };
}

export interface LateOutputInput {
  jobId: string;
  attemptId: string;
  scope: ProjectScope;
  assetVersionIds: readonly string[];
  /** True when consent/rights were revoked after dispatch. */
  revoked: boolean;
}

/**
 * Late-output handoff. Outputs arriving after terminal/cancelled state — or
 * after revocation — are linked as quarantined generations, never as live
 * results. Returns the quarantine flag for the caller to record.
 */
export async function linkLateOutput(
  store: RuntimeRepository,
  input: LateOutputInput,
): Promise<{ quarantined: boolean; reason: string | null }> {
  const job = await store.get(input.jobId, input.scope);
  if (!job) throw new RuntimeError("NOT_FOUND", "job not found in this scope.");
  const terminal = job.status === "COMPLETED" || job.status === "CANCELLED" || job.status === "FAILED" || job.status === "EXPIRED";
  const quarantined = terminal || job.status === "CANCEL_REQUESTED" || input.revoked;
  const reason = input.revoked
    ? "consent revoked; output quarantined."
    : terminal || job.status === "CANCEL_REQUESTED"
      ? `late output after ${job.status}; quarantined.`
      : null;
  await store.linkGeneration({
    jobId: input.jobId,
    attemptId: input.attemptId,
    scope: input.scope,
    assetVersionIds: input.assetVersionIds,
    quarantined,
    quarantineReason: reason,
  });
  return { quarantined, reason };
}

export interface CancelOutcome {
  jobId: string;
  status: "CANCELLED" | "CANCEL_REQUESTED";
  releasedReservation: boolean;
}

/**
 * Cooperative cancellation: request → worker acknowledges → CANCELLED.
 * The caller settles confirmed usable children and releases the unused
 * hold through economics; this helper performs the runtime half.
 */
export async function requestJobCancel(
  store: RuntimeRepository,
  scope: ProjectScope,
  jobId: string,
  reason: string,
): Promise<CancelOutcome> {
  const job = await store.requestCancel(jobId, scope, reason);
  return {
    jobId,
    status: job.status === "CANCELLED" ? "CANCELLED" : "CANCEL_REQUESTED",
    releasedReservation: false,
  };
}

export type { RuntimeAttempt };
