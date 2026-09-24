// server-only: This module uses Node.js APIs (fs, path) and Supabase service client.
// Only import in API routes, server components, or server-side scripts.
import type {
  AgentRun,
  AgentRunStatus,
  AgentAction,
  AgentActionStatus,
  AgentEvidence,
  RuntimeTransitionContext,
} from "./types";
import {
  createRun as createRunInMemory,
  setRunStatus as setRunStatusInMemory,
  setRunOutput as setRunOutputInMemory,
  createAction as createActionInMemory,
  setActionStatus as setActionStatusInMemory,
  setActionOutput as setActionOutputInMemory,
  recordEvidence as recordEvidenceInMemory,
  resetRuntimeStore as resetRuntimeStoreInMemory,
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
  nowIso,
  type CreateRunInput,
  type CreateActionInput,
  type CreateEvidenceInput,
} from "./run-store";

import {
  persistRun,
  persistRunStatus,
  persistRunOutput,
  persistAction,
  persistActionStatus,
  persistActionOutput,
  persistEvidence,
} from "./persist";

import {
  persistRun as persistRunLocal,
  persistRunStatus as persistRunStatusLocal,
  persistRunOutput as persistRunOutputLocal,
  persistAction as persistActionLocal,
  persistActionStatus as persistActionStatusLocal,
  persistActionOutput as persistActionOutputLocal,
  persistEvidence as persistEvidenceLocal,
} from "./storage";

export function createRun(input: CreateRunInput): AgentRun {
  const run = createRunInMemory(input);
  persistRun(run).catch(() => {});
  persistRunLocal(run);
  return run;
}

export function setRunStatus(
  id: string,
  status: AgentRunStatus,
  context?: RuntimeTransitionContext | null,
): AgentRun | null {
  const updated = setRunStatusInMemory(id, status, context);
  if (updated) {
    persistRunStatus(
      id, status, nowIso(),
      updated.startedAt ?? null,
      updated.completedAt ?? null,
    ).catch(() => {});
    persistRunStatusLocal(
      id, status, nowIso(),
      updated.startedAt ?? null,
      updated.completedAt ?? null,
    );
  }
  return updated;
}

export function setRunOutput(id: string, output: Record<string, unknown>): AgentRun | null {
  const updated = setRunOutputInMemory(id, output);
  if (updated) {
    persistRunOutput(id, output).catch(() => {});
    persistRunOutputLocal(id, output);
  }
  return updated;
}

export function createAction(input: CreateActionInput): AgentAction {
  const action = createActionInMemory(input);
  persistAction(action).catch(() => {});
  persistActionLocal(action);
  return action;
}

export function setActionStatus(id: string, status: AgentActionStatus): AgentAction | null {
  const updated = setActionStatusInMemory(id, status);
  if (updated) {
    persistActionStatus(id, status, updated.startedAt ?? null, updated.completedAt ?? null).catch(() => {});
    persistActionStatusLocal(id, status, updated.startedAt ?? null, updated.completedAt ?? null);
  }
  return updated;
}

export function setActionOutput(id: string, output: Record<string, unknown>): AgentAction | null {
  const updated = setActionOutputInMemory(id, output);
  if (updated) {
    persistActionOutput(id, output).catch(() => {});
    persistActionOutputLocal(id, output);
  }
  return updated;
}

export function recordEvidence(input: CreateEvidenceInput): AgentEvidence {
  const entry = recordEvidenceInMemory(input);
  persistEvidence(entry).catch(() => {});
  persistEvidenceLocal(entry);
  return entry;
}

export function resetRuntimeStore(): void {
  resetRuntimeStoreInMemory();
}

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
  type CreateRunInput,
  type CreateActionInput,
  type CreateEvidenceInput,
};
