import type { AgentRun, AgentAction, AgentEvidence, AgentValidationResult, AgentValidationGate } from "./types";
import type { ToolId } from "@ethen/contracts/tools/types";
import {
  createRun,
  setRunStatus,
  getRun,
  getRunByIdempotencyKey,
  cancelRun,
  failRun,
  createAction,
  setActionStatus,
  getAction,
  getActionsForRun,
  recordEvidence,
  getEvidenceForRun,
  buildRunAuditEntry,
  type CreateRunInput,
  type CreateActionInput,
  type CreateEvidenceInput,
} from "./run-store";
import { getEntry } from "./registry";
import { proposeToolAction, approveProposalAction, rejectProposalAction } from "@ethen/security/approvals/service";
import { recordAuditEvent } from "@ethen/security/audit/service";

function moveRunIntoRunningIfNeeded(runId: string): void {
  const current = getRun(runId);
  if (!current) return;
  if (current.status === "running") return;
  setRunStatus(runId, "running");
}

function moveRunIntoApprovalIfNeeded(runId: string, action: AgentAction): void {
  const current = getRun(runId);
  if (!current) return;
  if (current.status === "awaiting_approval" || current.status === "partially_approved") return;

  if (current.status === "pending" || current.status === "queued") {
    setRunStatus(runId, "planning");
  }

  setRunStatus(runId, "awaiting_approval", {
    proposalId: action.proposalId ?? null,
    metadata: { actionId: action.id },
  });
}

// ── createAgentRun ───────────────────────────────────────────────────────

export interface AgentRunResult {
  success: boolean;
  run: AgentRun | null;
  error: string | null;
}

export function createAgentRun(
  agentSlug: string,
  input?: Record<string, unknown> | null,
  options?: {
    triggerType?: "manual" | "scheduled" | "webhook" | "event_driven";
    idempotencyKey?: string | null;
    initiatedBy?: string | null;
    parentRunId?: string | null;
  },
): AgentRunResult {
  const entry = getEntry(agentSlug);

  if (!entry) {
    return { success: false, run: null, error: `Agent "${agentSlug}" not found in registry.` };
  }

  if (entry.implementationStatus === "not_started") {
    return {
      success: false,
      run: null,
      error: `Agent "${agentSlug}" is not yet implemented (status: not_started).`,
    };
  }

  if (options?.idempotencyKey) {
    const existing = getRunByIdempotencyKey(options.idempotencyKey);
    if (existing) {
      return { success: true, run: existing, error: null };
    }
  }

  const runInput: CreateRunInput = {
    agentSlug,
    triggerType: options?.triggerType ?? "manual",
    input,
    idempotencyKey: options?.idempotencyKey ?? null,
    initiatedBy: options?.initiatedBy ?? null,
    parentRunId: options?.parentRunId ?? null,
  };

  const run = createRun(runInput);

  recordAuditEvent(
    "action_executed",
    "agent.runtime",
    run.id,
    buildRunAuditEntry(run, "Agent run created").metadata,
  );

  return { success: true, run, error: null };
}

// ── recordAgentAction ────────────────────────────────────────────────────

export interface AgentActionResult {
  success: boolean;
  action: AgentAction | null;
  error: string | null;
  approvalRequired: boolean;
}

