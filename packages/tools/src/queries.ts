import "server-only";
import { TOOL_REGISTRY } from "./registry";
import type { ClientToolMeta, ToolDefinition, ToolId } from "@ethen/contracts/tools/types";
import {
  EXECUTABLE_WRITE_GOVERNANCE_OVERRIDES,
  readGovernedToolSemanticVersion,
  validateGovernedToolDefinitions,
  validateGovernedToolRegistryOrThrow,
} from "./registry/platform-tool-registry";

/** Strip server-only fields before sending to the client. */
export function toClientMeta(tool: ToolDefinition): ClientToolMeta {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    category: tool.category,
    riskLevel: tool.riskLevel,
    readOnly: tool.readOnly,
    requiresApproval: tool.requiresApproval,
    approvalRequirement: tool.approvalRequirement,
    executionState: tool.executionState,
    providerId: tool.providerId,
  };
}

/** All tools available to a given agent slug (client-safe). */
export function listToolsForAgent(agentSlug: string): ClientToolMeta[] {
  return TOOL_REGISTRY.filter(
    (t) =>
      t.allowedAgentSlugs.length === 0 || t.allowedAgentSlugs.includes(agentSlug)
  ).map(toClientMeta);
}

/** All tools available in a given workspace archetype (client-safe). */
export function listToolsForWorkspace(archetype: string): ClientToolMeta[] {
  return TOOL_REGISTRY.filter(
    (t) =>
      t.allowedWorkspaceArchetypes.length === 0 ||
      t.allowedWorkspaceArchetypes.includes(archetype)
  ).map(toClientMeta);
}

/** Look up a single tool definition by ID (server-side only). */
export function getToolDefinition(id: ToolId): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.id === id);
}

/** Validate that a ToolDefinition has all required fields populated. */
export function assertValidToolDefinition(tool: ToolDefinition): void {
  if (!tool.id) throw new Error(`Tool missing id`);
  if (!tool.name) throw new Error(`Tool ${tool.id} missing name`);
  if (!tool.description) throw new Error(`Tool ${tool.id} missing description`);
  if (!tool.inputSummary) throw new Error(`Tool ${tool.id} missing inputSummary`);
  if (!tool.outputSummary) throw new Error(`Tool ${tool.id} missing outputSummary`);

  const governed = validateGovernedToolDefinitions([tool], {
    semanticVersion: readGovernedToolSemanticVersion(),
    overrides: EXECUTABLE_WRITE_GOVERNANCE_OVERRIDES,
  });
  const firstError = governed.issues.find((issue) => issue.severity === "error");
  if (firstError) {
    throw new Error(`Tool ${tool.id} failed governed validation: ${firstError.code}`);
  }
}

/** Assert all registry entries are valid at module load time (dev guard). */
if (process.env.NODE_ENV !== "production") {
  validateGovernedToolRegistryOrThrow(TOOL_REGISTRY);
  for (const tool of TOOL_REGISTRY) {
    assertValidToolDefinition(tool);
  }
}
