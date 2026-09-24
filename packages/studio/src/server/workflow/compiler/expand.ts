/**
 * Studio V5 Canvas compiler — deterministic expansion + compile (STUDIO_12).
 * Compiles a validated authoring graph into an immutable WorkflowIR DAG
 * with task/schema/endpoint pins, endpoint resolution snapshots, policy
 * inputs and a budget envelope. select/branch/map/composition bodies are
 * expanded deterministically (sorted, bounded); every expanded unit is
 * estimated before approval by consumers.
 */
import {
  STUDIO_WORKFLOW_IR_VERSION,
  DEFAULT_VERSION_PINS,
  type VersionPins,
} from "../../../contracts/versions";
import type { TaskName } from "../../../contracts/tasks";
import type { ProjectScope } from "../../../contracts/scope";
import { asIcu, ZERO_ICU, type IcuAmount } from "../../../contracts/money";
import type {
  CanvasGraph,
  CanvasGraphNode,
  CompiledNodeEstimate,
  CompilerDiagnostic,
  CompilerPolicyInputs,
  EndpointResolutionSnapshot,
} from "../../../contracts/graph";
import type {
  WorkflowIR,
  WorkflowNode,
  WorkflowPortRef,
} from "../../../contracts/workflow";
import { canonicalSha256 } from "./canonical";
import { ABSOLUTE_MAX_NODES, MAX_FANOUT, validateGraph } from "./validate";
import { taskOf } from "../registry/nodes";

export interface CompileEndpointResolver {
  /**
   * Resolve the endpoint for a task node. Explicit pins must never be
   * silently changed; auto resolutions record reason + exclusions.
   * Throwing aborts compilation with an UNSUPPORTED_SCHEMA diagnostic.
   */
  resolve(task: TaskName, params: Readonly<Record<string, unknown>>): EndpointResolutionSnapshot;
}

export interface CompileOptions {
  scope: ProjectScope;
  graphId: string;
  revision: number;
  policy: CompilerPolicyInputs;
  endpoints: CompileEndpointResolver;
  pins?: VersionPins;
  /** Per-node budget in ICU (integer); envelope sums expanded units. */
  budgetPerNodeIcu?: number;
  maxNodes?: number;
}

export interface CompileSuccess {
  ok: true;
  ir: WorkflowIR;
  /** Canonical JSON of the authoring graph that was hashed. */
  canonicalJson: string;
  dagHash: string;
  estimates: CompiledNodeEstimate[];
  expandedUnits: number;
}

export interface CompileFailure {
  ok: false;
  diagnostics: CompilerDiagnostic[];
}

export type CompileResult = CompileSuccess | CompileFailure;

function portRefs(
  node: CanvasGraphNode,
  ports: readonly { name: string; mediaType: string; unit: string | null }[],
): WorkflowPortRef[] {
  return ports.map((p) => ({ nodeId: node.id, port: p.name, mediaType: p.mediaType, unit: p.unit }));
}

/** Normalize params for hashing/identity: canonical-JSON round-trip. */
export function normalizeParams(params: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
}

function accessibleLabel(node: CanvasGraphNode): string {
  const base = node.label?.trim() || `${node.kind} ${node.id}`;
  if (node.kind === "task" && node.task) return `${base} (${node.task})`;
  if (node.operator) return `${base} (${node.operator})`;
  return base;
}

interface ExpandedUnit {
  node: WorkflowNode;
  estimate: CompiledNodeEstimate;
}

export function compileGraph(graph: CanvasGraph, options: CompileOptions): CompileResult {
  const validation = validateGraph(graph, { maxNodes: options.maxNodes });
  if (!validation.ok) return { ok: false, diagnostics: validation.diagnostics };

  const diagnostics: CompilerDiagnostic[] = [];
  const pins = options.pins ?? DEFAULT_VERSION_PINS;
  if (!pins.taskSchemaVersion || !pins.endpointSchemaVersion || !pins.priceVersion || !pins.adapterVersion) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "MISSING_PIN",
          message: "Every compile requires task/schema/price/adapter pins.",
          nodeId: null,
          port: null,
        },
      ],
    };
  }

  const units: ExpandedUnit[] = [];
  for (const id of validation.order) {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) continue;
    try {
      units.push(...expandNode(node, graph, options, pins));
    } catch (error) {
      diagnostics.push({
        code: "UNSUPPORTED_SCHEMA",
        message: `Node ${id}: ${error instanceof Error ? error.message : String(error)}`,
        nodeId: id,
        port: null,
      });
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  if (units.length > ABSOLUTE_MAX_NODES) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "NODE_LIMIT",
          message: `Expansion yields ${units.length} units; absolute max is ${ABSOLUTE_MAX_NODES}.`,
          nodeId: null,
          port: null,
        },
      ],
    };
  }

  const perNode = options.budgetPerNodeIcu ?? 0;
  const envelope = asIcu(perNode * units.length);
  const compiledAt = new Date().toISOString();
  const irCore = {
    irVersion: STUDIO_WORKFLOW_IR_VERSION,
    graphRevisionId: `${options.graphId}:r${options.revision}`,
    scope: options.scope,
    nodes: units.map((u) => u.node),
    budgetEnvelopeIcu: envelope,
    compiledAt,
  };
  const { sha256 } = canonicalSha256(irCore);
  const ir: WorkflowIR = { ...irCore, dagHashSha256: sha256 };
  const { canonical } = canonicalSha256({ nodes: graph.nodes, edges: graph.edges });

  return {
    ok: true,
    ir,
    canonicalJson: canonical,
    dagHash: sha256,
    estimates: units.map((u) => u.estimate),
    expandedUnits: units.length,
  };
}

