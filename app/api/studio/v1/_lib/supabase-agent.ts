import "server-only";

/**
 * STUDIO_17 route-adapter agent access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed run/plan/patch/approval/event access over the j17 schema.
 * Service-role bypasses RLS, so every call binds explicit project scope.
 * Plans, patches and events are append-only; approvals move through the
 * request→grant/deny/expire/invalidate lifecycle only.
 */
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import { AgentError } from "@ethen/studio-core/server/agent";

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

function json(row: Row, key: string, fallback: unknown): unknown {
  const value = row[key];
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return fallback;
    }
  }
  return value;
}

export interface AgentRunRow {
  runId: string;
  title: string;
  brief: string;
  stage: string;
  tier: string;
  headRevision: number;
  budget: Record<string, unknown>;
  backedges: Record<string, unknown>;
  verify: Record<string, unknown>;
  workflowRunId: string | null;
  jobIds: string[];
  workbenchTimelineId: string | null;
  compositeCampaignId: string | null;
  origin: string;
  legacyPlanId: string | null;
  stoppedBy: string | null;
  updatedAt: string;
}

const RUN_SELECT =
  "run_id,title,brief,stage,tier,head_revision,budget,backedges,verify,workflow_run_id,job_ids,workbench_timeline_id,composite_campaign_id,origin,legacy_plan_id,stopped_by,updated_at";

function toRunRow(row: Row): AgentRunRow {
  return {
    runId: str(row, "run_id"),
    title: str(row, "title"),
    brief: str(row, "brief"),
    stage: str(row, "stage"),
    tier: str(row, "tier"),
    headRevision: int(row, "head_revision"),
    budget: (json(row, "budget", {}) as Record<string, unknown>) ?? {},
    backedges: (json(row, "backedges", {}) as Record<string, unknown>) ?? {},
    verify: (json(row, "verify", {}) as Record<string, unknown>) ?? {},
    workflowRunId: nullableStr(row, "workflow_run_id"),
    jobIds: (row["job_ids"] as string[] | null) ?? [],
    workbenchTimelineId: nullableStr(row, "workbench_timeline_id"),
    compositeCampaignId: nullableStr(row, "composite_campaign_id"),
    origin: str(row, "origin"),
    legacyPlanId: nullableStr(row, "legacy_plan_id"),
    stoppedBy: nullableStr(row, "stopped_by"),
    updatedAt: str(row, "updated_at"),
  };
}

