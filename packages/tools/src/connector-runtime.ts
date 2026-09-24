import "server-only";

import { TOOL_REGISTRY } from "./registry";
import { evaluateTool } from "./approval-policy";
import type { ToolRiskLevel, ApprovalRequirement, ToolId } from "@ethen/contracts/tools/types";
import { isConnectorExecutionApprovalSatisfied, recordConnectorBlockedAudit } from "./connectors/approval-boundary";
import { getConnectorDefinition, credentialVault } from "./connectors";
import { isConnectorReadOnlyReady, canConnectorWrite } from "./connectors/live-readiness";
import { isVaultConfigured } from "./connectors/vault";
import { recordAuditEvent } from "@ethen/security/audit/service";

// ── Runtime identification types ──────────────────────────────────────────────

export type ExecutionId = string;
export type ProviderId = string;
export type ActionId = string;

// ── User/account context ──────────────────────────────────────────────────────

export interface UserContext {
  userId?: string | null;
  sessionId: string;
  agentSlug?: string | null;
  approvalRequestId?: string | null;
}

// ── Action status ─────────────────────────────────────────────────────────────

export type ActionStatus =
  | "success"
  | "approval_required"
  | "blocked_not_implemented"
  | "not_configured"
  | "provider_not_found"
  | "action_not_found"
  | "auth_required"
  | "token_storage_not_configured"
  | "handler_not_configured"
  | "rate_limited"
  | "provider_error"
  | "validation_error";

// ── Trace events ──────────────────────────────────────────────────────────────

export type ActionTraceEvent =
  | "started"
  | "auth_checked"
  | "approval_checked"
  | "handler_dispatched"
  | "completed"
  | "failed";

// ── Runtime error codes ───────────────────────────────────────────────────────

export type RuntimeErrorCode =
  | "provider_not_found"
  | "action_not_found"
  | "auth_required"
  | "token_storage_not_configured"
  | "approval_required"
  | "handler_not_configured"
  | "rate_limited"
  | "provider_error"
  | "validation_error";

export interface NormalizedError {
  code: RuntimeErrorCode;
  message: string;
}

// ── Action result ─────────────────────────────────────────────────────────────

export interface ActionResult {
  executionId: ExecutionId;
  status: ActionStatus;
  actionId: ActionId;
  providerId: ProviderId;
  result?: unknown;
  error?: NormalizedError;
  trace: ActionTraceEvent[];
  approvalRequirement?: ApprovalRequirement | null;
  riskLevel?: ToolRiskLevel | null;
}

// ── Runtime error class ───────────────────────────────────────────────────────

const ERROR_STATUS: Record<RuntimeErrorCode, number> = {
  provider_not_found: 404,
  action_not_found: 404,
  auth_required: 401,
  token_storage_not_configured: 503,
  approval_required: 403,
  handler_not_configured: 503,
  rate_limited: 429,
  provider_error: 502,
  validation_error: 400,
};

export class RuntimeError extends Error {
  code: RuntimeErrorCode;
  status: number;

  constructor(code: RuntimeErrorCode, message: string) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.status = ERROR_STATUS[code] ?? 500;
  }
}

// ── Normalize error to safe client shape ──────────────────────────────────────

function normalizeError(err: unknown): NormalizedError {
  if (err instanceof RuntimeError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { code: "provider_error", message: "An internal error occurred." };
  }
  return { code: "provider_error", message: "An unexpected error occurred." };
}

// ── Execution ID generation (runtime-only UUID v4 substitute) ─────────────────

let executionCounter = 0;

function generateExecutionId(): ExecutionId {
  executionCounter += 1;
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `exec-${Date.now().toString(36)}-${randomPart}-${executionCounter}`;
}

// ── Handler type and handler registry ─────────────────────────────────────────

export type ActionHandler = (
  input: unknown,
  context: UserContext,
) => Promise<unknown>;

const handlerRegistry = new Map<ProviderId, Map<ActionId, ActionHandler>>();

export function registerHandler(
  providerId: ProviderId,
  actionId: ActionId,
  handler: ActionHandler,
): void {
  if (!handlerRegistry.has(providerId)) {
    handlerRegistry.set(providerId, new Map());
  }
  handlerRegistry.get(providerId)!.set(actionId, handler);
}

export function getHandler(
  providerId: ProviderId,
  actionId: ActionId,
): ActionHandler | undefined {
  return handlerRegistry.get(providerId)?.get(actionId);
}

export function listLiveHandlers(): Array<{
  providerId: ProviderId;
  actionId: ActionId;
}> {
  const handlers: Array<{ providerId: ProviderId; actionId: ActionId }> = [];
  for (const [providerId, actions] of handlerRegistry) {
    for (const actionId of actions.keys()) {
      handlers.push({ providerId, actionId });
    }
  }
  return handlers;
}

// ── Input validation ──────────────────────────────────────────────────────────

const ALLOWED_ACTION_IDS = new Set<string>(TOOL_REGISTRY.map((t) => t.id));

