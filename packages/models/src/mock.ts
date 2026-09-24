import "server-only";
import { gatewayContentText } from "./gateway/types";

import type { ProviderAdapter } from "./types";
import { createChunkedTextStream, estimateTokens } from "./shared";

function buildMockResponse(input: Parameters<ProviderAdapter["streamChat"]>[0]) {
  const lastUserMessage = [...input.request.messages]
    .reverse()
    .find((message) => message.role === "user");

  const agentName = input.request.agent?.name ?? "this agent";
  const routeId = input.route.routeId;
  const prompt = gatewayContentText(lastUserMessage?.content ?? "").trim() || "your request";

  return [
    `Mock mode is active for ${agentName}.`,
    `This response was routed through the internal "${routeId}" gateway path.`,
    `When real providers are wired in, this same route can target a server-side adapter without changing the client.`,
    `Latest prompt: ${prompt}`,
  ].join(" ");
}

export const mockProviderAdapter: ProviderAdapter = {
  providerId: "mock",
  label: "Mock provider",
  getAvailability() {
    return { available: true };
  },
  async streamChat(input) {
    const text = buildMockResponse(input);
    const inputText = input.request.messages.map((message) => gatewayContentText(message.content)).join("\n");

    return {
      textStream: createChunkedTextStream(text),
      usage: {
        inputMessages: input.request.messages.length,
        inputCharacters: inputText.length,
        outputCharacters: text.length,
        inputTokens: estimateTokens(inputText),
        outputTokens: estimateTokens(text),
        creditCost: input.request.agent?.creditCost ?? null,
      },
    };
  },
};