export async function listAgentRuns(scope: ResolvedScope): Promise<AgentRunRow[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_runs")
    .select(RUN_SELECT)
    .eq("project_id", scope.projectId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new AgentError("INTERNAL", `Agent run list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toRunRow);
}

export async function getAgentRun(scope: ResolvedScope, runId: string): Promise<AgentRunRow | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_runs")
    .select(RUN_SELECT)
    .eq("project_id", scope.projectId)
    .eq("run_id", runId)
    .maybeSingle();
  if (error) throw new AgentError("INTERNAL", `Agent run read is unavailable: ${error.message}`);
  return data ? toRunRow(data as Row) : null;
}

export async function insertAgentRun(input: {
  scope: ResolvedScope;
  title: string;
  brief: string;
  internalCeilingIcu: number;
  idempotencyKey: string;
}): Promise<AgentRunRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_runs")
    .upsert(
      {
        tenant_id: input.scope.tenantId,
        project_id: input.scope.projectId,
        title: input.title,
        brief: input.brief,
        budget: {
          maxPlanningPasses: 2,
          maxToolCalls: 5,
          internalCeilingIcu: input.internalCeilingIcu,
          planningPassesUsed: 0,
          toolCallsUsed: 0,
          internalSpentIcu: 0,
        },
        idempotency_key: input.idempotencyKey,
      },
      { onConflict: "project_id,idempotency_key" },
    )
    .select(RUN_SELECT)
    .single();
  if (error) throw new AgentError("INTERNAL", `Agent run create is unavailable: ${error.message}`);
  return toRunRow(data as Row);
}

export async function updateAgentRun(
  scope: ResolvedScope,
  runId: string,
  patch: Record<string, unknown>,
): Promise<AgentRunRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("project_id", scope.projectId)
    .eq("run_id", runId)
    .select(RUN_SELECT)
    .maybeSingle();
  if (error) throw new AgentError("INTERNAL", `Agent run update is unavailable: ${error.message}`);
  if (!data) throw new AgentError("NOT_FOUND", "Agent run was not found.");
  return toRunRow(data as Row);
}

/** CAS head bump: sets head_revision only when it still matches expected. */
export async function casBumpHeadRevision(
  scope: ResolvedScope,
  runId: string,
  expected: number,
): Promise<AgentRunRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_runs")
    .update({ head_revision: expected + 1, updated_at: new Date().toISOString() })
    .eq("project_id", scope.projectId)
    .eq("run_id", runId)
    .eq("head_revision", expected)
    .select(RUN_SELECT)
    .maybeSingle();
  if (error) throw new AgentError("INTERNAL", `Agent run update is unavailable: ${error.message}`);
  if (!data) throw new AgentError("STALE_REVISION", "Plan head moved underneath this write; reload and retry.");
  return toRunRow(data as Row);
}

export interface AgentPlanRow {
  planId: string;
  runId: string;
  revision: number;
  goal: string;
  constraints: unknown;
  steps: unknown;
  pins: Record<string, unknown>;
  estimatedIcu: number;
  quoteId: string | null;
  planHash: string;
  createdAt: string;
}

const PLAN_SELECT =
  "plan_id,run_id,revision,goal,constraints,steps,pins,estimated_icu,quote_id,plan_hash,created_at";

function toPlanRow(row: Row): AgentPlanRow {
  return {
    planId: str(row, "plan_id"),
    runId: str(row, "run_id"),
    revision: int(row, "revision"),
    goal: str(row, "goal"),
    constraints: json(row, "constraints", []),
    steps: json(row, "steps", []),
    pins: (json(row, "pins", {}) as Record<string, unknown>) ?? {},
    estimatedIcu: int(row, "estimated_icu"),
    quoteId: nullableStr(row, "quote_id"),
    planHash: str(row, "plan_hash"),
    createdAt: str(row, "created_at"),
  };
}

export async function listAgentPlans(scope: ResolvedScope, runId: string): Promise<AgentPlanRow[]> {
  const run = await getAgentRun(scope, runId);
  if (!run) throw new AgentError("NOT_FOUND", "Agent run was not found.");
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_plans")
    .select(PLAN_SELECT)
    .eq("run_id", runId)
    .order("revision", { ascending: true });
  if (error) throw new AgentError("INTERNAL", `Agent plan list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toPlanRow);
}

export async function insertAgentPlan(row: {
  runId: string;
  revision: number;
  goal: string;
  constraints: unknown;
  steps: unknown;
  pins: unknown;
  estimatedIcu: number;
  quoteId: string | null;
  planHash: string;
}): Promise<AgentPlanRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_plans")
    .insert({
      run_id: row.runId,
      revision: row.revision,
      goal: row.goal,
      constraints: row.constraints,
      steps: row.steps,
      pins: row.pins,
      estimated_icu: row.estimatedIcu,
      quote_id: row.quoteId,
      plan_hash: row.planHash,
    })
    .select(PLAN_SELECT)
    .single();
  if (error) throw new AgentError("INTERNAL", `Agent plan save is unavailable: ${error.message}`);
  return toPlanRow(data as Row);
}

export interface AgentPatchRow {
  patchId: string;
  runId: string;
  planRevision: number;
  baseGraphHash: string;
  ops: unknown;
  resultingHash: string;
  diff: string[];
  createdAt: string;
}

const PATCH_SELECT = "patch_id,run_id,plan_revision,base_graph_hash,ops,resulting_hash,diff,created_at";

function toPatchRow(row: Row): AgentPatchRow {
  return {
    patchId: str(row, "patch_id"),
    runId: str(row, "run_id"),
    planRevision: int(row, "plan_revision"),
    baseGraphHash: str(row, "base_graph_hash"),
    ops: json(row, "ops", []),
    resultingHash: str(row, "resulting_hash"),
    diff: (row["diff"] as string[] | null) ?? [],
    createdAt: str(row, "created_at"),
  };
}

