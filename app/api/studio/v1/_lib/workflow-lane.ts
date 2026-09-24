import "server-only";

/**
 * P05 — fixture-lane workflow repository (RC-4, RC-3 workflows).
 *
 * Mirrors the `supabase-workflow.ts` shapes the routes consume, backed by
 * `localStores().workflow` (the untouched kernel `MemoryWorkflowVersionStore`;
 * scope + dag-hash indexes live beside it per the P03 `exportOrder` /
 * P04 `cinemaSequences` precedent). Routes branch onto these functions
 * only when `isStudioFixtureLane()` holds. Validation and compilation
 * stay in the kernel (`validateGraph` / `compileGraph` / `compileRevision`
 * / `freezeWorkflowApp`); this lane only stores and projects rows.
 *
 * Graph identity is the graph id: `studio_v5_graph_revisions` carries no
 * name column (verified in `20260922110000_studio_v5_j12_canvas.sql`), so
 * the create route accepts an optional display name but persists nothing
 * beyond (graphId, revision, content). No migration, no rename route.
 */
import { randomUUID } from "node:crypto";
import type { ProjectScope } from "@ethen/studio-core/contracts";
import type { CanvasGraph } from "@ethen/studio-core/contracts";
import type { CompilerPolicyInputs } from "@ethen/studio-core/contracts";
import type { WorkflowAppDefinition } from "@ethen/studio-core/contracts";
import type { WorkflowIR } from "@ethen/studio-core/contracts";
import {
  compileGraph,
  dirtyDownstreamClosureIr,
  freezeWorkflowApp,
  isCompiledEnvelope,
  requireCompiledEnvelope,
  WorkflowExecutionError,
  type CompileEndpointResolver,
  type StoredDag,
} from "@ethen/studio-core/server/workflow";
import { canvasTemplate } from "../../../../../components/studio/v5/canvas/templates";
import type { LocalWorkflowStores } from "./local-lane";

/** Minimal scope the lane needs (routes pass their ResolvedScope). */
export interface FixtureScope {
  scope: ProjectScope;
  tenantId: string;
  projectId: string;
}

export type WorkflowLaneErrorCode = "CONFLICT" | "VALIDATION_ERROR" | "NOT_FOUND";

export class WorkflowLaneError extends Error {
  readonly code: WorkflowLaneErrorCode;
  constructor(code: WorkflowLaneErrorCode, message: string) {
    super(message);
    this.name = "WorkflowLaneError";
    this.code = code;
  }
}

export function scopeKeyOf(scope: FixtureScope): string {
  return `${scope.tenantId}/${scope.scope.workspaceId}/${scope.projectId}`;
}

function dagKey(graphId: string, revision: number): string {
  return `${graphId}:${revision}`;
}

/**
 * Deterministic endpoint resolver for the authoring path: an explicit
 * `endpointId` param is honored verbatim (never rewritten); otherwise the
 * compiler records an honest auto resolution (mode + reason + exclusions
 * are stored in the IR snapshot for downstream inspection).
 */
export const workflowLaneEndpointResolver: CompileEndpointResolver = {
  resolve: (task, params) => {
    const explicit = params.endpointId;
    if (typeof explicit === "string" && explicit.length > 0) {
      return { endpointId: explicit, mode: "explicit", reason: "caller pinned", exclusions: [], resolvedAt: new Date().toISOString() };
    }
    return {
      endpointId: `auto:${task}:v1`,
      mode: "auto",
      reason: "authoring lane: no catalog endpoint pinned",
      exclusions: [],
      resolvedAt: new Date().toISOString(),
    };
  },
};

/** Policy inputs recorded on authoring compiles (no consents gathered here). */
export function workflowLanePolicy(): CompilerPolicyInputs {
  return { policyProfile: "standard-v1", consentIds: [], rightsSnapshotId: null, identityBindingId: null };
}

/** Structural guard before the kernel diagnoses node-level issues. */
export function assertAuthoringGraph(value: unknown): asserts value is CanvasGraph {
  if (!value || typeof value !== "object") {
    throw new WorkflowLaneError("VALIDATION_ERROR", "graph must be an object with nodes[] and edges[].");
  }
  const graph = value as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new WorkflowLaneError("VALIDATION_ERROR", "graph must be an object with nodes[] and edges[].");
  }
}

export interface FixtureGraphSummary {
  graphId: string;
  headRevision: number;
  nodeCount: number;
  updatedAt: string;
}

export interface FixtureRevisionSummary {
  revision: number;
  sha256: string;
  nodeCount: number;
  dagHash: string | null;
  createdAt: string;
}

