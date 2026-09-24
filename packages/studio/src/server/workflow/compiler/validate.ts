/**
 * Studio V5 Canvas compiler — graph validation (STUDIO_12).
 * Rejects cycles, incompatible media/units, missing inputs, dangling
 * edges, invalid fanout and node-limit breaches with node/port-specific
 * diagnostics. Pure.
 */
import type {
  CanvasGraph,
  CanvasGraphNode,
  CompilerDiagnostic,
  TypedPort,
} from "../../../contracts/graph";
import { checkNodeKind, checkNodeReference } from "../registry/nodes";

/** Default per-workspace node cap; explicit workspace maximum is higher. */
export const DEFAULT_MAX_NODES = 10;
/** Absolute workspace maximum node count. */
export const ABSOLUTE_MAX_NODES = 50;
/** Maximum outgoing edges per node (map fanout bound). */
export const MAX_FANOUT = 10;

export interface ValidateOptions {
  /** Workspace node cap; defaults to DEFAULT_MAX_NODES, never above absolute max. */
  maxNodes?: number;
}

export interface ValidationSuccess {
  ok: true;
  /** Deterministic topological order (lexicographic tie-break). */
  order: string[];
}

export interface ValidationFailure {
  ok: false;
  diagnostics: CompilerDiagnostic[];
}

export type GraphValidation = ValidationSuccess | ValidationFailure;

function portByName(ports: readonly TypedPort[], name: string): TypedPort | null {
  return ports.find((p) => p.name === name) ?? null;
}

function mediaCompatible(from: string, to: string): boolean {
  if (from === to) return true;
  // Asset references may feed typed media ports after custody checks,
  // and any concrete media may bind to an asset-accepting port.
  if (from === "asset" || to === "asset") return true;
  return false;
}

export function validateGraph(graph: CanvasGraph, options: ValidateOptions = {}): GraphValidation {
  const diagnostics: CompilerDiagnostic[] = [];
  const maxNodes = Math.min(options.maxNodes ?? DEFAULT_MAX_NODES, ABSOLUTE_MAX_NODES);

  if (graph.nodes.length > maxNodes) {
    diagnostics.push({
      code: "NODE_LIMIT",
      message: `Graph has ${graph.nodes.length} nodes; workspace cap is ${maxNodes} (absolute max ${ABSOLUTE_MAX_NODES}).`,
      nodeId: null,
      port: null,
    });
  }

  const byId = new Map<string, CanvasGraphNode>();
  for (const node of graph.nodes) {
    if (!node.id?.trim()) {
      diagnostics.push({ code: "UNKNOWN_NODE", message: "Every node needs an id.", nodeId: null, port: null });
      continue;
    }
    if (byId.has(node.id)) {
      diagnostics.push({
        code: "DUPLICATE_NODE",
        message: `Duplicate node ${node.id}.`,
        nodeId: node.id,
        port: null,
      });
      continue;
    }
    byId.set(node.id, node);
    const kindDiag = checkNodeKind({ id: node.id, kind: node.kind as string });
    if (kindDiag) {
      diagnostics.push(kindDiag);
      continue;
    }
    const refDiag = checkNodeReference(node);
    if (refDiag) diagnostics.push(refDiag);
  }

  const fanout = new Map<string, number>();
  for (const node of graph.nodes) fanout.set(node.id, 0);
  const fedPorts = new Set<string>();
  for (const edge of graph.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      diagnostics.push({
        code: "DANGLING_EDGE",
        message: `Edge ${edge.from}:${edge.fromPort} -> ${edge.to}:${edge.toPort} dangles.`,
        nodeId: !from ? edge.from : edge.to,
        port: !from ? edge.fromPort : edge.toPort,
      });
      continue;
    }
    if (edge.from === edge.to) {
      diagnostics.push({
        code: "SELF_EDGE",
        message: `Node ${edge.from} has a self edge.`,
        nodeId: edge.from,
        port: edge.fromPort,
      });
      continue;
    }
    fanout.set(edge.from, (fanout.get(edge.from) ?? 0) + 1);
    const outPort = portByName(from.outputs, edge.fromPort);
    const inPort = portByName(to.inputs, edge.toPort);
    if (!outPort) {
      diagnostics.push({
        code: "UNKNOWN_NODE",
        message: `Node ${edge.from} has no output port "${edge.fromPort}".`,
        nodeId: edge.from,
        port: edge.fromPort,
      });
      continue;
    }
    if (!inPort) {
      diagnostics.push({
        code: "UNKNOWN_NODE",
        message: `Node ${edge.to} has no input port "${edge.toPort}".`,
        nodeId: edge.to,
        port: edge.toPort,
      });
      continue;
    }
    fedPorts.add(`${edge.to}:${edge.toPort}`);
    if (!mediaCompatible(outPort.mediaType, inPort.mediaType)) {
      diagnostics.push({
        code: "TYPE_MISMATCH",
        message:
          `Edge ${edge.from}:${edge.fromPort} (${outPort.mediaType}) -> ` +
          `${edge.to}:${edge.toPort} (${inPort.mediaType}): incompatible media types.`,
        nodeId: edge.to,
        port: edge.toPort,
      });
    } else if (outPort.unit !== inPort.unit) {
      diagnostics.push({
        code: "UNIT_MISMATCH",
        message:
          `Edge ${edge.from}:${edge.fromPort} (unit ${outPort.unit ?? "unitless"}) -> ` +
          `${edge.to}:${edge.toPort} (unit ${inPort.unit ?? "unitless"}): incompatible units.`,
        nodeId: edge.to,
        port: edge.toPort,
      });
    }
  }

  for (const [id, count] of fanout) {
    if (count > MAX_FANOUT) {
      diagnostics.push({
        code: "FANOUT_LIMIT",
        message: `Node ${id} has fanout ${count}; maximum is ${MAX_FANOUT}.`,
        nodeId: id,
        port: null,
      });
    }
  }

  // Required inputs must be fed by exactly one edge (except graph input
  // bindings, which the App form contract supplies at invocation).
  for (const node of graph.nodes) {
    if (node.kind === "input") continue;
    for (const port of node.inputs) {
      if (port.required && !fedPorts.has(`${node.id}:${port.name}`)) {
        diagnostics.push({
          code: "MISSING_INPUT",
          message: `Node ${node.id} is missing required input "${port.name}".`,
          nodeId: node.id,
          port: port.name,
        });
      }
    }
  }

  // Cycle detection with deterministic order (Kahn's, lexicographic).
  const order = topoOrder(graph, byId);
  if (order === null) {
    diagnostics.push({
      code: "CYCLE",
      message: `Graph contains a cycle: ${findCyclePath(graph, byId)}.`,
      nodeId: null,
      port: null,
    });
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, order: order as string[] };
}

