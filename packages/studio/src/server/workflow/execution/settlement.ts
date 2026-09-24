/**
 * Studio V5 run settlement with one envelope (STUDIO_13). Server-only.
 * Successful branch outputs are retained and settled exactly once: settle
 * is idempotent per child (replay returns the prior settlement, never a
 * second charge). A parent cancel releases only unstarted holds — settled
 * children keep their outputs and their single charge.
 */
import "server-only";
import type { ProjectScope } from "../../../contracts/scope";
import { asIcu, type IcuAmount } from "../../../contracts/money";
import {
  WorkflowExecutionError,
  type NodeRunBinding,
  type WorkflowRunEnvelope,
} from "./types";
import type { NodeJobPort } from "./admission";

export interface ChildSettleOutcome {
  nodeId: string;
  jobId: string;
  settledIcu: IcuAmount;
  replayed: boolean;
}

/**
 * Settle one successful child: idempotent, exactly-once. A settlement
 * amount mismatch against a prior settlement conflicts loudly (never
 * silently repriced).
 */
export async function settleNodeChild(
  port: NodeJobPort,
  input: {
    scope: ProjectScope;
    envelope: WorkflowRunEnvelope;
    binding: NodeRunBinding;
    actualIcu: IcuAmount;
    outputHash: string;
  },
): Promise<ChildSettleOutcome> {
  const { binding } = input;
  if (!binding.jobId) {
    throw new WorkflowExecutionError(
      "SETTLEMENT_CONFLICT",
      `Node ${binding.nodeId} has no bound job; cannot settle.`,
    );
  }
  if (binding.settledIcu !== null && binding.settledIcu !== input.actualIcu) {
    throw new WorkflowExecutionError(
      "SETTLEMENT_CONFLICT",
      `Node ${binding.nodeId} already settled at ${binding.settledIcu} ICU; refusing ${input.actualIcu} ICU re-settle.`,
    );
  }
  if (binding.settledIcu !== null) {
    return { nodeId: binding.nodeId, jobId: binding.jobId, settledIcu: binding.settledIcu, replayed: true };
  }
  const settled = await port.settleChild({
    scope: input.scope,
    envelope: input.envelope,
    nodeId: binding.nodeId,
    jobId: binding.jobId,
    actualIcu: input.actualIcu,
    outputHash: input.outputHash,
  });
  return { nodeId: binding.nodeId, jobId: settled.jobId, settledIcu: settled.settledIcu, replayed: settled.replayed };
}

/**
 * Cancel-time child handling under one envelope: settled children are
 * retained (outputs + single charge kept); running children are released
 * with reason `run-cancelled`; never-started bindings release their hold.
 * Returns the ICU retained (already settled) vs released.
 */
export async function settleRunCancel(
  port: NodeJobPort,
  input: {
    scope: ProjectScope;
    envelope: WorkflowRunEnvelope;
    bindings: readonly NodeRunBinding[];
    reason: string;
  },
): Promise<{ retainedIcu: IcuAmount; releasedNodes: string[]; retainedNodes: string[] }> {
  let retained = 0;
  const releasedNodes: string[] = [];
  const retainedNodes: string[] = [];
  for (const binding of input.bindings) {
    if (binding.settledIcu !== null) {
      retained += binding.settledIcu;
      retainedNodes.push(binding.nodeId);
      continue;
    }
    if (binding.jobId) {
      await port.releaseChild({
        scope: input.scope,
        envelope: input.envelope,
        nodeId: binding.nodeId,
        jobId: binding.jobId,
        reason: input.reason,
      });
    }
    releasedNodes.push(binding.nodeId);
  }
  return { retainedIcu: asIcu(retained), releasedNodes, retainedNodes };
}
