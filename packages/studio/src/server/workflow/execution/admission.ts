/**
 * Studio V5 scoped child admission (STUDIO_13). Server-only.
 * Every executed node binds to exactly one durable job admitted as a
 * scoped child of the run envelope: deterministic idempotency
 * (`canvas-run:{runId}:node:{nodeId}`), request hash from the node cache
 * identity, parent reservation linkage. Production wires these ports to
 * the j05 admission + j04 reservation path; tests use memory fakes.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { ProjectScope } from "../../../contracts/scope";
import type { IcuAmount } from "../../../contracts/money";
import type { WorkflowNode } from "../../../contracts/workflow";
import { WorkflowExecutionError, type WorkflowRunEnvelope } from "./types";

export interface NodeChildAdmission {
  scope: ProjectScope;
  envelope: WorkflowRunEnvelope;
  node: WorkflowNode;
  /** Deterministic node cache key (j13 cache identity). */
  cacheKey: string;
  /** Quoted cost for this node in ICU. */
  quotedIcu: IcuAmount;
}

export interface AdmittedNodeChild {
  jobId: string;
  reservationId: string;
  replayed: boolean;
}

export interface NodeChildSettlement {
  scope: ProjectScope;
  envelope: WorkflowRunEnvelope;
  nodeId: string;
  jobId: string;
  actualIcu: IcuAmount;
  outputHash: string;
}

export interface SettledNodeChild {
  jobId: string;
  settledIcu: IcuAmount;
  replayed: boolean;
}

/** Minimal child-job port; production implements this over j04/j05 SQL. */
export interface NodeJobPort {
  admitChild(admission: NodeChildAdmission): Promise<AdmittedNodeChild>;
  settleChild(settlement: NodeChildSettlement): Promise<SettledNodeChild>;
  releaseChild(input: {
    scope: ProjectScope;
    envelope: WorkflowRunEnvelope;
    nodeId: string;
    jobId: string;
    reason: string;
  }): Promise<{ released: boolean; replayed: boolean }>;
  readChildOutput(input: {
    scope: ProjectScope;
    jobId: string;
  }): Promise<{ status: string; outputHash: string | null; actualIcu: IcuAmount | null } | null>;
}

/** Deterministic child idempotency key: same run + same node replays, never duplicates. */
export function childIdempotencyKey(runId: string, nodeId: string): string {
  return `canvas-run:${runId}:node:${nodeId}`;
}

/** Deterministic request hash binding the child to its cache identity. */
export function childRequestHash(input: {
  dagHash: string;
  node: WorkflowNode;
  cacheKey: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        dag: input.dagHash,
        node: input.node.nodeId,
        task: input.node.task,
        endpoint: input.node.endpointId,
        pins: input.node.pins,
        cache: input.cacheKey,
      }),
    )
    .digest("hex");
}

/**
 * Admit one scoped child. Fails closed: a child without a cache key or
 * quote is never admitted (prevents unbilled execution).
 */
export async function admitNodeChild(
  port: NodeJobPort,
  admission: NodeChildAdmission,
): Promise<AdmittedNodeChild> {
  if (!admission.cacheKey) {
    throw new WorkflowExecutionError("ADMISSION_FAILED", `Node ${admission.node.nodeId} has no cache identity; refusing admission.`);
  }
  return port.admitChild(admission);
}