function validateActionId(id: unknown): string {
  if (typeof id !== "string" || !id.trim()) {
    throw new RuntimeError("validation_error", "Action ID is required.");
  }
  if (!ALLOWED_ACTION_IDS.has(id)) {
    throw new RuntimeError("action_not_found", `Unknown action: ${id}`);
  }
  return id;
}

function validateInput(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined) {
    return {};
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new RuntimeError("validation_error", "Input must be a JSON object.");
  }
  return input as Record<string, unknown>;
}

// ── Risk tier classification ──────────────────────────────────────────────────

const READ_ONLY_RISK_TIERS: Set<ToolRiskLevel> = new Set(["read_only"]);

const EXECUTABLE_STATES: Set<string> = new Set(["available", "contract_only"]);

const CONNECTOR_CATEGORIES: Set<string> = new Set([
  "business_ops",
  "google_workspace",
  "microsoft365",
  "automation",
]);

// ── Dispatcher ────────────────────────────────────────────────────────────────

export interface DispatchInput {
  actionId: ActionId;
  input?: unknown;
}

export async function dispatchAction(
  actionId: ActionId,
  input: unknown,
  context: UserContext,
): Promise<ActionResult> {
  const executionId = generateExecutionId();
  const trace: ActionTraceEvent[] = ["started"];

  // Validate action ID
  let validatedActionId: string;
  try {
    validatedActionId = validateActionId(actionId);
  } catch (err) {
    trace.push("failed");
    return {
      executionId,
      status: err instanceof RuntimeError ? err.code as ActionStatus : "action_not_found",
      actionId,
      providerId: "unknown",
      error: normalizeError(err),
      trace,
    };
  }

  // Look up tool definition in registry
  const toolDef = TOOL_REGISTRY.find((t) => t.id === validatedActionId);
  if (!toolDef) {
    trace.push("failed");
    return {
      executionId,
      status: "action_not_found",
      actionId: validatedActionId,
      providerId: "unknown",
      error: { code: "action_not_found", message: `Action ${validatedActionId} not in registry.` },
      trace,
    };
  }

  const providerId = toolDef.providerId ?? "unknown";

  trace.push("auth_checked");

  // Validate input structure
  let validatedInput: Record<string, unknown>;
  try {
    validatedInput = validateInput(input);
  } catch (err) {
    trace.push("failed");
    return {
      executionId,
      status: "validation_error",
      actionId: validatedActionId,
      providerId,
      error: normalizeError(err),
      trace,
    };
  }

  // Check execution state
  if (!EXECUTABLE_STATES.has(toolDef.executionState)) {
    trace.push("failed");
    return {
      executionId,
      status: "not_configured",
      actionId: validatedActionId,
      providerId,
      error: {
        code: "handler_not_configured",
        message: `Action ${validatedActionId} is ${toolDef.executionState} — not available for execution.`,
      },
      trace,
      approvalRequirement: null,
      riskLevel: null,
    };
  }

  // Evaluate risk and approval policy
  const decision = evaluateTool(toolDef);
  trace.push("approval_checked");

  const riskLevel = toolDef.riskLevel;
  const approvalRequirement = toolDef.approvalRequirement;

  // Block any action requiring approval (no approval backend present)
  if (decision.blocked) {
    trace.push("failed");
    return {
      executionId,
      status: "approval_required",
      actionId: validatedActionId,
      providerId,
      error: {
        code: "approval_required",
        message: `Action ${validatedActionId} is blocked by policy (risk: ${riskLevel}).`,
      },
      trace,
      approvalRequirement,
      riskLevel,
    };
  }

  // For write/destructive/external-side-effect actions, check vault + connector readiness
  if (!READ_ONLY_RISK_TIERS.has(riskLevel)) {
    // Check vault availability first
    if (!isVaultConfigured()) {
      recordConnectorBlockedAudit(
        providerId,
        validatedActionId,
        "execute",
        "Token vault is not configured — all live writes are blocked.",
        context.sessionId,
      );
      trace.push("failed");
      return {
        executionId,
        status: "blocked_not_implemented" as ActionStatus,
        actionId: validatedActionId,
        providerId,
        error: {
          code: "token_storage_not_configured",
          message: "Encryption vault is not configured. Live write operations are blocked.",
        },
        trace,
        approvalRequirement,
        riskLevel,
      };
    }

    // Check connector readiness for connector-backed write tools
    if (toolDef.providerId && CONNECTOR_CATEGORIES.has(toolDef.category)) {
      const definition = getConnectorDefinition(toolDef.providerId);
      if (definition) {
        const credentials = credentialVault.listByProvider(toolDef.providerId);
        const credential = credentials.length > 0 ? credentials[0] : null;
        const writeCheck = canConnectorWrite(definition, credential);

        if (!writeCheck.allowed) {
          recordConnectorBlockedAudit(
            providerId,
            validatedActionId,
            "execute",
            writeCheck.reason,
            context.sessionId,
          );
          trace.push("failed");
          return {
            executionId,
            status: "blocked_not_implemented" as ActionStatus,
            actionId: validatedActionId,
            providerId,
            error: {
              code: "handler_not_configured",
              message: `Connector "${toolDef.providerId}" write capability check failed: ${writeCheck.reason}`,
            },
            trace,
            approvalRequirement,
            riskLevel,
          };
        }
      }
    }

    // Check approval satisfaction via the connector approval boundary

    const approvalCheck = isConnectorExecutionApprovalSatisfied(context.approvalRequestId ?? null);

    if (!approvalCheck.approvalSatisfied) {
      recordConnectorBlockedAudit(
        providerId,
        validatedActionId,
        "execute",
        approvalCheck.blockReason ?? "Approval required for state-changing action.",
        context.sessionId,
      );

      trace.push("failed");
      return {
        executionId,
        status: approvalCheck.approvalRequired ? "approval_required" : "blocked_not_implemented" as ActionStatus,
        actionId: validatedActionId,
        providerId,
        error: {
          code: approvalCheck.approvalRequired ? "approval_required" : "handler_not_configured",
          message: approvalCheck.blockReason ?? `Action ${validatedActionId} is state-changing (risk: ${riskLevel}) and requires an approved approval proposal.`,
        },
        trace,
        approvalRequirement,
        riskLevel,
      };
    }

    // Approval is satisfied, but execute is still globally blocked
    trace.push("failed");
    return {
      executionId,
      status: "approval_required" as ActionStatus,
      actionId: validatedActionId,
      providerId,
      error: {
        code: "approval_required",
        message: `Action ${validatedActionId} is state-changing (risk: ${riskLevel}). Approval is satisfied but real external execution is still blocked.`,
      },
      trace,
      approvalRequirement,
      riskLevel,
    };
  }

  // Read-only action — check connector readiness for connector-backed tools
  if (toolDef.providerId && CONNECTOR_CATEGORIES.has(toolDef.category)) {
    const definition = getConnectorDefinition(toolDef.providerId);
    if (!definition) {
      trace.push("failed");
      recordConnectorBlockedAudit(
        toolDef.providerId,
        validatedActionId,
        "read",
        `Connector definition "${toolDef.providerId}" not found in registry.`,
        context.sessionId,
      );
      return {
        executionId,
        status: "provider_not_found" as ActionStatus,
        actionId: validatedActionId,
        providerId: toolDef.providerId,
        error: {
          code: "provider_not_found",
          message: `Connector "${toolDef.providerId}" is not registered.`,
        },
        trace,
        approvalRequirement: null,
        riskLevel: null,
      };
    }

    // Look up credential record for the provider
    const credentials = credentialVault.listByProvider(toolDef.providerId);
    const credential = credentials.length > 0 ? credentials[0] : null;

    const readiness = isConnectorReadOnlyReady(definition, credential);
    if (!readiness.allowed) {
      trace.push("failed");
      recordAuditEvent(
        "action_blocked",
        "agent.runtime" as ToolId,
        context.sessionId,
        {
          connectorId: toolDef.providerId,
          actionId: validatedActionId,
          actionMode: "read",
          reason: readiness.reason,
          readinessState: readiness.state,
          blockedAt: new Date().toISOString(),
        },
      );
      return {
        executionId,
        status: "not_configured" as ActionStatus,
        actionId: validatedActionId,
        providerId: toolDef.providerId,
        error: {
          code: "handler_not_configured",
          message: `Connector "${toolDef.providerId}" is not ready for read-only access: ${readiness.reason}`,
        },
        trace,
        approvalRequirement,
        riskLevel,
      };
    }

    // Log audit for read-only access on connector-backed tools
    recordAuditEvent(
      "action_executed",
      "agent.runtime" as ToolId,
      context.sessionId,
      {
        connectorId: toolDef.providerId,
        actionId: validatedActionId,
        actionMode: "read",
        readinessState: readiness.state,
      },
    );
  }

  // Read-only action — look up handler
  const handler = getHandler(providerId, validatedActionId);

  if (!handler) {
    trace.push("failed");
    return {
      executionId,
      status: "handler_not_configured",
      actionId: validatedActionId,
      providerId,
      error: {
        code: "handler_not_configured",
        message: `No handler registered for action ${validatedActionId} (provider: ${providerId}).`,
      },
      trace,
      approvalRequirement,
      riskLevel,
    };
  }

  // Dispatch to handler
  trace.push("handler_dispatched");
  try {
    const result = await handler(validatedInput, context);
    trace.push("completed");
    return {
      executionId,
      status: "success",
      actionId: validatedActionId,
      providerId,
      result,
      trace,
      approvalRequirement,
      riskLevel,
    };
  } catch (err) {
    trace.push("failed");
    return {
      executionId,
      status: "provider_error",
      actionId: validatedActionId,
      providerId,
      error: normalizeError(err),
      trace,
      approvalRequirement,
      riskLevel,
    };
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

export function getConnectorRuntimeHealth(): {
  registeredActions: number;
  registeredProviders: number;
  enabledHandlers: Array<{ providerId: ProviderId; actionId: ActionId }>;
} {
  return {
    registeredActions: TOOL_REGISTRY.length,
    registeredProviders: new Set(TOOL_REGISTRY.map((t) => t.providerId).filter(Boolean)).size,
    enabledHandlers: listLiveHandlers(),
  };
}
