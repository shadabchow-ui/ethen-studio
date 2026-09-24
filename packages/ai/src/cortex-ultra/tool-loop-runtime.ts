// ── Cortex Ultra Tool Loop Runtime ────────────────────────────────────────────
// Runtime owns: allowlist check, schema validation, policy decision,
// execution, compaction, and evidence handoff.
// MVP: read-only tools only. Write/state-changing requests are denied.
// Uses real grounded read-only tool adapter for search/retrieval.
// Repo/file tools are deferred (honest evidence reporting).

import type { CortexToolRequest, CortexToolPolicyDecision, CortexToolExecutionResult, CortexToolObservation, CortexEvidenceItem, CortexToolLoopOptions } from "./types";
import { EvidenceLedger } from "./evidence-ledger";
import { canContinueRun, createUltraRunBudget, recordToolUse } from "./cost-controller";
import {
  executeReadOnlyTool,
  type ReadOnlyToolResult,
  READ_ONLY_TOOL_CLASSES,
  WRITE_TOOL_CLASSES,
} from "./read-only-tool-adapter";

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ── Policy engine ─────────────────────────────────────────────────────────────

export function decideCortexToolPolicy(
  request: CortexToolRequest,
  options: CortexToolLoopOptions
): CortexToolPolicyDecision {
  const ts = now();

  // Unknown or missing tool name.
  if (!request.toolName || typeof request.toolName !== "string") {
    return { requestId: request.requestId, outcome: "deny", reason: "invalid_tool_name", decidedAt: ts };
  }

  // Write/state-changing class — always deny in MVP.
  if (WRITE_TOOL_CLASSES.has(request.toolClass)) {
    return { requestId: request.requestId, outcome: "deny", reason: "write_tool_not_allowed_in_mvp", decidedAt: ts };
  }

  // Allowlist check from options.
  const allowed = options.allowedToolClasses ?? [];
  if (allowed.length > 0 && !allowed.includes(request.toolClass)) {
    return { requestId: request.requestId, outcome: "deny", reason: "tool_class_not_in_allowlist", decidedAt: ts };
  }

  // Must be a known read-only class.
  if (!READ_ONLY_TOOL_CLASSES.has(request.toolClass)) {
    return { requestId: request.requestId, outcome: "requires_approval", reason: "unknown_tool_class", decidedAt: ts };
  }

  // Schema: args must be a plain object.
  if (typeof request.args !== "object" || Array.isArray(request.args) || request.args === null) {
    return { requestId: request.requestId, outcome: "deny", reason: "invalid_args_schema", decidedAt: ts };
  }

  return { requestId: request.requestId, outcome: "allow", reason: "read_only_tool_allowed", decidedAt: ts };
}

// ── Executor type ────────────────────────────────────────────────────────────

export type ToolExecutor = (request: CortexToolRequest) => Promise<unknown>;

// Real grounded executor using read-only tool adapter.
export const GROUNDED_EXECUTOR: ToolExecutor = async (req) => {
  const result: ReadOnlyToolResult = await executeReadOnlyTool(req);
  return result;
};

// ── Core execution step ───────────────────────────────────────────────────────

export async function executeCortexTool(
  request: CortexToolRequest,
  executor: ToolExecutor = GROUNDED_EXECUTOR
): Promise<CortexToolExecutionResult> {
  const start = Date.now();
  try {
    const raw = await executor(request);
    return {
      requestId: request.requestId,
      toolName: request.toolName,
      success: true,
      rawOutput: raw,
      executedAt: now(),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      requestId: request.requestId,
      toolName: request.toolName,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      executedAt: now(),
      durationMs: Date.now() - start,
    };
  }
}

// ── Compaction ────────────────────────────────────────────────────────────────
// Raw output is never returned to the model; only compact observations are.

function compactOutput(raw: unknown): { summary: string; empty: boolean } {
  if (raw === null || raw === undefined) return { summary: "(empty)", empty: true };
  const str = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (!str || str === "{}" || str === "[]") return { summary: "(empty)", empty: true };
  return {
    summary: str.length > 500 ? str.slice(0, 497) + "\u2026" : str,
    empty: false,
  };
}

