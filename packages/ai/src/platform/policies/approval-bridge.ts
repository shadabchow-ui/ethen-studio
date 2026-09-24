import type { PolicyDecisionState, PolicyEnforcementResult } from "@ethen/security/policies/types";

export type AISDKApprovalState =
  | "not-applicable"
  | "approved"
  | "denied"
  | "user-approval";

export const AI_SDK_APPROVAL_STATES: Record<AISDKApprovalState, string> = {
  "not-applicable": "not-applicable",
  approved: "approved",
  denied: "denied",
  "user-approval": "user-approval",
};

export function mapEthenStateToAISDK(
  state: PolicyDecisionState,
): AISDKApprovalState {
  switch (state) {
    case "allow":
      return "approved";
    case "deny":
      return "denied";
    case "requires_approval":
      return "user-approval";
    case "redact":
      return "approved";
    case "downgrade":
      return "user-approval";
    case "simulate":
      return "not-applicable";
    default:
      return "not-applicable";
  }
}

export function mapEnforcementResultToAISDK(
  result: PolicyEnforcementResult,
): AISDKApprovalState {
  if (result.denied) return "denied";
  if (result.requiresApproval) return "user-approval";
  if (result.requiresSimulation) return "not-applicable";
  if (result.allowed) return "approved";
  return "not-applicable";
}

export function isBlockingState(state: AISDKApprovalState): boolean {
  return state === "denied";
}

export function requiresUserAction(state: AISDKApprovalState): boolean {
  return state === "user-approval";
}

export function isAutoAllowed(state: AISDKApprovalState): boolean {
  return state === "approved" || state === "not-applicable";
}

export function buildAISDKApprovalMetadata(
  result: PolicyEnforcementResult,
): Record<string, unknown> {
  return {
    ethen_policy_state: result.decision.state,
    ethen_decision_id: result.decision.id,
    ethen_policy_reason: result.decision.reason,
    ethen_risk_tier: result.decision.riskTier,
    ethen_arguments_hash: result.decision.argumentsHash ?? null,
    ethen_trace_id: result.decision.traceId,
    ai_sdk_approval_state: mapEnforcementResultToAISDK(result),
    ai_sdk_requires_user_action: requiresUserAction(
      mapEnforcementResultToAISDK(result),
    ),
  };
}
