/**
 * Studio V5 run control: execute / retry / cancel / recover (STUDIO_13).
 * One envelope per run; every path funnels through the run store plus the
 * scoped NodeJobPort. Retained successful branch outputs are never
 * recomputed: retry and recover only touch dirty/non-terminal nodes, and
 * cancel never un-settles completed children.
 */
import "server-only";
import { asIcu } from "../../../contracts/money";
import type { WorkflowIR } from "../../../contracts/workflow";
import { requireCompiledEnvelope, type CompiledDagEnvelope } from "../compiler/envelope";
import {
  admitNodeChild,
  childRequestHash,
  type NodeJobPort,
} from "../execution/admission";
import { planRun, type RunPlan } from "../execution/plan";
import { settleNodeChild, settleRunCancel } from "../execution/settlement";
import {
  TERMINAL_NODE_RUN_STATUSES,
  WorkflowExecutionError,
  type NodeRunBinding,
  type WorkflowRun,
} from "../execution/types";
import { MemoryWorkflowRunStore } from "./memory";

export interface RunControllerDeps {
  store: MemoryWorkflowRunStore;
  jobs: NodeJobPort;
  /** Per-node quoted ICU (production: j04 quotes over compiler estimates). */
  quoteNode: (nodeId: string) => number;
  /** Per-node deterministic cache key (production: j12 identity + j13 store). */
  cacheKeyFor: (nodeId: string) => string;
  /** Execute one admitted child synchronously (worker path polls instead). */
  executeChild?: (input: {
    run: WorkflowRun;
    binding: NodeRunBinding;
    jobId: string;
  }) => Promise<{ outputHash: string; actualIcu: number }>;
}

export interface ExecuteRunInput {
  runId: string;
  envelope: CompiledDagEnvelope;
  cacheHits: ReadonlySet<string>;
}

export interface ExecuteRunResult {
  run: WorkflowRun;
  plan: RunPlan;
}

function nodeById(ir: WorkflowIR, nodeId: string) {
  const node = ir.nodes.find((entry) => entry.nodeId === nodeId);
  if (!node) throw new WorkflowExecutionError("UNKNOWN_NODE", `Compiled IR has no node ${nodeId}.`);
  return node;
}

async function runOneNode(
  deps: RunControllerDeps,
  run: WorkflowRun,
  ir: WorkflowIR,
  nodeId: string,
): Promise<WorkflowRun> {
  const { store } = deps;
  const node = nodeById(ir, nodeId);
  const cacheKey = deps.cacheKeyFor(nodeId);
  store.updateBinding(run.runId, nodeId, { cacheKey, status: "QUEUED", attempt: 1 });
  store.appendEvent(run.runId, "node.queued", nodeId, { cacheKey });
  const admitted = await admitNodeChild(deps.jobs, {
    scope: run.envelope.scope,
    envelope: run.envelope,
    node,
    cacheKey,
    quotedIcu: asIcu(deps.quoteNode(nodeId)),
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Admission failed.";
    store.updateBinding(run.runId, nodeId, { status: "FAILED", error: message });
    store.appendEvent(run.runId, "node.failed", nodeId, { error: message });
    throw new WorkflowExecutionError("ADMISSION_FAILED", message);
  });
  void childRequestHash({ dagHash: ir.dagHashSha256, node, cacheKey });
  store.updateBinding(run.runId, nodeId, { jobId: admitted.jobId, status: "RUNNING" });
  store.appendEvent(run.runId, "node.started", nodeId, { jobId: admitted.jobId });
  const binding = store.getRun(run.runId)?.bindings[nodeId];
  if (!binding) throw new WorkflowExecutionError("NOT_FOUND", `Binding ${run.runId}/${nodeId} lost.`);
  const outcome = deps.executeChild
    ? await deps.executeChild({ run, binding, jobId: admitted.jobId })
    : { outputHash: `pending:${admitted.jobId}`, actualIcu: 0 };
  if (!deps.executeChild) return store.getRun(run.runId) as WorkflowRun;
  const settled = await settleNodeChild(deps.jobs, {
    scope: run.envelope.scope,
    envelope: run.envelope,
    binding: { ...binding, jobId: admitted.jobId },
    actualIcu: asIcu(outcome.actualIcu),
    outputHash: outcome.outputHash,
  });
  store.updateBinding(run.runId, nodeId, {
    status: "SUCCEEDED",
    outputHash: outcome.outputHash,
    settledIcu: settled.settledIcu,
  });
  store.appendEvent(run.runId, "node.succeeded", nodeId, {
    jobId: admitted.jobId,
    settledIcu: settled.settledIcu,
    outputHash: outcome.outputHash,
  });
  return store.addActualIcu(run.runId, settled.replayed ? 0 : settled.settledIcu);
}

