import type {
  AgentRun,
  AgentRunStatus,
  AgentAction,
  AgentActionStatus,
  AgentEvidence,
  EvidenceType,
  RunTriggerType,
  RuntimeTransitionContext,
} from "./types";
import { TERMINAL_RUN_STATUSES, agentRunStatusToBackgroundStatus } from "./types";
import type { ToolId, ToolRiskLevel } from "@ethen/contracts/tools/types";
import {
  createRun as createRunSvr,
  setRunStatus as setRunStatusSvr,
  setRunOutput as setRunOutputSvr,
  createAction as createActionSvr,
  setActionStatus as setActionStatusSvr,
  setActionOutput as setActionOutputSvr,
  recordEvidence as recordEvidenceSvr,
  getRun,
  getRunByIdempotencyKey,
  getRunsForAgent,
  getActiveRuns,
  getActionsForRun,
  getEvidenceForRun,
  getEvidenceForAction,
  getChildRuns,
  getRootRuns,
  getRunTransitionLog,
  type CreateRunInput,
  type CreateActionInput,
  type CreateEvidenceInput,
} from "./server";
import { canTransitionRunStatus } from "./state-machine";
import {
  loadRun as loadRunDb,
  loadRunByIdempotencyKey as loadRunByIdempotencyKeyDb,
  loadRunsForAgent as loadRunsForAgentDb,
  loadActiveRuns as loadActiveRunsDb,
  loadActionsForRun as loadActionsForRunDb,
  loadEvidenceForRun as loadEvidenceForRunDb,
} from "./persist";

import {
  loadLocalRun,
  loadLocalRunByIdempotencyKey,
  loadLocalRuns,
  loadLocalActionsForRun,
  loadLocalEvidenceForRun,
} from "./storage";

// ═══════════════════════════════════════════════════════════════════════════
// Persistence status
// ═══════════════════════════════════════════════════════════════════════════

export type PersistenceMode = "durable" | "local_file" | "memory_only" | "unavailable";

let _persistenceCache: PersistenceMode | null = null;

async function detectPersistenceMode(): Promise<PersistenceMode> {
  try {
    const mod = await import("@ethen/database/service");
    const client = mod.createServiceClient();
    if (client) {
      const { error } = await client.from("agent_runs").select("id").limit(1).maybeSingle();
      if (!error) return "durable";
    }
  } catch {
    // Supabase not configured
  }

  return "local_file";
}

export async function getPersistenceMode(): Promise<PersistenceMode> {
  if (_persistenceCache !== null) return _persistenceCache;
  _persistenceCache = await detectPersistenceMode();
  return _persistenceCache;
}

export function resetPersistenceCache(): void {
  _persistenceCache = null;
}

export const PERSISTENCE_MODE_LABELS: Record<PersistenceMode, string> = {
  durable: "Supabase (production database persistence)",
  local_file: "Local file storage (private-beta durable)",
  memory_only: "In-memory only (non-durable — lost on restart)",
  unavailable: "Storage unavailable",
};

export const PERSISTENCE_MODE_DESCRIPTIONS: Record<PersistenceMode, string> = {
  durable: "Run data is persisted to Supabase Postgres and survives all restarts. Production durable.",
  local_file: "Run data is persisted to local disk in .local/ethen-runtime-store/ and survives server restarts. Private-beta — not production database persistence.",
  memory_only: "Run data lives only in server memory and is lost on process restart or refresh.",
  unavailable: "Storage subsystem is not available.",
};

// ═══════════════════════════════════════════════════════════════════════════
// Client-safe run summary
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentRunSummary {
  id: string;
  agentSlug: string;
  status: AgentRunStatus;
  backgroundStatus: ReturnType<typeof agentRunStatusToBackgroundStatus>;
  triggerType: RunTriggerType;
  actionCount: number;
  evidenceCount: number;
  childRunCount: number;
  parentRunId: string | null;
  hasOutput: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  persistenceMode: PersistenceMode;
}

