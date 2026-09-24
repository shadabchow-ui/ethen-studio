/**
 * Studio V5 canvas execution planner (STUDIO_13). Pure.
 * Recovered from canvas-workflow planWorkflowRecompute, re-pointed at the
 * compiled immutable IR: edges derive from compiled node inputs, so a
 * shared ancestor in a diamond executes exactly once (topological order
 * visits every node once). Raw authoring graphs are rejected — planning
 * accepts only a hash-verified compiled envelope.
 */
import "server-only";
import type { WorkflowIR } from "../../../contracts/workflow";
import {
  isCompiledEnvelope,
  requireCompiledEnvelope,
  type CompiledDagEnvelope,
} from "../compiler/envelope";
import { WorkflowExecutionError } from "./types";

export interface RunPlan {
  dagHash: string;
  /** Deterministic topological order (node-id tiebreak). */
  order: string[];
  /** Nodes reusing retained/cached outputs (no re-spend). */
  reuse: string[];
  /** Nodes to execute (dirty or no valid cache). */
  recompute: string[];
  /** Changed/selected nodes plus their downstream closure. */
  invalidated: string[];
}

export interface PlanRunInput {
  envelope: CompiledDagEnvelope;
  /** Changed node ids (edit-driven partial rerun). */
  changedNodeIds?: readonly string[];
  /**
   * Explicitly selected nodes (selected-downstream run): the selection
   * plus its downstream closure recomputes; everything else reuses valid
   * cache or is skipped. Takes precedence over changedNodeIds.
   */
  selectedNodeIds?: readonly string[];
  /** Node ids with currently valid cache entries (validity rechecked by j13 cache). */
  cacheHits: ReadonlySet<string>;
}

function downstreamOf(ir: WorkflowIR): Map<string, Set<string>> {
  const downstream = new Map<string, Set<string>>();
  for (const node of ir.nodes) downstream.set(node.nodeId, new Set());
  for (const node of ir.nodes) {
    for (const input of node.inputs) {
      downstream.get(input.nodeId)?.add(node.nodeId);
    }
  }
  return downstream;
}

/** Deterministic Kahn topological sort over compiled IR edges. */
export function topologicalOrder(ir: WorkflowIR): string[] {
  const downstream = downstreamOf(ir);
  const indegree = new Map<string, number>();
  for (const node of ir.nodes) indegree.set(node.nodeId, 0);
  for (const node of ir.nodes) {
    for (const input of node.inputs) {
      if (indegree.has(node.nodeId) && downstream.has(input.nodeId)) {
        indegree.set(node.nodeId, (indegree.get(node.nodeId) ?? 0) + 1);
      }
    }
  }
  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift() as string;
    order.push(current);
    for (const next of [...(downstream.get(current) ?? [])].sort()) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  if (order.length !== ir.nodes.length) {
    throw new WorkflowExecutionError("INVALID_ENVELOPE", "Compiled IR is not a DAG; cannot plan execution.");
  }
  return order;
}

export function dirtyDownstreamClosureIr(ir: WorkflowIR, seeds: readonly string[]): string[] {
  const downstream = downstreamOf(ir);
  const dirty = new Set<string>();
  const queue: string[] = [];
  for (const id of seeds) {
    if (!downstream.has(id)) {
      throw new WorkflowExecutionError("UNKNOWN_NODE", `Run selection references unknown node ${id}.`);
    }
    if (!dirty.has(id)) {
      dirty.add(id);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const next of downstream.get(current) ?? []) {
      if (!dirty.has(next)) {
        dirty.add(next);
        queue.push(next);
      }
    }
  }
  return [...dirty];
}

/**
 * Plan a run: verify the compiled envelope, then split nodes into reuse
 * vs recompute. Empty changed/selected sets mean a full run (recompute
 * every node without a valid cache hit). A selection recomputes the
 * selection plus dirty descendants only — retained successful branch
 * outputs are never recomputed.
 */
export function planRun(input: PlanRunInput): RunPlan {
  if (!isCompiledEnvelope(input.envelope)) {
    throw new WorkflowExecutionError(
      "RAW_GRAPH_REJECTED",
      "Execution accepts only compiled DAG envelopes; mutable editor JSON never executes.",
    );
  }
  const ir = requireCompiledEnvelope(input.envelope);
  const order = topologicalOrder(ir);
  const seeds = input.selectedNodeIds ?? input.changedNodeIds ?? [];
  const dirty = new Set(dirtyDownstreamClosureIr(ir, seeds));
  const reuse: string[] = [];
  const recompute: string[] = [];
  for (const id of order) {
    if (dirty.has(id) || !input.cacheHits.has(id)) recompute.push(id);
    else reuse.push(id);
  }
  return { dagHash: ir.dagHashSha256, order, reuse, recompute, invalidated: [...dirty] };
}
