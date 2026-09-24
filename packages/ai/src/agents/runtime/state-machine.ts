import type {
  AgentRunStatus,
  RuntimeTransitionContext,
  RuntimeTransitionError,
} from "./types";
import { TERMINAL_RUN_STATUSES } from "./types";

const RUN_STATUS_TRANSITIONS: Record<AgentRunStatus, readonly AgentRunStatus[]> = {
  pending: ["queued", "planning", "running", "canceled", "failed"],
  queued: ["planning", "running", "canceled", "failed"],
  planning: ["running", "awaiting_approval", "waiting_for_user", "failed", "canceled"],
  running: ["awaiting_approval", "waiting_for_user", "paused", "recovering", "completed", "failed", "canceled"],
  awaiting_approval: ["running", "partially_approved", "rejected", "expired", "failed", "canceled"],
  partially_approved: ["running", "rejected", "expired", "failed", "canceled"],
  waiting_for_user: ["running", "failed", "canceled", "expired"],
  paused: ["running", "recovering", "failed", "canceled"],
  recovering: ["running", "failed", "canceled"],
  completed: [],
  failed: [],
  rejected: [],
  canceled: [],
  expired: [],
};

function hasApprovalContext(context?: RuntimeTransitionContext | null): boolean {
  if (!context) return false;
  return Boolean(
    context.proposalId ||
      (context.evidence && Object.keys(context.evidence).length > 0) ||
      (context.metadata && Object.keys(context.metadata).length > 0),
  );
}

function requiresContext(status: AgentRunStatus): boolean {
  return status === "awaiting_approval" || status === "partially_approved";
}

export interface RuntimeTransitionDecision {
  allowed: boolean;
  error: RuntimeTransitionError | null;
}

export function canTransitionRunStatus(
  fromStatus: AgentRunStatus,
  toStatus: AgentRunStatus,
  context?: RuntimeTransitionContext | null,
): RuntimeTransitionDecision {
  if (fromStatus === toStatus) {
    return { allowed: true, error: null };
  }

  if (TERMINAL_RUN_STATUSES.includes(fromStatus)) {
    return {
      allowed: false,
      error: {
        code: "TERMINAL_RUN",
        message: `Run is in terminal state "${fromStatus}" and cannot transition to "${toStatus}".`,
        fromStatus,
        toStatus,
      },
    };
  }

  if (requiresContext(toStatus) && !hasApprovalContext(context)) {
    return {
      allowed: false,
      error: {
        code: "MISSING_CONTEXT",
        message: `Transition to "${toStatus}" requires approval proposal or evidence context.`,
        fromStatus,
        toStatus,
      },
    };
  }

  if (!RUN_STATUS_TRANSITIONS[fromStatus].includes(toStatus)) {
    return {
      allowed: false,
      error: {
        code: "INVALID_TRANSITION",
        message: `Illegal run transition from "${fromStatus}" to "${toStatus}".`,
        fromStatus,
        toStatus,
      },
    };
  }

  return { allowed: true, error: null };
}

export function isTerminalRunStatus(status: AgentRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

export function getAllowedRunTransitions(status: AgentRunStatus): readonly AgentRunStatus[] {
  return RUN_STATUS_TRANSITIONS[status];
}
