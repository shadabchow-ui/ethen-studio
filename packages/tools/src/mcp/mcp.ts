// MCP Registry — Centralized MCP server and tool state with safety-first defaults.
// MCP is disabled/not configured by default. No live server connections,
// external process spawning, or network calls are performed.

import type {
  McpServerModel,
  McpServerStatus,
  McpToolModel,
  McpToolRiskClass,
  McpToolExecutionStatus,
  McpRegistry,
  McpRegistrySummary,
  McpSafetyPolicy,
} from "./types";
import {
  MCP_SAFETY_POLICY,
} from "./types";

// ── Default registry — all servers not configured ─────────────────────────

export function createEmptyMcpRegistry(): McpRegistry {
  return {
    servers: [],
    tools: [],
    generatedAt: new Date().toISOString(),
    summary: computeMcpRegistrySummary([], []),
  };
}

// ── Registry summary computation ──────────────────────────────────────────

export function computeMcpRegistrySummary(
  servers: McpServerModel[],
  tools: McpToolModel[],
): McpRegistrySummary {
  const totalServers = servers.length;
  const configuredServers = servers.filter((s) => s.status === "configured").length;
  const disabledServers = servers.filter((s) => s.status === "disabled").length;
  const notConfiguredServers = servers.filter((s) => s.status === "not_configured").length;
  const blockedServers = servers.filter((s) => s.status === "blocked").length;
  const totalTools = tools.length;
  const availableTools = tools.filter((t) => t.executionStatus === "available").length;
  const disabledTools = tools.filter((t) => t.executionStatus !== "available").length;

  return {
    totalServers,
    configuredServers,
    disabledServers,
    notConfiguredServers,
    blockedServers,
    totalTools,
    availableTools,
    disabledTools,
    untrustedToolOutput: MCP_SAFETY_POLICY.toolOutputUntrustedContext,
    liveExecutionEnabled: MCP_SAFETY_POLICY.liveExecutionEnabled,
    note: availableTools === 0
      ? "No MCP tools are currently available. MCP is disabled/not configured by default."
      : `${availableTools} MCP tool(s) available. All MCP tool output is untrusted context.`,
  };
}

// ── Risk classification ───────────────────────────────────────────────────

export function classifyMcpToolRisk(
  riskLevel: string | null | undefined,
  hasSideEffects: boolean | null | undefined,
): McpToolRiskClass {
  if (riskLevel) {
    const normalized = riskLevel.toLowerCase().trim();
    if (normalized === "read_only" || normalized === "read") return "read_only";
    if (normalized === "write" || normalized === "writes_user_content") return "write";
    if (normalized === "external_side_effect" || normalized === "side_effect") return "external_side_effect";
    if (normalized === "destructive" || normalized === "delete") return "destructive";
    if (normalized === "privileged" || normalized === "admin") return "privileged";
    if (normalized === "untrusted") return "untrusted";
  }

  if (hasSideEffects === true) return "external_side_effect";
  if (hasSideEffects === false) return "read_only";

  return "unknown";
}

// ── Default risk class — external tools are untrusted ─────────────────────

export function getDefaultMcpToolRiskClass(): McpToolRiskClass {
  return "untrusted";
}

// ── Approval requirement mapping ──────────────────────────────────────────

export type McpApprovalRequirement =
  | "no_approval"
  | "confirm_once"
  | "confirm_every_time"
  | "blocked";

export const MCP_APPROVAL_REQUIREMENT_LABELS: Record<McpApprovalRequirement, string> = {
  no_approval: "No approval required",
  confirm_once: "Approval required (once per session)",
  confirm_every_time: "Approval required (every invocation)",
  blocked: "Blocked",
};

export function getMcpToolApprovalRequirement(
  riskClass: McpToolRiskClass,
): McpApprovalRequirement {
  switch (riskClass) {
    case "untrusted":
      return "confirm_every_time";
    case "read_only":
      return "no_approval";
    case "write":
      return "confirm_every_time";
    case "external_side_effect":
      return "confirm_every_time";
    case "destructive":
      return "blocked";
    case "privileged":
      return "blocked";
    case "unknown":
      return "blocked";
  }
}

// ── Execution status derivation ───────────────────────────────────────────

