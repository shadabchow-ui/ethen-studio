/** Studio V5 Creative Agent — explicit typed states for UI consumers (STUDIO_17). */
import "server-only";
import { errorState, loadingState, readyState, type LoadState } from "../../contracts/states";
import { studioError } from "../../contracts/errors";
import { agentStageLabel, type AgentRun, type ApprovalEnvelope, type CanvasPatch, type PlanRevision } from "./types";

export interface AgentRunDetail {
  run: AgentRun;
  headPlan: PlanRevision | null;
  headPatch: CanvasPatch | null;
  approvals: readonly ApprovalEnvelope[];
}

export function agentLoadingState(): LoadState<AgentRunDetail> {
  return loadingState<AgentRunDetail>();
}

export function agentReadyState(detail: AgentRunDetail): LoadState<AgentRunDetail> {
  return readyState(detail);
}

/** Waiting-approval state: complete facts, never a spinner without context. */
export function agentWaitingApprovalState(detail: AgentRunDetail): LoadState<AgentRunDetail> {
  return {
    kind: "ready",
    data: detail,
    error: null,
    actionLabel: null,
  };
}

export function agentBlockedState(detail: AgentRunDetail, reason: string): LoadState<AgentRunDetail> {
  return {
    kind: "blocked",
    data: detail,
    error: studioError("POLICY_DENIED", reason, detail.run.runId, false, {
      stage: agentStageLabel(detail.run.stage),
    }),
    actionLabel: "Review plan",
  };
}

export function agentSetupState(message: string): LoadState<AgentRunDetail> {
  return {
    kind: "setup_required",
    data: null,
    error: studioError("FORBIDDEN", message, "agent-setup", false, {}),
    actionLabel: "Select a project",
  };
}

export function agentErrorState(requestId: string, message: string): LoadState<AgentRunDetail> {
  return errorState<AgentRunDetail>(studioError("INTERNAL", message, requestId, true, {}));
}
