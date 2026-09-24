/**
 * Studio V5 Creative Agent — typed Canvas patches (STUDIO_17).
 * The agent edits Canvas through typed operations only. Patch application
 * is pure over CanvasGraph; the result must still compile (via the
 * injected compiler port) before execution. A human-readable diff is
 * produced alongside every patch and shown before execution.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import {
  isCanvasNodeKind,
  type CanvasGraph,
  type CanvasGraphNode,
} from "../../contracts/graph";
import { agentError, type AgentCompilerPort, type CanvasPatch, type CanvasPatchOp } from "./types";

/** Validate ops structurally against the base graph. Pure. */
export function validatePatchOps(base: CanvasGraph, ops: readonly CanvasPatchOp[]): void {
  if (ops.length === 0) throw agentError("BAD_REQUEST", "Canvas patch needs at least one operation.");
  const nodeIds = new Set(base.nodes.map((n) => n.id));
  const edgeKeys = new Set(base.edges.map((e) => `${e.from}:${e.fromPort}→${e.to}:${e.toPort}`));
  for (const op of ops) {
    switch (op.kind) {
      case "add-node": {
        if (!isCanvasNodeKind(op.node.kind)) {
          throw agentError("BAD_REQUEST", `Patch adds node with unknown kind "${op.node.kind}".`);
        }
        if (!op.node.id?.trim()) throw agentError("BAD_REQUEST", "Patch adds a node without an id.");
        if (nodeIds.has(op.node.id)) {
          throw agentError("BAD_REQUEST", `Patch adds duplicate node ${op.node.id}.`);
        }
        nodeIds.add(op.node.id);
        break;
      }
      case "remove-node": {
        if (!nodeIds.has(op.nodeId)) {
          throw agentError("BAD_REQUEST", `Patch removes unknown node ${op.nodeId}.`);
        }
        nodeIds.delete(op.nodeId);
        break;
      }
      case "set-params": {
        if (!nodeIds.has(op.nodeId)) {
          throw agentError("BAD_REQUEST", `Patch sets params on unknown node ${op.nodeId}.`);
        }
        break;
      }
      case "add-edge": {
        if (!nodeIds.has(op.from) || !nodeIds.has(op.to)) {
          throw agentError("BAD_REQUEST", `Patch adds an edge with an unknown endpoint (${op.from} → ${op.to}).`);
        }
        if (op.from === op.to) throw agentError("BAD_REQUEST", "Patch adds a self edge.");
        const key = `${op.from}:${op.fromPort}→${op.to}:${op.toPort}`;
        if (edgeKeys.has(key)) throw agentError("BAD_REQUEST", "Patch adds a duplicate edge.");
        edgeKeys.add(key);
        break;
      }
      case "remove-edge": {
        const key = `${op.from}:${op.fromPort}→${op.to}:${op.toPort}`;
        if (!edgeKeys.has(key)) throw agentError("BAD_REQUEST", "Patch removes an edge that does not exist.");
        edgeKeys.delete(key);
        break;
      }
      default:
        throw agentError("BAD_REQUEST", "Patch contains an unknown operation kind.");
    }
  }
}

