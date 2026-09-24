/**
 * STUDIO_13 — Canvas UI types (client-safe: contracts/graph only, no
 * server imports). The workspace edits authoring state; execution always
 * goes through a compiled revision selected in the version menu.
 */

import type {
  CanvasCompilerState,
  CanvasGraph,
  CanvasGraphEdge,
  CanvasGraphNode,
  CanvasMediaType,
  CompilerDiagnostic,
  WorkflowAppDefinition,
} from "@ethen/studio-core/contracts";

export type { CanvasCompilerState, CanvasGraph, CanvasGraphEdge, CanvasGraphNode, CompilerDiagnostic, WorkflowAppDefinition };
export type { CanvasMediaType };

export type CanvasRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "RECONCILING";

export type CanvasNodeRunStatus =
  | "PENDING"
  | "QUEUED"
  | "RUNNING"
  | "REUSED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "SKIPPED";

export interface CanvasNodeProjection {
  nodeId: string;
  status: CanvasNodeRunStatus;
  cacheHit: boolean;
  settledIcu: number | null;
  error: string | null;
}

export interface CanvasRunProjection {
  runId: string;
  status: CanvasRunStatus;
  summary: string;
  nodes: Record<string, CanvasNodeProjection>;
  completedNodes: number;
  totalNodes: number;
  actualIcu: number;
}

export interface CanvasRevisionSummary {
  revision: number;
  sha256: string;
  nodeCount: number;
  dagHash: string | null;
  createdAt: string;
}

export interface CanvasGraphSummary {
  graphId: string;
  headRevision: number;
  nodeCount: number;
  updatedAt: string;
}

export interface CanvasEstimate {
  perNodeIcu: Record<string, number>;
  totalIcu: number;
  budgetIcu: number;
  withinBudget: boolean;
}

export interface CanvasPreview {
  nodeId: string;
  mediaType: string;
  label: string;
  assetId: string | null;
  /** Human-readable state when no preview is available yet. */
  emptyLabel: string;
}

export type CanvasView =
  | { mode: "graph" }
  | { mode: "list" };

export interface CanvasWorkspaceState {
  view: CanvasView;
  selectedNodeId: string | null;
  inspectedNodeId: string | null;
  selectedRevision: number | null;
  runId: string | null;
  compareRevision: number | null;
}

export const CANVAS_RUN_STATUS_LABELS: Record<CanvasRunStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCEL_REQUESTED: "Cancel requested",
  CANCELLED: "Cancelled",
  RECONCILING: "Reconciling",
};

export const CANVAS_NODE_STATUS_LABELS: Record<CanvasNodeRunStatus, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  RUNNING: "Running",
  REUSED: "Reused from cache",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  SKIPPED: "Skipped",
};
