// lib/platform/policies/decision.ts
//
// Pure decision helpers used by the policy UI. Decisions are derived from
// profile + rule state; enforcement remains scaffolded (enforced=false)
// until a live runtime interceptor exists.

import type {
  PolicyPosture,
  PolicyProfile,
  PolicyRule,
  PolicyRuleEnforcement,
  PolicyDecisionRecord,
} from "@ethen/security/policies/types";

/** Roll up a profile's rule states into an aggregate posture. */
export function deriveProfilePosture(profile: PolicyProfile): PolicyPosture {
  const hasScaffolded = profile.rules.some((r) => r.enforcement === "scaffolded");
  const hasBlocked = profile.rules.some((r) => r.enforcement === "blocked");
  const hasApproval = profile.rules.some(
    (r) =>
      r.kind === "approval_before_code_execution" ||
      r.kind === "approval_before_file_writes" ||
      r.kind === "approval_before_deploy" ||
      r.kind === "sandbox_command_approval",
  );

  if (hasBlocked) return "blocked";
  if (hasScaffolded && hasApproval) return "approval_required";
  if (hasScaffolded) return "needs_configuration";
  return "safe";
}

/** True if the profile is honestly safe for execution today.
 *  Note: even "safe" posture does not imply durable execution is present. */
export function isPostureRunnable(posture: PolicyPosture): boolean {
  return posture === "safe";
}

/** Convenience: count how many rules in a profile are scaffolded. */
export function countScaffoldedRules(profile: PolicyProfile): number {
  return profile.rules.filter((r) => r.enforcement === "scaffolded").length;
}

/** Build a synthetic decision record for a fixture action/step. Enforcement
 *  is recorded as enforced=false until a live runtime interceptor exists. */
export function buildSampleDecision(input: {
  id: string;
  profileId: string;
  profileName: string;
  targetKind: PolicyDecisionRecord["target"]["kind"];
  targetId: string;
  targetLabel: string;
  parameters: Record<string, unknown>;
  decision: PolicyDecisionRecord["decision"];
  reason: string;
  traceId: string | null;
  createdAt: string;
}): PolicyDecisionRecord {
  return {
    id: input.id,
    profileId: input.profileId,
    profileName: input.profileName,
    target: {
      kind: input.targetKind,
      id: input.targetId,
      label: input.targetLabel,
    },
    parameters: input.parameters,
    decision: input.decision,
    reason: input.reason,
    enforced: false,
    traceId: input.traceId,
    sample: true,
    createdAt: input.createdAt,
  };
}

/** Helper to compose a rule with honest default enforcement state. */
export function composeRule(input: {
  id: string;
  kind: PolicyRule["kind"];
  description: string;
  enforcement?: PolicyRuleEnforcement;
  enforcementNote: string;
  config?: Record<string, unknown>;
}): PolicyRule {
  return {
    id: input.id,
    kind: input.kind,
    description: input.description,
    enforcement: input.enforcement ?? "scaffolded",
    enforcementNote: input.enforcementNote,
    config: input.config ?? {},
  };
}