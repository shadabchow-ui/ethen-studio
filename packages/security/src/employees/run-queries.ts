import type { EmployeeRunStatus } from "./runs";
import {
  createEmployeeRun,
  setEmployeeRunStatus,
  updateEmployeeRun,
  getEmployeeRun,
  getEmployeeRunsForEmployee,
  getEmployeeRunsForTask,
  type CreateEmployeeRunInput,
  type EmployeeRun,
} from "./runs";
import type { EmployeeTaskStatus } from "./tasks";
import {
  createEmployeeTask,
  setEmployeeTaskStatus,
  getEmployeeTask,
  type CreateEmployeeTaskInput,
  type EmployeeTask,
} from "./tasks";
import type { EmployeeRunStepType } from "./run-steps";
import { addTimelineEvent, completeTimelineEvent, getTimelineForRun } from "./run-timeline";

export interface CreateRunWithTaskInput {
  orgId: string;
  employeeId: string;
  taskTitle: string;
  taskGoal: string;
  trigger: "manual" | "schedule" | "event" | "webhook";
  taskInput?: Record<string, unknown>;
  workflowId?: string | null;
  scheduleId?: string | null;
}

export interface CreateRunWithTaskResult {
  task: EmployeeTask;
  run: EmployeeRun;
  error: string | null;
}

export function createRunWithTask(input: CreateRunWithTaskInput): CreateRunWithTaskResult {
  const task = createEmployeeTask({
    orgId: input.orgId,
    employeeId: input.employeeId,
    workflowId: input.workflowId,
    scheduleId: input.scheduleId,
    title: input.taskTitle,
    goal: input.taskGoal,
    trigger: input.trigger,
    input: input.taskInput,
  });

  const runInput: CreateEmployeeRunInput = {
    orgId: input.orgId,
    employeeId: input.employeeId,
    workflowId: input.workflowId,
    scheduleId: input.scheduleId,
    taskId: task.id,
    trigger: input.trigger,
  };

  const run = createEmployeeRun(runInput);

  addTimelineEvent(run.id, "plan", `Plan: ${input.taskTitle}`, {
    input: input.taskInput,
  });

  return { task, run, error: null };
}

export function advanceRunStatus(
  runId: string,
  status: EmployeeRunStatus,
): EmployeeRun | null {
  return setEmployeeRunStatus(runId, status);
}

export function completeRun(
  runId: string,
  summary?: string,
): EmployeeRun | null {
  const run = getEmployeeRun(runId);
  if (!run) return null;

  if (summary) {
    updateEmployeeRun(runId, { summary });
  }

  addTimelineEvent(runId, "complete", "Run completed");
  return setEmployeeRunStatus(runId, "completed");
}

export function failRun(
  runId: string,
  error: string,
): EmployeeRun | null {
  const run = getEmployeeRun(runId);
  if (!run) return null;

  updateEmployeeRun(runId, { error });

  addTimelineEvent(runId, "error", "Run failed", {
    summary: error,
  });

  return setEmployeeRunStatus(runId, "failed");
}

export function cancelRun(runId: string): EmployeeRun | null {
  const run = getEmployeeRun(runId);
  if (!run) return null;

  addTimelineEvent(runId, "error", "Run cancelled");
  return setEmployeeRunStatus(runId, "cancelled");
}

export function addStepToRun(
  runId: string,
  type: EmployeeRunStepType,
  title: string,
  options?: {
    summary?: string | null;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    toolId?: string | null;
  },
) {
  return addTimelineEvent(runId, type, title, options);
}

export function getRunTimeline(runId: string) {
  return getTimelineForRun(runId);
}

export function advanceTaskStatus(
  taskId: string,
  status: EmployeeTaskStatus,
): EmployeeTask | null {
  return setEmployeeTaskStatus(taskId, status);
}

export type {
  EmployeeRun,
  EmployeeRunStatus,
} from "./runs";
export type {
  EmployeeTask,
  EmployeeTaskStatus,
} from "./tasks";
export type {
  EmployeeRunStep,
  EmployeeRunStepType,
} from "./run-steps";
