// ── Cortex Ultra team receipt builder ─────────────────────────────────────
// Produces user-safe receipts from a CortexUltraRun.
// Never includes: raw provider keys, hidden prompts, private chain-of-thought,
// unredacted tool args, full unsafe tool outputs.

import type {
  CortexUltraRun,
  CortexUltraTeamReceipt,
  TeamReceiptRedactionTier,
  CostEstimateStatus,
} from "./ultra-types";

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sumTokens(
  run: CortexUltraRun,
  field: "inputTokens" | "outputTokens"
): number {
  let total = 0;
  for (const w of run.workers) {
    total += w[field] ?? 0;
  }
  for (const v of run.verifierResults) {
    total += v[field] ?? 0;
  }
  if (run.synthesisResult) {
    total += run.synthesisResult[field] ?? 0;
  }
  return total;
}

/** True if any worker/verifier/synthesis has a non-null estimatedCostUsd. */
function hasAnyCostData(run: CortexUltraRun): boolean {
  for (const w of run.workers) {
    if (w.estimatedCostUsd != null) return true;
  }
  for (const v of run.verifierResults) {
    if (v.estimatedCostUsd != null) return true;
  }
  if (run.synthesisResult?.estimatedCostUsd != null) return true;
  return false;
}

function sumCost(run: CortexUltraRun): number {
  let total = 0;
  for (const w of run.workers) total += w.estimatedCostUsd ?? 0;
  for (const v of run.verifierResults) total += v.estimatedCostUsd ?? 0;
  if (run.synthesisResult) total += run.synthesisResult.estimatedCostUsd ?? 0;
  return total;
}

function uniqueToolNames(run: CortexUltraRun): string[] {
  const names = new Set<string>();
  for (const w of run.workers) {
    for (const tc of w.toolCalls) names.add(tc.toolName);
  }
  return [...names].sort();
}

export function buildTeamReceipt(
  run: CortexUltraRun,
  redactionTier: TeamReceiptRedactionTier = "summary"
): CortexUltraTeamReceipt {
  const generatedAt = new Date().toISOString();
  const succeeded = run.workers.filter((w) => w.status === "complete").length;
  const totalToolCalls = run.workers.reduce((n, w) => n + w.toolCalls.length, 0);
  const evidenceCount = run.workers.reduce((n, w) => n + w.evidence.length, 0);

  const lastVerifier = run.verifierResults.find((v) => v.role === "verifier") ?? null;
  const finalVerifier =
    run.verifierResults.find((v) => v.role === "final_verifier") ?? null;

  const durationMs =
    run.completedAt
      ? new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime()
      : null;

  const hasCostData = hasAnyCostData(run);
  const costEstimateStatus: CostEstimateStatus = hasCostData ? "estimated" : "unavailable";
  const costEstimateReason: string | null = hasCostData
    ? null
    : "Exact cost data is not available from the provider response. Token counts and pricing are not tracked at this layer.";

  const workerSummaries = run.workers.map((w) => ({
    workerId: w.workerId,
    role: w.role,
    subtask:
      redactionTier === "minimal"
        ? "[redacted]"
        : w.assignedSubtask,
    status: w.status,
    providerId: redactionTier === "minimal" ? null : (w.providerId ?? null),
    modelId: redactionTier === "minimal" ? null : (w.modelId ?? null),
    estimatedCostUsd: w.estimatedCostUsd,
    outputSummary:
      redactionTier === "minimal" ? null : (w.outputSummary ?? null),
  }));

  return {
    receiptId: genId("rcpt"),
    runId: run.runId,
    requestId: run.requestId,
    generatedAt,
    redactionTier,
    workerCount: run.workers.length,
    workersSucceeded: succeeded,
    totalToolCalls,
    evidenceCount,
    finalOutput: run.synthesisResult?.output ?? null,
    verifierOutcome: lastVerifier?.outcome ?? null,
    finalVerifierOutcome: finalVerifier?.outcome ?? null,
    degraded: run.state === "DEGRADED_COMPLETE",
    aborted: run.state === "ABORTED",
    abortReason: run.stoppingRule?.detail ?? null,
    totalInputTokens: sumTokens(run, "inputTokens"),
    totalOutputTokens: sumTokens(run, "outputTokens"),
    totalEstimatedCostUsd: sumCost(run),
    costEstimateStatus,
    costEstimateReason,
    toolsUsed: uniqueToolNames(run),
    workerSummaries,
    evalResults: run.evalResults,
    stoppingRule: run.stoppingRule,
    durationMs,
  };
}

export function reconstructReceiptFromRun(run: CortexUltraRun): CortexUltraTeamReceipt {
  return buildTeamReceipt(run, "summary");
}
