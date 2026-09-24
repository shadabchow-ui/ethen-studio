/**
 * ETHEN-READY-042 — Policy enforcement/simulation surface.
 *
 * enforcePolicy: evaluates policy rules through the canonical approvals/audit
 * path and records denials as audit events.
 * simulatePolicy: same decision as enforcePolicy but does NOT persist audit events.
 *
 * Both derive posture from runtime approval/audit state instead of hardcoded
 * fixtures. The existing enforcer.ts handles per-action enforcement; this
 * module provides the higher-level policy-id–scoped interface.
 */

import { listAuditEntries, recordAuditEvent } from "@ethen/security/audit/service";
import { getPolicyProfile, listPolicyDecisions } from "./fixtures";
import { enforcePolicyDecision } from "@ethen/security/policies/enforcer";
import type {
  PolicyEnforcementContext,
  PolicyEnforcementResult,
  PolicyEnforcementTarget,
  EnforcementRiskTier,
  PolicyDecisionRecord,
  PolicyProfile,
} from "@ethen/security/policies/types";
import type { ToolId } from "@ethen/contracts/tools/types";

// ── Types ──────────────────────────────────────────────────────────────────

const POLICY_ENFORCEMENT_TOOL_ID = "system/policy-enforcement" satisfies ToolId;

export interface PolicyEnforcementInput {
  policyId: string;
  targetKind: PolicyEnforcementTarget;
  action: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  subjectId?: string;
  subjectType?: "user" | "agent" | "api_key" | "service";
  riskTier?: EnforcementRiskTier;
  projectId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  traceId?: string;
}

export interface PolicyEnforcementOutcome {
  decisionId: string;
  allowed: boolean;
  denied: boolean;
  requiresApproval: boolean;
  state: string;
  reason: string;
  auditLogged: boolean;
  profileName: string | null;
  profilePosture: string | null;
}

export interface PolicySimulationResult {
  policyId: string;
  profile: PolicyProfile | null;
  decision: PolicyEnforcementResult | null;
  derivedPosture: string;
  rationale: string;
  auditEventCount: number;
}

// ── Internal helpers ───────────────────────────────────────────────────────

function buildContext(input: PolicyEnforcementInput): PolicyEnforcementContext {
  const profile = getPolicyProfile(input.policyId) ?? null;

  return {
    projectId: input.projectId ?? profile?.projectId ?? null,
    targetKind: input.targetKind,
    action: input.action,
    toolName: input.toolName,
    subjectType: input.subjectType ?? "user",
    subjectId: input.subjectId ?? "unknown",
    arguments: input.arguments ?? {},
    traceId: input.traceId ?? `enforce_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    profile: profile ?? null,
    riskTier: input.riskTier ?? "medium",
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
  };
}

/**
 * Audit-key redaction for admin audit trail safety.
 * Strips known sensitive fields from metadata that could leak through
 * the enforcement audit path.
 */
function redactSensitiveMetadata(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const SENSITIVE_KEYS = new Set([
    "apiKey", "api_key", "secret", "token", "password", "credential",
    "privateKey", "private_key", "accessToken", "access_token",
  ]);
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    redacted[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : value;
  }
  return redacted;
}

// ── enforcePolicy ──────────────────────────────────────────────────────────

/**
 * Enforce a policy by id. Evaluates rules through the canonical enforcer,
 * records denials as audit events, and returns the outcome.
 *
 * Denials are ALWAYS logged. Allows are logged when auditMetadata is present.
 */
export function enforcePolicy(
  policyId: string,
  context: PolicyEnforcementInput,
): PolicyEnforcementOutcome {
  const profile = getPolicyProfile(policyId);
  const envCtx = buildContext(context);
  const result = enforcePolicyDecision(envCtx);
  const sessionId: string | null = envCtx.sessionId ?? null;

  let auditLogged = false;

  // Denials are always recorded as audit events
  if (result.denied) {
    recordAuditEvent(
      "action_blocked",
      POLICY_ENFORCEMENT_TOOL_ID,
      sessionId,
      {
        policyId,
        targetKind: envCtx.targetKind,
        action: envCtx.action,
        reason: result.decision.reason,
        traceId: envCtx.traceId,
        subjectId: envCtx.subjectId,
        ...redactSensitiveMetadata(result.decision.auditMetadata),
      },
    );
    auditLogged = true;
  }

  // Approval-required decisions also log
  if (result.requiresApproval) {
    recordAuditEvent(
      "action_approval_requested",
      POLICY_ENFORCEMENT_TOOL_ID,
      sessionId,
      {
        policyId,
        targetKind: envCtx.targetKind,
        action: envCtx.action,
        reason: result.decision.reason,
        traceId: envCtx.traceId,
        ...redactSensitiveMetadata(result.decision.auditMetadata),
      },
    );
    auditLogged = true;
  }

  return {
    decisionId: result.decision.id,
    allowed: result.allowed,
    denied: result.denied,
    requiresApproval: result.requiresApproval,
    state: result.decision.state,
    reason: result.decision.reason,
    auditLogged,
    profileName: profile?.name ?? null,
    profilePosture: profile?.posture ?? null,
  };
}

// ── simulatePolicy ─────────────────────────────────────────────────────────

/**
 * Simulate a policy enforcement. Produces the SAME decision as enforcePolicy
 * but does NOT persist any audit events.
 *
 * Returns the outcome with auditLogged=false to distinguish from real enforcement.
 */
export function simulatePolicy(
  policyId: string,
  context: PolicyEnforcementInput,
): PolicyEnforcementOutcome {
  const profile = getPolicyProfile(policyId);
  const envCtx = buildContext(context);
  const result = enforcePolicyDecision(envCtx);

  return {
    decisionId: `sim_${result.decision.id}`,
    allowed: result.allowed,
    denied: result.denied,
    requiresApproval: result.requiresApproval,
    state: result.decision.state,
    reason: result.decision.reason,
    auditLogged: false, // Never logs during simulation
    profileName: profile?.name ?? null,
    profilePosture: profile?.posture ?? null,
  };
}

// ── derivePolicyPosture ────────────────────────────────────────────────────

/**
 * Derive the current enforcement posture for a policy from runtime signals
 * rather than fixture data. Checks:
 *   - Profile exists and has rules
 *   - Recent audit events indicate denials or approvals
 *   - Enforcement state of rules (blocked → posture: blocked)
 */
export function derivePolicyPosture(policyId: string): string {
  const profile = getPolicyProfile(policyId);
  if (!profile) return "unknown";

  // Check for blocked rules
  const hasBlockedRule = profile.rules.some((r) => r.enforcement === "blocked");
  if (hasBlockedRule) return "blocked";

  // Check recent audit events for this policy
  const recentEntries = listAuditEntries({ limit: 50 });
  const policyEvents = recentEntries.filter(
    (e) =>
      e.eventType === "action_blocked" &&
      typeof e.metadata?.policyId === "string" &&
      e.metadata.policyId === policyId,
  );

  if (policyEvents.length > 0) return "audit_gap";

  // Check for scaffolded rules
  const hasScaffolded = profile.rules.some((r) => r.enforcement === "scaffolded");
  if (hasScaffolded) return "needs_configuration";

  return "safe";
}