export function buildRunSummary(run: AgentRun, persistenceMode: PersistenceMode): AgentRunSummary {
  const actions = getActionsForRun(run.id);
  const evidence = getEvidenceForRun(run.id);
  const children = getChildRuns(run.id);

  return {
    id: run.id,
    agentSlug: run.agentSlug,
    status: run.status,
    backgroundStatus: agentRunStatusToBackgroundStatus(run.status),
    triggerType: run.triggerType,
    actionCount: actions.length,
    evidenceCount: evidence.length,
    childRunCount: children.length,
    parentRunId: run.parentRunId,
    hasOutput: run.output !== null,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    updatedAt: run.updatedAt,
    persistenceMode,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Action summary
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentActionSummary {
  id: string;
  runId: string;
  step: number;
  toolId: string;
  riskLevel: ToolRiskLevel;
  status: AgentActionStatus;
  hasOutput: boolean;
  proposalId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export function buildActionSummary(action: AgentAction): AgentActionSummary {
  return {
    id: action.id,
    runId: action.runId,
    step: action.step,
    toolId: action.toolId,
    riskLevel: action.riskLevel,
    status: action.status,
    hasOutput: action.output !== null,
    proposalId: action.proposalId,
    createdAt: action.createdAt,
    startedAt: action.startedAt,
    completedAt: action.completedAt,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Evidence summary
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentEvidenceSummary {
  id: string;
  runId: string;
  actionId: string | null;
  evidenceType: EvidenceType;
  label: string;
  hasContentUrl: boolean;
  hasMetadata: boolean;
  createdAt: string;
}

export function buildEvidenceSummary(evidence: AgentEvidence): AgentEvidenceSummary {
  return {
    id: evidence.id,
    runId: evidence.runId,
    actionId: evidence.actionId,
    evidenceType: evidence.evidenceType,
    label: evidence.label,
    hasContentUrl: evidence.contentUrl !== null,
    hasMetadata: evidence.metadata !== null && Object.keys(evidence.metadata).length > 0,
    createdAt: evidence.createdAt,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Run detail (full load with actions + evidence summaries)
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentRunDetail {
  summary: AgentRunSummary;
  actions: AgentActionSummary[];
  evidence: AgentEvidenceSummary[];
  children: AgentRunSummary[];
  transitionLog: ReturnType<typeof getRunTransitionLog>;
}

export function buildRunDetail(run: AgentRun, persistenceMode: PersistenceMode): AgentRunDetail {
  const actions = getActionsForRun(run.id);
  const evidence = getEvidenceForRun(run.id);
  const children = getChildRuns(run.id);

  return {
    summary: buildRunSummary(run, persistenceMode),
    actions: actions.map(buildActionSummary),
    evidence: evidence.map(buildEvidenceSummary),
    children: children.map((c) => buildRunSummary(c, persistenceMode)),
    transitionLog: getRunTransitionLog(run.id),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Service operations — create / load / list / update
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateRunResult {
  success: boolean;
  run: AgentRun | null;
  error: string | null;
}

export async function serviceCreateRun(input: CreateRunInput): Promise<CreateRunResult> {
  try {
    const run = createRunSvr(input);
    return { success: true, run, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, run: null, error: message };
  }
}

export interface LoadRunResult {
  success: boolean;
  run: AgentRun | null;
  detail: AgentRunDetail | null;
  error: string | null;
  source: "db" | "memory" | "none";
}

export async function serviceLoadRun(id: string): Promise<LoadRunResult> {
  const mode = await getPersistenceMode();

  const memRun = getRun(id);
  if (memRun) {
    return {
      success: true,
      run: memRun,
      detail: buildRunDetail(memRun, mode),
      error: null,
      source: "memory",
    };
  }

  if (mode === "durable") {
    const dbRun = await loadRunDb(id);
    if (dbRun) {
      return {
        success: true,
        run: dbRun,
        detail: buildRunDetail(dbRun, mode),
        error: null,
        source: "db",
      };
    }
  }

  if (mode === "local_file") {
    const localRun = loadLocalRun(id);
    if (localRun) {
      return {
        success: true,
        run: localRun,
        detail: buildRunDetail(localRun, mode),
        error: null,
        source: "memory",
      };
    }
  }

  return { success: false, run: null, detail: null, error: `Run "${id}" not found.`, source: "none" };
}

export interface LoadRunByIdempotencyResult {
  success: boolean;
  run: AgentRun | null;
  error: string | null;
  source: "db" | "memory" | "none";
}

export async function serviceLoadRunByIdempotencyKey(key: string): Promise<LoadRunByIdempotencyResult> {
  const memRun = getRunByIdempotencyKey(key);
  if (memRun) {
    return { success: true, run: memRun, error: null, source: "memory" };
  }

  const mode = await getPersistenceMode();
  if (mode === "durable") {
    const dbRun = await loadRunByIdempotencyKeyDb(key);
    if (dbRun) {
      return { success: true, run: dbRun, error: null, source: "db" };
    }
  }

  if (mode === "local_file") {
    const localRun = loadLocalRunByIdempotencyKey(key);
    if (localRun) {
      return { success: true, run: localRun, error: null, source: "memory" };
    }
  }

  return { success: false, run: null, error: `No run with idempotency key "${key}" found.`, source: "none" };
}

export interface ListRunsResult {
  success: boolean;
  runs: AgentRunSummary[];
  total: number;
  persistenceMode: PersistenceMode;
  error: string | null;
}

export async function serviceListRuns(options?: {
  agentSlug?: string;
  includeTerminal?: boolean;
}): Promise<ListRunsResult> {
  const mode = await getPersistenceMode();

  let runs: AgentRun[];
  if (options?.agentSlug) {
    if (mode === "durable") {
      runs = await loadRunsForAgentDb(options.agentSlug);
    } else if (mode === "local_file") {
      runs = loadLocalRuns().filter((r) => r.agentSlug === options.agentSlug);
    } else {
      runs = getRunsForAgent(options.agentSlug);
    }
  } else {
    if (mode === "durable") {
      runs = await loadActiveRunsDb();
    } else if (mode === "local_file") {
      const all = loadLocalRuns();
      runs = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else {
      runs = getActiveRuns();
    }
  }

  const filtered = options?.includeTerminal !== false
    ? runs
    : runs.filter((r) => !TERMINAL_RUN_STATUSES.includes(r.status));

  const summaries = filtered.map((r) => buildRunSummary(r, mode));

  return {
    success: true,
    runs: summaries,
    total: summaries.length,
    persistenceMode: mode,
    error: null,
  };
}

export interface UpdateRunStatusResult {
  success: boolean;
  run: AgentRun | null;
  error: string | null;
}

export async function serviceUpdateRunStatus(
  id: string,
  status: AgentRunStatus,
  context?: RuntimeTransitionContext | null,
): Promise<UpdateRunStatusResult> {
  let existing = getRun(id);

  // Try loading from DB if not in memory
  if (!existing) {
    const mode = await getPersistenceMode();
    if (mode === "durable") {
      existing = await loadRunDb(id);
    }
  }

  if (!existing) {
    return { success: false, run: null, error: `Run "${id}" not found.` };
  }

  const decision = canTransitionRunStatus(existing.status, status, context);
  if (!decision.allowed) {
    return {
      success: false,
      run: existing,
      error: decision.error?.message ?? `Failed to update run "${id}" status.`,
    };
  }

  const updated = setRunStatusSvr(id, status, context);
  if (!updated) {
    return { success: false, run: null, error: `Failed to update run "${id}" status.` };
  }

  return { success: true, run: updated, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// Action operations
// ═══════════════════════════════════════════════════════════════════════════

export interface AppendActionResult {
  success: boolean;
  action: AgentAction | null;
  error: string | null;
}

export async function serviceAppendAction(input: CreateActionInput): Promise<AppendActionResult> {
  try {
    const run = getRun(input.runId);
    if (!run) {
      return { success: false, action: null, error: `Run "${input.runId}" not found.` };
    }

    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      return {
        success: false,
        action: null,
        error: `Run "${input.runId}" is in terminal state "${run.status}". Cannot append actions.`,
      };
    }

    const action = createActionSvr(input);
    return { success: true, action, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, action: null, error: message };
  }
}

export interface UpdateActionStateResult {
  success: boolean;
  action: AgentAction | null;
  error: string | null;
}

export async function serviceUpdateActionState(
  actionId: string,
  status: AgentActionStatus,
  output?: Record<string, unknown> | null,
): Promise<UpdateActionStateResult> {
  try {
    const updated = setActionStatusSvr(actionId, status);
    if (!updated) {
      return { success: false, action: null, error: `Action "${actionId}" not found.` };
    }

    if (output !== undefined && output !== null) {
      setActionOutputSvr(actionId, output);
    }

    const final = output !== undefined && output !== null
      ? { ...updated, output }
      : updated;

    return { success: true, action: final, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, action: null, error: message };
  }
}

export interface LoadActionsForRunResult {
  success: boolean;
  actions: AgentActionSummary[];
  total: number;
  error: string | null;
}

export async function serviceLoadActionsForRun(runId: string): Promise<LoadActionsForRunResult> {
  try {
    const mode = await getPersistenceMode();

    if (mode === "durable") {
      const dbActions = await loadActionsForRunDb(runId);
      if (dbActions.length > 0) {
        return {
          success: true,
          actions: dbActions.map(buildActionSummary),
          total: dbActions.length,
          error: null,
        };
      }
    }

    if (mode === "local_file") {
      const localActions = loadLocalActionsForRun(runId);
      if (localActions.length > 0) {
        return {
          success: true,
          actions: localActions.map(buildActionSummary),
          total: localActions.length,
          error: null,
        };
      }
    }

    const memActions = getActionsForRun(runId);
    return {
      success: true,
      actions: memActions.map(buildActionSummary),
      total: memActions.length,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, actions: [], total: 0, error: message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Evidence operations
// ═══════════════════════════════════════════════════════════════════════════

export interface AttachEvidenceResult {
  success: boolean;
  evidence: AgentEvidence | null;
  error: string | null;
}

export async function serviceAttachEvidence(input: CreateEvidenceInput): Promise<AttachEvidenceResult> {
  try {
    const run = getRun(input.runId);
    if (!run) {
      return { success: false, evidence: null, error: `Run "${input.runId}" not found.` };
    }

    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      return {
        success: false,
        evidence: null,
        error: `Run "${input.runId}" is in terminal state "${run.status}". Cannot attach evidence.`,
      };
    }

    const evidence = recordEvidenceSvr(input);
    return { success: true, evidence, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, evidence: null, error: message };
  }
}

export interface LoadEvidenceForRunResult {
  success: boolean;
  evidence: AgentEvidenceSummary[];
  total: number;
  error: string | null;
}

export async function serviceLoadEvidenceForRun(runId: string): Promise<LoadEvidenceForRunResult> {
  try {
    const mode = await getPersistenceMode();

    if (mode === "durable") {
      const dbEvidence = await loadEvidenceForRunDb(runId);
      if (dbEvidence.length > 0) {
        return {
          success: true,
          evidence: dbEvidence.map(buildEvidenceSummary),
          total: dbEvidence.length,
          error: null,
        };
      }
    }

    if (mode === "local_file") {
      const localEvidence = loadLocalEvidenceForRun(runId);
      if (localEvidence.length > 0) {
        return {
          success: true,
          evidence: localEvidence.map(buildEvidenceSummary),
          total: localEvidence.length,
          error: null,
        };
      }
    }

    const memEvidence = getEvidenceForRun(runId);
    return {
      success: true,
      evidence: memEvidence.map(buildEvidenceSummary),
      total: memEvidence.length,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, evidence: [], total: 0, error: message };
  }
}