/** Create a graph: revision 1 from a template or an empty graph (uncompiled). */
export function fixtureCreateGraph(
  stores: LocalWorkflowStores,
  scope: FixtureScope,
  input: { name?: string; templateId?: string | null },
): { graphId: string; revision: 1 } {
  let graph: CanvasGraph = { nodes: [], edges: [] };
  if (input.templateId) {
    const template = canvasTemplate(input.templateId);
    if (!template) throw new WorkflowLaneError("VALIDATION_ERROR", `Unknown template ${input.templateId}.`);
    graph = structuredClone(template.graph);
  }
  const graphId = randomUUID();
  const stored = stores.versions.appendRevision(graphId, graph);
  stores.scopes.set(graphId, scopeKeyOf(scope));
  return { graphId, revision: stored.revision as 1 };
}

/**
 * Save an immutable revision: optimistic concurrency on `baseRevision`
 * (stale → CONFLICT), kernel validate + compile (invalid →
 * VALIDATION_ERROR with node-level messages), then append + pin the DAG.
 */
export function fixtureSaveRevision(
  stores: LocalWorkflowStores,
  scope: FixtureScope,
  input: { graphId: string; baseRevision: number; graph: CanvasGraph },
): { revision: number; sha256: string; dagHash: string } {
  if (stores.scopes.get(input.graphId) !== scopeKeyOf(scope)) {
    throw new WorkflowLaneError("NOT_FOUND", "Graph not found in this project.");
  }
  if (!Number.isInteger(input.baseRevision) || input.baseRevision <= 0) {
    throw new WorkflowLaneError("VALIDATION_ERROR", "baseRevision is required.");
  }
  const head = stores.versions.headRevision(input.graphId);
  if (!head) throw new WorkflowLaneError("NOT_FOUND", "Graph not found in this project.");
  if (input.baseRevision !== head.revision) {
    throw new WorkflowLaneError(
      "CONFLICT",
      `Revision ${input.baseRevision} is stale; head is ${head.revision}. Reload and retry.`,
    );
  }
  // Compile before appending so an invalid graph stores nothing.
  const candidate = compileGraph(input.graph, {
    scope: scope.scope,
    graphId: input.graphId,
    revision: head.revision + 1,
    policy: workflowLanePolicy(),
    endpoints: workflowLaneEndpointResolver,
  });
  if (!candidate.ok) {
    const messages = candidate.diagnostics.map((entry) =>
      entry.nodeId ? `${entry.nodeId}: ${entry.message}` : entry.message,
    );
    throw new WorkflowLaneError("VALIDATION_ERROR", messages.join(" "));
  }
  const stored = stores.versions.appendRevision(input.graphId, input.graph);
  const pinned = stores.versions.compileRevision(input.graphId, stored.revision, {
    scope: scope.scope,
    policy: workflowLanePolicy(),
    endpoints: workflowLaneEndpointResolver,
  });
  if (!pinned.ok) {
    const messages = pinned.diagnostics.map((entry) =>
      entry.nodeId ? `${entry.nodeId}: ${entry.message}` : entry.message,
    );
    throw new WorkflowLaneError("VALIDATION_ERROR", messages.join(" "));
  }
  stores.dagByRevision.set(dagKey(input.graphId, stored.revision), pinned.dag.dagHash);
  return { revision: stored.revision, sha256: stored.sha256, dagHash: pinned.dag.dagHash };
}

/** Head revision per graph in this project (newest first). */
export function fixtureListGraphs(stores: LocalWorkflowStores, scope: FixtureScope): FixtureGraphSummary[] {
  const key = scopeKeyOf(scope);
  return stores.versions
    .listGraphs()
    .filter((entry) => stores.scopes.get(entry.graphId) === key);
}

/** Head authoring graph + revision history for the workspace. */
export function fixtureGetWorkspace(
  stores: LocalWorkflowStores,
  scope: FixtureScope,
  graphId: string,
): { graph: CanvasGraph; revisions: FixtureRevisionSummary[] } {
  if (stores.scopes.get(graphId) !== scopeKeyOf(scope)) {
    throw new WorkflowLaneError("NOT_FOUND", "Graph not found in this project.");
  }
  const head = stores.versions.headRevision(graphId);
  if (!head) throw new WorkflowLaneError("NOT_FOUND", "Graph not found in this project.");
  return { graph: head.graph, revisions: fixtureListRevisions(stores, scope, graphId) };
}

export function fixtureListRevisions(
  stores: LocalWorkflowStores,
  scope: FixtureScope,
  graphId: string,
): FixtureRevisionSummary[] {
  if (stores.scopes.get(graphId) !== scopeKeyOf(scope)) {
    throw new WorkflowLaneError("NOT_FOUND", "Graph not found in this project.");
  }
  return stores.versions.listRevisions(graphId).map((entry) => ({
    revision: entry.revision,
    sha256: entry.sha256,
    nodeCount: entry.nodeCount,
    dagHash: stores.dagByRevision.get(dagKey(graphId, entry.revision)) ?? null,
    createdAt: entry.createdAt,
  }));
}