function expandNode(
  node: CanvasGraphNode,
  graph: CanvasGraph,
  options: CompileOptions,
  pins: VersionPins,
): ExpandedUnit[] {
  switch (node.kind) {
    case "task":
      return [compileTaskNode(node, graph, options, pins, node.id)];
    case "transform":
    case "select":
      // Local operators compile to pinned pass-through units (no
      // provider dispatch); execution still flows through the DAG only.
      return [compileLocalNode(node, graph, options, pins, node.id)];
    case "branch":
    case "map":
    case "composition":
      return expandComposite(node, graph, options, pins);
    case "input":
    case "output":
      return [compileLocalNode(node, graph, options, pins, node.id)];
  }
}

function incomingRefs(node: CanvasGraphNode, graph: CanvasGraph): WorkflowPortRef[] {
  const refs: WorkflowPortRef[] = [];
  for (const edge of graph.edges) {
    if (edge.to !== node.id) continue;
    const from = graph.nodes.find((n) => n.id === edge.from);
    const outPort = from?.outputs.find((p) => p.name === edge.fromPort);
    refs.push({
      nodeId: edge.from,
      port: edge.fromPort,
      mediaType: outPort?.mediaType ?? "none",
      unit: outPort?.unit ?? null,
    });
  }
  return refs.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
}

function compileTaskNode(
  node: CanvasGraphNode,
  graph: CanvasGraph,
  options: CompileOptions,
  pins: VersionPins,
  unitId: string,
): ExpandedUnit {
  const task = taskOf(node);
  if (!task) throw new Error(`unknown task "${node.task ?? ""}"`);
  const snapshot = options.endpoints.resolve(task, node.params);
  const parameters = normalizeParams(node.params);
  const workflowNode: WorkflowNode = {
    nodeId: unitId,
    task,
    pins: { ...pins },
    endpointId: snapshot.endpointId,
    parameters,
    inputs: incomingRefs(node, graph),
    outputs: portRefs(node, node.outputs),
    identityBindingId: options.policy.identityBindingId,
    policyProfile: options.policy.policyProfile,
    budgetIcu: asIcu(options.budgetPerNodeIcu ?? 0),
  };
  return {
    node: workflowNode,
    estimate: {
      nodeId: unitId,
      task,
      endpointId: snapshot.endpointId,
      parameters: { ...parameters },
      accessibleLabel: accessibleLabel(node),
    },
  };
}

function compileLocalNode(
  node: CanvasGraphNode,
  graph: CanvasGraph,
  options: CompileOptions,
  pins: VersionPins,
  unitId: string,
): ExpandedUnit {
  // Local/binding units carry full pins and policy profile so cache
  // identity and audit treat every unit uniformly.
  const workflowNode: WorkflowNode = {
    nodeId: unitId,
    task: "agent.invoke",
    pins: { ...pins },
    endpointId: `local:${node.kind}${node.operator ? `:${node.operator}` : ""}`,
    parameters: { ...normalizeParams(node.params), __localKind: node.kind, __operator: node.operator },
    inputs: incomingRefs(node, graph),
    outputs: portRefs(node, node.outputs),
    identityBindingId: options.policy.identityBindingId,
    policyProfile: options.policy.policyProfile,
    budgetIcu: ZERO_ICU,
  };
  return {
    node: workflowNode,
    estimate: {
      nodeId: unitId,
      task: "agent.invoke",
      endpointId: workflowNode.endpointId,
      parameters: { ...normalizeParams(node.params) },
      accessibleLabel: accessibleLabel(node),
    },
  };
}

function expandComposite(
  node: CanvasGraphNode,
  graph: CanvasGraph,
  options: CompileOptions,
  pins: VersionPins,
): ExpandedUnit[] {
  const children = [...(node.children ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (node.kind === "map") {
    const items = listParam(node.params.items);
    if (items.length > MAX_FANOUT) {
      throw new Error(`map fanout ${items.length} exceeds maximum ${MAX_FANOUT}`);
    }
    // Deterministic: one expanded unit per item × child, sorted.
    const units: ExpandedUnit[] = [];
    const sortedItems = [...items].sort();
    for (const item of sortedItems) {
      for (const child of children) {
        const unitId = `${node.id}[${item}]/${child.id}`;
        units.push(...expandChildAsUnit(child, node, graph, options, pins, unitId, { __mapItem: item }));
      }
    }
    if (units.length === 0) {
      // Empty map still compiles to a single join unit so downstream
      // edges resolve deterministically.
      units.push(compileLocalNode(node, graph, options, pins, node.id));
    }
    return units;
  }
  if (children.length === 0) return [compileLocalNode(node, graph, options, pins, node.id)];
  const units: ExpandedUnit[] = [];
  for (const child of children) {
    units.push(...expandChildAsUnit(child, node, graph, options, pins, `${node.id}/${child.id}`, null));
  }
  return units;
}

function expandChildAsUnit(
  child: CanvasGraphNode,
  parent: CanvasGraphNode,
  graph: CanvasGraph,
  options: CompileOptions,
  pins: VersionPins,
  unitId: string,
  extraParams: Record<string, unknown> | null,
): ExpandedUnit[] {
  const effective: CanvasGraphNode =
    extraParams === null ? child : { ...child, params: { ...child.params, ...extraParams } };
  if (effective.kind === "task") return [compileTaskNode(effective, graph, options, pins, unitId)];
  if (effective.kind === "branch" || effective.kind === "map" || effective.kind === "composition") {
    return expandComposite({ ...effective, id: unitId }, graph, options, pins);
  }
  return [compileLocalNode(effective, graph, options, pins, unitId)];
}

function listParam(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export type { IcuAmount };