export async function listAgentPatches(scope: ResolvedScope, runId: string): Promise<AgentPatchRow[]> {
  const run = await getAgentRun(scope, runId);
  if (!run) throw new AgentError("NOT_FOUND", "Agent run was not found.");
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_patches")
    .select(PATCH_SELECT)
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw new AgentError("INTERNAL", `Agent patch list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toPatchRow);
}

export async function insertAgentPatch(row: {
  runId: string;
  planRevision: number;
  baseGraphHash: string;
  ops: unknown;
  resultingHash: string;
  diff: string[];
}): Promise<AgentPatchRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_patches")
    .insert({
      run_id: row.runId,
      plan_revision: row.planRevision,
      base_graph_hash: row.baseGraphHash,
      ops: row.ops,
      resulting_hash: row.resultingHash,
      diff: row.diff,
    })
    .select(PATCH_SELECT)
    .single();
  if (error) throw new AgentError("INTERNAL", `Agent patch save is unavailable: ${error.message}`);
  return toPatchRow(data as Row);
}

export interface AgentApprovalRow {
  approvalId: string;
  runId: string;
  planRevision: number;
  planHash: string;
  patchHash: string | null;
  quoteId: string | null;
  estimatedIcu: number;
  capIcu: number;
  pins: Record<string, unknown>;
  policyDecisionId: string | null;
  tier: string;
  kind: string;
  state: string;
  requestedBy: string;
  requestedAt: string;
  grantedBy: string | null;
  grantedAt: string | null;
  expiresAt: string;
  staleReason: string | null;
}

const APPROVAL_SELECT =
  "approval_id,run_id,plan_revision,plan_hash,patch_hash,quote_id,estimated_icu,cap_icu,pins,policy_decision_id,tier,kind,state,requested_by,requested_at,granted_by,granted_at,expires_at,stale_reason";

function toApprovalRow(row: Row): AgentApprovalRow {
  return {
    approvalId: str(row, "approval_id"),
    runId: str(row, "run_id"),
    planRevision: int(row, "plan_revision"),
    planHash: str(row, "plan_hash"),
    patchHash: nullableStr(row, "patch_hash"),
    quoteId: nullableStr(row, "quote_id"),
    estimatedIcu: int(row, "estimated_icu"),
    capIcu: int(row, "cap_icu"),
    pins: (json(row, "pins", {}) as Record<string, unknown>) ?? {},
    policyDecisionId: nullableStr(row, "policy_decision_id"),
    tier: str(row, "tier"),
    kind: str(row, "kind"),
    state: str(row, "state"),
    requestedBy: str(row, "requested_by"),
    requestedAt: str(row, "requested_at"),
    grantedBy: nullableStr(row, "granted_by"),
    grantedAt: nullableStr(row, "granted_at"),
    expiresAt: str(row, "expires_at"),
    staleReason: nullableStr(row, "stale_reason"),
  };
}

export async function listAgentApprovals(scope: ResolvedScope, runId: string): Promise<AgentApprovalRow[]> {
  const run = await getAgentRun(scope, runId);
  if (!run) throw new AgentError("NOT_FOUND", "Agent run was not found.");
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_approvals")
    .select(APPROVAL_SELECT)
    .eq("run_id", runId)
    .order("requested_at", { ascending: true });
  if (error) throw new AgentError("INTERNAL", `Agent approval list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toApprovalRow);
}