function topoOrder(
  graph: CanvasGraph,
  byId: ReadonlyMap<string, CanvasGraphNode>,
): string[] | null {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of byId.keys()) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of graph.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    if (edge.from === edge.to) continue;
    outgoing.get(edge.from)?.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }
  const ready = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const next of (outgoing.get(id) ?? []).sort()) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  return order.length === byId.size ? order : null;
}

function findCyclePath(
  graph: CanvasGraph,
  byId: ReadonlyMap<string, CanvasGraphNode>,
): string {
  const outgoing = new Map<string, string[]>();
  for (const id of byId.keys()) outgoing.set(id, []);
  for (const edge of graph.edges) {
    if (byId.has(edge.from) && byId.has(edge.to)) outgoing.get(edge.from)?.push(edge.to);
  }
  const visited = new Set<string>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  const visit = (id: string): string | null => {
    if (inStack.has(id)) return [...stack.slice(stack.indexOf(id)), id].join(" -> ");
    if (visited.has(id)) return null;
    visited.add(id);
    stack.push(id);
    inStack.add(id);
    for (const next of (outgoing.get(id) ?? []).sort()) {
      const hit = visit(next);
      if (hit) return hit;
    }
    stack.pop();
    inStack.delete(id);
    return null;
  };
  for (const id of [...byId.keys()].sort()) {
    const hit = visit(id);
    if (hit) return hit;
  }
  return "(unresolved)";
}

/**
 * Dirty downstream closure: changed nodes plus every transitive
 * downstream dependent. Recovered from canvas-workflow recompute
 * semantics; pure given the graph.
 */
export function dirtyDownstreamClosure(
  graph: Pick<CanvasGraph, "nodes" | "edges">,
  changedNodeIds: readonly string[],
): string[] {
  const downstream = new Map<string, Set<string>>();
  for (const node of graph.nodes) downstream.set(node.id, new Set());
  for (const edge of graph.edges) downstream.get(edge.from)?.add(edge.to);
  const dirty = new Set<string>();
  const queue: string[] = [];
  for (const id of changedNodeIds) {
    if (downstream.has(id) && !dirty.has(id)) {
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
  return [...dirty].sort();
}
