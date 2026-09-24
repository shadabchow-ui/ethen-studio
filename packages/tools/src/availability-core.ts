import type {
  ToolAvailabilityResult,
  ToolAvailabilityInput,
  ToolAvailabilityDiagnostic,
  ToolDefinition,
  ToolId,
} from "@ethen/contracts/tools/types";

const ROLE_TOOL_MAP: Record<string, ToolId[]> = {
  customer_support: [
    "business-ops.zendesk.search_tickets",
    "business-ops.zendesk.get_ticket",
    "business-ops.zendesk.draft_reply",
    "business-ops.zendesk.send_reply",
    "business-ops.zendesk.update_ticket_status",
    "business-ops.intercom.search_conversations",
    "business-ops.intercom.get_conversation",
    "business-ops.intercom.draft_reply",
    "business-ops.intercom.send_reply",
  ],
  sales_operations: [
    "business-ops.salesforce.search_accounts",
    "business-ops.salesforce.get_account",
    "business-ops.salesforce.search_contacts",
    "business-ops.salesforce.get_contact",
    "business-ops.salesforce.search_opportunities",
    "business-ops.salesforce.get_opportunity",
    "business-ops.salesforce.draft_note",
    "business-ops.salesforce.create_note",
    "business-ops.hubspot.search_contacts",
    "business-ops.hubspot.get_contact",
    "business-ops.hubspot.search_companies",
    "business-ops.hubspot.get_company",
    "business-ops.hubspot.search_deals",
    "business-ops.hubspot.get_deal",
  ],
  research: [
    "research.search",
    "research.answer",
    "research.contents",
    "research.agent",
    "artifact.read",
    "artifact.create",
  ],
};

const AUTONOMY_RISK_ALLOWANCE: Record<number, string[]> = {
  0: ["read_only"],
  1: ["read_only", "write", "writes_user_content"],
  2: ["read_only", "write", "writes_user_content"],
  3: ["read_only", "write", "writes_user_content", "external_side_effect"],
  4: ["read_only", "write", "writes_user_content", "external_side_effect"],
};

export function planToolAvailability(
  input: ToolAvailabilityInput,
  registry: ToolDefinition[],
): ToolAvailabilityResult {
  const definition = findTool(input.toolId, registry);
  if (!definition) {
    return {
      kind: "blocked",
      toolId: input.toolId,
      diagnostics: [
        {
          message: `Tool "${input.toolId}" is not registered in the tool registry.`,
          severity: "error",
        },
      ],
    };
  }

  const diagnostics: ToolAvailabilityDiagnostic[] = [];

  const executionCheck = checkExecutionState(definition);
  diagnostics.push(...executionCheck.diagnostics);
  if (executionCheck.blocking) {
    return { kind: executionCheck.kind, toolId: input.toolId, diagnostics };
  }

  const roleCheck = checkEmployeeRole(input, definition);
  diagnostics.push(...roleCheck.diagnostics);
  if (roleCheck.blocking) {
    return { kind: roleCheck.kind, toolId: input.toolId, diagnostics };
  }

  const autonomyCheck = checkAutonomyLevel(input, definition);
  diagnostics.push(...autonomyCheck.diagnostics);
  if (autonomyCheck.blocking) {
    return { kind: autonomyCheck.kind, toolId: input.toolId, diagnostics };
  }

  const appCheck = checkConnectedApps(input, definition);
  diagnostics.push(...appCheck.diagnostics);
  if (appCheck.blocking) {
    return { kind: appCheck.kind, toolId: input.toolId, diagnostics };
  }

  const credentialCheck = checkCredentials(input, definition);
  diagnostics.push(...credentialCheck.diagnostics);
  if (credentialCheck.blocking) {
    return { kind: credentialCheck.kind, toolId: input.toolId, diagnostics };
  }

  const budgetCheck = checkBudget(input);
  diagnostics.push(...budgetCheck.diagnostics);
  if (budgetCheck.blocking) {
    return { kind: budgetCheck.kind, toolId: input.toolId, diagnostics };
  }

  const businessProfileCheck = checkBusinessProfile(input);
  diagnostics.push(...businessProfileCheck.diagnostics);
  if (businessProfileCheck.blocking) {
    return { kind: businessProfileCheck.kind, toolId: input.toolId, diagnostics };
  }

  if (definition.requiresApproval) {
    return {
      kind: "approval_required",
      toolId: input.toolId,
      diagnostics: [
        ...diagnostics,
        {
          message: `"${definition.name}" requires approval before execution.`,
          severity: "info",
          actionLabel: "Configure approval policy",
        },
      ],
    };
  }

  return {
    kind: "available",
    toolId: input.toolId,
    diagnostics,
  };
}

export function planToolAvailabilityBatch(
  inputs: ToolAvailabilityInput[],
  registry: ToolDefinition[],
): ToolAvailabilityResult[] {
  return inputs.map((input) => planToolAvailability(input, registry));
}

function findTool(toolId: ToolId, registry: ToolDefinition[]): ToolDefinition | undefined {
  return registry.find((t) => t.id === toolId);
}

interface CheckResult {
  kind: ToolAvailabilityResult["kind"];
  blocking: boolean;
  diagnostics: ToolAvailabilityDiagnostic[];
}

