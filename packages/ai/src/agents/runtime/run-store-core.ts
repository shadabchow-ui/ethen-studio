import type {
  AgentRun,
  AgentRunStatus,
  AgentAction,
  AgentActionStatus,
  AgentEvidence,
  EvidenceType,
  RunTriggerType,
  BackgroundAgentsDashboard,
  RuntimeTransitionContext,
} from "./types";
import type { ToolId, ToolRiskLevel } from "@ethen/contracts/tools/types";
import { TERMINAL_RUN_STATUSES } from "./types";
import { appendTransitionLogEntry, getTransitionLog, resetTransitionLogs } from "./transition-log";
import { canTransitionRunStatus, isTerminalRunStatus } from "./state-machine";

// ── Redaction helpers ────────────────────────────────────────────────────

const SENSITIVE_KEY_PATTERNS = [
  /secret/i,
  /token/i,
  /key/i,
  /password/i,
  /credential/i,
  /authorization/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
];

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return SENSITIVE_KEY_PATTERNS.some((p) => p.test(value))
      ? "[REDACTED]"
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactValue(val);
    }
  }
  return result;
}

// ── In-memory stores ─────────────────────────────────────────────────────

export const runs = new Map<string, AgentRun>();
export const actions = new Map<string, AgentAction>();
export const evidenceEntries: AgentEvidence[] = [];

export let runCounter = 0;
export let actionCounter = 0;
export let evidenceCounter = 0;

export function nextRunId(): string {
  runCounter += 1;
  return `run-${runCounter}`;
}

export function nextActionId(): string {
  actionCounter += 1;
  return `action-${actionCounter}`;
}

