import "server-only";

/**
 * STUDIO_13 route-adapter workflow access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed run/binding/event/cache access over the j13 schema.
 * Service-role bypasses RLS, so every call binds explicit project scope.
 * Runs resolve a compiled DAG row by hash — raw graph payloads are never
 * accepted here (RAW_GRAPH_REJECTED before any write).
 */
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import {
  WorkflowExecutionError,
  projectRunEvents,
} from "@ethen/studio-core/server/workflow";

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function int(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function nullableInt(row: Row, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}

export interface CanvasRevisionRow {
  revision: number;
  sha256: string;
  nodeCount: number;
  dagHash: string | null;
  createdAt: string;
}

export async function listGraphRevisions(
  scope: ResolvedScope,
  graphId: string,
): Promise<{ revisions: CanvasRevisionRow[]; graph: unknown | null }> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_graph_revisions")
    .select("revision,sha256,node_count,canonical_json,created_at")
    .eq("project_id", scope.projectId)
    .eq("graph_id", graphId)
    .order("revision", { ascending: true });
  if (error) throw new WorkflowExecutionError("NOT_FOUND", "Graph revisions are unavailable.");
  const rows = (data ?? []) as Row[];
  const { data: dags } = await client
    .from("studio_v5_compiled_dags")
    .select("dag_hash,revision")
    .eq("project_id", scope.projectId)
    .eq("graph_id", graphId);
  const dagByRevision = new Map<number, string>();
  for (const dag of ((dags ?? []) as Row[])) {
    dagByRevision.set(int(dag, "revision"), str(dag, "dag_hash"));
  }
  const revisions: CanvasRevisionRow[] = rows.map((row) => ({
    revision: int(row, "revision"),
    sha256: str(row, "sha256"),
    nodeCount: int(row, "node_count"),
    dagHash: dagByRevision.get(int(row, "revision")) ?? null,
    createdAt: str(row, "created_at"),
  }));
  const head = rows[rows.length - 1];
  const graph = head ? (head["canonical_json"] as unknown) : null;
  return { revisions, graph };
}

export interface CanvasGraphSummary {
  graphId: string;
  headRevision: number;
  nodeCount: number;
  updatedAt: string;
}

/** M5 Canvas index: head revision per graph in this project scope. */
export async function listGraphs(scope: ResolvedScope): Promise<CanvasGraphSummary[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_graph_revisions")
    .select("graph_id,revision,node_count,created_at")
    .eq("project_id", scope.projectId)
    .order("revision", { ascending: false });
  if (error) throw new WorkflowExecutionError("NOT_FOUND", "Graph index is unavailable.");
  const summaries = new Map<string, CanvasGraphSummary>();
  for (const row of ((data ?? []) as Row[])) {
    const graphId = str(row, "graph_id");
    if (!graphId || summaries.has(graphId)) continue;
    summaries.set(graphId, {
      graphId,
      headRevision: int(row, "revision"),
      nodeCount: int(row, "node_count"),
      updatedAt: str(row, "created_at"),
    });
  }
  return [...summaries.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/** P05 — append an immutable authoring revision (no update path exists). */
export async function insertGraphRevision(input: {
  scope: ResolvedScope;
  graphId: string;
  revision: number;
  canonicalJson: unknown;
  sha256: string;
  nodeCount: number;
}): Promise<{ revision: number; sha256: string }> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_graph_revisions")
    .insert({
      graph_id: input.graphId,
      revision: input.revision,
      tenant_id: input.scope.tenantId,
      project_id: input.scope.projectId,
      canonical_json: input.canonicalJson,
      sha256: input.sha256,
      node_count: input.nodeCount,
    })
    .select("revision,sha256")
    .single();
  if (error || !data) {
    throw new WorkflowExecutionError("ADMISSION_FAILED", "Graph revision could not be saved.");
  }
  const row = data as Row;
  return { revision: int(row, "revision"), sha256: str(row, "sha256") };
}

/** P05 — pin an immutable compiled DAG (trigger-refused updates). */
export async function insertCompiledDag(input: {
  scope: ResolvedScope;
  dagHash: string;
  graphId: string;
  revision: number;
  ir: unknown;
  irVersion: string;
  pins: unknown;
}): Promise<{ dagHash: string }> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_compiled_dags")
    .insert({
      dag_hash: input.dagHash,
      graph_id: input.graphId,
      revision: input.revision,
      tenant_id: input.scope.tenantId,
      project_id: input.scope.projectId,
      ir: input.ir,
      ir_version: input.irVersion,
      pins: input.pins,
    })
    .select("dag_hash")
    .single();
  if (error || !data) {
    throw new WorkflowExecutionError("ADMISSION_FAILED", "Compiled DAG could not be pinned.");
  }
  return { dagHash: str(data as Row, "dag_hash") };
}

export interface CompiledDagRow {
  dagHash: string;
  graphId: string;
  revision: number;
  ir: unknown;
}

export async function getCompiledDag(
  scope: ResolvedScope,
  graphId: string,
  revision: number,
): Promise<CompiledDagRow | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_compiled_dags")
    .select("dag_hash,graph_id,revision,ir")
    .eq("project_id", scope.projectId)
    .eq("graph_id", graphId)
    .eq("revision", revision)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  return { dagHash: str(row, "dag_hash"), graphId: str(row, "graph_id"), revision: int(row, "revision"), ir: row["ir"] };
}

export interface CreatedRun {
  runId: string;
  status: string;
  plan: { order: string[]; reuse: string[]; recompute: string[] };
}