function checkExecutionState(definition: ToolDefinition): CheckResult {
  if (definition.executionState === "contract_only") {
    return {
      kind: "contract_only",
      blocking: true,
      diagnostics: [
        {
          message: `"${definition.name}" is defined but execution is not yet wired.`,
          severity: "warning",
          actionLabel: "Check roadmap",
        },
      ],
    };
  }

  if (definition.executionState === "planned") {
    return {
      kind: "contract_only",
      blocking: true,
      diagnostics: [
        {
          message: `"${definition.name}" is planned for a future phase.`,
          severity: "warning",
        },
      ],
    };
  }

  if (definition.executionState !== "available") {
    return {
      kind: "error",
      blocking: true,
      diagnostics: [
        {
          message: `"${definition.name}" has an unknown execution state.`,
          severity: "error",
        },
      ],
    };
  }

  return { kind: "available", blocking: false, diagnostics: [] };
}

function checkEmployeeRole(
  input: ToolAvailabilityInput,
  definition: ToolDefinition,
): CheckResult {
  if (!input.employeeRole) {
    return { kind: "setup_required", blocking: false, diagnostics: [] };
  }

  const roleTools = ROLE_TOOL_MAP[input.employeeRole];
  if (!roleTools) {
    return {
      kind: "blocked",
      blocking: true,
      diagnostics: [
        {
          message: `Employee role "${input.employeeRole}" is not recognized.`,
          severity: "error",
        },
      ],
    };
  }

  if (!roleTools.includes(definition.id)) {
    return {
      kind: "blocked",
      blocking: true,
      diagnostics: [
        {
          message: `"${definition.name}" is not available for role "${input.employeeRole}".`,
          severity: "warning",
        },
      ],
    };
  }

  return { kind: "available", blocking: false, diagnostics: [] };
}

function checkAutonomyLevel(
  input: ToolAvailabilityInput,
  definition: ToolDefinition,
): CheckResult {
  if (input.autonomyLevel === undefined || input.autonomyLevel === null) {
    return {
      kind: "setup_required",
      blocking: true,
      diagnostics: [
        {
          message: "Employee autonomy level is not configured.",
          severity: "error",
          actionLabel: "Configure autonomy level",
        },
      ],
    };
  }

  if (input.autonomyLevel < 0 || input.autonomyLevel > 5) {
    return {
      kind: "blocked",
      blocking: true,
      diagnostics: [
        {
          message: `Autonomy level ${input.autonomyLevel} is out of valid range (0-5).`,
          severity: "error",
        },
      ],
    };
  }

  const allowedRiskLevels = AUTONOMY_RISK_ALLOWANCE[input.autonomyLevel];
  if (!allowedRiskLevels) {
    return {
      kind: "blocked",
      blocking: true,
      diagnostics: [
        {
          message: `No risk allowance defined for autonomy level ${input.autonomyLevel}.`,
          severity: "error",
        },
      ],
    };
  }

  if (!allowedRiskLevels.includes(definition.riskLevel)) {
    return {
      kind: "blocked",
      blocking: true,
      diagnostics: [
        {
          message: `"${definition.name}" has risk level "${definition.riskLevel}" which exceeds autonomy level ${input.autonomyLevel} allowance.`,
          severity: "error",
          actionLabel: "Increase autonomy level",
        },
      ],
    };
  }

  return { kind: "available", blocking: false, diagnostics: [] };
}

function checkConnectedApps(
  input: ToolAvailabilityInput,
  definition: ToolDefinition,
): CheckResult {
  const providerId = definition.providerId;
  if (!providerId) {
    return { kind: "available", blocking: false, diagnostics: [] };
  }

  if (!input.connectedApps || input.connectedApps.length === 0) {
    return {
      kind: "setup_required",
      blocking: true,
      diagnostics: [
        {
          message: `"${definition.name}" requires a connected app (provider: "${providerId}").`,
          severity: "error",
          actionLabel: `Connect ${providerId}`,
        },
      ],
    };
  }

  const appConnected = input.connectedApps.some(
    (app) => app.toLowerCase() === providerId.toLowerCase(),
  );
  if (!appConnected) {
    return {
      kind: "setup_required",
      blocking: true,
      diagnostics: [
        {
          message: `"${definition.name}" requires provider "${providerId}" to be connected.`,
          severity: "error",
          actionLabel: `Connect ${providerId}`,
        },
      ],
    };
  }

  return { kind: "available", blocking: false, diagnostics: [] };
}

function checkCredentials(
  input: ToolAvailabilityInput,
  definition: ToolDefinition,
): CheckResult {
  const providerId = definition.providerId;
  if (!providerId) {
    return { kind: "available", blocking: false, diagnostics: [] };
  }

  if (!input.credentials || input.credentials.length === 0) {
    return {
      kind: "setup_required",
      blocking: true,
      diagnostics: [
        {
          message: `"${definition.name}" requires credentials for provider "${providerId}".`,
          severity: "error",
          actionLabel: "Configure credentials",
        },
      ],
    };
  }

  return { kind: "available", blocking: false, diagnostics: [] };
}

function checkBudget(input: ToolAvailabilityInput): CheckResult {
  if (input.budgetWithinLimit === false) {
    return {
      kind: "blocked",
      blocking: true,
      diagnostics: [
        {
          message: "Budget limit has been exceeded. Execution is blocked.",
          severity: "error",
          actionLabel: "Review budget",
        },
      ],
    };
  }

  return { kind: "available", blocking: false, diagnostics: [] };
}

function checkBusinessProfile(input: ToolAvailabilityInput): CheckResult {
  if (input.businessProfileComplete === false) {
    return {
      kind: "setup_required",
      blocking: true,
      diagnostics: [
        {
          message: "Business profile is incomplete. Complete setup before using tools.",
          severity: "error",
          actionLabel: "Complete business profile",
        },
      ],
    };
  }

  return { kind: "available", blocking: false, diagnostics: [] };
}
