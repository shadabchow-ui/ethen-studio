import type {
  ComputerUseRun,
  ComputerUseRunStatus,
  ComputerUseStep,
  ComputerUseScreenshot,
  ComputerUseApproval,
  ComputerUseArtifact,
  ComputerUseObservation,
  ComputerUseReplayEvent,
  ComputerAction,
  PermissionScope,
  SandboxSession,
  ComputerUseMode,
} from "./types";
import { isMockModeAllowed } from "@ethen/config/env-contract";

/**
 * Labels the backend backing the current ComputerUseStorageAdapter.
 * - `"in_memory"` — in-process, ephemeral; resets on server restart.
 * - `"localstorage"` — browser `localStorage` (client-side only).
 * - `"supabase"` — durable Supabase persistence (not yet implemented
 *   for computer-use; exists for sessions/artifacts elsewhere).
 * - `"custom"` — external, user-defined adapter.
 *
 * Only `"in_memory"` is implemented today.
 */
export type ComputerUseStorageKind = "in_memory" | "localstorage" | "supabase" | "custom";

/**
 * Job 13 CU-P0-04: screenshots are durable, Project-owned, restart-surviving.
 * Supabase adapter stores evidence as tenant-scoped objects (Project/session
 * ownership enforced via RLS/service-role scoping). In-memory adapter is
 * ephemeral and blocked in production unless ETHEN_COMPUTER_USE_EPHEMERAL_TEST.
 * Legacy inline data URIs are read-only compat; canonical evidence is object
 * storage. See storage-supabase.ts getSupabaseAdapterReadiness().
 */
export const SCREENSHOT_STORAGE_LIMITATION =
  "Durable Computer Use screenshots are tenant-scoped SOL-19 evidence objects (Project/session ownership, RLS); legacy inline data URIs are read-only compat." as const;

export interface ComputerUseRunStore {
  create(input: CreateRunStoreInput): Promise<ComputerUseRun>;
  get(id: string): Promise<ComputerUseRun | null>;
  setStatus(id: string, status: ComputerUseRunStatus): Promise<ComputerUseRun | null>;
  update(id: string, data: Partial<ComputerUseRun>): Promise<ComputerUseRun | null>;
  /** Service-role listing must always be narrowed by the authenticated actor. */
  list(scope?: ComputerUseRunAccessScope): Promise<ComputerUseRun[]>;
  updateSandbox(id: string, update: Partial<SandboxSession>): Promise<ComputerUseRun | null>;
  reset(): void;
}

export interface CreateRunStoreInput {
  userId: string;
  orgId?: string;
  projectId?: string;
  title: string;
  task: string;
  mode?: ComputerUseMode;
  allowedDomains?: string[];
  maxSteps?: number;
  permissionScope?: Partial<PermissionScope>;
  sandbox?: Partial<SandboxSession>;
}

export interface ComputerUseRunAccessScope {
  actorId: string;
  projectId?: string;
}

export interface ComputerUseStepStore {
  add(runId: string, step: Omit<ComputerUseStep, "id"> & { id?: string }): Promise<ComputerUseStep>;
  getByRun(runId: string): Promise<ComputerUseStep[]>;
  updateStatus(
    stepId: string,
    status: ComputerUseStep["status"],
    extra?: Partial<ComputerUseStep>,
  ): Promise<ComputerUseStep | null>;
  reset(): void;
}

export interface ComputerUseScreenshotStore {
  add(runId: string, screenshot: ComputerUseScreenshot): Promise<ComputerUseScreenshot>;
  getByRun(runId: string): Promise<ComputerUseScreenshot[]>;
  reset(): void;
}

export interface ComputerUseApprovalStore {
  add(runId: string, input: {
    stepId: string;
    action: ComputerAction;
    riskLevel: ComputerUseApproval["riskLevel"];
    reason: string;
  }): Promise<ComputerUseApproval | null>;
  getByRun(runId: string): Promise<ComputerUseApproval[]>;
  getPending(runId: string): Promise<ComputerUseApproval[]>;
  resolve(
    approvalId: string,
    decision: "approved" | "denied" | "expired",
    resolvedBy?: string,
  ): Promise<ComputerUseApproval | null>;
  reset(): void;
}

export interface ComputerUseArtifactStore {
  add(
    runId: string,
    artifact: Omit<ComputerUseArtifact, "id" | "createdAt" | "runId"> & { id?: string },
  ): Promise<ComputerUseArtifact | null>;
  getByRun(runId: string): Promise<ComputerUseArtifact[]>;
  reset(): void;
}

