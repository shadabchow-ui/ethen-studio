import type { ComputerUseApproval, ComputerUseRun } from "./types";

export interface ApprovalTargetsResult {
  pending: ComputerUseApproval[];
  targetApprovals: ComputerUseApproval[];
  missingSpecificApproval: boolean;
}

export interface ApprovalExecutionBlock {
  error: string;
  runStatus: string;
  expectedStatus: "approval_needed";
  detailCode: string;
  reason: string;
}

export function getApprovalRouteTargets(
  approvals: ComputerUseApproval[],
  approvalId?: string,
): ApprovalTargetsResult {
  const pending = approvals.filter((approval) => !approval.decision);
  const targetApprovals = approvalId
    ? pending.filter((approval) => approval.id === approvalId)
    : pending;

  return {
    pending,
    targetApprovals,
    missingSpecificApproval: Boolean(approvalId) && targetApprovals.length === 0,
  };
}

export function getApprovalExecutionBlock(
  run: ComputerUseRun,
  targetApprovals: ComputerUseApproval[],
): ApprovalExecutionBlock | null {
  if (targetApprovals.length === 0) {
    return null;
  }

  if (run.status === "approval_needed") {
    return null;
  }

  return {
    error: `Cannot execute approval actions while run is in ${run.status} state.`,
    runStatus: run.status,
    expectedStatus: "approval_needed",
    detailCode: run.status,
    reason: `Approval execution blocked: run must be in approval_needed state, got ${run.status}.`,
  };
}
