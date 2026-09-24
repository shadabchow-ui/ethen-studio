import type {
  ComputerUseRun,
  ComputerUseRunStatus,
  ComputerUseStep,
  ComputerUseScreenshot,
  ComputerUseApproval,
  ComputerUseArtifact,
  ComputerUseObservation,
  ComputerUseReplayEvent,
  SandboxSession,
  ComputerAction,
} from "./types";
import { getComputerUseStorageAdapter } from "./storage";

import {
  createComputerUseRun as storeCreateComputerUseRun,
  getComputerUseRun as storeGetComputerUseRun,
  setComputerUseRunStatus as storeSetComputerUseRunStatus,
  listComputerUseRuns as storeListComputerUseRuns,
  addComputerUseStep as storeAddComputerUseStep,
  getComputerUseSteps as storeGetComputerUseSteps,
  addComputerUseScreenshot as storeAddComputerUseScreenshot,
  getComputerUseScreenshots as storeGetComputerUseScreenshots,
  addComputerUseApproval as storeAddComputerUseApproval,
  getComputerUseApprovals as storeGetComputerUseApprovals,
  addComputerUseArtifact as storeAddComputerUseArtifact,
  getComputerUseArtifacts as storeGetComputerUseArtifacts,
  addComputerUseObservation as storeAddComputerUseObservation,
  getComputerUseObservations as storeGetComputerUseObservations,
  addComputerUseEvent as storeAddComputerUseEvent,
  getComputerUseEvents as storeGetComputerUseEvents,
  resetComputerUseStore as storeResetComputerUseStore,
  getNowIso,
  createRun as storeCreateRun,
  getRun as storeGetRun,
  listRuns as storeListRuns,
  updateRunStatus as storeUpdateRunStatus,
  updateRunSandbox as storeUpdateRunSandbox,
  addStep as storeAddStep,
  updateStepStatus as storeUpdateStepStatus,
  getStepsForRun,
  addScreenshot as storeAddScreenshot,
  getScreenshotsForRun,
  requestApproval as storeRequestApproval,
  resolveApproval as storeResolveApproval,
  getApprovalsForRun,
  getPendingApprovals as storeGetPendingApprovals,
  addArtifact as storeAddArtifact,
  getArtifactsForRun,
  getEventsForRun,
  resetStore as storeResetStore,
  takeoverRun as storeTakeoverRun,
  returnFromTakeover as storeReturnFromTakeover,
  type CreateRunInput,
} from "./store";

function requireExplicitLegacyStore(): void {
  const adapter = getComputerUseStorageAdapter();
  if (adapter.kind !== "in_memory") {
    throw new Error(
      `Legacy synchronous Computer Use access is read-only during migration; adapter "${adapter.kind}" requires the durable async service.`
    );
  }
}

// ── Core CRUD (adapter-routed) ──────────────────────────────────────────────

export function createComputerUseRun(run: Parameters<typeof storeCreateComputerUseRun>[0]): ComputerUseRun {
  requireExplicitLegacyStore();
  return storeCreateComputerUseRun(run);
}

export function getComputerUseRun(runId: string): ComputerUseRun | null {
  requireExplicitLegacyStore();
  return storeGetComputerUseRun(runId);
}

export function setComputerUseRunStatus(runId: string, status: ComputerUseRunStatus): ComputerUseRun | null {
  requireExplicitLegacyStore();
  return storeSetComputerUseRunStatus(runId, status);
}

export function listComputerUseRuns(): ComputerUseRun[] {
  requireExplicitLegacyStore();
  return storeListComputerUseRuns();
}

export function addComputerUseStep(runId: string, step: Omit<ComputerUseStep, "id"> & { id?: string }): ComputerUseStep {
  requireExplicitLegacyStore();
  return storeAddComputerUseStep(runId, step);
}

export function getComputerUseSteps(runId: string): ComputerUseStep[] {
  requireExplicitLegacyStore();
  return storeGetComputerUseSteps(runId);
}

export function addComputerUseScreenshot(runId: string, screenshot: ComputerUseScreenshot): ComputerUseScreenshot {
  requireExplicitLegacyStore();
  return storeAddComputerUseScreenshot(runId, screenshot);
}

export function getComputerUseScreenshots(runId: string): ComputerUseScreenshot[] {
  requireExplicitLegacyStore();
  return storeGetComputerUseScreenshots(runId);
}

export function addComputerUseApproval(runId: string, approval: ComputerUseApproval): ComputerUseApproval {
  requireExplicitLegacyStore();
  return storeAddComputerUseApproval(runId, approval);
}

