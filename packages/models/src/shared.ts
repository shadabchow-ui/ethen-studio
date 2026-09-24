import { gatewayContentText, type GatewayChatMessage, type GatewayUsageMetadata } from "./gateway/types";

export function estimateTokens(text: string) {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Mutable usage object so stream parsers can fill tokens after the adapter returns. */
export type MutableGatewayUsage = GatewayUsageMetadata;

export function createMutableGatewayUsage(input: {
  messages: Array<{ content: GatewayChatMessage["content"] }>;
  creditCost?: number | null;
}): MutableGatewayUsage {
  const inputText = input.messages.map((message) => gatewayContentText(message.content)).join("\n");
  return {
    inputMessages: input.messages.length,
    inputCharacters: inputText.length,
    outputCharacters: 0,
    inputTokens: estimateTokens(inputText),
    outputTokens: null,
    cachedTokens: null,
    creditCost: input.creditCost ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Apply an OpenAI-compatible usage object onto a live usage record.
 * Never invents tokens when the provider omitted them.
 */
export function applyOpenAICompatibleUsage(
  usage: MutableGatewayUsage,
  raw: unknown,
): void {
  const record = asRecord(raw);
  if (!record) return;

  const promptTokens = asFiniteNumber(record.prompt_tokens);
  if (promptTokens != null) usage.inputTokens = promptTokens;

  const completionTokens = asFiniteNumber(record.completion_tokens);
  if (completionTokens != null) usage.outputTokens = completionTokens;

  const details = asRecord(record.prompt_tokens_details);
  const cachedFromDetails = details ? asFiniteNumber(details.cached_tokens) : null;
  const cachedFromHit = asFiniteNumber(record.prompt_cache_hit_tokens);
  if (cachedFromDetails != null) usage.cachedTokens = cachedFromDetails;
  else if (cachedFromHit != null) usage.cachedTokens = cachedFromHit;
}

/** Apply Anthropic Messages usage (message_start / message_delta). */
export function applyAnthropicUsage(
  usage: MutableGatewayUsage,
  raw: unknown,
): void {
  const record = asRecord(raw);
  if (!record) return;

  const inputTokens = asFiniteNumber(record.input_tokens);
  if (inputTokens != null) usage.inputTokens = inputTokens;

  const outputTokens = asFiniteNumber(record.output_tokens);
  if (outputTokens != null) usage.outputTokens = outputTokens;

  const cached = asFiniteNumber(record.cache_read_input_tokens);
  if (cached != null) usage.cachedTokens = cached;
}

export function createChunkedTextStream(
  text: string,
  chunkSize = 32
): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (let index = 0; index < text.length; index += chunkSize) {
        controller.enqueue(text.slice(index, index + chunkSize));
      }

      controller.close();
    },
  });
}
