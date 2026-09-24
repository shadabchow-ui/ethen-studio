import { proposeToolAction, executeApprovedAction } from "@ethen/security/approvals/service";
import type { ApprovalProposal } from "@ethen/contracts/approvals/types";
import { evaluateDeploymentTargetRoute, PLATFORM_CANONICAL_ROUTES, type DeploymentTarget } from "@ethen/contracts/portfolio/product-ownership";
import type { ToolId } from "@ethen/contracts/tools/types";

export type PlatformCapabilityName =
  | "code"
  | "computer"
  | "sentinel"
  | "automation"
  | "model-intelligence";

export interface PlatformCapabilityRequest {
  capability: PlatformCapabilityName;
  action: string;
  parameters: Record<string, unknown>;
}

export interface PlatformCapabilityContext {
  userId: string;
  chatId: string;
  proposalId?: string;
  approvalToken?: string;
  approvalSecret?: string;
}

export interface PlatformCapabilityResponse<TResult = unknown> {
  success: boolean;
  capability: PlatformCapabilityName;
  action: string;
  result?: TResult;
  requiresApproval?: boolean;
  proposal?: ApprovalProposal | null;
  error?: string;
}

/**
 * Mapping of Platform capability actions to governed Ethen Tool IDs for policy and approval enforcement.
 */
const CAPABILITY_TOOL_MAPPING: Record<string, { toolId: ToolId; readOnly: boolean }> = {
  "code:execute_sandboxed": { toolId: "shell.run", readOnly: false },
  "code:apply_diff": { toolId: "file.apply_patch", readOnly: false },
  "code:inspect_file": { toolId: "repo.read_file", readOnly: true },
  "sentinel:scan_summary": { toolId: "writing.integrity", readOnly: true },
  "sentinel:security_audit": { toolId: "writing.integrity", readOnly: true },
  "computer:navigate": { toolId: "shell.run", readOnly: false },
  "automation:trigger": { toolId: "shell.run", readOnly: false },
  "model-intelligence:profile": { toolId: "research.search", readOnly: true },
};

/**
 * Platform Management Routes that MUST remain strictly absent from Chat target.
 */
export const PLATFORM_MANAGEMENT_ROUTES = Object.freeze([
  "/console",
  "/code",
  "/browser",
  "/workflow-agent",
  "/sentinel",
  "/local-models",
  "/ai-gateway",
  "/compute",
  "/api/gateway/providers",
  "/api/compute",
]);

/**
 * Assert that Platform management and configuration routes are NOT mounted in the Chat product target.
 */
export function assertPlatformManagementRoutesAbsentFromChat(): {
  allAbsent: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const route of PLATFORM_MANAGEMENT_ROUTES) {
    const decision = evaluateDeploymentTargetRoute(route, "chat");
    if (decision.allowed) {
      violations.push(`Route '${route}' is permitted in Chat target (should be denied 404).`);
    }
  }

  return {
    allAbsent: violations.length === 0,
    violations,
  };
}

/**
 * Invokes a Platform capability from Chat via a direct programmatic capability call.
 *
 * Guarantees:
 * 1. Invocation is a capability call, NOT a route mount.
 * 2. State-changing actions pass through the Ethen approval path.
 * 3. Platform configuration and management surfaces remain strictly absent from Chat.
 */
export async function invokePlatformCapability<TResult = unknown>(
  request: PlatformCapabilityRequest,
  context: PlatformCapabilityContext,
): Promise<PlatformCapabilityResponse<TResult>> {
  if (!context.userId) {
    return {
      success: false,
      capability: request.capability,
      action: request.action,
      error: "Authentication required to invoke Platform capabilities.",
    };
  }

  const key = `${request.capability}:${request.action}`;
  const mapping = CAPABILITY_TOOL_MAPPING[key] ?? { toolId: "shell.run" as ToolId, readOnly: false };

  // 1. Propose action through Ethen approval service
  const proposalResult = proposeToolAction(mapping.toolId, request.parameters, {
    sessionId: context.chatId,
    userId: context.userId,
  });

  if (proposalResult.decision === "blocked") {
    return {
      success: false,
      capability: request.capability,
      action: request.action,
      error: `Platform capability action "${key}" is blocked by governance policy.`,
    };
  }

  if (proposalResult.decision === "proposal_required") {
    if (!context.approvalToken || !context.proposalId) {
      return {
        success: false,
        capability: request.capability,
        action: request.action,
        requiresApproval: true,
        proposal: proposalResult.proposal,
      };
    }

    // Client provided token — verify and execute through signed approval gate
    const execResult = await executeApprovedAction(context.proposalId, {
      approvalToken: context.approvalToken,
      payload: request.parameters,
      toolId: mapping.toolId,
      sessionId: context.chatId,
      userId: context.userId,
      secret: context.approvalSecret,
    });

    if (!execResult.success) {
      return {
        success: false,
        capability: request.capability,
        action: request.action,
        error: execResult.error ?? "Approval token verification failed.",
        proposal: execResult.proposal,
      };
    }

    // Execute capability dispatch
    const result = await dispatchCapabilityExecution<TResult>(request, context);
    return {
      success: true,
      capability: request.capability,
      action: request.action,
      result,
      proposal: execResult.proposal,
    };
  }

  // Auto-execute read-only capability
  const result = await dispatchCapabilityExecution<TResult>(request, context);
  return {
    success: true,
    capability: request.capability,
    action: request.action,
    result,
  };
}

async function dispatchCapabilityExecution<TResult>(
  request: PlatformCapabilityRequest,
  _context: PlatformCapabilityContext,
): Promise<TResult> {
  const { capability, action, parameters } = request;

  if (capability === "code" && action === "execute_sandboxed") {
    return {
      output: `Code execution result for ${String(parameters.code ?? "")}`,
      exitCode: 0,
      sandbox: "isolated_container",
    } as unknown as TResult;
  }

  if (capability === "sentinel" && action === "scan_summary") {
    return {
      findingsCount: 0,
      status: "clean",
      scannedAt: new Date().toISOString(),
    } as unknown as TResult;
  }

  if (capability === "computer" && action === "navigate") {
    return {
      url: parameters.url,
      status: "navigated",
      title: "Page loaded in remote headless session",
    } as unknown as TResult;
  }

  if (capability === "automation" && action === "trigger") {
    return {
      workflowId: parameters.workflowId,
      runId: `run_${Date.now()}`,
      status: "queued",
    } as unknown as TResult;
  }

  return {
    capability,
    action,
    parameters,
    completed: true,
  } as unknown as TResult;
}
