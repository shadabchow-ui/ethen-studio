/**
 * Studio V5 kernel — browser-safe Canvas graph authoring types (STUDIO_12
 * additive types through the STUDIO_01 contracts seam; no server imports).
 *
 * The visual graph is editable authoring state. Only a validated compiled
 * DAG executes. These types are shared by authoring UI, the compiler and
 * the Workflow→App contract; the compiler itself is server-only.
 */

/** Authoring node kinds. No code-node or scheduling-node support. */
export const CANVAS_NODE_KINDS = [
  "task",
  "transform",
  "select",
  "branch",
  "map",
  "composition",
  "input",
  "output",
] as const;
export type CanvasNodeKind = (typeof CANVAS_NODE_KINDS)[number];

export function isCanvasNodeKind(value: string): value is CanvasNodeKind {
  return (CANVAS_NODE_KINDS as readonly string[]).includes(value);
}

/** Node kinds that must never compile (explicit rejection, not silent skip). */
export const FORBIDDEN_NODE_KINDS = ["code", "schedule", "loop"] as const;

/** Media types carried on typed ports. */
export const CANVAS_MEDIA_TYPES = [
  "image",
  "video",
  "audio",
  "speech",
  "music",
  "text",
  "timeline",
  "document",
  "asset",
  "job",
  "evaluation",
  "export",
  "none",
] as const;
export type CanvasMediaType = (typeof CANVAS_MEDIA_TYPES)[number];

/** Physical/logical unit carried on typed ports (null = unitless). */
export type CanvasPortUnit = string | null;

/** A typed port on an authoring node. */
export interface TypedPort {
  name: string;
  mediaType: string;
  unit: CanvasPortUnit;
  required: boolean;
  /** Human-readable label for accessible port rendering. */
  label: string;
}

/** Authoring node: editable state, never executed directly. */
export interface CanvasGraphNode {
  id: string;
  kind: CanvasNodeKind;
  /** Canonical `<family>.<verb>` task for kind=task; null otherwise. */
  task: string | null;
  /** Named transform/select/branch/map/composition operator. */
  operator: string | null;
  /** Namespaced, schema-validated parameters (normalized at compile). */
  params: Record<string, unknown>;
  inputs: readonly TypedPort[];
  outputs: readonly TypedPort[];
  /** Accessible node label for UI consumers. */
  label: string;
  /** Branch/map/composition child graph (expanded deterministically). */
  children: readonly CanvasGraphNode[] | null;
  /** Child edges for branch/map/composition bodies. */
  childEdges: readonly CanvasGraphEdge[] | null;
}

export interface CanvasGraphEdge {
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}

/** Editable authoring graph (one revision payload). */
export interface CanvasGraph {
  nodes: readonly CanvasGraphNode[];
  edges: readonly CanvasGraphEdge[];
}

/** Immutable revision pointer: content-addressed by canonical SHA-256. */
export interface GraphRevision {
  graphId: string;
  revision: number;
  /** Canonical JSON bytes that were hashed (key-order normalized). */
  canonicalJson: string;
  /** SHA-256 hex of canonicalJson. */
  sha256: string;
  nodeCount: number;
  createdAt: string;
}

export type CompilerDiagnosticCode =
  | "CYCLE"
  | "UNKNOWN_NODE"
  | "DANGLING_EDGE"
  | "SELF_EDGE"
  | "DUPLICATE_NODE"
  | "MISSING_INPUT"
  | "TYPE_MISMATCH"
  | "UNIT_MISMATCH"
  | "UNKNOWN_TASK"
  | "UNKNOWN_OPERATOR"
  | "UNSUPPORTED_SCHEMA"
  | "FORBIDDEN_KIND"
  | "NODE_LIMIT"
  | "FANOUT_LIMIT"
  | "MISSING_PIN"
  | "UNAUTHORIZED_ASSET"
  | "INVALID_PARAM"
  | "APP_SCHEMA_MISMATCH";

/** Node/port-specific compiler error for adjacent-to-node UI display. */
export interface CompilerDiagnostic {
  code: CompilerDiagnosticCode;
  message: string;
  nodeId: string | null;
  port: string | null;
}

/** Endpoint resolution snapshot pinned at compile time (from j06 routing). */
export interface EndpointResolutionSnapshot {
  endpointId: string;
  mode: "explicit" | "auto";
  reason: string;
  exclusions: readonly string[];
  resolvedAt: string;
}

/** Policy inputs the compiler threads into every compiled node. */
export interface CompilerPolicyInputs {
  policyProfile: string;
  consentIds: readonly string[];
  rightsSnapshotId: string | null;
  identityBindingId: string | null;
}

/** Per-node estimate inputs emitted by the compiler for j13/consumers. */
export interface CompiledNodeEstimate {
  nodeId: string;
  task: string;
  endpointId: string;
  parameters: Record<string, unknown>;
  accessibleLabel: string;
}

/**
 * Frozen Workflow→App form contract: graph version plus form input/output
 * schema, owner and private-workspace permissions.
 */
export interface WorkflowAppFormField {
  name: string;
  mediaType: string;
  unit: CanvasPortUnit;
  required: boolean;
  label: string;
  description: string;
}

export interface WorkflowAppDefinition {
  appId: string;
  graphId: string;
  /** Frozen compiled DAG hash this app invokes (immutable). */
  frozenDagHash: string;
  frozenRevision: number;
  inputs: readonly WorkflowAppFormField[];
  outputs: readonly WorkflowAppFormField[];
  ownerId: string;
  /** Private workspace distribution first; never public by default. */
  visibility: "private-workspace";
  permissions: {
    invoke: readonly string[];
    manage: readonly string[];
  };
}

/** Explicit typed compiler states for UI consumers. */
export type CanvasCompilerState =
  | { status: "empty" }
  | { status: "editing"; nodeCount: number }
  | { status: "compiling" }
  | { status: "valid"; dagHash: string; nodeCount: number; expandedUnits: number }
  | { status: "invalid"; diagnostics: readonly CompilerDiagnostic[] }
  | { status: "blocked"; reason: string };
