import "server-only";
import { gatewayContentText } from "./gateway/types";
import { needsContractV2 } from "./capabilities";
import { streamContractV2 } from "./contract-v2";

import { getProviderApiKey } from "./gateway/env";
import { GatewayError } from "./gateway/errors";
import { applyAnthropicUsage, createMutableGatewayUsage } from "./shared";
import type { ProviderAdapter } from "./types";
import { directProviderAsUpstream } from "./runtime/direct-provider-upstream";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 8192;

export const anthropicProviderAdapter: ProviderAdapter = {
  providerId: "anthropic",
  label: "Anthropic",
  getAvailability() {
    return getProviderApiKey("anthropic")
      ? { available: true }
      : { available: false, missingEnv: "ANTHROPIC_API_KEY" };
  },
  async streamChat({ request, route, apiKeyOverride, signal }) {
    const apiKey = apiKeyOverride ?? getProviderApiKey("anthropic");
    if (!apiKey) {
      throw new GatewayError({
        code: "provider_key_missing",
        message: "ANTHROPIC_API_KEY is not configured on this server.",
        status: 503,
        details: { provider: "anthropic" },
      });
    }

    const model = (route.routingApplied && route.selectedModelAlias) || route.profile.models?.anthropic || DEFAULT_MODEL;
    if (needsContractV2(request)) return streamContractV2({provider:"anthropic",request,model,url:ANTHROPIC_API_URL,apiKey,signal});

    const systemParts = request.messages.filter((m) => m.role === "system");
    const conversationMessages = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: gatewayContentText(m.content) }));

    const maxTokens = request.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      stream: true,
      messages: conversationMessages,
    };
    if (systemParts.length > 0) {
      body.system = systemParts.map((m) => m.content).join("\n");
    }

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw new GatewayError({
        code: "provider_unavailable",
        message: "Could not reach Anthropic API. Check network connectivity.",
        status: 503,
        details: { provider: "anthropic", cause: String(err) },
      });
    }

    if (!response.ok) {
      let errBody = "";
      try {
        errBody = await response.text();
      } catch {
        // ignore read errors
      }
      throw new GatewayError({
        code: "provider_error",
        message: `Anthropic API returned HTTP ${response.status}.`,
        status: response.status >= 500 ? 502 : response.status,
        details: { provider: "anthropic", httpStatus: response.status, body: errBody.slice(0, 400) },
      });
    }

    if (!response.body) {
      throw new GatewayError({
        code: "provider_error",
        message: "Anthropic API returned an empty response body.",
        status: 502,
        details: { provider: "anthropic" },
      });
    }

    const usage = createMutableGatewayUsage({
      messages: request.messages,
      creditCost: request.agent?.creditCost ?? null,
    });

    const bodyReader = response.body.getReader();
    const decoder = new TextDecoder();

    const textStream = new ReadableStream<string>({
      async start(controller) {
        let buffer = "";
        let eventType = "";
        try {
          while (true) {
            const { done, value } = await bodyReader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                const raw = line.slice(6).trim();
                if (!raw || raw === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(raw) as Record<string, unknown>;
                  if (eventType === "message_start" && parsed.message && typeof parsed.message === "object") {
                    applyAnthropicUsage(usage, (parsed.message as Record<string, unknown>).usage);
                  } else if (eventType === "message_delta") {
                    applyAnthropicUsage(usage, parsed.usage);
                  } else if (
                    eventType === "content_block_delta" &&
                    parsed.delta &&
                    typeof parsed.delta === "object" &&
                    (parsed.delta as Record<string, unknown>).type === "text_delta"
                  ) {
                    const text = (parsed.delta as Record<string, unknown>).text;
                    if (typeof text === "string" && text) {
                      usage.outputCharacters += text.length;
                      controller.enqueue(text);
                    }
                  }
                } catch {
                  // skip malformed SSE data lines
                }
              }
            }
          }
        } catch (err) {
          controller.error(
            new GatewayError({
              code: "provider_stream_error",
              message: "Anthropic stream read failed mid-response.",
              status: 502,
              details: { provider: "anthropic", cause: String(err) },
            })
          );
          return;
        }
        controller.close();
      },
    });

    return {
      textStream,
      usage,
    };
  },
};

export const anthropicUpstreamAdapter = directProviderAsUpstream(anthropicProviderAdapter);
