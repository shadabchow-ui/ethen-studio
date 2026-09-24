/**
 * Studio V5 node registry — supported authoring kinds (STUDIO_12).
 * Supports task, transform, select/branch over validated inputs, bounded
 * map and composition expansion. No code-node, scheduling-node or
 * arbitrary runtime loop support.
 */
import { isTaskName, type TaskName } from "../../../contracts/tasks";
import type { CanvasGraphNode, CanvasNodeKind, CompilerDiagnostic } from "../../../contracts/graph";
import { FORBIDDEN_NODE_KINDS } from "../../../contracts/graph";

export interface NodeKindDescriptor {
  kind: CanvasNodeKind;
  label: string;
  description: string;
  requiresTask: boolean;
  requiresOperator: boolean;
  allowsChildren: boolean;
}

const DESCRIPTORS: Record<CanvasNodeKind, NodeKindDescriptor> = {
  task: {
    kind: "task",
    label: "Task",
    description: "One canonical registry task with pinned task/schema versions.",
    requiresTask: true,
    requiresOperator: false,
    allowsChildren: false,
  },
  transform: {
    kind: "transform",
    label: "Transform",
    description: "Deterministic local transform over validated inputs (no provider call).",
    requiresTask: false,
    requiresOperator: true,
    allowsChildren: false,
  },
  select: {
    kind: "select",
    label: "Select",
    description: "Select one validated input branch by named condition.",
    requiresTask: false,
    requiresOperator: true,
    allowsChildren: false,
  },
  branch: {
    kind: "branch",
    label: "Branch",
    description: "Bounded branch over validated inputs with child bodies.",
    requiresTask: false,
    requiresOperator: true,
    allowsChildren: true,
  },
  map: {
    kind: "map",
    label: "Map",
    description: "Bounded map over a validated list input (fanout capped).",
    requiresTask: false,
    requiresOperator: true,
    allowsChildren: true,
  },
  composition: {
    kind: "composition",
    label: "Composition",
    description: "Named composition expanded deterministically into child nodes.",
    requiresTask: false,
    requiresOperator: true,
    allowsChildren: true,
  },
  input: {
    kind: "input",
    label: "Input",
    description: "Workflow input binding exposed to the App form contract.",
    requiresTask: false,
    requiresOperator: false,
    allowsChildren: false,
  },
  output: {
    kind: "output",
    label: "Output",
    description: "Workflow output binding exposed to the App form contract.",
    requiresTask: false,
    requiresOperator: false,
    allowsChildren: false,
  },
};

/** Named operators the registry knows how to expand/validate. */
export const KNOWN_TRANSFORM_OPERATORS = ["passthrough", "pick", "concat-text", "rename-port"] as const;
export const KNOWN_SELECT_OPERATORS = ["first-valid", "by-name"] as const;
export const KNOWN_BRANCH_OPERATORS = ["by-name", "condition"] as const;
export const KNOWN_MAP_OPERATORS = ["over-list"] as const;
/** export.deliver is a composition, never a canonical task family. */
export const KNOWN_COMPOSITION_OPERATORS = ["export.deliver", "sequence", "fanout-join"] as const;

export function describeNodeKind(kind: CanvasNodeKind): NodeKindDescriptor {
  return DESCRIPTORS[kind];
}

export function knownOperatorFor(kind: CanvasNodeKind, operator: string): boolean {
  switch (kind) {
    case "transform":
      return (KNOWN_TRANSFORM_OPERATORS as readonly string[]).includes(operator);
    case "select":
      return (KNOWN_SELECT_OPERATORS as readonly string[]).includes(operator);
    case "branch":
      return (KNOWN_BRANCH_OPERATORS as readonly string[]).includes(operator);
    case "map":
      return (KNOWN_MAP_OPERATORS as readonly string[]).includes(operator);
    case "composition":
      return (KNOWN_COMPOSITION_OPERATORS as readonly string[]).includes(operator);
    default:
      return false;
  }
}

/**
 * Reject forbidden kinds (code/schedule/loop) with a node-specific
 * diagnostic. Unknown kind strings are reported as invalid params.
 */
export function checkNodeKind(node: {
  id: string;
  kind: string;
}): CompilerDiagnostic | null {
  if ((FORBIDDEN_NODE_KINDS as readonly string[]).includes(node.kind)) {
    return {
      code: "FORBIDDEN_KIND",
      message: `Node ${node.id}: kind "${node.kind}" is not supported (no custom code or scheduling nodes).`,
      nodeId: node.id,
      port: null,
    };
  }
  if (!(node.kind in DESCRIPTORS)) {
    return {
      code: "INVALID_PARAM",
      message: `Node ${node.id}: unknown kind "${node.kind}".`,
      nodeId: node.id,
      port: null,
    };
  }
  return null;
}

/** Validate task/operator references on a node. Pure. */
export function checkNodeReference(node: CanvasGraphNode): CompilerDiagnostic | null {
  const descriptor = DESCRIPTORS[node.kind];
  if (descriptor.requiresTask) {
    if (!node.task || !isTaskName(node.task)) {
      return {
        code: "UNKNOWN_TASK",
        message: `Node ${node.id}: unknown or missing task "${node.task ?? ""}".`,
        nodeId: node.id,
        port: null,
      };
    }
  }
  if (descriptor.requiresOperator) {
    if (!node.operator || !knownOperatorFor(node.kind, node.operator)) {
      return {
        code: "UNKNOWN_OPERATOR",
        message: `Node ${node.id}: unknown or missing operator "${node.operator ?? ""}" for kind "${node.kind}".`,
        nodeId: node.id,
        port: null,
      };
    }
  }
  if (!descriptor.allowsChildren && node.children && node.children.length > 0) {
    return {
      code: "INVALID_PARAM",
      message: `Node ${node.id}: kind "${node.kind}" does not accept child nodes.`,
      nodeId: node.id,
      port: null,
    };
  }
  return null;
}

export function taskOf(node: CanvasGraphNode): TaskName | null {
  return node.task && isTaskName(node.task) ? node.task : null;
}