/** Persist a run with its plan + bindings + created event. Plan computed by the caller. */
export async function insertRunRecord(input: {
  scope: ResolvedScope;
  graphId: string;
  revision: number;
  dagHash: string;
  selection: string[] | null;
  plan: { order: string[]; reuse: string[]; recompute: string[] };
  budgetIcu: number;
}): Promise<CreatedRun> {
  const client = requireServiceClient();
  const { data: run, error: runError } = await client
    .from("studio_v5_workflow_runs")
    .insert({
      tenant_id: input.scope.tenantId,
      project_id: input.scope.projectId,
      graph_id: input.graphId,
      revision: input.revision,
      dag_hash: input.dagHash,
      status: "QUEUED",
      selection: input.selection,
      plan: input.plan,
      reservation_key: `canvas-run:pending`,
      budget_icu: input.budgetIcu,
    })
    .select("run_id,status")
    .single();
  if (runError || !run) {
    throw new WorkflowExecutionError("ADMISSION_FAILED", "Run could not be created.");
  }
  const runId = str(run as Row, "run_id");
  await client
    .from("studio_v5_workflow_runs")
    .update({ reservation_key: `canvas-run:${runId}` })
    .eq("run_id", runId);
  const bindings = input.plan.order.map((nodeId) => ({ run_id: runId, node_id: nodeId, status: "PENDING" }));
  if (bindings.length > 0) {
    const { error: bindingError } = await client.from("studio_v5_workflow_node_runs").insert(bindings);
    if (bindingError) throw new WorkflowExecutionError("ADMISSION_FAILED", "Run bindings could not be created.");
  }
  await client.from("studio_v5_workflow_run_events").insert({
    run_id: runId,
    seq: 0,
    type: "run.created",
    node_id: null,
    payload: { dagHash: input.dagHash },
  });
  return { runId, status: "QUEUED", plan: input.plan };
}

export interface RunProjectionWire {
  runId: string;
  status: string;
  summary: string;
  nodes: Record<string, { nodeId: string; status: string; cacheHit: boolean; settledIcu: number | null; error: string | null }>;
  completedNodes: number;
  totalNodes: number;
  actualIcu: number;
}

export async function readRunProjection(scope: ResolvedScope, runId: string): Promise<RunProjectionWire | null> {
  const client = requireServiceClient();
  const { data: run } = await client
    .from("studio_v5_workflow_runs")
    .select("run_id,status,plan")
    .eq("project_id", scope.projectId)
    .eq("run_id", runId)
    .limit(1)
    .maybeSingle();
  if (!run) return null;
  const plan = ((run as Row)["plan"] as { order?: string[] } | null) ?? {};
  const nodeIds = Array.isArray(plan.order) ? plan.order : [];
  const { data: events } = await client
    .from("studio_v5_workflow_run_events")
    .select("run_id,seq,type,node_id,payload,at")
    .eq("run_id", runId)
    .order("seq", { ascending: true });
  const { data: bindings } = await client
    .from("studio_v5_workflow_node_runs")
    .select("node_id,status,settled_icu,error")
    .eq("run_id", runId);
  const projected = projectRunEvents(
    runId,
    ((events ?? []) as Row[]).map((row, index) => ({
      runId,
      seq: typeof row["seq"] === "number" ? (row["seq"] as number) : index,
      type: str(row, "type") as never,
      nodeId: nullableStr(row, "node_id"),
      payload: (row["payload"] as Record<string, unknown>) ?? {},
      at: str(row, "at") || new Date().toISOString(),
    })),
    nodeIds,
  );
  // Bindings carry settlement truth the event fold may predate; merge errors/settled amounts.
  for (const binding of ((bindings ?? []) as Row[])) {
    const nodeId = str(binding, "node_id");
    const node = (projected.nodes as Record<string, { settledIcu: number | null; error: string | null }>)[nodeId];
    if (node) {
      if (node.settledIcu === null) node.settledIcu = nullableInt(binding, "settled_icu");
      if (!node.error) node.error = nullableStr(binding, "error");
    }
  }
  void int;
  return {
    runId,
    status: String((run as Row)["status"] ?? projected.status) as string,
    summary: projected.summary,
    nodes: projected.nodes as RunProjectionWire["nodes"],
    completedNodes: projected.completedNodes,
    totalNodes: projected.totalNodes,
    actualIcu: projected.actualIcu,
  };
}

export async function appendRunEvent(input: {
  scope: ResolvedScope;
  runId: string;
  type: string;
  nodeId: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  const client = requireServiceClient();
  const { data: run } = await client
    .from("studio_v5_workflow_runs")
    .select("run_id")
    .eq("project_id", input.scope.projectId)
    .eq("run_id", input.runId)
    .limit(1)
    .maybeSingle();
  if (!run) throw new WorkflowExecutionError("NOT_FOUND", "Run not found in this project.");
  const { count } = await client
    .from("studio_v5_workflow_run_events")
    .select("seq", { count: "exact", head: true })
    .eq("run_id", input.runId);
  await client.from("studio_v5_workflow_run_events").insert({
    run_id: input.runId,
    seq: count ?? 0,
    type: input.type,
    node_id: input.nodeId,
    payload: input.payload,
  });
}

export async function updateRunStatus(
  scope: ResolvedScope,
  runId: string,
  status: string,
): Promise<void> {
  const client = requireServiceClient();
  const finished = status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";
  const { data } = await client
    .from("studio_v5_workflow_runs")
    .update({
      status,
      finished_at: finished ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", scope.projectId)
    .eq("run_id", runId)
    .select("run_id");
  if (!data || (data as unknown[]).length === 0) {
    throw new WorkflowExecutionError("NOT_FOUND", "Run not found in this project.");
  }
}