export function recordAgentAction(
  runId: string,
  toolId: ToolId,
  step: number,
  input?: Record<string, unknown> | null,
): AgentActionResult {
  const run = getRun(runId);
  if (!run) {
    return { success: false, action: null, error: `Run "${runId}" not found.`, approvalRequired: false };
  }

  const proposalResult = proposeToolAction(toolId, input ?? {}, {
    sessionId: runId,
  });

  const riskLevel = proposalResult.tool?.riskLevel ?? "read_only";

  const actionInput: CreateActionInput = {
    runId,
    step,
    toolId,
    riskLevel,
    input,
    proposalId: null,
  };

  if (proposalResult.decision === "blocked") {
    const action = createAction(actionInput);
    const updated = setActionStatus(action.id, "failed");
    return {
      success: true,
      action: updated,
      error: `Tool "${toolId}" is blocked: not available or policy prevented execution.`,
      approvalRequired: false,
    };
  }

  if (proposalResult.decision === "proposal_required" && proposalResult.proposal) {
    const action = createAction({
      ...actionInput,
      proposalId: proposalResult.proposal.id,
    });
    const updated = setActionStatus(action.id, "awaiting_approval");

    return {
      success: true,
      action: updated,
      error: null,
      approvalRequired: true,
    };
  }

  const action = createAction(actionInput);
  const updated = setActionStatus(action.id, "running");

  return {
    success: true,
    action: updated,
    error: null,
    approvalRequired: false,
  };
}

// ── requestAgentApproval ─────────────────────────────────────────────────

export interface AgentApprovalResult {
  success: boolean;
  approvalCompleted: boolean;
  action: AgentAction | null;
  error: string | null;
}

export function requestAgentApproval(actionId: string): AgentApprovalResult {
  const action = getAction(actionId);
  if (!action) {
    return { success: false, approvalCompleted: false, action: null, error: `Action "${actionId}" not found.` };
  }

  if (action.status !== "awaiting_approval") {
    return {
      success: false,
      approvalCompleted: false,
      action,
      error: `Action "${actionId}" is not awaiting approval (status: ${action.status}).`,
    };
  }

  if (!action.proposalId) {
    return {
      success: false,
      approvalCompleted: false,
      action,
      error: "Action has no associated approval proposal.",
    };
  }

  const result = approveProposalAction(action.proposalId);

  if (!result.success) {
    return {
      success: false,
      approvalCompleted: false,
      action,
      error: result.error ?? "Approval failed.",
    };
  }

  setActionStatus(action.id, "approved");
  return {
    success: true,
    approvalCompleted: true,
    action: getAction(action.id),
    error: null,
  };
}

export function rejectAgentApproval(actionId: string): AgentApprovalResult {
  const action = getAction(actionId);
  if (!action) {
    return { success: false, approvalCompleted: false, action: null, error: `Action "${actionId}" not found.` };
  }

  if (action.status !== "awaiting_approval") {
    return {
      success: false,
      approvalCompleted: false,
      action,
      error: `Action "${actionId}" is not awaiting approval (status: ${action.status}).`,
    };
  }

  if (!action.proposalId) {
    return {
      success: false,
      approvalCompleted: false,
      action,
      error: "Action has no associated approval proposal.",
    };
  }

  const result = rejectProposalAction(action.proposalId);

  if (!result.success) {
    return {
      success: false,
      approvalCompleted: false,
      action,
      error: result.error ?? "Rejection failed.",
    };
  }

  setActionStatus(action.id, "rejected");

  const run = getRun(action.runId);
  if (run) {
    moveRunIntoApprovalIfNeeded(run.id, action);
    setRunStatus(run.id, "rejected", {
      reason: "approval_rejected",
      metadata: { actionId: action.id, proposalId: action.proposalId },
    });
  }

  return {
    success: true,
    approvalCompleted: true,
    action: getAction(action.id),
    error: null,
  };
}

// ── cancelAgentRun ────────────────────────────────────────────────────────

export function cancelAgentRun(runId: string): AgentRun | null {
  const run = getRun(runId);
  if (!run) return null;

  const cancelled = cancelRun(runId);

  if (cancelled) {
    recordAuditEvent(
      "run.failed",
      "agent.runtime",
      runId,
      buildRunAuditEntry(run, "Run cancelled by user.").metadata,
    );
  }

  return cancelled;
}

// ── failAgentRun ──────────────────────────────────────────────────────────

