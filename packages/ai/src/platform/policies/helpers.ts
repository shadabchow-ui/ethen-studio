import {
  enforcePolicyDecision,
  makeEnforcementDecision,
  enforceDeny,
  enforceRequiresApproval,
  enforceAllow,
  enforceDowngrade,
  enforceSimulate,
  validateApprovalForExecution,
  checkArgumentsBinding,
} from "@ethen/security/policies/enforcer";
import type {
  PolicyEnforcementContext,
  PolicyEnforcementResult,
  PolicyEnforcementDecision,
  ApprovalValidationResult,
  EnforcementRiskTier,
} from "@ethen/security/policies/types";

export {
  enforcePolicyDecision,
  makeEnforcementDecision,
  enforceDeny,
  enforceRequiresApproval,
  enforceAllow,
  enforceDowngrade,
  enforceSimulate,
  validateApprovalForExecution,
  checkArgumentsBinding,
};

export function enforcementForToolCall(
  toolName: string,
  args: Record<string, unknown>,
  options?: {
    projectId?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    riskTier?: EnforcementRiskTier;
    traceId?: string;
  },
): PolicyEnforcementResult {
  return enforcePolicyDecision({
    projectId: options?.projectId ?? null,
    targetKind: "tool_call",
    action: toolName,
    toolName,
    arguments: args,
    traceId: options?.traceId ?? `trace_tool_${Date.now()}`,
    profile: null,
    riskTier: options?.riskTier ?? "medium",
    sessionId: options?.sessionId,
    userId: options?.userId,
  });
}

export function enforcementForSandboxCommand(
  command: string,
  args: string[],
  options?: {
    projectId?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    riskTier?: EnforcementRiskTier;
    traceId?: string;
  },
): PolicyEnforcementResult {
  return enforcePolicyDecision({
    projectId: options?.projectId ?? null,
    targetKind: "sandbox_command",
    action: command,
    toolName: command.split(" ")[0],
    arguments: { command, args },
    traceId: options?.traceId ?? `trace_sbox_${Date.now()}`,
    profile: null,
    riskTier: options?.riskTier ?? "high",
    sessionId: options?.sessionId,
    userId: options?.userId,
  });
}

export function enforcementForWorkflowStep(
  stepName: string,
  stepInput: Record<string, unknown>,
  options?: {
    projectId?: string | null;
    workflowId?: string | null;
    runId?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    riskTier?: EnforcementRiskTier;
    traceId?: string;
  },
): PolicyEnforcementResult {
  return enforcePolicyDecision({
    projectId: options?.projectId ?? null,
    targetKind: "workflow_step",
    action: stepName,
    toolName: stepName,
    arguments: stepInput,
    traceId: options?.traceId ?? `trace_wf_${Date.now()}`,
    profile: null,
    riskTier: options?.riskTier ?? "medium",
    sessionId: options?.sessionId,
    userId: options?.userId,
  });
}

export function enforcementForGatewayRequest(
  providerId: string,
  requestArgs: Record<string, unknown>,
  options?: {
    projectId?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    riskTier?: EnforcementRiskTier;
    traceId?: string;
  },
): PolicyEnforcementResult {
  return enforcePolicyDecision({
    projectId: options?.projectId ?? null,
    targetKind: "gateway_request",
    action: providerId,
    arguments: requestArgs,
    traceId: options?.traceId ?? `trace_gw_${Date.now()}`,
    profile: null,
    riskTier: options?.riskTier ?? "low",
    sessionId: options?.sessionId,
    userId: options?.userId,
  });
}

export function enforcementForProviderAttempt(
  providerId: string,
  modelId: string,
  options?: {
    projectId?: string | null;
    sessionId?: string | null;
    riskTier?: EnforcementRiskTier;
    traceId?: string;
  },
): PolicyEnforcementResult {
  return enforcePolicyDecision({
    projectId: options?.projectId ?? null,
    targetKind: "provider_attempt",
    action: providerId,
    toolName: modelId,
    arguments: { providerId, modelId },
    traceId: options?.traceId ?? `trace_provider_${Date.now()}`,
    profile: null,
    riskTier: options?.riskTier ?? "low",
    sessionId: options?.sessionId,
  });
}

export function enforcementForExternalWrite(
  toolName: string,
  args: Record<string, unknown>,
  options?: {
    projectId?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    riskTier?: EnforcementRiskTier;
    traceId?: string;
  },
): PolicyEnforcementResult {
  return enforcePolicyDecision({
    projectId: options?.projectId ?? null,
    targetKind: "external_write",
    action: toolName,
    toolName,
    arguments: args,
    traceId: options?.traceId ?? `trace_ext_${Date.now()}`,
    profile: null,
    riskTier: options?.riskTier ?? "critical",
    sessionId: options?.sessionId,
    userId: options?.userId,
  });
}

export function enforcementForDeploymentHandoff(
  target: string,
  options?: {
    projectId?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    riskTier?: EnforcementRiskTier;
    traceId?: string;
  },
): PolicyEnforcementResult {
  return enforcePolicyDecision({
    projectId: options?.projectId ?? null,
    targetKind: "deployment_handoff",
    action: target,
    arguments: { target },
    traceId: options?.traceId ?? `trace_deploy_${Date.now()}`,
    profile: null,
    riskTier: options?.riskTier ?? "critical",
    sessionId: options?.sessionId,
    userId: options?.userId,
  });
}

export function enforcementForSecretUse(
  secretName: string,
  options?: {
    projectId?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    traceId?: string;
  },
): PolicyEnforcementResult {
  return enforcePolicyDecision({
    projectId: options?.projectId ?? null,
    targetKind: "secret_use",
    action: secretName,
    arguments: { secretName },
    traceId: options?.traceId ?? `trace_sec_${Date.now()}`,
    profile: null,
    riskTier: "critical",
    sessionId: options?.sessionId,
    userId: options?.userId,
  });
}
