import type {
  AgentRun,
  AgentRunStatus,
  AgentAction,
  AgentActionStatus,
  AgentEvidence,
  RunTriggerType,
  RuntimeTransitionContext,
} from "./types";
import type { ToolId, ToolRiskLevel } from "@ethen/contracts/tools/types";
import {
  runs,
  actions,
  evidenceEntries,
  runCounter,
  actionCounter,
  evidenceCounter,
  nextRunId,
  nextActionId,
  nextEvidenceId,
  nowIso,
  createRun as createRunCore,
  getRun,
  getRunByIdempotencyKey,
  setRunStatus as setRunStatusCore,
  setRunOutput as setRunOutputCore,
  cancelRun,
  failRun,
  getRunsForAgent,
  getActiveRuns,
  getRunCount,
  getRootRuns,
  getChildRuns,
  getBackgroundAgentsDashboard,
  getRunTransitionLog,
  createAction as createActionCore,
  getAction,
  setActionStatus as setActionStatusCore,
  setActionOutput as setActionOutputCore,
  getActionsForRun,
  getPendingActionsForRun,
  recordEvidence as recordEvidenceCore,
  getEvidenceForRun,
  getEvidenceForAction,
  resetRuntimeStore as resetRuntimeStoreCore,
  buildRunAuditEntry,
  type CreateRunInput,
  type CreateActionInput,
  type CreateEvidenceInput,
} from "./run-store-core";

// ── Client-safe in-memory store operations ───────────────────────────────
// Persistence is handled by lib/agents/runtime/server.ts (server-only).
// Client components must not import server-only modules.

export function createRun(input: CreateRunInput): AgentRun {
  return createRunCore(input);
}

export function setRunStatus(
  id: string,
  status: AgentRunStatus,
  context?: RuntimeTransitionContext | null,
): AgentRun | null {
  return setRunStatusCore(id, status, context);
}

export function setRunOutput(id: string, output: Record<string, unknown>): AgentRun | null {
  return setRunOutputCore(id, output);
}

export function createAction(input: CreateActionInput): AgentAction {
  return createActionCore(input);
}

export function setActionStatus(id: string, status: AgentActionStatus): AgentAction | null {
  return setActionStatusCore(id, status);
}

export function setActionOutput(id: string, output: Record<string, unknown>): AgentAction | null {
  return setActionOutputCore(id, output);
}

export function recordEvidence(input: CreateEvidenceInput): AgentEvidence {
  return recordEvidenceCore(input);
}

export function resetRuntimeStore(): void {
  resetRuntimeStoreCore();
}

// ── Re-exports of read-only functions from core ──────────────────────────

export {
  getRun,
  getRunByIdempotencyKey,
  getRunsForAgent,
  getActiveRuns,
  getRunCount,
  getRunTransitionLog,
  getRootRuns,
  getChildRuns,
  getBackgroundAgentsDashboard,
  getAction,
  getActionsForRun,
  getPendingActionsForRun,
  getEvidenceForRun,
  getEvidenceForAction,
  buildRunAuditEntry,
  cancelRun,
  failRun,
  runs,
  actions,
  evidenceEntries,
  runCounter,
  actionCounter,
  evidenceCounter,
  nextRunId,
  nextActionId,
  nextEvidenceId,
  nowIso,
  type CreateRunInput,
  type CreateActionInput,
  type CreateEvidenceInput,
};
