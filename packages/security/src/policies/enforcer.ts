import type {
  PolicyDecisionState,
  PolicyEnforcementTarget,
  PolicyEnforcementDecision,
  PolicyEnforcementContext,
  PolicyEnforcementResult,
  ApprovalValidationResult,
  ApprovalValidationContext,
  EnforcementRiskTier,
} from "./types";
import type { ToolId } from "@ethen/contracts/tools/types";
import { canonicalizeArguments, hashArguments, argumentsMatch } from "./argument-hash";
import { computePayloadHash } from "./payload-hash";
import {
  signSignedApprovalToken,
  validateSignedApprovalToken,
} from "./signed-approval-token";

let decisionCounter = 0;

function nextDecisionId(): string {
  decisionCounter += 1;
  return `pdec_enforce_${decisionCounter}_${Date.now()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function riskLevelToEnforcementTier(
  riskLevel: string | undefined,
): EnforcementRiskTier {
  if (!riskLevel) return "medium";
  switch (riskLevel) {
    case "read_only":
      return "low";
    case "write":
    case "writes_user_content":
      return "medium";
    case "external_side_effect":
      return "high";
    case "destructive":
    case "privileged":
      return "critical";
    default:
      return "medium";
  }
}

export function makeEnforcementDecision(
  state: PolicyDecisionState,
  context: PolicyEnforcementContext,
  reason: string,
  options?: {
    riskTier?: EnforcementRiskTier;
    argumentsHash?: string;
    auditMetadata?: Record<string, unknown>;
  },
): PolicyEnforcementDecision {
  const canonicalArgs = context.arguments
    ? canonicalizeArguments(context.arguments)
    : {};

  return {
    id: nextDecisionId(),
    projectId: context.projectId,
    targetKind: context.targetKind,
    action: context.action,
    subjectType: context.subjectType ?? "api_key",
    subjectId: context.subjectId ?? "unknown",
    state,
    reason,
    riskTier: options?.riskTier ?? "medium",
    argumentsHash:
      options?.argumentsHash ?? hashArguments(context.arguments ?? {}),
    traceId: context.traceId ?? `trace_${nextDecisionId()}`,
    createdAt: nowIso(),
    auditMetadata: {
      ...(options?.auditMetadata ?? {}),
      arguments_keys: Object.keys(canonicalArgs),
      arguments_redacted: canonicalArgs,
      target_kind: context.targetKind,
      action: context.action,
      tool_name: context.toolName ?? null,
    },
  };
}

function makeResult(
  decision: PolicyEnforcementDecision,
  overrides?: {
    approvalRequestId?: string;
    approvalToken?: string;
  },
): PolicyEnforcementResult {
  return {
    decision,
    allowed: decision.state === "allow",
    denied: decision.state === "deny",
    requiresApproval: decision.state === "requires_approval",
    requiresRedaction: decision.state === "redact",
    requiresDowngrade: decision.state === "downgrade",
    requiresSimulation: decision.state === "simulate",
    approvalRequestId: overrides?.approvalRequestId,
    approvalToken: overrides?.approvalToken,
  };
}

export function enforcePolicyDecision(
  context: PolicyEnforcementContext,
): PolicyEnforcementResult {
  const profile = context.profile ?? null;

  if (!profile) {
    const decision = makeEnforcementDecision(
      "allow",
      context,
      "No policy profile configured — defaulting to allow with audit.",
      { riskTier: "low" },
    );
    return makeResult(decision);
  }

  for (const rule of profile.rules) {
    const ruleResult = evaluateRule(rule, context);
    if (ruleResult) {
      return ruleResult;
    }
  }

  const decision = makeEnforcementDecision(
    "allow",
    context,
    `All policy rules evaluated — default allow for action "${context.action}" under profile "${profile.name}".`,
    { riskTier: context.riskTier ?? "low" },
  );
  return makeResult(decision);
}

function evaluateRule(
  rule: import("./types").PolicyRule,
  context: PolicyEnforcementContext,
): PolicyEnforcementResult | null {
  if (rule.enforcement === "scaffolded" || rule.enforcement === "advisory") {
    const decision = makeEnforcementDecision(
      "allow",
      context,
      `Rule "${rule.kind}" is ${rule.enforcement} — logging without blocking.`,
      { riskTier: "low" },
    );
    return makeResult(decision);
  }

  switch (rule.kind) {
    case "provider_block": {
      const blocked = (rule.config.blocked as string[]) ?? [];
      const actionLower = context.action.toLowerCase();
      if (blocked.some((p) => actionLower.includes(p.toLowerCase()))) {
        const decision = makeEnforcementDecision(
          "deny",
          context,
          `Provider "${context.action}" is blocked by policy rule "${rule.id}".`,
          { riskTier: "critical" },
        );
        return makeResult(decision);
      }
      return null;
    }

    case "provider_allow": {
      const allowed = (rule.config.allowed as string[]) ?? [];
      const actionLower = context.action.toLowerCase();
      if (allowed.length > 0 && !allowed.some((p) => actionLower.includes(p.toLowerCase()))) {
        const decision = makeEnforcementDecision(
          "deny",
          context,
          `Provider "${context.action}" is not in the allowed provider list.`,
          { riskTier: "critical" },
        );
        return makeResult(decision);
      }
      return null;
    }

    case "block_expensive_models": {
      const blockedTiers = (rule.config.blockedTiers as string[]) ?? [];
      const modelTier = (context.arguments?.modelTier as string) ?? "";
      if (blockedTiers.includes(modelTier)) {
        const decision = makeEnforcementDecision(
          "deny",
          context,
          `Model tier "${modelTier}" is blocked by cost control policy.`,
          { riskTier: "high" },
        );
        return makeResult(decision);
      }
      return null;
    }

    case "approval_before_code_execution":
    case "approval_before_file_writes":
    case "approval_before_deploy":
    case "sandbox_command_approval": {
      const tools = (rule.config.tools as string[]) ?? [];
      const sandboxKinds = (rule.config.sandboxKinds as string[]) ?? [];
      const actionMatch =
        tools.some((t) => context.action === t || context.toolName === t) ||
        (context.targetKind === "sandbox_command" &&
          sandboxKinds.length > 0);
      if (actionMatch) {
        const decision = makeEnforcementDecision(
          "requires_approval",
          context,
          `Action "${context.action}" ${context.toolName ? `(${context.toolName})` : ""} requires approval under rule "${rule.kind}".`,
          { riskTier: context.riskTier ?? "high" },
        );
        return makeResult(decision);
      }
      return null;
    }

    case "pii_redaction": {
      const decision = makeEnforcementDecision(
        "redact",
        context,
        `PII redaction is enforced for action "${context.action}".`,
        { riskTier: "medium" },
      );
      return makeResult(decision);
    }

    case "tool_allowlist": {
      const decision = makeEnforcementDecision(
        "allow",
        context,
        `Tool "${context.action}" is in the registered tool registry.`,
        { riskTier: "low" },
      );
      return makeResult(decision);
    }

    default:
      return null;
  }
}

export function enforceDeny(
  context: PolicyEnforcementContext,
  reason: string,
): PolicyEnforcementResult {
  const decision = makeEnforcementDecision(
    "deny",
    context,
    reason,
    { riskTier: "high" },
  );
  return makeResult(decision);
}

export function enforceRequiresApproval(
  context: PolicyEnforcementContext,
  reason: string,
): PolicyEnforcementResult {
  const decision = makeEnforcementDecision(
    "requires_approval",
    context,
    reason,
    { riskTier: context.riskTier ?? "high" },
  );
  return makeResult(decision);
}

export function enforceAllow(
  context: PolicyEnforcementContext,
  reason: string,
): PolicyEnforcementResult {
  const decision = makeEnforcementDecision(
    "allow",
    context,
    reason,
    { riskTier: "low" },
  );
  return makeResult(decision);
}

export function enforceDowngrade(
  context: PolicyEnforcementContext,
  reason: string,
): PolicyEnforcementResult {
  const decision = makeEnforcementDecision(
    "downgrade",
    context,
    reason,
    { riskTier: context.riskTier ?? "high" },
  );
  return makeResult(decision);
}

export function enforceSimulate(
  context: PolicyEnforcementContext,
  reason: string,
): PolicyEnforcementResult {
  const decision = makeEnforcementDecision(
    "simulate",
    context,
    reason,
    { riskTier: context.riskTier ?? "medium" },
  );
  return makeResult(decision);
}

export function validateApprovalForExecution(
  context: ApprovalValidationContext,
): ApprovalValidationResult {
  const currentHash = hashArguments(context.arguments);

  if (!context.approvalToken?.trim()) {
    return {
      valid: false,
      reason: "Approval token is required for state-changing execution.",
      argumentsChanged: false,
      expired: false,
      tokenInvalid: true,
      decision: null,
    };
  }

  // Validate that action looks like a plausible toolId before passing to
  // token verification. Tool IDs follow the pattern "domain.action" or "system/name".
  // Unknown actions are treated as invalid — fail-closed for type safety.
  const toolId = context.action.includes(".") || context.action.includes("/")
    ? context.action as ToolId
    : null;

  if (!toolId) {
    return {
      valid: false,
      reason: `Action "${context.action}" is not a valid tool identifier.`,
      argumentsChanged: false,
      expired: false,
      tokenInvalid: true,
      decision: null,
    };
  }

  const tokenValidation = validateSignedApprovalToken({
    token: context.approvalToken,
    secret: context.secret,
    now: context.now,
    expected: {
      proposalId: context.approvalRequestId,
      toolId,
      payloadHash: currentHash,
      sessionId: context.sessionId ?? null,
      userId: context.userId ?? null,
      expiresAt: context.expiresAt,
    },
  });

  if (!tokenValidation.ok) {
    const failure = tokenValidation.failure;
    return {
      valid: false,
      reason: failure.message,
      argumentsChanged:
        failure.code === "payload_hash_mismatch",
      expired:
        failure.code === "expired_token" || failure.code === "expires_at_mismatch",
      tokenInvalid: true,
      decision: null,
    };
  }

  const decision = makeEnforcementDecision(
    "allow",
    {
      projectId: null,
      targetKind: context.targetKind,
      action: context.action,
      traceId: context.traceId,
      arguments: context.arguments,
      toolName: context.toolName,
      sessionId: context.sessionId,
      userId: context.userId,
    },
    "Approval token validated — arguments match approved payload.",
    { riskTier: "low", argumentsHash: currentHash },
  );

  return {
    valid: true,
    reason: "Approval token validated successfully.",
    argumentsChanged: false,
    expired: false,
    tokenInvalid: false,
    decision,
  };
}

export function checkArgumentsBinding(
  approvedHash: string,
  currentArgs: Record<string, unknown>,
): { valid: boolean; hash: string; reason: string } {
  const currentHash = hashArguments(currentArgs);
  if (currentHash !== approvedHash) {
    return {
      valid: false,
      hash: currentHash,
      reason: `Arguments changed since approval. Expected hash ${approvedHash.slice(0, 8)}..., got ${currentHash.slice(0, 8)}...`,
    };
  }
  return { valid: true, hash: currentHash, reason: "Arguments match approval." };
}

export { canonicalizeArguments, hashArguments, argumentsMatch } from "./argument-hash";
