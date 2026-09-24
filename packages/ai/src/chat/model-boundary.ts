/**
 * Model Boundary for Ethen Chat (Split Specification Authority).
 *
 * Chat should have a strong model selector:
 * Astra, OpenAI, Claude, Gemini, DeepSeek, Local models.
 *
 * But Chat MUST NOT absorb Platform infrastructure such as:
 * - provider credentials
 * - routing rules
 * - provider health
 * - deployment configuration
 * - GPU settings
 * - benchmark management
 * - usage analytics
 */

export interface ChatModelOption {
  id: string;
  name: string;
  description: string;
  category: "flagship" | "fast" | "reasoning" | "local";
}

export const CHAT_MODEL_SELECTION: readonly ChatModelOption[] = Object.freeze([
  { id: "astra", name: "Ethen Astra", description: "Default balanced intelligence", category: "flagship" },
  { id: "gpt-4o", name: "GPT-4o", description: "OpenAI multimodal model", category: "flagship" },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", description: "Anthropic frontier reasoning", category: "reasoning" },
  { id: "gemini-2-0-flash", name: "Gemini 2.0 Flash", description: "Google fast multimodal model", category: "fast" },
  { id: "deepseek-v3", name: "DeepSeek V3", description: "DeepSeek open-architecture model", category: "flagship" },
  { id: "llama-3-2-local", name: "Llama 3.2 (Local)", description: "Private local inference", category: "local" },
]);

export const PROHIBITED_CHAT_INFRASTRUCTURE_KEYS = Object.freeze([
  "providerCredentials",
  "apiKey",
  "apiSecret",
  "vaultRef",
  "credentialRef",
  "routingRules",
  "cortexRouteMap",
  "fallbackCascade",
  "providerHealth",
  "uptimePercent",
  "latencyMs",
  "deploymentConfiguration",
  "replicaCount",
  "hostnames",
  "gpuSettings",
  "vramAllocated",
  "cudaVersion",
  "benchmarkManagement",
  "evalHarness",
  "testDatasets",
  "usageAnalytics",
  "costAttribution",
  "tenantTokenBurn",
]);

export function getChatModelSelection(): readonly ChatModelOption[] {
  return CHAT_MODEL_SELECTION;
}

export function sanitizeChatModelData<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (PROHIBITED_CHAT_INFRASTRUCTURE_KEYS.some((prohibited) => key.toLowerCase().includes(prohibited.toLowerCase()))) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

export function assertNoPlatformInfrastructureLeaked(payload: unknown): {
  compliant: boolean;
  leakedKeys: string[];
} {
  const leakedKeys: string[] = [];

  function inspect(obj: unknown, prefix = ""): void {
    if (!obj || typeof obj !== "object") return;

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const matchesProhibited = PROHIBITED_CHAT_INFRASTRUCTURE_KEYS.some((p) =>
        key.toLowerCase().includes(p.toLowerCase()),
      );

      if (matchesProhibited) {
        leakedKeys.push(fullPath);
      }

      if (value && typeof value === "object") {
        inspect(value, fullPath);
      }
    }
  }

  inspect(payload);

  return {
    compliant: leakedKeys.length === 0,
    leakedKeys,
  };
}
