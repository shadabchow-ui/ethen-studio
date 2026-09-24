// Provider Runtime Types
// Foundation for provider capability probing and coding-mode eligibility

export type ProviderProtocol = "openai-compatible" | "anthropic";

export interface ProviderConnectionConfig {
  providerId: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ModelIdentity {
  providerId: string;
  modelId: string;
  contextWindow: number | "unknown";
  supportsTools: boolean | "unknown";
  supportsStreaming: boolean | "unknown";
}

/** Token usage reported by the provider for a model call, when available. */
export interface ProbeUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Where contextWindow came from — kept explicit so "unknown" is never confused with a guess. */
export type ContextWindowSource = "known-model-map" | "unknown";

export interface CapabilityProbeResult {
  providerId: string;
  model: string;
  chat: boolean;
  streaming: boolean;
  toolCalling: boolean;
  toolResultContinuation: boolean;
  contextWindow: number | "unknown";
  contextWindowSource: ContextWindowSource;
  /** Token usage from the probe's chat call. Null when the provider response didn't include usage data. */
  usage: ProbeUsage | null;
  /** Always null — no pricing table is configured, so cost is never fabricated. */
  costUsd: number | null;
  codingMode: boolean;
  warnings: string[];
  latencyMs: number | null;
  error: string | null;
  errorSafeDetail: string | null;
  chatResponsePreview: string | null;
}

export interface ChatResult {
  success: boolean;
  content: string | null;
  usage: ProbeUsage | null;
  error: string | null;
  errorSafeDetail: string | null;
  latencyMs: number;
}

export interface StreamingResult {
  success: boolean;
  chunks: number;
  content: string | null;
  error: string | null;
  errorSafeDetail: string | null;
  latencyMs: number;
}

export interface ToolCallingResult {
  success: boolean;
  toolCalled: boolean;
  toolName: string | null;
  toolArgs: Record<string, unknown> | null;
  content: string | null;
  error: string | null;
  errorSafeDetail: string | null;
  latencyMs: number;
}

export interface ToolResultContinuationResult {
  success: boolean;
  continuationValid: boolean;
  content: string | null;
  error: string | null;
  errorSafeDetail: string | null;
  latencyMs: number;
}

export const EthenProbeTool = {
  name: "ethen_probe_echo",
  description: "Ethen capability probe — echoes the input and returns a fixed response to verify tool calling works.",
  input_schema: {
    type: "object" as const,
    properties: {
      message: {
        type: "string" as const,
        description: "A test message to echo back",
      },
    },
    required: ["message"],
  },
};

export const PROBE_SYSTEM_PROMPT =
  "You are an agent capability probe. Respond concisely. When asked to use tools, call them exactly as instructed.";

export const PROBE_CHAT_MESSAGE = "Reply with exactly: PROBE_OK";

export const PROBE_TOOL_CALL_MESSAGE =
  "Call the tool ethen_probe_echo with message=hello. Do not reply in text — only call the tool.";

export const PROBE_TOOL_RESULT_MESSAGE =
  "The tool returned the message you sent. Confirm tool result receipt by replying with exactly: CONTINUATION_OK";

export function buildToolResultMessage(): string {
  return JSON.stringify({ echoed: "hello", received: true });
}