/** Apply ops to a base graph, returning the patched graph. Pure. */
export function applyPatchOps(base: CanvasGraph, ops: readonly CanvasPatchOp[]): CanvasGraph {
  const nodes = new Map<string, CanvasGraphNode>();
  for (const node of base.nodes) {
    nodes.set(node.id, {
      ...node,
      params: { ...node.params },
      inputs: [...node.inputs],
      outputs: [...node.outputs],
    });
  }
  const edges = base.edges.map((e) => ({ ...e }));
  for (const op of ops) {
    switch (op.kind) {
      case "add-node":
        nodes.set(op.node.id, {
          ...op.node,
          params: { ...op.node.params },
          inputs: [...op.node.inputs],
          outputs: [...op.node.outputs],
        });
        break;
      case "remove-node": {
        nodes.delete(op.nodeId);
        for (let i = edges.length - 1; i >= 0; i--) {
          if (edges[i].from === op.nodeId || edges[i].to === op.nodeId) edges.splice(i, 1);
        }
        break;
      }
      case "set-params": {
        const node = nodes.get(op.nodeId);
        if (node) nodes.set(op.nodeId, { ...node, params: { ...op.params } });
        break;
      }
      case "add-edge":
        edges.push({ from: op.from, fromPort: op.fromPort, to: op.to, toPort: op.toPort });
        break;
      case "remove-edge": {
        const index = edges.findIndex(
          (e) => e.from === op.from && e.fromPort === op.fromPort && e.to === op.to && e.toPort === op.toPort,
        );
        if (index >= 0) edges.splice(index, 1);
        break;
      }
    }
  }
  return {
    nodes: [...nodes.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    edges: edges.sort((a, b) =>
      `${a.from}:${a.fromPort}→${a.to}:${a.toPort}` < `${b.from}:${b.fromPort}→${b.to}:${b.toPort}` ? -1 : 1,
    ),
  };
}

function portLabel(node: CanvasGraphNode | undefined, port: string): string {
  const match = node?.inputs.find((p) => p.name === port) ?? node?.outputs.find((p) => p.name === port);
  return match ? `${port} (${match.mediaType})` : port;
}

/** Build human-readable diff lines (before → after) for one patch. Pure. */
export function describePatchDiff(base: CanvasGraph, ops: readonly CanvasPatchOp[]): string[] {
  const byId = new Map(base.nodes.map((n) => [n.id, n]));
  return ops.map((op) => {
    switch (op.kind) {
      case "add-node":
        return `+ node ${op.node.id} [${op.node.kind}] "${op.node.label}"`;
      case "remove-node": {
        const node = byId.get(op.nodeId);
        return `− node ${op.nodeId}${node ? ` [${node.kind}] "${node.label}"` : ""} (attached edges removed)`;
      }
      case "set-params": {
        const node = byId.get(op.nodeId);
        const before = node ? JSON.stringify(node.params) : "?";
        return `~ node ${op.nodeId} params ${before} → ${JSON.stringify(op.params)}`;
      }
      case "add-edge":
        return `+ edge ${op.from}:${portLabel(byId.get(op.from), op.fromPort)} → ${op.to}:${portLabel(byId.get(op.to), op.toPort)}`;
      case "remove-edge":
        return `− edge ${op.from}:${op.fromPort} → ${op.to}:${op.toPort}`;
    }
  });
}

export interface ProposePatchInput {
  runId: string;
  planRevision: number;
  base: CanvasGraph;
  ops: readonly CanvasPatchOp[];
  compiler: AgentCompilerPort;
  now: string;
}

export interface ProposedPatch {
  patch: CanvasPatch;
  patched: CanvasGraph;
}

/**
 * Validate, apply and compile-check a patch. The patched graph must
 * compile or the patch is rejected with node/port diagnostics — patch
 * proposals never bypass the compiler.
 */
export function proposePatch(input: ProposePatchInput): ProposedPatch {
  validatePatchOps(input.base, input.ops);
  const patched = applyPatchOps(input.base, input.ops);
  const validation = input.compiler.validateGraph(patched);
  if (!validation.ok) {
    const first = validation.diagnostics[0];
    throw agentError(
      "BAD_REQUEST",
      `Canvas patch does not compile: ${first.code}${first.nodeId ? ` at ${first.nodeId}` : ""} — ${first.message}`,
      { diagnostics: validation.diagnostics.slice(0, 5) },
    );
  }
  const baseHash = input.compiler.hashGraph(input.base).sha256;
  const resultingHash = input.compiler.hashGraph(patched).sha256;
  if (baseHash === resultingHash) {
    throw agentError("BAD_REQUEST", "Canvas patch is a no-op: resulting graph hash matches the base.");
  }
  const patch: CanvasPatch = Object.freeze({
    patchId: randomUUID(),
    runId: input.runId,
    planRevision: input.planRevision,
    baseGraphHash: baseHash,
    ops: [...input.ops],
    resultingHash,
    diff: describePatchDiff(input.base, input.ops),
    createdAt: input.now,
  }) as CanvasPatch;
  return { patch, patched };
}
