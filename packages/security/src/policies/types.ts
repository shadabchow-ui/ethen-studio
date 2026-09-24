// lib/platform/policies/types.ts
//
// Policy profile / rule / decision types for the platform spine. Policy
// enforcement today is scaffolded (visible decisions without live runtime
// interception) — every enforcement claim is labelled accordingly.

import type { PlatformSurfaceStatus } from "@ethen/contracts/platform/projects/types";

/** A policy rule kind surfacing a specific guardrail. */
export type PolicyRuleKind =
  | "provider_allow"
  | "provider_block"
  | "block_expensive_models"
  | "approval_before_code_execution"
  | "approval_before_file_writes"
  | "approval_before_deploy"
  | "pii_redaction"
  | "tool_allowlist"
  | "sandbox_command_approval";

export const POLICY_RULE_KIND_LABELS: Record<PolicyRuleKind, string> = {
  provider_allow: "Provider allow",
  provider_block: "Provider block",
  block_expensive_models: "Block expensive models",
  approval_before_code_execution: "Approval before code execution",
  approval_before_file_writes: "Approval before file writes",
  approval_before_deploy: "Approval before deploy",
  pii_redaction: "PII redaction",
  tool_allowlist: "Tool allowlist",
  sandbox_command_approval: "Sandbox command approval",
};

/** Enforcement posture for a rule. `enforced` requires live runtime. */
export type PolicyRuleEnforcement =
  | "enforced"
  | "scaffolded"
  | "advisory"
  | "blocked";

export const POLICY_RULE_ENFORCEMENT_LABELS: Record<PolicyRuleEnforcement, string> = {
  enforced: "Enforced",
  scaffolded: "Scaffolded",
  advisory: "Advisory",
  blocked: "Blocked",
};

/** A single rule within a policy profile. */
export interface PolicyRule {
  id: string;
  kind: PolicyRuleKind;
  description: string;
  enforcement: PolicyRuleEnforcement;
  /** Honest note about enforcement state. */
  enforcementNote: string;
  /** Concrete configuration values (allow/block lists, thresholds). */
  config: Record<string, unknown>;
}

/** A policy profile: a named bundle of rules applied to a project. */
export interface PolicyProfile {
  id: string;
  name: string;
  description: string;
  projectId: string | null;
  /** Honest overall posture for the profile. */
  posture: PolicyPosture;
  rules: PolicyRule[];
  /** Whether this profile is sample/fixture data rather than durable. */
  sample: boolean;
  /** Underlying route status (mirrors PlatformSurfaceStatus honesty). */
  surfaceStatus: PlatformSurfaceStatus;
  createdAt: string;
  updatedAt: string;
}

/** Aggregate posture surfaced in the policy UI. */
export type PolicyPosture =
  | "safe"
  | "needs_configuration"
  | "approval_required"
  | "blocked"
  | "credential_missing"
  | "policy_conflict"
  | "audit_gap";

export const POLICY_POSTURE_LABELS: Record<PolicyPosture, string> = {
  safe: "Safe",
  needs_configuration: "Needs configuration",
  approval_required: "Approval required",
  blocked: "Blocked",
  credential_missing: "Credential missing",
  policy_conflict: "Policy conflict",
  audit_gap: "Audit gap",
};

/** A recorded policy decision against a specific action/step. */
export interface PolicyDecisionRecord {
  id: string;
  profileId: string;
  profileName: string;
  /** Action or step the decision was made against. */
  target: {
    kind: "tool_call" | "workflow_step" | "approval" | "model_request";
    id: string;
    label: string;
  };
  /** Exact parameters/payload the decision was made against, when available. */
  parameters: Record<string, unknown>;
  decision: "allow" | "deny" | "approval_required" | "blocked" | "redacted";
  reason: string;
  /** Whether enforcement is real or scaffolded today. */
  enforced: boolean;
  /** Trace id correlated with the audit log. */
  traceId: string | null;
  /** Whether this record is sample/fixture data. */
  sample: boolean;
  createdAt: string;
}