export function getMcpToolExecutionStatus(
  serverStatus: McpServerStatus,
): McpToolExecutionStatus {
  switch (serverStatus) {
    case "configured":
      return "available";
    case "not_configured":
      return "not_configured";
    case "disabled":
      return "disabled";
    case "blocked":
      return "blocked";
    case "unavailable":
      return "disabled";
    case "error":
      return "disabled";
  }
}

// ── Server normalization ──────────────────────────────────────────────────

export function normalizeMcpServer(
  partial: Partial<McpServerModel> & { id: string; label: string },
): McpServerModel {
  return {
    id: partial.id,
    label: partial.label,
    source: partial.source ?? "mcp",
    configSource: partial.configSource ?? null,
    status: normalizeMcpServerStatus(partial.status),
    toolCount: partial.toolCount ?? null,
    riskClassification: partial.riskClassification ?? getDefaultMcpToolRiskClass(),
    approvalRequired: partial.approvalRequired ?? true,
    configuredReason: partial.configuredReason ?? null,
    disabledReason: partial.disabledReason ?? null,
    lastChecked: partial.lastChecked ?? null,
  };
}

export function normalizeMcpServerStatus(raw: string | null | undefined): McpServerStatus {
  if (!raw) return "not_configured";
  const valid: McpServerStatus[] = [
    "not_configured", "configured", "disabled", "blocked", "unavailable", "error",
  ];
  if (valid.includes(raw as McpServerStatus)) {
    return raw as McpServerStatus;
  }
  return "not_configured";
}

// ── Build registry with safety defaults ───────────────────────────────────

export function buildMcpRegistry(
  serverPartials: (Partial<McpServerModel> & { id: string; label: string })[],
  toolPartials: (Partial<McpToolModel> & { id: string; name: string; serverId: string })[],
): McpRegistry {
  const servers = serverPartials.map((p) => {
    const server = normalizeMcpServer(p);
    if (server.status === "not_configured" && !server.disabledReason) {
      server.disabledReason = "MCP server not configured. No live connection exists.";
    }
    return server;
  });

  const tools = toolPartials.map((t) => {
    const server = servers.find((s) => s.id === t.serverId);
    const serverStatus = server?.status ?? "not_configured";
    const executionStatus = getMcpToolExecutionStatus(serverStatus);

    return {
      id: t.id,
      name: t.name,
      serverId: t.serverId,
      description: t.description ?? null,
      inputSchema: t.inputSchema ?? null,
      riskClass: t.riskClass ?? getDefaultMcpToolRiskClass(),
      approvalCategory: "mcp" as const,
      executionStatus,
    };
  });

  return {
    servers,
    tools,
    generatedAt: new Date().toISOString(),
    summary: computeMcpRegistrySummary(servers, tools),
  };
}

// ── MCP tool output untrusted predicate — always true ─────────────────────

export function isMcpToolOutputUntrusted(): true {
  return MCP_SAFETY_POLICY.toolOutputUntrustedContext;
}

// ── MCP live execution predicate — always false ───────────────────────────

export function isMcpLiveExecutionEnabled(): false {
  return MCP_SAFETY_POLICY.liveExecutionEnabled;
}

// ── Get active safety policy ──────────────────────────────────────────────

export function getMcpSafetyPolicy(): McpSafetyPolicy {
  return { ...MCP_SAFETY_POLICY };
}

// ── Registry validity check ───────────────────────────────────────────────

export function validateMcpRegistry(registry: McpRegistry): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  for (const server of registry.servers) {
    if (server.status === "configured" && MCP_SAFETY_POLICY.liveExecutionEnabled === false) {
      warnings.push(
        `Server "${server.label}" (${server.id}) is marked configured but live MCP execution is disabled. ` +
        "No external tool calls will be made.",
      );
    }
    if (!server.id || !server.label) {
      warnings.push(`Server entry missing required id/label: ${JSON.stringify(server)}`);
    }
  }

  for (const tool of registry.tools) {
    const serverExists = registry.servers.some((s) => s.id === tool.serverId);
    if (!serverExists) {
      warnings.push(
        `Tool "${tool.name}" (${tool.id}) references unknown server "${tool.serverId}".`,
      );
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
