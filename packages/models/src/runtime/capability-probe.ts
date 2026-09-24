import "server-only";

import type {
  CapabilityProbeResult,
  ProviderConnectionConfig,
  ProviderProtocol,
} from "./types";
import {
  testOpenAICompatibleChat,
  testOpenAICompatibleStreaming,
  testOpenAICompatibleToolCalling,
  testOpenAICompatibleToolResultContinuation,
} from "./openai-compatible-adapter";
import {
  testAnthropicChat,
  testAnthropicStreaming,
  testAnthropicToolCalling,
  testAnthropicToolResultContinuation,
} from "./anthropic-adapter";

export async function probeProviderCapabilities(
  config: ProviderConnectionConfig,
): Promise<CapabilityProbeResult> {
  const warnings: string[] = [];
  const overallStart = Date.now();

  if (!config.model || config.model === "Not provided") {
    return {
      providerId: config.providerId,
      model: config.model,
      chat: false,
      streaming: false,
      toolCalling: false,
      toolResultContinuation: false,
      contextWindow: "unknown",
      contextWindowSource: "unknown",
      usage: null,
      costUsd: null,
      codingMode: false,
      warnings: ["A model identifier is required to test provider capabilities."],
      latencyMs: 0,
      error: "A model identifier is required.",
      errorSafeDetail: "A model identifier is required to test provider capabilities.",
      chatResponsePreview: null,
    };
  }

  const testChat = config.protocol === "anthropic" ? testAnthropicChat : testOpenAICompatibleChat;
  const testStreaming = config.protocol === "anthropic" ? testAnthropicStreaming : testOpenAICompatibleStreaming;
  const testTools = config.protocol === "anthropic" ? testAnthropicToolCalling : testOpenAICompatibleToolCalling;
  const testContinuation = config.protocol === "anthropic" ? testAnthropicToolResultContinuation : testOpenAICompatibleToolResultContinuation;

  const chatResult = await testChat(config);

  if (!chatResult.success) {
    return {
      providerId: config.providerId,
      model: config.model,
      chat: false,
      streaming: false,
      toolCalling: false,
      toolResultContinuation: false,
      contextWindow: "unknown",
      contextWindowSource: "unknown",
      usage: null,
      costUsd: null,
      codingMode: false,
      warnings: ["Chat failed — provider is unreachable or authentication failed."],
      latencyMs: chatResult.latencyMs,
      error: chatResult.error,
      errorSafeDetail: chatResult.errorSafeDetail,
      chatResponsePreview: null,
    };
  }

  const chatResponsePreview = chatResult.content
    ? chatResult.content.slice(0, 200)
    : null;

  const streamingResult = await testStreaming(config);

  if (!streamingResult.success) {
    warnings.push("Streaming test failed or returned insufficient chunks.");
  }

  const toolCallingResult = await testTools(config);

  if (!toolCallingResult.success) {
    warnings.push("Tool calling test failed. Coding mode will be disabled.");
  }

  let toolResultContinuationResult = null;
  if (toolCallingResult.success) {
    toolResultContinuationResult = await testContinuation(config);
    if (!toolResultContinuationResult.success) {
      warnings.push("Tool-result continuation test failed. Coding mode will be disabled.");
    }
  } else {
    warnings.push("Tool-result continuation skipped because tool calling failed.");
  }

  const codingMode = toolCallingResult.success && (toolResultContinuationResult?.success ?? false);

  return {
    providerId: config.providerId,
    model: config.model,
    chat: true,
    streaming: streamingResult.success,
    toolCalling: toolCallingResult.success,
    toolResultContinuation: toolResultContinuationResult?.success ?? false,
    contextWindow: "unknown",
    contextWindowSource: "unknown",
    usage: chatResult.usage ?? null,
    costUsd: null,
    codingMode,
    warnings,
    latencyMs: Date.now() - overallStart,
    error: null,
    errorSafeDetail: null,
    chatResponsePreview,
  };
}

export function resolveProtocol(providerId: string): ProviderProtocol {
  if (providerId === "anthropic") return "anthropic";
  return "openai-compatible";
}
