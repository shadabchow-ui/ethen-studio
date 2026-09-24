import {
  getComputerUseStorageAdapter,
  SCREENSHOT_STORAGE_LIMITATION,
  type ComputerUseStorageAdapter,
  type ComputerUseRunAccessScope,
  type CreateRunStoreInput,
} from "./storage";
import { } from "./seed";
import type {
  ComputerAction,
  ComputerUseApproval,
  ComputerUseObservation,
  ComputerUseReplayEvent,
  ComputerUseRun,
  ComputerUseRunStatus,
  ComputerUseStep,
} from "./types";

export type StorageKind = "in_memory" | "supabase" | "custom";
export type ComputerUseRunDataSource = "durable" | "in_memory" | "unavailable";

export interface ComputerUseRunSummary {
  run: ComputerUseRun;
  steps: ComputerUseStep[];
  events: ComputerUseReplayEvent[];
  screenshots: Awaited<ReturnType<ComputerUseStorageAdapter["screenshots"]["getByRun"]>>;
  approvals: ComputerUseApproval[];
  artifacts: Awaited<ReturnType<ComputerUseStorageAdapter["artifacts"]["getByRun"]>>;
  observations: ComputerUseObservation[];
  latestObservation: ComputerUseObservation | null;
  storageKind: StorageKind;
  dataSource: ComputerUseRunDataSource;
}

export interface ComputerUseRuntimeService {
  readonly storageKind: StorageKind;
  readonly dataSource: ComputerUseRunDataSource;
  createRun(input: CreateRunStoreInput): Promise<ComputerUseRun>;
  getRun(runId: string): Promise<ComputerUseRun | null>;
  listRuns(scope?: ComputerUseRunAccessScope): Promise<ComputerUseRun[]>;
  getSummary(runId: string): Promise<ComputerUseRunSummary | null>;
  getEvents(runId: string): Promise<ComputerUseReplayEvent[]>;
  getObservations(runId: string): Promise<ComputerUseObservation[]>;
  getApprovals(runId: string): Promise<ComputerUseApproval[]>;
  getPendingApprovals(runId: string): Promise<ComputerUseApproval[]>;
  setStatus(runId: string, status: ComputerUseRunStatus): Promise<ComputerUseRun | null>;
  pause(runId: string): Promise<ComputerUseRun | null>;
  resume(runId: string): Promise<ComputerUseRun | null>;
  stop(runId: string): Promise<ComputerUseRun | null>;
  takeover(runId: string): Promise<ComputerUseRun | null>;
  returnFromTakeover(runId: string): Promise<ComputerUseRun | null>;
  requestApproval(input: {
    runId: string;
    stepId: string;
    action: ComputerAction;
    riskLevel: ComputerUseApproval["riskLevel"];
    reason: string;
  }): Promise<ComputerUseApproval | null>;
  resolveApproval(approvalId: string, decision: "approved" | "denied" | "expired", resolvedBy?: string): Promise<ComputerUseApproval | null>;
  appendEvent(runId: string, event: Omit<ComputerUseReplayEvent, "id"> & { id?: string }): Promise<ComputerUseReplayEvent>;
}

function sourceFor(kind: StorageKind): ComputerUseRunDataSource {
  return kind === "supabase" ? "durable" : "in_memory";
}

class AdapterBackedComputerUseRuntimeService implements ComputerUseRuntimeService {
  public readonly storageKind: StorageKind;
  public readonly dataSource: ComputerUseRunDataSource;

  constructor(private readonly adapter: ComputerUseStorageAdapter) {
    this.storageKind = adapter.kind as StorageKind;
    this.dataSource = sourceFor(this.storageKind);
  }

  async createRun(input: CreateRunStoreInput) { return this.adapter.runs.create(input); }
  async getRun(runId: string) { return this.adapter.runs.get(runId); }
  async listRuns(scope?: ComputerUseRunAccessScope) {
    return this.adapter.runs.list(scope);
  }
  async getEvents(runId: string) { return this.adapter.events.getByRun(runId); }
  async getObservations(runId: string) { return this.adapter.observations.getByRun(runId); }
  async getApprovals(runId: string) { return this.adapter.approvals.getByRun(runId); }
  async getPendingApprovals(runId: string) { return this.adapter.approvals.getPending(runId); }
  async setStatus(runId: string, status: ComputerUseRunStatus) { return this.adapter.runs.setStatus(runId, status); }
  async pause(runId: string) { return this.setStatus(runId, "paused"); }
  async resume(runId: string) { return this.setStatus(runId, "running"); }
  async stop(runId: string) { return this.setStatus(runId, "cancelled"); }
  async takeover(runId: string) { return this.setStatus(runId, "takeover"); }
  async returnFromTakeover(runId: string) { return this.setStatus(runId, "running"); }
  async requestApproval(input: Parameters<ComputerUseRuntimeService["requestApproval"]>[0]) {
    return this.adapter.approvals.add(input.runId, input);
  }
  async resolveApproval(approvalId: string, decision: "approved" | "denied" | "expired", resolvedBy?: string) {
    return this.adapter.approvals.resolve(approvalId, decision, resolvedBy);
  }
  async appendEvent(runId: string, event: Omit<ComputerUseReplayEvent, "id"> & { id?: string }) {
    return this.adapter.events.add(runId, event);
  }
  async getSummary(runId: string): Promise<ComputerUseRunSummary | null> {
    const run = await this.getRun(runId);
    if (!run) return null;
    const [steps, screenshots, approvals, artifacts, observations, events] = await Promise.all([
      this.adapter.steps.getByRun(runId), this.adapter.screenshots.getByRun(runId),
      this.adapter.approvals.getByRun(runId), this.adapter.artifacts.getByRun(runId),
      this.adapter.observations.getByRun(runId), this.adapter.events.getByRun(runId),
    ]);
    return { run, steps, screenshots, approvals, artifacts, observations, events,
      latestObservation: observations.at(-1) ?? null, storageKind: this.storageKind, dataSource: this.dataSource };
  }
}

export function getComputerUseRuntimeService(): ComputerUseRuntimeService {
  return new AdapterBackedComputerUseRuntimeService(getComputerUseStorageAdapter());
}

export function createComputerUseRuntimeService(adapter: ComputerUseStorageAdapter): ComputerUseRuntimeService {
  return new AdapterBackedComputerUseRuntimeService(adapter);
}

export function getEvidenceStorageDescription(): string { return SCREENSHOT_STORAGE_LIMITATION; }
