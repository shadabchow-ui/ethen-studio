/** Studio V5 canvas run event projection (STUDIO_13). Pure. */
import "server-only";
import {
  workflowRunStatusLabel,
  type NodeRunStatus,
  type WorkflowRunEvent,
  type WorkflowRunStatus,
} from "./types";

export interface NodeProjection {
  nodeId: string;
  status: NodeRunStatus;
  cacheHit: boolean;
  settledIcu: number | null;
  error: string | null;
  updatedAt: string | null;
}

export interface RunProjection {
  runId: string;
  status: WorkflowRunStatus;
  nodes: Readonly<Record<string, NodeProjection>>;
  completedNodes: number;
  totalNodes: number;
  actualIcu: number;
  finishedAt: string | null;
  /** Accessible one-line summary for the run tray. */
  summary: string;
}

/**
 * Fold append-only run events into the UI projection. Unknown event types
 * are ignored (forward-compatible); replaying the same log twice yields
 * the same projection (idempotent fold).
 */
export function projectRunEvents(
  runId: string,
  events: readonly WorkflowRunEvent[],
  nodeIds: readonly string[],
): RunProjection {
  const nodes: Record<string, NodeProjection> = {};
  for (const nodeId of nodeIds) {
    nodes[nodeId] = {
      nodeId,
      status: "PENDING",
      cacheHit: false,
      settledIcu: null,
      error: null,
      updatedAt: null,
    };
  }
  let status: WorkflowRunStatus = "QUEUED";
  let actualIcu = 0;
  let finishedAt: string | null = null;
  const ordered = [...events]
    .filter((event) => event.runId === runId)
    .sort((a, b) => a.seq - b.seq);
  // Idempotent fold: a redelivered (runId, seq) applies exactly once.
  const seen = new Set<number>();
  for (const event of ordered) {
    if (seen.has(event.seq)) continue;
    seen.add(event.seq);
    switch (event.type) {
      case "run.started":
        if (status === "QUEUED") status = "RUNNING";
        break;
      case "run.completed":
        status = "COMPLETED";
        finishedAt = event.at;
        break;
      case "run.failed":
        status = "FAILED";
        finishedAt = event.at;
        break;
      case "run.cancel_requested":
        if (status === "QUEUED" || status === "RUNNING") status = "CANCEL_REQUESTED";
        break;
      case "run.cancelled":
        status = "CANCELLED";
        finishedAt = event.at;
        break;
      case "run.recovered":
        if (status !== "COMPLETED" && status !== "FAILED" && status !== "CANCELLED") status = "RUNNING";
        break;
      case "node.queued":
      case "node.started":
      case "node.reused":
      case "node.succeeded":
      case "node.failed":
      case "node.cancelled":
      case "node.retried": {
        if (!event.nodeId || !nodes[event.nodeId]) break;
        const node = nodes[event.nodeId];
        if (event.type === "node.queued") node.status = "QUEUED";
        else if (event.type === "node.started") node.status = "RUNNING";
        else if (event.type === "node.reused") {
          node.status = "REUSED";
          node.cacheHit = true;
        } else if (event.type === "node.succeeded") {
          node.status = "SUCCEEDED";
          const settled = event.payload["settledIcu"];
          if (typeof settled === "number") {
            node.settledIcu = settled;
            actualIcu += settled;
          }
        } else if (event.type === "node.failed") {
          node.status = "FAILED";
          const error = event.payload["error"];
          node.error = typeof error === "string" ? error : "Node failed.";
        } else if (event.type === "node.cancelled") {
          node.status = "CANCELLED";
        } else if (event.type === "node.retried") {
          node.status = "QUEUED";
          node.error = null;
        }
        node.updatedAt = event.at;
        break;
      }
      default:
        break;
    }
  }
  const terminal = new Set(["REUSED", "SUCCEEDED", "FAILED", "CANCELLED", "SKIPPED"]);
  const completedNodes = Object.values(nodes).filter((node) => terminal.has(node.status)).length;
  const summary =
    `Run ${workflowRunStatusLabel(status).toLowerCase()}: ` +
    `${completedNodes} of ${nodeIds.length} nodes settled, ` +
    `${actualIcu} ICU actual.`;
  return {
    runId,
    status,
    nodes,
    completedNodes,
    totalNodes: nodeIds.length,
    actualIcu,
    finishedAt,
    summary,
  };
}
