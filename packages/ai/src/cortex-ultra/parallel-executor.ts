// ── Cortex Ultra Parallel Executor ───────────────────────────────────────
// Dispatches up to two workers in parallel with isolation.
// Supports degraded behaviors: one-fails, both-fail.
// Uses injectable worker executor for deterministic tests.

import type { CortexUltraWorkerResult } from "./types";
import type { UltraWorkerTaskContract } from "./ultra-types";
import { runWorker, type WorkerExecutor, type WorkerRunResult } from "./worker-runtime";

export interface ParallelExecutorResult {
  workerResults: CortexUltraWorkerResult[];
  status: "all_complete" | "partial" | "degraded" | "failed";
  errors: Array<{ workerId: string; error: string }>;
  evidenceRefs: string[];
  /** All evidence refs from both tool loop and workers (deduplicated). */
  allEvidenceRefs: string[];
}

export async function runParallelWorkers(
  contracts: UltraWorkerTaskContract[],
  executor?: WorkerExecutor
): Promise<ParallelExecutorResult> {
  const workers = contracts.slice(0, 2);

  if (workers.length === 0) {
    return { workerResults: [], status: "failed", errors: [], evidenceRefs: [], allEvidenceRefs: [] };
  }

  const promises = workers.map((c) => runWorker(c, executor));
  const results = await Promise.all(promises);

  const workerResults: CortexUltraWorkerResult[] = [];
  const allErrors: Array<{ workerId: string; error: string }> = [];
  const evidenceRefs: string[] = [];
  const allEvidenceRefs: string[] = [];
  let failedCount = 0;
  let timedOutCount = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    workerResults.push(r.workerResult);
    for (const e of r.evidenceRefs) {
      if (!evidenceRefs.includes(e)) evidenceRefs.push(e);
    }
    for (const e of r.preExistingEvidenceRefs) {
      if (!allEvidenceRefs.includes(e)) allEvidenceRefs.push(e);
    }
    for (const e of r.evidenceRefs) {
      if (!allEvidenceRefs.includes(e)) allEvidenceRefs.push(e);
    }
    for (const err of r.errors) {
      allErrors.push({ workerId: workers[i].workerId, error: err });
    }
    if (r.status === "failed") failedCount++;
    if (r.status === "timed_out") timedOutCount++;
  }

  let status: ParallelExecutorResult["status"];
  const totalFailed = failedCount + timedOutCount;

  if (totalFailed === 0) {
    const allComplete = results.every((r) => r.status === "complete");
    status = allComplete ? "all_complete" : "partial";
  } else if (totalFailed === workers.length) {
    status = "failed";
  } else {
    status = "degraded";
  }

  return { workerResults, status, errors: allErrors, evidenceRefs, allEvidenceRefs };
}