export function fixtureGetDag(
  stores: LocalWorkflowStores,
  scope: FixtureScope,
  graphId: string,
  revision: number,
): StoredDag | null {
  if (stores.scopes.get(graphId) !== scopeKeyOf(scope)) return null;
  const dagHash = stores.dagByRevision.get(dagKey(graphId, revision));
  if (!dagHash) return null;
  return stores.versions.getDag(dagHash);
}

export interface FixtureEstimate {
  perNodeIcu: Record<string, number>;
  totalIcu: number;
  budgetIcu: number;
  withinBudget: boolean;
}

/**
 * Per-node ICU from a compiled IR (selection + dirty downstream only).
 * Shared by the fixture estimate branch; the Supabase branch keeps its
 * own inline math untouched.
 */
export function estimateFromIr(ir: WorkflowIR, selection: string[] | null, budgetIcu: number): FixtureEstimate {
  const scoped = selection ? dirtyDownstreamClosureIr(ir, selection) : ir.nodes.map((node) => node.nodeId);
  const perNodeIcu: Record<string, number> = {};
  for (const node of ir.nodes) {
    perNodeIcu[node.nodeId] = scoped.includes(node.nodeId) ? node.budgetIcu : 0;
  }
  const totalIcu = Object.values(perNodeIcu).reduce((sum, value) => sum + value, 0);
  return { perNodeIcu, totalIcu, budgetIcu, withinBudget: totalIcu <= budgetIcu };
}

/** Fixture run estimate over the memory DAG (null when uncompiled). */
export function fixtureEstimate(
  stores: LocalWorkflowStores,
  scope: FixtureScope,
  input: { graphId: string; revision: number; selection: string[] | null; budgetIcu: number },
): FixtureEstimate | null {
  const dag = fixtureGetDag(stores, scope, input.graphId, input.revision);
  if (!dag) return null;
  const envelope = { ir: dag.ir, dagHash: dag.dagHash };
  if (!isCompiledEnvelope(envelope)) {
    throw new WorkflowLaneError("VALIDATION_ERROR", "Stored DAG failed verification.");
  }
  let ir: WorkflowIR;
  try {
    ir = requireCompiledEnvelope(envelope);
  } catch {
    throw new WorkflowLaneError("VALIDATION_ERROR", "Stored DAG failed verification.");
  }
  try {
    return estimateFromIr(ir, input.selection, input.budgetIcu);
  } catch (error) {
    if (error instanceof WorkflowExecutionError) throw new WorkflowLaneError("VALIDATION_ERROR", error.message);
    throw error;
  }
}

/**
 * Freeze a private Workflow→App on the fixture lane: compiles the
 * revision on demand when it has no DAG yet, then freezes through the
 * pure kernel. Never throws a 500 shape (NOT_FOUND / VALIDATION_ERROR).
 */
export function fixtureFreezeApp(
  stores: LocalWorkflowStores,
  scope: FixtureScope,
  input: { graphId: string; revision: number; appId: string; ownerId: string; invoke: string[]; manage: string[] },
): WorkflowAppDefinition {
  if (stores.scopes.get(input.graphId) !== scopeKeyOf(scope)) {
    throw new WorkflowLaneError("NOT_FOUND", "Graph not found in this project.");
  }
  const stored = stores.versions.getRevision(input.graphId, input.revision);
  if (!stored) throw new WorkflowLaneError("NOT_FOUND", "Graph revision was not found.");
  let dagHash = stores.dagByRevision.get(dagKey(input.graphId, input.revision)) ?? null;
  if (!dagHash) {
    const pinned = stores.versions.compileRevision(input.graphId, input.revision, {
      scope: scope.scope,
      policy: workflowLanePolicy(),
      endpoints: workflowLaneEndpointResolver,
    });
    if (!pinned.ok) {
      const messages = pinned.diagnostics.map((entry) =>
        entry.nodeId ? `${entry.nodeId}: ${entry.message}` : entry.message,
      );
      throw new WorkflowLaneError("VALIDATION_ERROR", messages.join(" "));
    }
    dagHash = pinned.dag.dagHash;
    stores.dagByRevision.set(dagKey(input.graphId, input.revision), dagHash);
  }
  const frozen = freezeWorkflowApp(stored.graph, {
    appId: input.appId,
    graphId: input.graphId,
    frozenDagHash: dagHash,
    frozenRevision: input.revision,
    inputs: [],
    outputs: [],
    ownerId: input.ownerId,
    invoke: input.invoke,
    manage: input.manage,
  });
  if (!frozen.ok) {
    throw new WorkflowLaneError("VALIDATION_ERROR", frozen.diagnostics.map((entry) => entry.message).join(" "));
  }
  stores.apps.set(frozen.app.appId, frozen.app);
  return frozen.app;
}
