import "server-only";
import { gatewayContentText } from "./gateway/types";
import { needsContractV2 } from "./capabilities";
import { streamContractV2 } from "./contract-v2";

import { getDeepSeekEnv, getProviderApiKey } from "./gateway/env";
import { GatewayError } from "./gateway/errors";
import { applyOpenAICompatibleUsage, createMutableGatewayUsage } from "./shared";
import type { ProviderAdapter } from "./types";

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_MAX_TOKENS = 2048;

type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export const deepseekProviderAdapter: ProviderAdapter = {
  providerId: "deepseek",
  label: "DeepSeek",
  getAvailability() {
    if (!getProviderApiKey("deepseek")) {
      return {
        available: false,
        missingEnv: "DEEPSEEK_API_KEY",
        reason: "DeepSeek API key is not configured.",
      };
    }
    return { available: true };
  },
  async streamChat({ request, route, apiKeyOverride, signal }) {
    const apiKey = apiKeyOverride ?? getProviderApiKey("deepseek");
    if (!apiKey) {
      throw new GatewayError({
        code: "provider_key_missing",
        message: "DEEPSEEK_API_KEY is not configured on this server.",
        status: 503,
        details: { provider: "deepseek" },
      });
    }

    const env = getDeepSeekEnv();
    const model = (route.routingApplied && route.selectedModelAlias) || route.profile.models?.deepseek || env.model || DEFAULT_MODEL;
    const url = buildChatCompletionsUrl(env.baseUrl);
    if (needsContractV2(request)) return streamContractV2({provider:"deepseek",request,model,url:url,apiKey,signal});

    const messages: DeepSeekMessage[] = request.messages.map((m) => ({
      role: m.role as DeepSeekMessage["role"],
      content: gatewayContentText(m.content),
    }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
      messages,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw new GatewayError({
        code: "provider_unavailable",
        message: "Could not reach DeepSeek API. Check network connectivity.",
        status: 503,
        details: { provider: "deepseek", cause: String(err) },
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
        message: `DeepSeek API returned HTTP ${response.status}.`,
        status: response.status >= 500 ? 502 : response.status,
        details: {
          provider: "deepseek",
          httpStatus: response.status,
          body: errBody.slice(0, 400),
        },
      });
    }

    if (!response.body) {
      throw new GatewayError({
        code: "provider_error",
        message: "DeepSeek API returned an empty response body.",
        status: 502,
        details: { provider: "deepseek" },
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
        try {
          while (true) {
            const { done, value } = await bodyReader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (!raw || raw === "[DONE]") continue;
              try {
                const parsed = JSON.parse(raw) as Record<string, unknown>;
                const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
                const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
                if (delta && typeof delta.content === "string" && delta.content) {
                  usage.outputCharacters += delta.content.length;
                  controller.enqueue(delta.content);
                }
                applyOpenAICompatibleUsage(usage, parsed.usage);
              } catch {
                // skip malformed SSE data lines
              }
            }
          }
        } catch (err) {
          controller.error(
            new GatewayError({
              code: "provider_stream_error",
              message: "DeepSeek stream read failed mid-response.",
              status: 502,
              details: { provider: "deepseek", cause: String(err) },
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