export function failAgentRun(runId: string, reason: string): AgentRun | null {
  const run = getRun(runId);
  if (!run) return null;

  const failed = failRun(runId, { error: reason });

  if (failed) {
    recordAuditEvent(
      "run.failed",
      "agent.runtime",
      runId,
      buildRunAuditEntry(run, `Run failed: ${reason}`).metadata,
    );
  }

  return failed;
}

// ── recordAgentEvidence ──────────────────────────────────────────────────

export function recordAgentEvidence(
  runId: string,
  evidenceType: CreateEvidenceInput["evidenceType"],
  label: string,
  options?: {
    actionId?: string | null;
    contentUrl?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): AgentEvidence {
  const entry = recordEvidence({
    runId,
    actionId: options?.actionId ?? null,
    evidenceType,
    label,
    contentUrl: options?.contentUrl ?? null,
    metadata: options?.metadata ?? null,
  });

  recordAuditEvent(
    "action_executed",
    "agent.runtime",
    runId,
    { evidenceId: entry.id, evidenceType, label },
  );

  return entry;
}

// ── appendAgentAuditEntry ────────────────────────────────────────────────

export function appendAgentAuditEntry(
  runId: string,
  eventSummary: string,
  extraMeta?: Record<string, unknown> | null,
): void {
  const run = getRun(runId);
  if (!run) return;

  const auditPayload = buildRunAuditEntry(run, eventSummary, extraMeta);
  recordAuditEvent(
    "action_executed",
    "agent.runtime",
    runId,
    auditPayload.metadata,
  );
}

// ── resolveAgentRunStatus ────────────────────────────────────────────────

export function resolveAgentRunStatus(runId: string): AgentRun | null {
  const run = getRun(runId);
  if (!run) return null;

  const actions = getActionsForRun(runId);

  if (actions.length === 0) {
    return run;
  }

  const allTerminal = actions.every((a) =>
    ["completed", "failed", "rejected", "skipped"].includes(a.status),
  );

  if (!allTerminal) {
    const hasApproval = actions.some((a) => a.status === "awaiting_approval");
    const hasPending = actions.some((a) => a.status === "pending");

    if (hasApproval) {
      const approvalAction = actions.find((a) => a.status === "awaiting_approval");
      if (run.status === "pending" || run.status === "queued") {
        setRunStatus(run.id, "planning");
      }
      setRunStatus(run.id, "awaiting_approval", {
        proposalId: approvalAction?.proposalId ?? null,
        metadata: { actionIds: actions.filter((a) => a.status === "awaiting_approval").map((a) => a.id) },
      });
    } else if (hasPending) {
      if (run.status === "pending") {
        setRunStatus(run.id, "running");
      }
    }

    const partiallyApproved = actions.some((a) => a.status === "approved") &&
      actions.some((a) => a.status === "awaiting_approval");

    if (partiallyApproved) {
      setRunStatus(run.id, "partially_approved", {
        metadata: {
          approvedActionIds: actions.filter((a) => a.status === "approved").map((a) => a.id),
          awaitingApprovalActionIds: actions
            .filter((a) => a.status === "awaiting_approval")
            .map((a) => a.id),
        },
      });
    }

    return getRun(run.id);
  }

  const hasFailed = actions.some((a) => a.status === "failed");
  const hasRejected = actions.some((a) => a.status === "rejected");

  if (hasRejected) {
    const rejectedAction = actions.find((a) => a.status === "rejected");
    if (rejectedAction) {
      moveRunIntoApprovalIfNeeded(run.id, rejectedAction);
    }
    setRunStatus(run.id, "rejected");

    recordAuditEvent(
      "action_rejected",
      "agent.runtime",
      run.id,
      buildRunAuditEntry(run, "Run rejected: one or more actions were rejected.").metadata,
    );

    return getRun(run.id);
  }

  if (hasFailed) {
    setRunStatus(run.id, "failed");

    recordAuditEvent(
      "action_failed",
      "agent.runtime",
      run.id,
      buildRunAuditEntry(run, "Run failed: one or more actions failed.").metadata,
    );

    return getRun(run.id);
  }

  moveRunIntoRunningIfNeeded(run.id);
  setRunStatus(run.id, "completed");

  recordAuditEvent(
    "action_executed",
    "agent.runtime",
    run.id,
    buildRunAuditEntry(run, "Run completed successfully.").metadata,
  );

  return getRun(run.id);
}

// ── Validation helpers ───────────────────────────────────────────────────

export function validateAgentRun(runId: string): AgentValidationResult {
  const gates: AgentValidationGate[] = [];
  const issues: string[] = [];

  const run = getRun(runId);

  gates.push({
    name: "run_exists",
    passed: run !== null,
    detail: run ? `Run "${run.id}" exists.` : `Run "${runId}" not found.`,
  });

  if (!run) {
    return { runId, passed: false, gates, issues: [`Run "${runId}" not found.`] };
  }

  const entry = getEntry(run.agentSlug);

  gates.push({
    name: "agent_registered",
    passed: entry !== null,
    detail: entry ? `Agent "${run.agentSlug}" is registered.` : `Agent "${run.agentSlug}" not in registry.`,
  });

  if (!entry) {
    issues.push(`Agent "${run.agentSlug}" not registered.`);
  }

  const hasId = typeof run.id === "string" && run.id.length > 0;
  gates.push({ name: "run_has_id", passed: hasId, detail: hasId ? `Run ID: ${run.id}` : "Run ID missing." });
  if (!hasId) issues.push("Run ID missing.");

  const hasCreatedAt = typeof run.createdAt === "string" && run.createdAt.length > 0;
  gates.push({ name: "run_has_created_at", passed: hasCreatedAt, detail: hasCreatedAt ? `Created: ${run.createdAt}` : "createdAt missing." });
  if (!hasCreatedAt) issues.push("Run createdAt missing.");

  const runActions = getActionsForRun(runId);

  const allActionsHaveStep = runActions.every((a) => typeof a.step === "number");
  gates.push({ name: "actions_have_step", passed: allActionsHaveStep, detail: allActionsHaveStep ? "All actions have step numbers." : "Some actions missing step." });
  if (!allActionsHaveStep) issues.push("Some actions missing step numbers.");

  const allActionsHaveId = runActions.every((a) => typeof a.id === "string" && a.id.length > 0);
  gates.push({ name: "actions_have_id", passed: allActionsHaveId, detail: allActionsHaveId ? "All actions have IDs." : "Some actions missing ID." });
  if (!allActionsHaveId) issues.push("Some actions missing ID.");

  const uniqueStepIds = new Set(runActions.map((a) => a.id));
  gates.push({ name: "action_ids_unique", passed: uniqueStepIds.size === runActions.length, detail: "Action IDs are unique." });
  if (uniqueStepIds.size !== runActions.length) issues.push("Duplicate action IDs found.");

  const evidence = getEvidenceForRun(runId);

  const evidenceContentOk = evidence.every((e) => {
    if (e.metadata) {
      const metaStr = JSON.stringify(e.metadata).toLowerCase();
      return !metaStr.includes("secret") || metaStr.includes("[REDACTED]");
    }
    return true;
  });
  gates.push({ name: "evidence_secrets_redacted", passed: evidenceContentOk, detail: evidenceContentOk ? "Evidence metadata is redacted." : "Evidence may contain raw secrets." });
  if (!evidenceContentOk) issues.push("Evidence metadata may contain unredacted secrets.");

  const passed = gates.every((g) => g.passed);

  return { runId, passed, gates, issues };
}

export function validateIdempotency(key: string): boolean {
  const first = getRunByIdempotencyKey(key);

  if (!first) return true;

  const second = getRunByIdempotencyKey(key);
  if (!second) return false;

  return second.id === first.id;
}
