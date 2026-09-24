/**
 * Studio V5 workflow run memory store (STUDIO_13). Test/port adapter;
 * production persists via the j13 migration tables. Runs are created from
 * compiled envelopes only — raw graphs are rejected at creation, never
 * admitted. Events are append-only; bindings carry the node→Job map.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type { ProjectScope } from "../../../contracts/scope";
import { asIcu, ZERO_ICU } from "../../../contracts/money";
import { isCompiledEnvelope, requireCompiledEnvelope } from "../compiler/envelope";
import type { CompiledDagEnvelope } from "../compiler/envelope";
import {
  WorkflowExecutionError,
  type NodeRunBinding,
  type NodeRunStatus,
  type WorkflowRun,
  type WorkflowRunEnvelope,
  type WorkflowRunEvent,
  type WorkflowRunStatus,
} from "../execution/types";

export interface CreateRunInput {
  scope: ProjectScope;
  envelope: CompiledDagEnvelope;
  graphId: string;
  revision: number;
  budgetIcu: number;
  selection?: readonly string[];
  runId?: string;
}

const RUN_TRANSITIONS: Readonly<Record<WorkflowRunStatus, readonly WorkflowRunStatus[]>> = {
  QUEUED: ["RUNNING", "CANCEL_REQUESTED", "CANCELLED"],
  RUNNING: ["COMPLETED", "FAILED", "CANCEL_REQUESTED", "RECONCILING"],
  COMPLETED: [],
  FAILED: ["RECONCILING"],
  CANCEL_REQUESTED: ["CANCELLED", "RECONCILING"],
  CANCELLED: [],
  RECONCILING: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
};

export class MemoryWorkflowRunStore {
  private runs = new Map<string, WorkflowRun>();
  private events = new Map<string, WorkflowRunEvent[]>();

  createRun(input: CreateRunInput): WorkflowRun {
    if (!isCompiledEnvelope(input.envelope)) {
      throw new WorkflowExecutionError(
        "RAW_GRAPH_REJECTED",
        "Runs accept only compiled DAG envelopes; mutable editor JSON never executes.",
      );
    }
    const ir = requireCompiledEnvelope(input.envelope);
    const runId = input.runId ?? randomUUID();
    if (this.runs.has(runId)) {
      throw new WorkflowExecutionError("INVALID_TRANSITION", `Run ${runId} already exists.`);
    }
    const now = new Date().toISOString();
    const envelope: WorkflowRunEnvelope = {
      runId,
      scope: input.scope,
      graphId: input.graphId,
      revision: input.revision,
      dagHash: ir.dagHashSha256,
      reservationKey: `canvas-run:${runId}`,
      budgetIcu: asIcu(input.budgetIcu),
      createdAt: now,
    };
    const bindings: Record<string, NodeRunBinding> = {};
    for (const node of ir.nodes) {
      bindings[node.nodeId] = {
        runId,
        nodeId: node.nodeId,
        jobId: null,
        status: "PENDING",
        cacheKey: null,
        outputHash: null,
        settledIcu: null,
        attempt: 0,
        error: null,
        updatedAt: now,
      };
    }
    const run: WorkflowRun = {
      runId,
      envelope,
      status: "QUEUED",
      selection: input.selection ? [...input.selection] : null,
      bindings,
      actualIcu: ZERO_ICU,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };
    this.runs.set(runId, run);
    this.events.set(runId, []);
    this.appendEvent(runId, "run.created", null, { dagHash: ir.dagHashSha256 });
    return structuredClone(run);
  }

  getRun(runId: string): WorkflowRun | null {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : null;
  }

  transitionRun(runId: string, to: WorkflowRunStatus): WorkflowRun {
    const run = this.runs.get(runId);
    if (!run) throw new WorkflowExecutionError("NOT_FOUND", `Run ${runId} not found.`);
    const allowed = RUN_TRANSITIONS[run.status] ?? [];
    if (run.status !== to && !allowed.includes(to)) {
      throw new WorkflowExecutionError(
        "INVALID_TRANSITION",
        `Run ${runId} cannot move ${run.status} → ${to}.`,
      );
    }
    run.status = to;
    run.updatedAt = new Date().toISOString();
    if (to === "COMPLETED" || to === "FAILED" || to === "CANCELLED") {
      run.finishedAt = run.updatedAt;
    }
    return structuredClone(run);
  }

  updateBinding(runId: string, nodeId: string, patch: Partial<NodeRunBinding>): NodeRunBinding {
    const run = this.runs.get(runId);
    const binding = run?.bindings[nodeId];
    if (!run || !binding) {
      throw new WorkflowExecutionError("NOT_FOUND", `Binding ${runId}/${nodeId} not found.`);
    }
    const next: NodeRunBinding = {
      ...binding,
      ...patch,
      runId,
      nodeId,
      updatedAt: new Date().toISOString(),
    };
    (run.bindings as Record<string, NodeRunBinding>)[nodeId] = next;
    run.updatedAt = next.updatedAt;
    return structuredClone(next);
  }

  addActualIcu(runId: string, deltaIcu: number): WorkflowRun {
    const run = this.runs.get(runId);
    if (!run) throw new WorkflowExecutionError("NOT_FOUND", `Run ${runId} not found.`);
    run.actualIcu = asIcu(run.actualIcu + deltaIcu);
    run.updatedAt = new Date().toISOString();
    return structuredClone(run);
  }

  appendEvent(
    runId: string,
    type: WorkflowRunEvent["type"],
    nodeId: string | null,
    payload: Record<string, unknown> = {},
  ): WorkflowRunEvent {
    const log = this.events.get(runId);
    if (!log) throw new WorkflowExecutionError("NOT_FOUND", `Run ${runId} not found.`);
    const event: WorkflowRunEvent = {
      runId,
      seq: log.length,
      type,
      nodeId,
      payload: { ...payload },
      at: new Date().toISOString(),
    };
    log.push(event);
    return structuredClone(event);
  }

  listEvents(runId: string): WorkflowRunEvent[] {
    return structuredClone(this.events.get(runId) ?? []);
  }

  listRuns(): WorkflowRun[] {
    return [...this.runs.values()].map((run) => structuredClone(run));
  }

  /** Test-only: force a status without transition checks (crash simulation). */
  forceStatus(runId: string, status: WorkflowRunStatus, nodeStatus?: NodeRunStatus): void {
    const run = this.runs.get(runId);
    if (!run) throw new WorkflowExecutionError("NOT_FOUND", `Run ${runId} not found.`);
    run.status = status;
    if (nodeStatus) {
      for (const binding of Object.values(run.bindings)) {
        if (binding.status === "RUNNING" || binding.status === "QUEUED") {
          (run.bindings as Record<string, NodeRunBinding>)[binding.nodeId] = {
            ...binding,
            status: nodeStatus,
          };
        }
      }
    }
  }
}
