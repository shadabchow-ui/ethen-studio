import type { ProviderId } from "../types";

export type McpResourceContentType = "text" | "json" | "binary";

export interface McpResourceMeta {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpToolInputSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface McpToolManifest {
  name: string;
  description?: string;
  inputSchema?: McpToolInputSchema;
}

export interface McpProviderCapabilities {
  providerId: ProviderId;
  resources: McpResourceMeta[];
  tools: McpToolManifest[];
  state: "not_configured" | "available" | "disabled";
}

export function getMcpCapabilities(): McpProviderCapabilities {
  return {
    providerId: "mcp-bridge",
    resources: [],
    tools: [],
    state: "not_configured",
  };
}
