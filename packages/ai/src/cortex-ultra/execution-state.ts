// ── Cortex Ultra execution state helpers ──────────────────────────────────
// State machine transitions, run creation, timeline events, cost ceiling.
// Pure functions — no I/O, no side effects.

import type {
  CortexUltraRun,
  CortexUltraRunState,
  CortexUltraCostBudget,
  CortexUltraStoppingRule,
  CortexUltraStoppingRuleTrigger,
} from "./ultra-types";
import { TERMINAL_STATES } from "./ultra-types";

// ── ID generation ──────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Allowed state transitions ──────────────────────────────────────────────

const ALLOWED_TRANSITIONS: ReadonlyMap<CortexUltraRunState, ReadonlySet<CortexUltraRunState>> =
  new Map([
    ["PREFLIGHT", new Set<CortexUltraRunState>(["PLANNING", "ABORTED"])],
    ["PLANNING", new Set<CortexUltraRunState>(["PLAN_VALIDATION", "ABORTED"])],
    ["PLAN_VALIDATION", new Set<CortexUltraRunState>(["TEAM_ASSEMBLY", "PLANNING", "ABORTED"])],
    ["TEAM_ASSEMBLY", new Set<CortexUltraRunState>(["WORKER_DISPATCH", "ABORTED"])],
    [
      "WORKER_DISPATCH",
      new Set<CortexUltraRunState>(["TOOL_LOOP_RUNNING", "WORKER_INTEGRATION", "ABORTED"]),
    ],
    [
      "TOOL_LOOP_RUNNING",
      new Set<CortexUltraRunState>(["WORKER_INTEGRATION", "REPAIR_OR_RERUN", "ABORTED"]),
    ],
    [
      "WORKER_INTEGRATION",
      new Set<CortexUltraRunState>(["VERIFICATION", "SYNTHESIS", "ABORTED"]),
    ],
    [
      "VERIFICATION",
      new Set<CortexUltraRunState>(["REPAIR_OR_RERUN", "SYNTHESIS", "DEGRADED_COMPLETE", "ABORTED"]),
    ],
    [
      "REPAIR_OR_RERUN",
      new Set<CortexUltraRunState>(["WORKER_DISPATCH", "VERIFICATION", "ABORTED"]),
    ],
    ["SYNTHESIS", new Set<CortexUltraRunState>(["FINAL_VERIFICATION", "ABORTED"])],
    [
      "FINAL_VERIFICATION",
      new Set<CortexUltraRunState>(["COMPLETE", "DEGRADED_COMPLETE", "ABORTED"]),
    ],
    ["COMPLETE", new Set<CortexUltraRunState>()],
    ["DEGRADED_COMPLETE", new Set<CortexUltraRunState>()],
    ["ABORTED", new Set<CortexUltraRunState>()],
  ]);

export function isTransitionAllowed(
  from: CortexUltraRunState,
  to: CortexUltraRunState
): boolean {
  return ALLOWED_TRANSITIONS.get(from)?.has(to) ?? false;
}

export function assertTransitionAllowed(
  from: CortexUltraRunState,
  to: CortexUltraRunState
): void {
  if (!isTransitionAllowed(from, to)) {
    throw new Error(`Invalid Ultra state transition: ${from} → ${to}`);
  }
}

// ── Run factory ────────────────────────────────────────────────────────────

export interface CreateUltraRunOptions {
  requestId?: string;
  userId?: string | null;
  sessionId?: string | null;
  projectId?: string | null;
  intentSummary?: string | null;
  hardCeilingUsd?: number;
  softWarningUsd?: number;
  maxToolCallIterations?: number;
}

export function createUltraRun(opts: CreateUltraRunOptions = {}): CortexUltraRun {
  const now = new Date().toISOString();
  const runId = genId("cu");
  const hardCeilingUsd = opts.hardCeilingUsd ?? 2.0;
  const costBudget: CortexUltraCostBudget = {
    hardCeilingUsd,
    softWarningUsd: opts.softWarningUsd ?? hardCeilingUsd * 0.75,
    accumulatedUsd: 0,
    maxToolCallIterations: opts.maxToolCallIterations ?? 20,
    consumedToolCallIterations: 0,
  };
  return {
    runId,
    requestId: opts.requestId ?? genId("req"),
    userId: opts.userId ?? null,
    sessionId: opts.sessionId ?? null,
    projectId: opts.projectId ?? null,
    state: "PREFLIGHT",
    intentSummary: opts.intentSummary ?? null,
    plan: null,
    workers: [],
    steps: [],
    verifierResults: [],
    synthesisResult: null,
    evalResults: [],
    costBudget,
    stoppingRule: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    timeline: [{ at: now, event: "run_created", state: "PREFLIGHT" }],
  };
}

