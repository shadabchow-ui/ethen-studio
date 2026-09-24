import { TOOL_REGISTRY, getToolDefinition } from "@ethen/tools/registry";
import type { ToolDefinition, ToolId } from "@ethen/contracts/tools/types";

/**
 * Vercel Chatbot example tools explicitly rejected from shipping in Ethen Chat.
 * Ethen Chat strictly executes governed Ethen tools from the Ethen tool registry.
 */
export const VERCEL_EXAMPLE_TOOLS = Object.freeze([
  "getWeather",
  "createDocument",
  "updateDocument",
  "requestSuggestions",
]);

export function isVercelExampleTool(toolName: string): boolean {
  return VERCEL_EXAMPLE_TOOLS.includes(toolName);
}

export function assertNotVercelExampleTool(toolName: string): void {
  if (isVercelExampleTool(toolName)) {
    throw new Error(
      `Tool "${toolName}" is a rejected Vercel example tool and does not ship in Ethen Chat. ` +
      `Ethen Chat strictly operates on the governed Ethen tool registry.`
    );
  }
}

/**
 * Mapping of Chat UI tool alias identifiers to canonical Ethen TOOL_REGISTRY IDs.
 */
export const CHAT_TOOL_CANONICAL_MAP: Readonly<Record<string, ToolId>> = Object.freeze({
  web: "research.search",
  "deep-research": "research.agent",
  code: "shell.run",
  patch: "file.apply_patch",
  "file-read": "repo.read_file",
  "artifact.create": "artifact.create",
  "artifact.read": "artifact.read",
});

/**
 * Resolve a tool identifier (either alias or direct canonical ToolId) to a governed Ethen ToolDefinition.
 */
export function resolveToEthenTool(toolId: string): ToolDefinition | null {
  assertNotVercelExampleTool(toolId);

  // 1. Check direct canonical ID
  const direct = getToolDefinition(toolId as ToolId);
  if (direct) return direct;

  // 2. Check alias map
  const mappedId = CHAT_TOOL_CANONICAL_MAP[toolId];
  if (mappedId) {
    const mapped = getToolDefinition(mappedId);
    if (mapped) return mapped;
  }

  return null;
}

/**
 * Assert that a tool is present in the Ethen tool registry and permitted for Chat execution.
 */
export function isEthenTool(toolId: string): boolean {
  if (isVercelExampleTool(toolId)) return false;
  return resolveToEthenTool(toolId) !== null;
}

export function validateChatTool(toolId: string): { valid: boolean; error?: string; tool?: ToolDefinition } {
  if (isVercelExampleTool(toolId)) {
    return {
      valid: false,
      error: `Tool "${toolId}" is a rejected Vercel example tool and cannot be executed in Ethen Chat.`,
    };
  }

  const tool = resolveToEthenTool(toolId);
  if (!tool) {
    return {
      valid: false,
      error: `Tool "${toolId}" is not registered in the Ethen tool registry.`,
    };
  }

  return { valid: true, tool };
}

export interface ChatToolMetadata {
  id: string;
  canonicalId: ToolId;
  name: string;
  description: string;
  category: string;
  readOnly: boolean;
  requiresApproval: boolean;
  riskLevel: string;
  executionState: string;
}

export function listAvailableChatTools(): ChatToolMetadata[] {
  const result: ChatToolMetadata[] = [];

  for (const [alias, canonicalId] of Object.entries(CHAT_TOOL_CANONICAL_MAP)) {
    const tool = getToolDefinition(canonicalId);
    if (tool) {
      result.push({
        id: alias,
        canonicalId,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        readOnly: tool.readOnly,
        requiresApproval: tool.requiresApproval,
        riskLevel: tool.riskLevel,
        executionState: tool.executionState,
      });
    }
  }

  return result;
}
