import type { CanonicalApprovalService } from "../../../platform/approvals";
import type {
  ApprovalAccessScope,
  ApprovalAuthorizationResult,
  ApprovalPolicyBinding,
  ApprovalScope,
} from "../../../platform/approvals";
import type { ComputerAction } from "./types";
import { computeCanonicalActionIdentity } from "./store";

/**
 * The platform service hashes these bytes.  Do not hash a raw JS object:
 * property insertion order is not a stable security boundary.  The legacy
 * canonical identity deliberately includes only executable action fields.
 */
export function canonicalComputerUseActionBytes(action: ComputerAction): Uint8Array {
  return new TextEncoder().encode(computeCanonicalActionIdentity(action));
}

function withAttemptScope(scope: ApprovalScope, attemptId: string): ApprovalScope {
  return {
    ...scope,
    constraints: { ...scope.constraints, computerUseAttemptId: attemptId },
  };
}

export async function requestComputerUseApproval(input: {
  approvals: CanonicalApprovalService;
  organizationId: string;
  projectId: string;
  runId: string;
  attemptId: string;
  requesterId: string;
  action: ComputerAction;
  policy: ApprovalPolicyBinding;
  scope: ApprovalScope;
  expiresAt: string;
}) {
  return input.approvals.requestApproval({
    organizationId: input.organizationId,
    projectId: input.projectId,
    runId: input.runId,
    requesterId: input.requesterId,
    actionBytes: canonicalComputerUseActionBytes(input.action),
    policy: input.policy,
    scope: withAttemptScope(input.scope, input.attemptId),
    expiresAt: input.expiresAt,
  });
}

export async function authorizeComputerUseAction(input: {
  approvals: CanonicalApprovalService;
  access: ApprovalAccessScope;
  approvalId: string;
  runId: string;
  attemptId: string;
  action: ComputerAction;
  policy: ApprovalPolicyBinding;
  scope: ApprovalScope;
}): Promise<ApprovalAuthorizationResult> {
  return input.approvals.authorize(input.access, input.approvalId, {
    actionBytes: canonicalComputerUseActionBytes(input.action),
    policy: input.policy,
    scope: withAttemptScope(input.scope, input.attemptId),
    runId: input.runId,
  });
}