// ── Policy Enforcement Types ──────────────────────────────────────────────

/** Policy decision states for the runtime enforcement interceptor. */
export type PolicyDecisionState =
  | "allow"
  | "deny"
  | "requires_approval"
  | "redact"
  | "downgrade"
  | "simulate";

export const POLICY_DECISION_STATE_LABELS: Record<PolicyDecisionState, string> = {
  allow: "Allow",
  deny: "Deny",
  requires_approval: "Requires Approval",
  redact: "Redact",
  downgrade: "Downgrade",
  simulate: "Simulate",
};

/** Resource/action kinds that the policy interceptor can enforce against. */
export type PolicyEnforcementTarget =
  | "gateway_request"
  | "provider_attempt"
  | "tool_call"
  | "sandbox_command"
  | "workflow_step"
  | "deployment_handoff"
  | "external_write"
  | "secret_use";

/** Subject identity for enforcement decisions. */
export type EnforcementSubjectType = "user" | "agent" | "api_key" | "service";

/** Risk tier for enforcement classification. */
export type EnforcementRiskTier = "low" | "medium" | "high" | "critical";

/** Normalized/typed alternative to the fixture PolicyDecisionRecord for live enforcement. */
export interface PolicyEnforcementDecision {
  id: string;
  projectId: string | null;
  targetKind: PolicyEnforcementTarget;
  action: string;
  subjectType: EnforcementSubjectType;
  subjectId: string;
  state: PolicyDecisionState;
  reason: string;
  riskTier: EnforcementRiskTier;
  argumentsHash?: string;
  traceId: string;
  createdAt: string;
  /** Audit-safe metadata (no raw keys/secrets). */
  auditMetadata: Record<string, unknown>;
}

/** Context provided to the interceptor when evaluating a policy decision. */
export interface PolicyEnforcementContext {
  projectId: string | null;
  targetKind: PolicyEnforcementTarget;
  action: string;
  toolName?: string;
  subjectType?: EnforcementSubjectType;
  subjectId?: string;
  arguments?: Record<string, unknown>;
  traceId: string;
  /** Policy profile to evaluate against. Null means use default fail-closed. */
  profile?: import("./types").PolicyProfile | null;
  /** Risk tier override from tool registry. */
  riskTier?: EnforcementRiskTier;
  /** Session identity context. */
  sessionId?: string | null;
  userId?: string | null;
}

/** Result of a policy enforcement check. */
export interface PolicyEnforcementResult {
  /** The enforcement decision. */
  decision: PolicyEnforcementDecision;
  /** Whether execution is allowed to proceed. */
  allowed: boolean;
  /** Whether execution is denied and must be blocked. */
  denied: boolean;
  /** Whether execution requires approval first. */
  requiresApproval: boolean;
  /** Whether output/payload should be redacted before return. */
  requiresRedaction: boolean;
  /** Whether the action should be downgraded to a safer route. */
  requiresDowngrade: boolean;
  /** Whether execution should be simulated (no side effects). */
  requiresSimulation: boolean;
  /** An approval request ID if a proposal was created. */
  approvalRequestId?: string;
  /** An approval token if execution was authorized with a signed token. */
  approvalToken?: string;
}

/** Validation result for an approval-bound execution. */
export interface ApprovalValidationResult {
  valid: boolean;
  reason: string;
  argumentsChanged: boolean;
  expired: boolean;
  tokenInvalid: boolean;
  decision: PolicyEnforcementDecision | null;
}

/** Context for validating an approval before execution. */
export interface ApprovalValidationContext {
  approvalToken?: string | null;
  approvalRequestId: string;
  policyDecisionId: string;
  targetKind: PolicyEnforcementTarget;
  action: string;
  toolName?: string;
  arguments: Record<string, unknown>;
  expectedArgumentsHash: string;
  sessionId?: string | null;
  userId?: string | null;
  expiresAt: string;
  traceId: string;
  secret?: string;
  now?: Date;
}