/**
 * Execute a run in plan order: reuse valid cache hits, admit + execute +
 * settle recompute nodes. Budget is enforced against the envelope before
 * the first admission.
 */
export async function executeRun(deps: RunControllerDeps, input: ExecuteRunInput): Promise<ExecuteRunResult> {
  const { store } = deps;
  let run = store.getRun(input.runId);
  if (!run) throw new WorkflowExecutionError("NOT_FOUND", `Run ${input.runId} not found.`);
  const ir = requireCompiledEnvelope(input.envelope);
  const plan = planRun({
    envelope: input.envelope,
    changedNodeIds: [],
    selectedNodeIds: run.selection ? [...run.selection] : undefined,
    cacheHits: input.cacheHits,
  });
  const quoted = plan.recompute.reduce((sum, nodeId) => sum + deps.quoteNode(nodeId), 0);
  if (quoted > run.envelope.budgetIcu) {
    throw new WorkflowExecutionError(
      "BUDGET_EXCEEDED",
      `Recompute quote ${quoted} ICU exceeds run budget ${run.envelope.budgetIcu} ICU.`,
    );
  }
  run = store.transitionRun(run.runId, "RUNNING");
  store.appendEvent(run.runId, "run.started", null, { recompute: plan.recompute });
  try {
    for (const nodeId of plan.reuse) {
      store.updateBinding(run.runId, nodeId, { status: "REUSED", cacheKey: deps.cacheKeyFor(nodeId) });
      store.appendEvent(run.runId, "node.reused", nodeId, { cacheHit: true });
    }
    for (const nodeId of plan.recompute) {
      const current = store.getRun(run.runId) as WorkflowRun;
      if (current.status === "CANCEL_REQUESTED") break;
      run = await runOneNode(deps, current, ir, nodeId);
    }
    run = store.getRun(run.runId) as WorkflowRun;
    if (run.status === "CANCEL_REQUESTED") {
      await cancelRun(deps, { runId: run.runId, reason: "cancel-requested-during-execution" });
      return { run: store.getRun(run.runId) as WorkflowRun, plan };
    }
    run = store.transitionRun(run.runId, "COMPLETED");
    store.appendEvent(run.runId, "run.completed", null, { actualIcu: run.actualIcu });
    return { run, plan };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Run failed.";
    run = store.getRun(run.runId) as WorkflowRun;
    if (run.status === "RUNNING") {
      run = store.transitionRun(run.runId, "FAILED");
      store.appendEvent(run.runId, "run.failed", null, { error: message });
    }
    throw error;
  }
}

/**
 * Retry failed nodes (plus their dirty downstream): retained SUCCEEDED /
 * REUSED bindings are untouched. Only FAILED bindings reset to QUEUED.
 */
export async function retryRun(
  deps: RunControllerDeps,
  input: { runId: string; envelope: CompiledDagEnvelope; cacheHits: ReadonlySet<string> },
): Promise<ExecuteRunResult> {
  const { store } = deps;
  let run = store.getRun(input.runId);
  if (!run) throw new WorkflowExecutionError("NOT_FOUND", `Run ${input.runId} not found.`);
  if (run.status !== "FAILED") {
    throw new WorkflowExecutionError("INVALID_TRANSITION", `Only failed runs retry; run is ${run.status}.`);
  }
  requireCompiledEnvelope(input.envelope);
  run = store.transitionRun(run.runId, "RECONCILING");
  for (const binding of Object.values(run.bindings)) {
    if (binding.status === "FAILED") {
      store.updateBinding(run.runId, binding.nodeId, {
        status: "QUEUED",
        error: null,
        attempt: binding.attempt + 1,
      });
      store.appendEvent(run.runId, "node.retried", binding.nodeId, {});
    }
  }
  run = store.transitionRun(run.runId, "RUNNING");
  store.appendEvent(run.runId, "run.started", null, { retried: true });
  const ir = requireCompiledEnvelope(input.envelope);
  try {
    // Retried failures plus never-started downstream (PENDING) execute;
    // retained SUCCEEDED/REUSED bindings are terminal and untouched.
    for (const binding of Object.values((store.getRun(run.runId) as WorkflowRun).bindings)) {
      if (binding.status !== "QUEUED" && binding.status !== "PENDING") continue;
      run = await runOneNode(deps, store.getRun(run.runId) as WorkflowRun, ir, binding.nodeId);
    }
    run = store.transitionRun(run.runId, "COMPLETED");
    store.appendEvent(run.runId, "run.completed", null, { actualIcu: run.actualIcu, retried: true });
    const plan = planRun({ envelope: input.envelope, cacheHits: input.cacheHits });
    return { run, plan };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Retry failed.";
    run = store.transitionRun(run.runId, "FAILED");
    store.appendEvent(run.runId, "run.failed", null, { error: message });
    throw error;
  }
}

