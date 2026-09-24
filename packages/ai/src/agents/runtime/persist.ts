import type { AgentRun, AgentAction, AgentEvidence } from "./types";
import { TERMINAL_RUN_STATUSES } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────

function dbNow(): string {
  return new Date().toISOString();
}

async function getServiceClient() {
  try {
    const mod = await import(`@ethen/database/service`);
    return mod.createServiceClient();
  } catch {
    return null;
  }
}

// ── Run persistence ────────────────────────────────────────────────────────

export async function persistRun(run: AgentRun): Promise<boolean> {
  const supabase = await getServiceClient();
  if (!supabase) return false;

  const { error } = await supabase.from("agent_runs").upsert(
    {
      id: run.id,
      agent_slug: run.agentSlug,
      status: run.status,
      trigger_type: run.triggerType,
      idempotency_key: run.idempotencyKey,
      input: run.input as Record<string, unknown> | null,
      output: run.output as Record<string, unknown> | null,
      initiated_by: run.initiatedBy,
      parent_run_id: run.parentRunId,
      started_at: run.startedAt,
      completed_at: run.completedAt,
      created_at: run.createdAt,
      updated_at: run.updatedAt,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[persist] persistRun failed:", error.message);
    return false;
  }
  return true;
}

export async function persistRunStatus(
  id: string,
  status: string,
  updatedAt: string,
  startedAt?: string | null,
  completedAt?: string | null,
): Promise<boolean> {
  const supabase = await getServiceClient();
  if (!supabase) return false;

  const update: Record<string, unknown> = { status, updated_at: updatedAt };
  if (startedAt !== undefined) update.started_at = startedAt;
  if (completedAt !== undefined) update.completed_at = completedAt;

  const { error } = await supabase
    .from("agent_runs")
    .update(update)
    .eq("id", id);

  if (error) {
    console.error("[persist] persistRunStatus failed:", error.message);
    return false;
  }
  return true;
}

export async function persistRunOutput(
  id: string,
  output: Record<string, unknown>,
): Promise<boolean> {
  const supabase = await getServiceClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from("agent_runs")
    .update({ output, updated_at: dbNow() })
    .eq("id", id);

  if (error) {
    console.error("[persist] persistRunOutput failed:", error.message);
    return false;
  }
  return true;
}

export async function loadRun(id: string): Promise<AgentRun | null> {
  const supabase = await getServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return dbRowToRun(data);
}

export async function loadRunByIdempotencyKey(key: string): Promise<AgentRun | null> {
  const supabase = await getServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("idempotency_key", key)
    .limit(1)
    .single();

  if (error || !data) return null;
  return dbRowToRun(data);
}

export async function loadRunsForAgent(agentSlug: string): Promise<AgentRun[]> {
  const supabase = await getServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("agent_slug", agentSlug)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map(dbRowToRun);
}

export async function loadActiveRuns(): Promise<AgentRun[]> {
  const supabase = await getServiceClient();
  if (!supabase) return [];

  const terminal = TERMINAL_RUN_STATUSES;
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .not("status", "in", `(${terminal.join(",")})`)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map(dbRowToRun);
}

export async function loadRootRuns(): Promise<AgentRun[]> {
  const supabase = await getServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .is("parent_run_id", null)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map(dbRowToRun);
}

export async function loadChildRuns(parentRunId: string): Promise<AgentRun[]> {
  const supabase = await getServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("parent_run_id", parentRunId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map(dbRowToRun);
}

// ── Action persistence ─────────────────────────────────────────────────────

export async function persistAction(action: AgentAction): Promise<boolean> {
  const supabase = await getServiceClient();
  if (!supabase) return false;

  const { error } = await supabase.from("agent_actions").upsert(
    {
      id: action.id,
      run_id: action.runId,
      step: action.step,
      tool_id: action.toolId,
      risk_level: action.riskLevel,
      status: action.status,
      input: action.input as Record<string, unknown> | null,
      output: action.output as Record<string, unknown> | null,
      proposal_id: action.proposalId,
      started_at: action.startedAt,
      completed_at: action.completedAt,
      created_at: action.createdAt,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[persist] persistAction failed:", error.message);
    return false;
  }
  return true;
}

export async function persistActionStatus(
  id: string,
  status: string,
  startedAt?: string | null,
  completedAt?: string | null,
): Promise<boolean> {
  const supabase = await getServiceClient();
  if (!supabase) return false;

  const update: Record<string, unknown> = { status };
  if (startedAt !== undefined) update.started_at = startedAt;
  if (completedAt !== undefined) update.completed_at = completedAt;

  const { error } = await supabase
    .from("agent_actions")
    .update(update)
    .eq("id", id);

  if (error) {
    console.error("[persist] persistActionStatus failed:", error.message);
    return false;
  }
  return true;
}

export async function persistActionOutput(
  id: string,
  output: Record<string, unknown>,
): Promise<boolean> {
  const supabase = await getServiceClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from("agent_actions")
    .update({ output })
    .eq("id", id);

  if (error) {
    console.error("[persist] persistActionOutput failed:", error.message);
    return false;
  }
  return true;
}

export async function loadActionsForRun(runId: string): Promise<AgentAction[]> {
  const supabase = await getServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agent_actions")
    .select("*")
    .eq("run_id", runId)
    .order("step", { ascending: true });

  if (error || !data) return [];
  return data.map(dbRowToAction);
}

// ── Evidence persistence ───────────────────────────────────────────────────

export async function persistEvidence(evidence: AgentEvidence): Promise<boolean> {
  const supabase = await getServiceClient();
  if (!supabase) return false;

  const { error } = await supabase.from("agent_evidence").upsert(
    {
      id: evidence.id,
      run_id: evidence.runId,
      action_id: evidence.actionId,
      evidence_type: evidence.evidenceType,
      label: evidence.label,
      content_url: evidence.contentUrl,
      metadata: evidence.metadata as Record<string, unknown> | null,
      created_at: evidence.createdAt,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[persist] persistEvidence failed:", error.message);
    return false;
  }
  return true;
}

export async function loadEvidenceForRun(
  runId: string,
): Promise<AgentEvidence[]> {
  const supabase = await getServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agent_evidence")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map(dbRowToEvidence);
}

export async function loadEvidenceForAction(
  actionId: string,
): Promise<AgentEvidence[]> {
  const supabase = await getServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agent_evidence")
    .select("*")
    .eq("action_id", actionId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map(dbRowToEvidence);
}

// ── DB row mappers ─────────────────────────────────────────────────────────

function dbRowToRun(row: Record<string, unknown>): AgentRun {
  return {
    id: row.id as string,
    agentSlug: row.agent_slug as string,
    status: row.status as AgentRun["status"],
    triggerType: (row.trigger_type as AgentRun["triggerType"]) ?? "manual",
    idempotencyKey: (row.idempotency_key as string) ?? null,
    input: (row.input as Record<string, unknown>) ?? null,
    output: (row.output as Record<string, unknown>) ?? null,
    initiatedBy: (row.initiated_by as string) ?? null,
    parentRunId: (row.parent_run_id as string) ?? null,
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    updatedAt: row.updated_at as string,
  };
}

function dbRowToAction(row: Record<string, unknown>): AgentAction {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    step: row.step as number,
    toolId: row.tool_id as AgentAction["toolId"],
    riskLevel: (row.risk_level as AgentAction["riskLevel"]) ?? "read_only",
    status: row.status as AgentAction["status"],
    input: (row.input as Record<string, unknown>) ?? null,
    output: (row.output as Record<string, unknown>) ?? null,
    proposalId: (row.proposal_id as string) ?? null,
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
  };
}

function dbRowToEvidence(row: Record<string, unknown>): AgentEvidence {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    actionId: (row.action_id as string) ?? null,
    evidenceType: row.evidence_type as AgentEvidence["evidenceType"],
    label: row.label as string,
    contentUrl: (row.content_url as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    createdAt: row.created_at as string,
  };
}