export async function insertAgentApproval(row: {
  runId: string;
  planRevision: number;
  planHash: string;
  patchHash: string | null;
  quoteId: string | null;
  estimatedIcu: number;
  capIcu: number;
  pins: unknown;
  policyDecisionId: string | null;
  tier: string;
  kind: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
}): Promise<AgentApprovalRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_approvals")
    .insert({
      run_id: row.runId,
      plan_revision: row.planRevision,
      plan_hash: row.planHash,
      patch_hash: row.patchHash,
      quote_id: row.quoteId,
      estimated_icu: row.estimatedIcu,
      cap_icu: row.capIcu,
      pins: row.pins,
      policy_decision_id: row.policyDecisionId,
      tier: row.tier,
      kind: row.kind,
      state: "requested",
      requested_by: row.requestedBy,
      requested_at: row.requestedAt,
      expires_at: row.expiresAt,
    })
    .select(APPROVAL_SELECT)
    .single();
  if (error) throw new AgentError("INTERNAL", `Agent approval save is unavailable: ${error.message}`);
  return toApprovalRow(data as Row);
}

export async function updateAgentApproval(
  approvalId: string,
  patch: Record<string, unknown>,
): Promise<AgentApprovalRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_approvals")
    .update(patch)
    .eq("approval_id", approvalId)
    .select(APPROVAL_SELECT)
    .maybeSingle();
  if (error) throw new AgentError("INTERNAL", `Agent approval update is unavailable: ${error.message}`);
  if (!data) throw new AgentError("NOT_FOUND", "Approval was not found.");
  return toApprovalRow(data as Row);
}

export async function invalidateLiveApprovals(runId: string, reason: string): Promise<void> {
  const client = requireServiceClient();
  const { error } = await client
    .from("studio_v5_agent_approvals")
    .update({ state: "invalidated", stale_reason: reason })
    .eq("run_id", runId)
    .in("state", ["requested", "granted"]);
  if (error) throw new AgentError("INTERNAL", `Agent approval update is unavailable: ${error.message}`);
}

export interface AgentEventRow {
  eventId: string;
  runId: string;
  seq: number;
  type: string;
  stage: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function appendAgentEvent(row: {
  runId: string;
  seq: number;
  type: string;
  stage: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  const client = requireServiceClient();
  const { error } = await client.from("studio_v5_agent_events").insert({
    run_id: row.runId,
    seq: row.seq,
    type: row.type,
    stage: row.stage,
    payload: row.payload,
  });
  if (error) throw new AgentError("INTERNAL", `Agent event save is unavailable: ${error.message}`);
}

export async function listAgentEvents(scope: ResolvedScope, runId: string): Promise<AgentEventRow[]> {
  const run = await getAgentRun(scope, runId);
  if (!run) throw new AgentError("NOT_FOUND", "Agent run was not found.");
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_events")
    .select("event_id,run_id,seq,type,stage,payload,created_at")
    .eq("run_id", runId)
    .order("seq", { ascending: true })
    .limit(200);
  if (error) throw new AgentError("INTERNAL", `Agent event list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => ({
    eventId: str(row, "event_id"),
    runId: str(row, "run_id"),
    seq: int(row, "seq"),
    type: str(row, "type"),
    stage: nullableStr(row, "stage"),
    payload: (json(row, "payload", {}) as Record<string, unknown>) ?? {},
    createdAt: str(row, "created_at"),
  }));
}

export async function nextAgentEventSeq(runId: string): Promise<number> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_events")
    .select("seq")
    .eq("run_id", runId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AgentError("INTERNAL", `Agent event read is unavailable: ${error.message}`);
  return data ? int(data as Row, "seq") + 1 : 1;
}

export interface LegacyPlanLink {
  legacyPlanId: string;
  title: string;
  goal: string;
  legacyStatus: string;
  taskCount: number;
  linkedRunId: string | null;
}

export async function listLegacyPlanLinks(scope: ResolvedScope): Promise<LegacyPlanLink[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_agent_legacy_plans")
    .select("legacy_plan_id,title,goal,legacy_status,task_count,linked_run_id")
    .eq("project_id", scope.projectId)
    .limit(50);
  if (error) throw new AgentError("INTERNAL", `Legacy plan links are unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => ({
    legacyPlanId: str(row, "legacy_plan_id"),
    title: str(row, "title"),
    goal: str(row, "goal"),
    legacyStatus: str(row, "legacy_status"),
    taskCount: int(row, "task_count"),
    linkedRunId: nullableStr(row, "linked_run_id"),
  }));
}

export { nullableInt };