export interface ComputerUseObservationStore {
  add(runId: string, observation: ComputerUseObservation): Promise<ComputerUseObservation>;
  getByRun(runId: string): Promise<ComputerUseObservation[]>;
  reset(): void;
}

export interface ComputerUseEventStore {
  add(
    runId: string,
    event: Omit<ComputerUseReplayEvent, "id"> & { id?: string },
  ): Promise<ComputerUseReplayEvent>;
  getByRun(runId: string): Promise<ComputerUseReplayEvent[]>;
  reset(): void;
}

export interface ComputerUseStorageAdapter {
  readonly kind: ComputerUseStorageKind;
  runs: ComputerUseRunStore;
  steps: ComputerUseStepStore;
  screenshots: ComputerUseScreenshotStore;
  approvals: ComputerUseApprovalStore;
  artifacts: ComputerUseArtifactStore;
  observations: ComputerUseObservationStore;
  events: ComputerUseEventStore;
  reset(): void;
}

// ── In-memory adapter (connected to existing store.ts) ────────────────────

import {
  createRun as createRunStore,
  getRun,
  listRuns,
  updateRunStatus,
  updateRunSandbox,
  addStep as addStepStore,
  getStepsForRun,
  updateStepStatus,
  addScreenshot as addScreenshotStore,
  getScreenshotsForRun,
  requestApproval,
  resolveApproval,
  getApprovalsForRun,
  getPendingApprovals,
  addArtifact as addArtifactStore,
  getArtifactsForRun,
  addComputerUseObservation,
  getComputerUseObservations,
  addComputerUseEvent,
  getComputerUseEvents,
  resetComputerUseStore,
} from "./store";

function makeRunStore(): ComputerUseRunStore {
  return {
    async create(input: CreateRunStoreInput): Promise<ComputerUseRun> {
      return createRunStore(input);
    },
    async get(id: string): Promise<ComputerUseRun | null> {
      return getRun(id);
    },
    async setStatus(id: string, status: ComputerUseRunStatus): Promise<ComputerUseRun | null> {
      return updateRunStatus(id, status);
    },
    async update(id: string, data: Partial<ComputerUseRun>): Promise<ComputerUseRun | null> {
      const run = getRun(id);
      if (!run) return null;
      Object.assign(run, data);
      return run;
    },
    async list(scope?: ComputerUseRunAccessScope): Promise<ComputerUseRun[]> {
      const runs = listRuns();
      if (!scope) return runs;
      return runs.filter((run) => run.userId === scope.actorId && (!scope.projectId || run.projectId === scope.projectId));
    },
    async updateSandbox(id: string, update: Partial<SandboxSession>): Promise<ComputerUseRun | null> {
      return updateRunSandbox(id, update);
    },
    reset(): void {
      resetComputerUseStore();
    },
  };
}

function makeStepStore(): ComputerUseStepStore {
  return {
    async add(runId: string, step: Omit<ComputerUseStep, "id"> & { id?: string }): Promise<ComputerUseStep> {
      const result = addStepStore(runId, step.action, {
        index: step.index,
        status: step.status,
        beforeScreenshotId: step.beforeScreenshotId,
        afterScreenshotId: step.afterScreenshotId,
        policyDecision: step.policyDecision,
        result: step.result,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
      });
      if (!result) throw new Error(`Cannot add step: run ${runId} not found`);
      return result;
    },
    async getByRun(runId: string): Promise<ComputerUseStep[]> {
      return getStepsForRun(runId);
    },
    async updateStatus(
      stepId: string,
      status: ComputerUseStep["status"],
      extra?: Partial<ComputerUseStep>,
    ): Promise<ComputerUseStep | null> {
      return updateStepStatus(stepId, status, extra);
    },
    reset(): void {
      resetComputerUseStore();
    },
  };
}

function makeScreenshotStore(): ComputerUseScreenshotStore {
  return {
    async add(runId: string, screenshot: ComputerUseScreenshot): Promise<ComputerUseScreenshot> {
      return addScreenshotStore(runId, screenshot.imageUri, screenshot);
    },
    async getByRun(runId: string): Promise<ComputerUseScreenshot[]> {
      return getScreenshotsForRun(runId);
    },
    reset(): void {
      resetComputerUseStore();
    },
  };
}

