/**
 * Studio V5 compiler-only execution contract (STUDIO_12).
 * Execution (j13 runtime) accepts ONLY compiled DAG envelopes: an
 * immutable IR plus its verified SHA-256. Raw authoring graphs are
 * rejected here, never executed.
 */
import { STUDIO_WORKFLOW_IR_VERSION } from "../../../contracts/versions";
import type { WorkflowIR } from "../../../contracts/workflow";
import { canonicalSha256 } from "./canonical";

export interface CompiledDagEnvelope {
  ir: WorkflowIR;
  dagHash: string;
}

function coreOf(ir: WorkflowIR): Record<string, unknown> {
  return {
    irVersion: ir.irVersion,
    graphRevisionId: ir.graphRevisionId,
    scope: ir.scope,
    nodes: ir.nodes,
    budgetEnvelopeIcu: ir.budgetEnvelopeIcu,
    compiledAt: ir.compiledAt,
  };
}

/** Build the envelope the runtime must receive. */
export function sealEnvelope(ir: WorkflowIR): CompiledDagEnvelope {
  return { ir, dagHash: ir.dagHashSha256 };
}

/**
 * Verify an envelope before execution: IR version must match, the hash
 * must recompute exactly, and node count must be within bounds.
 * Throws on any violation (fail-closed).
 */
export function requireCompiledEnvelope(
  envelope: CompiledDagEnvelope,
  options: { maxNodes?: number } = {},
): WorkflowIR {
  const { ir, dagHash } = envelope;
  if (!ir || typeof ir !== "object") throw new Error("EXECUTION_CONTRACT: envelope carries no compiled IR.");
  if (ir.irVersion !== STUDIO_WORKFLOW_IR_VERSION) {
    throw new Error(
      `EXECUTION_CONTRACT: IR version ${String((ir as WorkflowIR).irVersion)} is not executable (expected ${STUDIO_WORKFLOW_IR_VERSION}).`,
    );
  }
  const { sha256 } = canonicalSha256(coreOf(ir));
  if (sha256 !== dagHash || dagHash !== ir.dagHashSha256) {
    throw new Error("EXECUTION_CONTRACT: DAG hash mismatch; envelope is not the compiled IR.");
  }
  const maxNodes = options.maxNodes ?? 50;
  if (ir.nodes.length === 0 || ir.nodes.length > maxNodes) {
    throw new Error(`EXECUTION_CONTRACT: node count ${ir.nodes.length} outside executable bounds.`);
  }
  for (const node of ir.nodes) {
    if (!node.pins?.taskSchemaVersion || !node.endpointId) {
      throw new Error(`EXECUTION_CONTRACT: node ${node.nodeId} lacks pins/endpoint; raw graphs never execute.`);
    }
  }
  return ir;
}

/** Type-guard: raw authoring graphs ({nodes,edges} without IR) are never envelopes. */
export function isCompiledEnvelope(value: unknown): value is CompiledDagEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<CompiledDagEnvelope>;
  if (!envelope.ir || typeof envelope.ir !== "object") return false;
  return typeof envelope.dagHash === "string" && typeof envelope.ir.dagHashSha256 === "string";
}
