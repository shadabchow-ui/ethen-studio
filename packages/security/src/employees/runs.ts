export type EmployeeRunStatus =
  | "queued"
  | "planning"
  | "loading_context"
  | "running"
  | "waiting_approval"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";

export type RunTriggerType = "manual" | "schedule" | "event" | "webhook";

export interface EmployeeRun {
  id: string;
  orgId: string;
  employeeId: string;
  workflowId: string | null;
  scheduleId: string | null;
  taskId: string | null;
  status: EmployeeRunStatus;
  trigger: RunTriggerType;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  model: string | null;
  provider: string | null;
  totalTokens: number | null;
  totalCostCents: number | null;
  summary: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const EMPLOYEE_RUN_STATUSES: EmployeeRunStatus[] = [
  "queued",
  "planning",
  "loading_context",
  "running",
  "waiting_approval",
  "retrying",
  "completed",
  "failed",
  "cancelled",
  "blocked",
];

export const TERMINAL_EMPLOYEE_RUN_STATUSES: EmployeeRunStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export const ACTIVE_EMPLOYEE_RUN_STATUSES: EmployeeRunStatus[] = [
  "queued",
  "planning",
  "loading_context",
  "running",
  "waiting_approval",
  "retrying",
  "blocked",
];

export const ALLOWED_RUN_TRANSITIONS: Record<EmployeeRunStatus, EmployeeRunStatus[]> = {
  queued: ["planning", "cancelled"],
  planning: ["loading_context", "failed", "cancelled"],
  loading_context: ["running", "failed", "cancelled"],
  running: ["waiting_approval", "retrying", "completed", "failed", "cancelled", "blocked"],
  waiting_approval: ["running", "retrying", "failed", "cancelled"],
  retrying: ["running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
  blocked: ["retrying", "cancelled"],
};

export function canTransitionRunStatus(
  current: EmployeeRunStatus,
  next: EmployeeRunStatus,
): boolean {
  return ALLOWED_RUN_TRANSITIONS[current]?.includes(next) ?? false;
}

let runCounter = 0;
const runs = new Map<string, EmployeeRun>();

function nextRunId(): string {
  runCounter += 1;
  return `erun-${runCounter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CreateEmployeeRunInput {
  orgId: string;
  employeeId: string;
  workflowId?: string | null;
  scheduleId?: string | null;
  taskId?: string | null;
  trigger: RunTriggerType;
}

export function createEmployeeRun(input: CreateEmployeeRunInput): EmployeeRun {
  const now = nowIso();
  const run: EmployeeRun = {
    id: nextRunId(),
    orgId: input.orgId,
    employeeId: input.employeeId,
    workflowId: input.workflowId ?? null,
    scheduleId: input.scheduleId ?? null,
    taskId: input.taskId ?? null,
    status: "queued",
    trigger: input.trigger,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    model: null,
    provider: null,
    totalTokens: null,
    totalCostCents: null,
    summary: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  runs.set(run.id, run);
  return run;
}

export function getEmployeeRun(id: string): EmployeeRun | null {
  return runs.get(id) ?? null;
}

export function setEmployeeRunStatus(
  id: string,
  status: EmployeeRunStatus,
): EmployeeRun | null {
  const existing = runs.get(id);
  if (!existing) return null;
  if (TERMINAL_EMPLOYEE_RUN_STATUSES.includes(existing.status)) return null;
  if (!canTransitionRunStatus(existing.status, status)) return null;

  const now = nowIso();
  const updates: Partial<EmployeeRun> = { status, updatedAt: now };

  if (status === "running" && !existing.startedAt) {
    updates.startedAt = now;
  }
  if (TERMINAL_EMPLOYEE_RUN_STATUSES.includes(status)) {
    updates.completedAt = now;
    if (existing.startedAt) {
      updates.durationMs = Date.now() - new Date(existing.startedAt).getTime();
    }
  }

  const updated: EmployeeRun = { ...existing, ...updates };
  runs.set(id, updated);
  return updated;
}

export function updateEmployeeRun(
  id: string,
  partial: Partial<Pick<EmployeeRun, "summary" | "error" | "model" | "provider" | "totalTokens" | "totalCostCents">>,
): EmployeeRun | null {
  const existing = runs.get(id);
  if (!existing) return null;
  const updated: EmployeeRun = { ...existing, ...partial, updatedAt: nowIso() };
  runs.set(id, updated);
  return updated;
}

export function getEmployeeRunsForEmployee(employeeId: string): EmployeeRun[] {
  const result: EmployeeRun[] = [];
  for (const run of runs.values()) {
    if (run.employeeId === employeeId) result.push(run);
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getEmployeeRunsForTask(taskId: string): EmployeeRun[] {
  const result: EmployeeRun[] = [];
  for (const run of runs.values()) {
    if (run.taskId === taskId) result.push(run);
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getActiveEmployeeRuns(): EmployeeRun[] {
  const result: EmployeeRun[] = [];
  for (const run of runs.values()) {
    if (!TERMINAL_EMPLOYEE_RUN_STATUSES.includes(run.status)) result.push(run);
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function resetEmployeeRunStore(): void {
  runs.clear();
  runCounter = 0;
}