/** Cancel: one envelope — settled children retained, the rest released. */
export async function cancelRun(
  deps: RunControllerDeps,
  input: { runId: string; reason: string },
): Promise<WorkflowRun> {
  const { store } = deps;
  let run = store.getRun(input.runId);
  if (!run) throw new WorkflowExecutionError("NOT_FOUND", `Run ${input.runId} not found.`);
  if (run.status === "COMPLETED" || run.status === "CANCELLED") return run;
  if (run.status === "QUEUED" || run.status === "RUNNING") {
    run = store.transitionRun(run.runId, "CANCEL_REQUESTED");
    store.appendEvent(run.runId, "run.cancel_requested", null, { reason: input.reason });
  }
  const settled = await settleRunCancel(deps.jobs, {
    scope: run.envelope.scope,
    envelope: run.envelope,
    bindings: Object.values(run.bindings),
    reason: input.reason,
  });
  for (const nodeId of settled.releasedNodes) {
    const binding = (store.getRun(run.runId) as WorkflowRun).bindings[nodeId];
    if (binding && !(TERMINAL_NODE_RUN_STATUSES as readonly string[]).includes(binding.status)) {
      store.updateBinding(run.runId, nodeId, { status: "CANCELLED" });
      store.appendEvent(run.runId, "node.cancelled", nodeId, { reason: input.reason });
    }
  }
  run = store.transitionRun(run.runId, "CANCELLED");
  store.appendEvent(run.runId, "run.cancelled", null, {
    reason: input.reason,
    retainedIcu: settled.retainedIcu,
    retainedNodes: settled.retainedNodes,
  });
  return run;
}

/**
 * Recover after worker loss: reconcile persisted bindings against live
 * child state. SUCCEEDED/settled and REUSED bindings are retained as-is;
 * only non-terminal bindings re-resolve (completed children settle once,
 * the rest requeue). Terminal runs are returned untouched.
 */
export async function recoverRun(
  deps: RunControllerDeps,
  input: { runId: string; envelope: CompiledDagEnvelope },
): Promise<WorkflowRun> {
  const { store } = deps;
  let run = store.getRun(input.runId);
  if (!run) throw new WorkflowExecutionError("NOT_FOUND", `Run ${input.runId} not found.`);
  if (run.status === "COMPLETED" || run.status === "CANCELLED" || run.status === "FAILED") return run;
  requireCompiledEnvelope(input.envelope);
  if (run.status === "RUNNING" || run.status === "RECONCILING" || run.status === "QUEUED") {
    if (run.status === "RUNNING") run = store.transitionRun(run.runId, "RECONCILING");
    store.appendEvent(run.runId, "run.recovered", null, { resumedAfter: "worker-loss" });
  }
  for (const binding of Object.values(run.bindings)) {
    if ((TERMINAL_NODE_RUN_STATUSES as readonly string[]).includes(binding.status)) continue;
    if (!binding.jobId) {
      store.updateBinding(run.runId, binding.nodeId, { status: "QUEUED" });
      store.appendEvent(run.runId, "node.queued", binding.nodeId, { recovered: true });
      continue;
    }
    const live = await deps.jobs.readChildOutput({ scope: run.envelope.scope, jobId: binding.jobId });
    if (live && (live.status === "COMPLETED" || live.status === "SUCCEEDED") && live.outputHash && live.actualIcu !== null) {
      const settled = await settleNodeChild(deps.jobs, {
        scope: run.envelope.scope,
        envelope: run.envelope,
        binding,
        actualIcu: live.actualIcu,
        outputHash: live.outputHash,
      });
      store.updateBinding(run.runId, binding.nodeId, {
        status: "SUCCEEDED",
        outputHash: live.outputHash,
        settledIcu: settled.settledIcu,
      });
      store.appendEvent(run.runId, "node.succeeded", binding.nodeId, {
        jobId: binding.jobId,
        settledIcu: settled.settledIcu,
        recovered: true,
      });
      if (!settled.replayed) run = store.addActualIcu(run.runId, settled.settledIcu);
    } else {
      store.updateBinding(run.runId, binding.nodeId, { status: "QUEUED" });
      store.appendEvent(run.runId, "node.queued", binding.nodeId, { recovered: true });
    }
  }
  run = store.transitionRun(run.runId, "RUNNING");
  return run;
}
