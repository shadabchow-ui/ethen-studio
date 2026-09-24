/** Studio V5 policy — explicit typed states for UI consumers (STUDIO_03). */
import "server-only";
import { errorState, loadingState, readyState, type LoadState } from "../../contracts/states";
import { studioError } from "../../contracts/errors";
import type { PolicyDecision } from "../../contracts/policy";
import { reasonDetail, type PolicyReasonCode } from "./reason-codes";

/** Project a policy decision onto an explicit UI state (allowed/denied/error). */
export function policyDecisionState(decision: PolicyDecision): LoadState<PolicyDecision> {
  if (decision.allowed) return readyState(decision);
  const detail = reasonDetail(decision.reasonCode as PolicyReasonCode);
  return {
    kind: "blocked",
    data: decision,
    error: studioError(
      "POLICY_DENIED",
      detail.title,
      decision.decisionId,
      false,
      { reasonCode: decision.reasonCode, remediation: decision.remediation },
    ),
    actionLabel: decision.remediation,
  };
}

/** Loading state while a policy check is in flight. */
export function policyLoadingState(): LoadState<PolicyDecision> {
  return loadingState<PolicyDecision>();
}

/** Setup state when policy configuration (e.g. legal text) is missing. */
export function policySetupState(message: string, actionLabel: string | null = "Configure"): LoadState<PolicyDecision> {
  return {
    kind: "setup_required",
    data: null,
    error: studioError("FORBIDDEN", message, "policy-setup", false, {}),
    actionLabel,
  };
}

/** Error state when the policy check itself failed (distinct from denied). */
export function policyCheckErrorState(requestId: string, message: string): LoadState<PolicyDecision> {
  return errorState<PolicyDecision>(studioError("INTERNAL", message, requestId, true, {}));
}