export function nextEvidenceId(): string {
  evidenceCounter += 1;
  return `evidence-${evidenceCounter}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ── Run store ────────────────────────────────────────────────────────────

export interface CreateRunInput {
  agentSlug: string;
  triggerType: RunTriggerType;
  input?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  initiatedBy?: string | null;
  parentRunId?: string | null;
  runId?: string | null;
}

export function createRun(input: CreateRunInput): AgentRun {
  const id = input.runId ?? nextRunId();
  const now = nowIso();

  const run: AgentRun = {
    id,
    agentSlug: input.agentSlug,
    status: "pending",
    triggerType: input.triggerType,
    idempotencyKey: input.idempotencyKey ?? null,
    input: input.input ?? null,
    output: null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
    initiatedBy: input.initiatedBy ?? null,
    parentRunId: input.parentRunId ?? null,
  };

  runs.set(run.id, run);
  return run;
}

export function getRun(id: string): AgentRun | null {
  return runs.get(id) ?? null;
}

export function getRunByIdempotencyKey(key: string): AgentRun | null {
  for (const run of runs.values()) {
    if (run.idempotencyKey === key) return run;
  }
  return null;
}

export function setRunStatus(
  id: string,
  status: AgentRunStatus,
  context?: RuntimeTransitionContext | null,
): AgentRun | null {
  const existing = runs.get(id);
  if (!existing) return null;

  const now = nowIso();
  const decision = canTransitionRunStatus(existing.status, status, context);
  if (!decision.allowed) {
    appendTransitionLogEntry({
      run: existing,
      toStatus: status,
      context,
      occurredAt: now,
      error: decision.error,
    });
    return null;
  }

  const updates: Partial<AgentRun> = {
    status,
    updatedAt: now,
  };

  if (status === "running" && !existing.startedAt) {
    updates.startedAt = now;
  }
  if (isTerminalRunStatus(status)) {
    updates.completedAt = now;
  }

  const updated = { ...existing, ...updates };
  runs.set(id, updated);
  appendTransitionLogEntry({
    run: existing,
    toStatus: status,
    context,
    occurredAt: now,
  });
  return updated;
}

export function setRunOutput(id: string, output: Record<string, unknown>): AgentRun | null {
  const existing = runs.get(id);
  if (!existing) return null;
  const updated = { ...existing, output, updatedAt: nowIso() };
  runs.set(id, updated);
  return updated;
}

export function cancelRun(id: string): AgentRun | null {
  return setRunStatus(id, "canceled");
}

export function failRun(id: string, error?: Record<string, unknown>): AgentRun | null {
  const updated = setRunStatus(id, "failed");
  if (updated && error) {
    return setRunOutput(id, error);
  }
  return updated;
}

export function getRunsForAgent(agentSlug: string): AgentRun[] {
  const result: AgentRun[] = [];
  for (const run of runs.values()) {
    if (run.agentSlug === agentSlug) result.push(run);
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getActiveRuns(): AgentRun[] {
  const result: AgentRun[] = [];
  for (const run of runs.values()) {
    if (!TERMINAL_RUN_STATUSES.includes(run.status)) result.push(run);
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getRunCount(): number {
  return runs.size;
}

export function getRunTransitionLog(id: string) {
  return getTransitionLog(id);
}

export function getRootRuns(): AgentRun[] {
  const result: AgentRun[] = [];
  for (const run of runs.values()) {
    if (!run.parentRunId) result.push(run);
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getChildRuns(parentRunId: string): AgentRun[] {
  const result: AgentRun[] = [];
  for (const run of runs.values()) {
    if (run.parentRunId === parentRunId) result.push(run);
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getBackgroundAgentsDashboard(): BackgroundAgentsDashboard {
  const allRuns = Array.from(runs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    active: allRuns.filter((run) => run.status === "pending" || run.status === "running"),
    waitingApprovals: allRuns.filter(
      (run) => run.status === "awaiting_approval" || run.status === "partially_approved",
    ),
    blocked: allRuns.filter((run) => run.status === "rejected"),
    completedRecent: allRuns.filter((run) => run.status === "completed").slice(0, 10),
    failedRecent: allRuns.filter((run) => run.status === "failed" || run.status === "canceled").slice(0, 10),
    backgroundExecutionAvailable: false,
  };
}

// ── Action store ─────────────────────────────────────────────────────────

export interface CreateActionInput {
  runId: string;
  step: number;
  toolId: ToolId;
  riskLevel: ToolRiskLevel;
  input?: Record<string, unknown> | null;
  proposalId?: string | null;
}

export function createAction(input: CreateActionInput): AgentAction {
  const now = nowIso();
  const action: AgentAction = {
    id: nextActionId(),
    runId: input.runId,
    step: input.step,
    toolId: input.toolId,
    riskLevel: input.riskLevel,
    status: "pending",
    input: input.input ?? null,
    output: null,
    proposalId: input.proposalId ?? null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
  };

  actions.set(action.id, action);
  return action;
}

export function getAction(id: string): AgentAction | null {
  return actions.get(id) ?? null;
}

export function setActionStatus(id: string, status: AgentActionStatus): AgentAction | null {
  const existing = actions.get(id);
  if (!existing) return null;

  const now = nowIso();
  const updates: Partial<AgentAction> = { status };

  if (status === "running" && !existing.startedAt) {
    updates.startedAt = now;
  }
  if (["completed", "failed", "rejected", "skipped"].includes(status)) {
    updates.completedAt = now;
  }

  const updated = { ...existing, ...updates };
  actions.set(id, updated);
  return updated;
}

export function setActionOutput(id: string, output: Record<string, unknown>): AgentAction | null {
  const existing = actions.get(id);
  if (!existing) return null;
  const updated = { ...existing, output };
  actions.set(id, updated);
  return updated;
}

export function getActionsForRun(runId: string): AgentAction[] {
  const result: AgentAction[] = [];
  for (const action of actions.values()) {
    if (action.runId === runId) result.push(action);
  }
  return result.sort((a, b) => a.step - b.step);
}

export function getPendingActionsForRun(runId: string): AgentAction[] {
  return getActionsForRun(runId).filter(
    (a) => a.status === "pending" || a.status === "awaiting_approval",
  );
}

// ── Evidence store ───────────────────────────────────────────────────────

export interface CreateEvidenceInput {
  runId: string;
  actionId?: string | null;
  evidenceType: EvidenceType;
  label: string;
  contentUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function recordEvidence(input: CreateEvidenceInput): AgentEvidence {
  const redactedMeta = input.metadata ? redactObject(input.metadata) : null;

  const entry: AgentEvidence = {
    id: nextEvidenceId(),
    runId: input.runId,
    actionId: input.actionId ?? null,
    evidenceType: input.evidenceType,
    label: input.label,
    contentUrl: input.contentUrl ?? null,
    metadata: redactedMeta,
    createdAt: nowIso(),
  };

  evidenceEntries.push(entry);
  return entry;
}

export function getEvidenceForRun(runId: string): AgentEvidence[] {
  return evidenceEntries
    .filter((e) => e.runId === runId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getEvidenceForAction(actionId: string): AgentEvidence[] {
  return evidenceEntries
    .filter((e) => e.actionId === actionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ── Store reset (for tests) ──────────────────────────────────────────────

export function resetRuntimeStore(): void {
  runs.clear();
  actions.clear();
  evidenceEntries.length = 0;
  runCounter = 0;
  actionCounter = 0;
  evidenceCounter = 0;
  resetTransitionLogs();
}

// ── Audit helpers ────────────────────────────────────────────────────────

export function buildRunAuditEntry(
  run: AgentRun,
  eventSummary: string,
  extraMeta?: Record<string, unknown> | null,
): { eventType: string; toolId: string; sessionId: string | null; metadata: Record<string, unknown> | null } {
  const baseMeta: Record<string, unknown> = {
    runId: run.id,
    agentSlug: run.agentSlug,
    triggerType: run.triggerType,
    status: run.status,
    summary: eventSummary,
  };
  return {
    eventType: "agent_run_event",
    toolId: "agent.runtime",
    sessionId: run.id,
    metadata: redactObject(extraMeta ? { ...baseMeta, ...extraMeta } : baseMeta),
  };
}
