export type EmployeeRunStepType =
  | "plan"
  | "context_load"
  | "tool_check"
  | "tool_call"
  | "approval_gate"
  | "report_generation"
  | "notification"
  | "retry"
  | "error"
  | "complete";

export type EmployeeRunStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked";

export interface EmployeeRunStep {
  id: string;
  runId: string;
  order: number;
  type: EmployeeRunStepType;
  status: EmployeeRunStepStatus;
  title: string;
  summary: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  toolId: string | null;
  approvalRequestId: string | null;
  auditEventId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export interface ToolCallRecord {
  stepId: string;
  runId: string;
  toolId: string;
  inputSummary: Record<string, unknown>;
  outputSummary: Record<string, unknown> | null;
  durationMs: number | null;
  costCents: number | null;
  riskLevel: string;
  approvalRequired: boolean;
  startedAt: string;
  completedAt: string | null;
}

export interface EvidenceReference {
  id: string;
  stepId: string;
  runId: string;
  label: string;
  sourceName: string;
  contentUrl: string | null;
  confidence: "high" | "medium" | "low";
  freshness: string | null;
  verified: boolean;
  createdAt: string;
}

export interface ReportArtifactLink {
  id: string;
  runId: string;
  stepId: string | null;
  title: string;
  type: string;
  url: string | null;
  generatedAt: string;
}

let stepCounter = 0;
const steps = new Map<string, EmployeeRunStep>();

function nextStepId(): string {
  stepCounter += 1;
  return `estep-${stepCounter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CreateEmployeeRunStepInput {
  runId: string;
  order: number;
  type: EmployeeRunStepType;
  title: string;
  summary?: string | null;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  toolId?: string | null;
  approvalRequestId?: string | null;
  auditEventId?: string | null;
}

export function createEmployeeRunStep(input: CreateEmployeeRunStepInput): EmployeeRunStep {
  const step: EmployeeRunStep = {
    id: nextStepId(),
    runId: input.runId,
    order: input.order,
    type: input.type,
    status: "pending",
    title: input.title,
    summary: input.summary ?? null,
    input: input.input ?? null,
    output: input.output ?? null,
    toolId: input.toolId ?? null,
    approvalRequestId: input.approvalRequestId ?? null,
    auditEventId: input.auditEventId ?? null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
  };
  steps.set(step.id, step);
  return step;
}

export function getEmployeeRunStep(id: string): EmployeeRunStep | null {
  return steps.get(id) ?? null;
}

export function setEmployeeRunStepStatus(
  id: string,
  status: EmployeeRunStepStatus,
): EmployeeRunStep | null {
  const existing = steps.get(id);
  if (!existing) return null;
  const now = nowIso();
  const updates: Partial<EmployeeRunStep> = { status };
  if (status === "running" && !existing.startedAt) {
    updates.startedAt = now;
  }
  if (status === "completed" || status === "failed" || status === "blocked") {
    updates.completedAt = now;
    if (existing.startedAt) {
      updates.durationMs = Date.now() - new Date(existing.startedAt).getTime();
    }
  }
  const updated: EmployeeRunStep = { ...existing, ...updates };
  steps.set(id, updated);
  return updated;
}

export function setEmployeeRunStepOutput(
  id: string,
  output: Record<string, unknown>,
): EmployeeRunStep | null {
  const existing = steps.get(id);
  if (!existing) return null;
  const updated: EmployeeRunStep = { ...existing, output };
  steps.set(id, updated);
  return updated;
}

export function getStepsForEmployeeRun(runId: string): EmployeeRunStep[] {
  const result: EmployeeRunStep[] = [];
  for (const step of steps.values()) {
    if (step.runId === runId) result.push(step);
  }
  return result.sort((a, b) => a.order - b.order);
}

export function getStepsByTypeForRun(
  runId: string,
  type: EmployeeRunStepType,
): EmployeeRunStep[] {
  return getStepsForEmployeeRun(runId).filter((s) => s.type === type);
}

export function resetEmployeeRunStepStore(): void {
  steps.clear();
  stepCounter = 0;
}