export function getComputerUseApprovals(runId: string): ComputerUseApproval[] {
  requireExplicitLegacyStore();
  return storeGetComputerUseApprovals(runId);
}

export function addComputerUseArtifact(runId: string, artifact: Omit<ComputerUseArtifact, "id" | "createdAt" | "runId"> & { id?: string }): ComputerUseArtifact {
  requireExplicitLegacyStore();
  return storeAddComputerUseArtifact(runId, artifact);
}

export function getComputerUseArtifacts(runId: string): ComputerUseArtifact[] {
  requireExplicitLegacyStore();
  return storeGetComputerUseArtifacts(runId);
}

export function addComputerUseObservation(runId: string, observation: ComputerUseObservation): ComputerUseObservation {
  requireExplicitLegacyStore();
  return storeAddComputerUseObservation(runId, observation);
}

export function getComputerUseObservations(runId: string): ComputerUseObservation[] {
  requireExplicitLegacyStore();
  return storeGetComputerUseObservations(runId);
}

export function addComputerUseEvent(runId: string, event: Omit<ComputerUseReplayEvent, "id"> & { id?: string }): ComputerUseReplayEvent {
  requireExplicitLegacyStore();
  return storeAddComputerUseEvent(runId, event);
}

export function getComputerUseEvents(runId: string): ComputerUseReplayEvent[] {
  requireExplicitLegacyStore();
  return storeGetComputerUseEvents(runId);
}

export function resetComputerUseStore(): void {
  // Always reset regardless of adapter kind — the in-memory store is
  // always the backing store for currently integrated code paths.
  storeResetComputerUseStore();
}

// ── Convenience API (adapter-routed) ────────────────────────────────────────

export function createRun(input: CreateRunInput): ComputerUseRun {
  requireExplicitLegacyStore();
  return storeCreateRun(input);
}

export function getRun(id: string): ComputerUseRun | null {
  requireExplicitLegacyStore();
  return storeGetRun(id);
}

export function listRuns(): ComputerUseRun[] {
  requireExplicitLegacyStore();
  return storeListRuns();
}

export function updateRunStatus(id: string, status: ComputerUseRunStatus): ComputerUseRun | null {
  requireExplicitLegacyStore();
  return storeUpdateRunStatus(id, status);
}

export function updateRunSandbox(runId: string, sandboxUpdate: Partial<SandboxSession>): ComputerUseRun | null {
  requireExplicitLegacyStore();
  return storeUpdateRunSandbox(runId, sandboxUpdate);
}

export function addStep(runId: string, action: ComputerAction, overrides?: Partial<ComputerUseStep>): ComputerUseStep | null {
  requireExplicitLegacyStore();
  return storeAddStep(runId, action, overrides);
}

export function updateStepStatus(stepId: string, status: ComputerUseStep["status"], extra?: Partial<ComputerUseStep>): ComputerUseStep | null {
  requireExplicitLegacyStore();
  return storeUpdateStepStatus(stepId, status, extra);
}

export function addScreenshot(runId: string, imageUri: string, overrides?: Partial<ComputerUseScreenshot>): ComputerUseScreenshot {
  requireExplicitLegacyStore();
  return storeAddScreenshot(runId, imageUri, overrides);
}

export function requestApproval(input: {
  runId: string;
  stepId: string;
  action: ComputerAction;
  riskLevel: "low" | "medium" | "high" | "critical";
  reason: string;
}): ComputerUseApproval | null {
  requireExplicitLegacyStore();
  return storeRequestApproval(input);
}

export function resolveApproval(approvalId: string, decision: "approved" | "denied" | "expired", resolvedBy?: string): ComputerUseApproval | null {
  requireExplicitLegacyStore();
  return storeResolveApproval(approvalId, decision, resolvedBy);
}

export function getPendingApprovals(runId: string): ComputerUseApproval[] {
  requireExplicitLegacyStore();
  return storeGetPendingApprovals(runId);
}

export function addArtifact(runId: string, artifact: Omit<ComputerUseArtifact, "id" | "createdAt" | "runId"> & { id?: string }): ComputerUseArtifact | null {
  requireExplicitLegacyStore();
  return storeAddArtifact(runId, artifact);
}

export function takeoverRun(id: string): ComputerUseRun | null {
  requireExplicitLegacyStore();
  return storeTakeoverRun(id);
}

export function returnFromTakeover(id: string): ComputerUseRun | null {
  requireExplicitLegacyStore();
  return storeReturnFromTakeover(id);
}

export function resetStore(): void {
  storeResetStore();
}

export { getNowIso, getStepsForRun, getScreenshotsForRun, getApprovalsForRun, getArtifactsForRun, getEventsForRun };
export type { CreateRunInput };