export function buildObservation(
  policy: CortexToolPolicyDecision,
  result?: CortexToolExecutionResult
): CortexToolObservation {
  if (policy.outcome !== "allow" || !result) {
    return {
      requestId: policy.requestId,
      toolName: result?.toolName ?? "unknown",
      outcome: policy.outcome,
      summary: `Tool denied: ${policy.reason}`,
      empty: true,
    };
  }
  if (!result.success) {
    return {
      requestId: policy.requestId,
      toolName: result.toolName,
      outcome: "failed",
      summary: `Execution failed: ${result.error ?? "unknown error"}`,
      empty: true,
    };
  }
  const adapterResult = result.rawOutput as Partial<ReadOnlyToolResult> | undefined;
  if (adapterResult?.grounded === false) {
    return {
      requestId: policy.requestId,
      toolName: result.toolName,
      outcome: "executed",
      summary: `Preview only — setup required: ${adapterResult.summary ?? "grounded tool execution is unavailable."}`,
      empty: true,
    };
  }
  const { summary, empty } = compactOutput(result.rawOutput);
  return {
    requestId: policy.requestId,
    toolName: result.toolName,
    outcome: "executed",
    summary,
    empty,
  };
}

// ── Evidence extraction from adapter result ───────────────────────────────────

function extractEvidenceFromResult(
  request: CortexToolRequest,
  result: ReadOnlyToolResult,
  ledger: EvidenceLedger
): CortexEvidenceItem | undefined {
  // Empty results must not count as successful evidence.
  if (!result.success) return undefined;

  // Deferred tools produce honest evidence noting the limitation.
  if (result.deferred) {
    ledger.markDeferred(request.toolClass);
    const item = ledger.add({
      requestId: request.requestId,
      toolName: request.toolName,
      toolClass: request.toolClass,
      finding: result.summary,
      confidence: "low",
    });
    return item;
  }

  // Grounded tools with no actual findings → no evidence.
  if (result.summary.includes("No evidence collected") || result.summary.includes("failed")) {
    return undefined;
  }

  // Successful grounded evidence.
  ledger.addSourceUrls(result.sourceUrls);

  const sourceUrl = result.sourceUrls.length > 0 ? result.sourceUrls[0] : undefined;

  const item = ledger.add({
    requestId: request.requestId,
    toolName: request.toolName,
    toolClass: request.toolClass,
    finding: result.summary,
    sourceUrl,
    confidence: result.sourceUrls.length > 0 ? "high" : "medium",
  });
  return item;
}

// ── Loop orchestrator ─────────────────────────────────────────────────────────

export interface ToolLoopTurn {
  request: CortexToolRequest;
  policy: CortexToolPolicyDecision;
  result?: CortexToolExecutionResult;
  observation: CortexToolObservation;
  evidence?: CortexEvidenceItem;
}

export interface RunCortexToolLoopOptions extends CortexToolLoopOptions {
  /** Evidence ledger instance for this run. */
  evidenceLedger?: EvidenceLedger;
}

export async function runCortexToolLoop(
  requests: CortexToolRequest[],
  options: RunCortexToolLoopOptions = {},
  executor: ToolExecutor = GROUNDED_EXECUTOR
): Promise<ToolLoopTurn[]> {
  const maxTools = options.maxTools ?? 5;
  const turns: ToolLoopTurn[] = [];
  const ledger = options.evidenceLedger ?? new EvidenceLedger();
  const budget = options.budgetState ?? createUltraRunBudget({ maxTools, maxTokens: options.budgetTokens });

  for (const request of requests.slice(0, maxTools)) {
    if (!canContinueRun(budget)) break;

    const policy = decideCortexToolPolicy(request, options);

    if (policy.outcome !== "allow" || options.dryRun) {
      const observation = buildObservation(policy);
      turns.push({ request, policy, observation });
      continue;
    }

    const result = await executeCortexTool(request, executor);
    const observation = buildObservation(policy, result);
    recordToolUse(budget);

    let evidence: CortexEvidenceItem | undefined;
    if (result.success && !observation.empty) {
      // Try to extract structured evidence from the adapter result.
      const raw = result.rawOutput as ReadOnlyToolResult | undefined;
      if (raw && raw.toolClass !== undefined) {
        evidence = extractEvidenceFromResult(request, raw, ledger);
      }
    }

    turns.push({ request, policy, result, observation, evidence });
  }

  return turns;
}
