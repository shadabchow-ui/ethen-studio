import type { EmployeeRunStep, EmployeeRunStepType, EmployeeRunStepStatus } from "./run-steps";
import { createEmployeeRunStep, setEmployeeRunStepStatus, setEmployeeRunStepOutput, getStepsForEmployeeRun } from "./run-steps";

export function orderTimelineEvents(steps: EmployeeRunStep[]): EmployeeRunStep[] {
  return [...steps].sort((a, b) => a.order - b.order);
}

export function getTimelineForRun(runId: string): EmployeeRunStep[] {
  return orderTimelineEvents(getStepsForEmployeeRun(runId));
}

export interface AddTimelineEventOptions {
  summary?: string | null;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  toolId?: string | null;
  approvalRequestId?: string | null;
  auditEventId?: string | null;
}

export function addTimelineEvent(
  runId: string,
  type: EmployeeRunStepType,
  title: string,
  options?: AddTimelineEventOptions,
): EmployeeRunStep {
  const existing = getStepsForEmployeeRun(runId);
  const order = existing.length > 0 ? Math.max(...existing.map((s) => s.order)) + 1 : 1;

  return createEmployeeRunStep({
    runId,
    order,
    type,
    title,
    summary: options?.summary ?? null,
    input: options?.input ?? null,
    output: options?.output ?? null,
    toolId: options?.toolId ?? null,
    approvalRequestId: options?.approvalRequestId ?? null,
    auditEventId: options?.auditEventId ?? null,
  });
}

export function completeTimelineEvent(
  stepId: string,
  status: Extract<EmployeeRunStepStatus, "completed" | "failed" | "blocked">,
  output?: Record<string, unknown> | null,
): EmployeeRunStep | null {
  const updated = setEmployeeRunStepStatus(stepId, status);
  if (updated && output) {
    return setEmployeeRunStepOutput(stepId, output);
  }
  return updated;
}