// ── Timeline event ─────────────────────────────────────────────────────────

export function appendTimelineEvent(
  run: CortexUltraRun,
  event: string,
  detail?: string
): CortexUltraRun {
  const now = new Date().toISOString();
  return {
    ...run,
    updatedAt: now,
    timeline: [...run.timeline, { at: now, event, state: run.state, detail }],
  };
}

// ── State transition ───────────────────────────────────────────────────────

export function transitionState(
  run: CortexUltraRun,
  to: CortexUltraRunState,
  detail?: string
): CortexUltraRun {
  assertTransitionAllowed(run.state, to);
  const now = new Date().toISOString();
  const isTerminal = TERMINAL_STATES.has(to);
  return {
    ...run,
    state: to,
    updatedAt: now,
    completedAt: isTerminal ? now : run.completedAt,
    timeline: [
      ...run.timeline,
      { at: now, event: `transition:${run.state}→${to}`, state: to, detail },
    ],
  };
}

// ── Cost ceiling ───────────────────────────────────────────────────────────

export interface CostCeilingCheckResult {
  exceeded: boolean;
  soft: boolean;
  reason: string | null;
}

export function checkCostCeiling(budget: CortexUltraCostBudget): CostCeilingCheckResult {
  if (budget.consumedToolCallIterations >= budget.maxToolCallIterations) {
    return {
      exceeded: true,
      soft: false,
      reason: `Tool iteration limit reached: ${budget.consumedToolCallIterations}/${budget.maxToolCallIterations}`,
    };
  }
  if (budget.accumulatedUsd >= budget.hardCeilingUsd) {
    return {
      exceeded: true,
      soft: false,
      reason: `Hard cost ceiling exceeded: $${budget.accumulatedUsd.toFixed(4)} >= $${budget.hardCeilingUsd}`,
    };
  }
  if (budget.accumulatedUsd >= budget.softWarningUsd) {
    return {
      exceeded: false,
      soft: true,
      reason: `Soft cost warning: $${budget.accumulatedUsd.toFixed(4)} >= $${budget.softWarningUsd}`,
    };
  }
  return { exceeded: false, soft: false, reason: null };
}

export function addCost(
  run: CortexUltraRun,
  usd: number,
  toolIterations = 0
): CortexUltraRun {
  const budget: CortexUltraCostBudget = {
    ...run.costBudget,
    accumulatedUsd: run.costBudget.accumulatedUsd + usd,
    consumedToolCallIterations:
      run.costBudget.consumedToolCallIterations + toolIterations,
  };
  return { ...run, costBudget: budget, updatedAt: new Date().toISOString() };
}

// ── Degraded completion ────────────────────────────────────────────────────

export function markDegradedComplete(
  run: CortexUltraRun,
  trigger: CortexUltraStoppingRuleTrigger,
  detail: string
): CortexUltraRun {
  const stoppingRule: CortexUltraStoppingRule = {
    trigger,
    triggeredAt: new Date().toISOString(),
    detail,
  };
  const transitioned = transitionState(run, "DEGRADED_COMPLETE", detail);
  return { ...transitioned, stoppingRule };
}

// ── Abort ──────────────────────────────────────────────────────────────────

export function markAborted(
  run: CortexUltraRun,
  trigger: CortexUltraStoppingRuleTrigger,
  detail: string
): CortexUltraRun {
  if (TERMINAL_STATES.has(run.state)) {
    return run; // already terminal, no-op
  }
  const stoppingRule: CortexUltraStoppingRule = {
    trigger,
    triggeredAt: new Date().toISOString(),
    detail,
  };
  // Force transition even from non-standard state by patching state before transition check.
  const now = new Date().toISOString();
  return {
    ...run,
    state: "ABORTED",
    stoppingRule,
    updatedAt: now,
    completedAt: now,
    timeline: [
      ...run.timeline,
      { at: now, event: `aborted:${trigger}`, state: "ABORTED", detail },
    ],
  };
}