function makeApprovalStore(): ComputerUseApprovalStore {
  return {
    async add(runId: string, input: {
      stepId: string;
      action: ComputerAction;
      riskLevel: ComputerUseApproval["riskLevel"];
      reason: string;
    }): Promise<ComputerUseApproval | null> {
      return requestApproval({
        runId,
        stepId: input.stepId,
        action: input.action,
        riskLevel: input.riskLevel,
        reason: input.reason,
      });
    },
    async getByRun(runId: string): Promise<ComputerUseApproval[]> {
      return getApprovalsForRun(runId);
    },
    async getPending(runId: string): Promise<ComputerUseApproval[]> {
      return getPendingApprovals(runId);
    },
    async resolve(
      approvalId: string,
      decision: "approved" | "denied" | "expired",
      resolvedBy?: string,
    ): Promise<ComputerUseApproval | null> {
      return resolveApproval(approvalId, decision, resolvedBy);
    },
    reset(): void {
      resetComputerUseStore();
    },
  };
}

function makeArtifactStore(): ComputerUseArtifactStore {
  return {
    async add(
      runId: string,
      artifact: Omit<ComputerUseArtifact, "id" | "createdAt" | "runId"> & { id?: string },
    ): Promise<ComputerUseArtifact | null> {
      return addArtifactStore(runId, artifact);
    },
    async getByRun(runId: string): Promise<ComputerUseArtifact[]> {
      return getArtifactsForRun(runId);
    },
    reset(): void {
      resetComputerUseStore();
    },
  };
}

function makeObservationStore(): ComputerUseObservationStore {
  return {
    async add(runId: string, observation: ComputerUseObservation): Promise<ComputerUseObservation> {
      addComputerUseObservation(runId, observation);
      return observation;
    },
    async getByRun(runId: string): Promise<ComputerUseObservation[]> {
      return getComputerUseObservations(runId);
    },
    reset(): void {
      resetComputerUseStore();
    },
  };
}

function makeEventStore(): ComputerUseEventStore {
  return {
    async add(
      runId: string,
      event: Omit<ComputerUseReplayEvent, "id"> & { id?: string },
    ): Promise<ComputerUseReplayEvent> {
      return addComputerUseEvent(runId, event);
    },
    async getByRun(runId: string): Promise<ComputerUseReplayEvent[]> {
      return getComputerUseEvents(runId);
    },
    reset(): void {
      resetComputerUseStore();
    },
  };
}

// ── Factory ───────────────────────────────────────────────────────────────

let currentAdapter: ComputerUseStorageAdapter | null = null;

/**
 * Returns the active ComputerUseStorageAdapter.
 *
 * When Supabase is configured (service-role key available), returns the
 * Supabase-backed adapter. Otherwise falls back to the in-memory adapter
 * for local development and testing.
 *
 * Durability: In-memory mode resets on server restart. Supabase mode
 * persists runs, steps, events, screenshots metadata, approvals,
 * observations, and artifacts to the database.
 */
export function createInMemoryComputerUseAdapter(): ComputerUseStorageAdapter {
  return {
    kind: "in_memory",
    runs: makeRunStore(),
    steps: makeStepStore(),
    screenshots: makeScreenshotStore(),
    approvals: makeApprovalStore(),
    artifacts: makeArtifactStore(),
    observations: makeObservationStore(),
    events: makeEventStore(),
    reset(): void {
      resetComputerUseStore();
    },
  };
}

export function getComputerUseStorageAdapter(): ComputerUseStorageAdapter {
  if (!currentAdapter) {
    try {
      // Dynamic require to avoid bundling server-only Supabase modules in client builds.
      // storage-supabase.ts internally imports server-only and Supabase packages
      // and will throw at require-time if loaded in a browser bundle.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const supabaseModule = require("./storage-supabase");
      const readiness: { ready: boolean; reason: string } =
        supabaseModule.getSupabaseAdapterReadiness();
      if (readiness.ready) {
        const adapter = supabaseModule.createSupabaseComputerUseAdapter();
        currentAdapter = adapter;
        return adapter;
      }
    } catch {
      // Readiness is handled below. Production must never silently fall back.
    }
    const explicitEphemeralMode =
      process.env.NODE_ENV !== "production" ||
      isMockModeAllowed() ||
      process.env.ETHEN_COMPUTER_USE_EPHEMERAL_TEST === "true";
    if (!explicitEphemeralMode) {
      throw new Error(
        "Computer Use durable storage is unavailable. Configure Supabase; in-memory canonical fallback is disabled.",
      );
    }
    currentAdapter = createInMemoryComputerUseAdapter();
  }
  return currentAdapter;
}

export function setComputerUseStorageAdapter(adapter: ComputerUseStorageAdapter): void {
  currentAdapter = adapter;
}

export function resetComputerUseStorageAdapter(): void {
  if (currentAdapter) {
    currentAdapter.reset();
  }
  currentAdapter = null;
}
