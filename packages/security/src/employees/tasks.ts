export type EmployeeTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface EmployeeTask {
  id: string;
  orgId: string;
  employeeId: string;
  workflowId: string | null;
  scheduleId: string | null;
  title: string;
  goal: string;
  trigger: "manual" | "schedule" | "event" | "webhook";
  input: Record<string, unknown>;
  status: EmployeeTaskStatus;
  createdAt: string;
}

let taskCounter = 0;
const tasks = new Map<string, EmployeeTask>();

function nextTaskId(): string {
  taskCounter += 1;
  return `etask-${taskCounter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CreateEmployeeTaskInput {
  orgId: string;
  employeeId: string;
  workflowId?: string | null;
  scheduleId?: string | null;
  title: string;
  goal: string;
  trigger: "manual" | "schedule" | "event" | "webhook";
  input?: Record<string, unknown>;
}

export function createEmployeeTask(input: CreateEmployeeTaskInput): EmployeeTask {
  const now = nowIso();
  const task: EmployeeTask = {
    id: nextTaskId(),
    orgId: input.orgId,
    employeeId: input.employeeId,
    workflowId: input.workflowId ?? null,
    scheduleId: input.scheduleId ?? null,
    title: input.title,
    goal: input.goal,
    trigger: input.trigger,
    input: input.input ?? {},
    status: "queued",
    createdAt: now,
  };
  tasks.set(task.id, task);
  return task;
}

export function getEmployeeTask(id: string): EmployeeTask | null {
  return tasks.get(id) ?? null;
}

export function setEmployeeTaskStatus(
  id: string,
  status: EmployeeTaskStatus,
): EmployeeTask | null {
  const existing = tasks.get(id);
  if (!existing) return null;
  const updated: EmployeeTask = { ...existing, status };
  tasks.set(id, updated);
  return updated;
}

export const EMPLOYEE_TASK_STATUSES: EmployeeTaskStatus[] = [
  "queued", "running", "completed", "failed", "cancelled",
];

export function getEmployeeTasksForEmployee(employeeId: string): EmployeeTask[] {
  const result: EmployeeTask[] = [];
  for (const task of tasks.values()) {
    if (task.employeeId === employeeId) result.push(task);
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPendingTasksForEmployee(employeeId: string): EmployeeTask[] {
  return getEmployeeTasksForEmployee(employeeId).filter(
    (t) => t.status === "queued" || t.status === "running",
  );
}

export function getActiveEmployeeTasks(): EmployeeTask[] {
  const result: EmployeeTask[] = [];
  for (const task of tasks.values()) {
    if (task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled") {
      result.push(task);
    }
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function resetEmployeeTaskStore(): void {
  tasks.clear();
  taskCounter = 0;
}
