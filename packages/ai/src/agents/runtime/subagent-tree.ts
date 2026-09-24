import type { AgentRun, SubagentTreeNode, BackgroundAgentsDashboard } from "./types";
import { agentRunStatusToBackgroundStatus } from "./types";
import { getRun, getChildRuns, getRootRuns, getBackgroundAgentsDashboard } from "./run-store-core";

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getInputString(run: AgentRun, keys: string[]): string | null {
  if (!run.input) return null;

  for (const key of keys) {
    const value = run.input[key];
    const str = firstString(value);
    if (str) return str;
  }

  return null;
}

/**
 * Build a subagent run tree starting from a root run.
 * Recursively resolves child runs via parentRunId.
 * Returns null if the run is not found.
 */
export function buildSubagentTree(runId: string): SubagentTreeNode | null {
  const run = getRun(runId);
  if (!run) return null;

  return _buildTree(run, 0);
}

function _buildTree(run: AgentRun, depth: number): SubagentTreeNode {
  const childRuns = getChildRuns(run.id);
  const children = childRuns.map((child) => _buildTree(child, depth + 1));

  return { run, children, depth };
}

/**
 * Build subagent trees for all root runs (runs with no parentRunId).
 */
export function buildAllSubagentTrees(): SubagentTreeNode[] {
  const roots = getRootRuns();
  return roots.map((root) => _buildTree(root, 0));
}

/**
 * Build a tree for a specific run, including its ancestors up to root.
 * Returns the full tree rooted at the top-level parent.
 */
export function buildAncestorSubagentTree(runId: string): SubagentTreeNode | null {
  const run = getRun(runId);
  if (!run) return null;

  let rootRun = run;
  while (rootRun.parentRunId) {
    const parent = getRun(rootRun.parentRunId);
    if (!parent) break;
    rootRun = parent;
  }

  return _buildTree(rootRun, 0);
}

/**
 * Get visible subagent tree nodes as a flat, depth-ordered list
 * suitable for rendering a compact tree/list UI.
 */
export interface FlatTreeNode {
  run: AgentRun;
  depth: number;
  hasChildren: boolean;
  isLastChild: boolean;
  /** Status mapped through background lens. */
  backgroundStatus: ReturnType<typeof agentRunStatusToBackgroundStatus>;
}

export function flattenSubagentTree(rootRunId: string): FlatTreeNode[] {
  const root = getRun(rootRunId);
  if (!root) return [];

  const result: FlatTreeNode[] = [];
  _flatten(root, 0, result);
  return result;
}

function _flatten(run: AgentRun, depth: number, result: FlatTreeNode[]): void {
  const children = getChildRuns(run.id);

  result.push({
    run,
    depth,
    hasChildren: children.length > 0,
    isLastChild: false,
    backgroundStatus: agentRunStatusToBackgroundStatus(run.status),
  });

  children.forEach((child, idx) => {
    const flat: FlatTreeNode[] = [];
    _flatten(child, depth + 1, flat);
    if (flat.length > 0) {
      flat[flat.length - 1].isLastChild = idx === children.length - 1;
    }
    result.push(...flat);
  });
}

/**
 * Get the background agents dashboard for UI rendering.
 */
export function getDashboard(): BackgroundAgentsDashboard {
  return getBackgroundAgentsDashboard();
}

/**
 * Derive a display title for a run.
 * Uses taskTitle if set, otherwise falls back to agentSlug + truncated input.
 */
export function deriveRunTitle(run: AgentRun): string {
  const directTitle = getInputString(run, ["taskTitle", "title", "task", "objective", "name", "prompt"]);
  if (directTitle) return directTitle;

  const inputStr = run.input
    ? (typeof run.input === "object"
      ? Object.values(run.input).filter((v) => typeof v === "string").join(" ").trim()
      : String(run.input))
    : "";

  if (inputStr && inputStr.length > 0) {
    return inputStr.length > 60 ? inputStr.slice(0, 57) + "..." : inputStr;
  }

  return `${run.agentSlug.replace(/-/g, " ")} run`;
}

/**
 * Derive a role label for display in the subagent tree.
 */
export function deriveRoleLabel(run: AgentRun): string {
  const inputRole = getInputString(run, ["agentRole", "role"]);
  if (inputRole) return inputRole;
  if (run.parentRunId) return "subagent";
  return "primary";
}
