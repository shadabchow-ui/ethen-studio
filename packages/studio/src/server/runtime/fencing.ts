/** Studio V5 runtime — dispatch lease/generation fencing (STUDIO_05). Server-only. */
import "server-only";
import { RuntimeError, type RuntimeJob } from "./types";

/**
 * Fencing check. The caller presents the generation from its claim record;
 * the mutation applies only when the stored generation matches exactly.
 * A mismatch means the lease expired and was reclaimed by another worker —
 * the stale worker must stop, never overwrite.
 */
export function checkFence(job: { dispatchGeneration: number }, expectedGeneration: number): void {
  if (!Number.isInteger(expectedGeneration) || expectedGeneration < 1) {
    throw new RuntimeError("INVALID_INPUT", "expectedGeneration must be a positive integer.");
  }
  if (job.dispatchGeneration !== expectedGeneration) {
    throw new RuntimeError(
      "STALE_WORKER",
      `stale worker: expected generation ${expectedGeneration}, stored ${job.dispatchGeneration}.`,
    );
  }
}

export function checkLeaseOwner(
  job: Pick<RuntimeJob, "leaseOwner" | "leaseExpiresAt">,
  workerId: string,
  nowIso?: string,
): void {
  if (!job.leaseOwner || job.leaseOwner !== workerId) {
    throw new RuntimeError("LEASE_LOST", "worker does not own the job lease.");
  }
  const now = nowIso ?? new Date().toISOString();
  if (!job.leaseExpiresAt || job.leaseExpiresAt <= now) {
    throw new RuntimeError("LEASE_LOST", "job lease expired.");
  }
}

export function checkFencedMutation(
  job: Pick<RuntimeJob, "dispatchGeneration" | "leaseOwner" | "leaseExpiresAt">,
  workerId: string,
  expectedGeneration: number,
  nowIso?: string,
): void {
  checkFence(job, expectedGeneration);
  checkLeaseOwner(job, workerId, nowIso);
}

export function isLeaseExpired(leaseExpiresAt: string | null, nowIso: string): boolean {
  return leaseExpiresAt !== null && leaseExpiresAt <= nowIso;
}

/** Deterministic provider operation key: stable across crash retries of one attempt. */
export function operationKeyFor(jobId: string, attemptNumber: number): string {
  return `studio-v5:${jobId}:attempt-${attemptNumber}`;
}
