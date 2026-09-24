// ── Cortex Ultra Worker Runtime ──────────────────────────────────────────
// Accepts a typed worker task contract and produces a CortexUltraWorkerResult.
// Uses injectable executor for testability. No live provider calls.
// Captures complete/partial/failed/timed_out status with evidence refs.

import type {
  CortexUltraWorkerResult,
  CortexUltraWorkerClaim,
  CortexUltraClaimType,
} from "./types";
import type { UltraWorkerTaskContract } from "./ultra-types";

export type WorkerStatus = "complete" | "partial" | "failed" | "timed_out";

export type WorkerExecutorOutput = {
  outputText: string;
  claims: Array<{
    summary: string;
    type: CortexUltraClaimType;
    evidenceIds?: string[];
    canonicalKey?: string;
  }>;
  uncertainties?: string[];
  evidenceRefs?: string[];
  providerId?: string | null;
  modelId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
};

export type WorkerExecutor = (
  contract: UltraWorkerTaskContract
) => Promise<WorkerExecutorOutput>;

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_EXECUTOR: WorkerExecutor = async (contract) => {
  return {
    outputText: `Mock output for: ${contract.assignedTask}`,
    claims: [
      {
        summary: `Completed task: ${contract.assignedTask.slice(0, 80)}`,
        type: "analysis",
      },
    ],
    uncertainties: [],
  };
};

export interface WorkerRunResult {
  status: WorkerStatus;
  workerResult: CortexUltraWorkerResult;
  errors: string[];
  evidenceRefs: string[];
  /** Tool-loop evidence IDs available before worker starts. */
  preExistingEvidenceRefs: string[];
}

export async function runWorker(
  contract: UltraWorkerTaskContract,
  executor: WorkerExecutor = DEFAULT_EXECUTOR
): Promise<WorkerRunResult> {
  const errors: string[] = [];
  const preExistingEvidenceRefs = contract.evidenceRequirements ?? [];

  try {
    const timeoutPromise = new Promise<WorkerExecutorOutput>((_, reject) =>
      setTimeout(() => reject(new Error("Worker timed out")), contract.timeoutMs)
    );

    const output = await Promise.race([executor(contract), timeoutPromise]);

    const validEvidenceIds = new Set((contract.evidenceContext ?? []).map((item) => item.id));
    const claims: CortexUltraWorkerClaim[] = (output.claims ?? []).map((c) => ({
      claimId: genId("cl"),
      summary: c.summary,
      type: c.type,
      evidenceIds: validEvidenceIds.size === 0
        ? []
        : (c.evidenceIds ?? []).filter((id) => validEvidenceIds.has(id)),
      canonicalKey: c.canonicalKey,
    }));

    const evidenceRefs = output.evidenceRefs ?? [];
    const status: WorkerStatus =
      (output.uncertainties?.length ?? 0) > 0 ? "partial" : "complete";

    return {
      status,
      workerResult: {
        workerId: contract.workerId,
        summary: `${status}: ${contract.assignedTask.slice(0, 100)}`,
        outputText: output.outputText,
        claims,
        providerId: output.providerId ?? null,
        modelId: output.modelId ?? null,
        inputTokens: output.inputTokens ?? null,
        outputTokens: output.outputTokens ?? null,
        estimatedCostUsd: output.estimatedCostUsd ?? null,
      },
      errors,
      evidenceRefs,
      preExistingEvidenceRefs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("timed out");
    return {
      status: isTimeout ? "timed_out" : "failed",
      workerResult: {
        workerId: contract.workerId,
        summary: `${isTimeout ? "timed_out" : "failed"}: ${message}`,
        outputText: "",
        claims: [],
        failureReason: message,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
      },
      errors: [message],
      evidenceRefs: [],
      preExistingEvidenceRefs,
    };
  }
}
