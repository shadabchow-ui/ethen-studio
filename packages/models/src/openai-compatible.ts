import "server-only";
import { gatewayContentText } from "./gateway/types";
import { needsContractV2 } from "./capabilities";
import { streamContractV2 } from "./contract-v2";

import { getOpenAICompatibleEnv, getProviderApiKey, isLoopbackProviderUrl } from "./gateway/env";
import { GatewayError } from "./gateway/errors";
import { applyOpenAICompatibleUsage, createMutableGatewayUsage } from "./shared";
import type { ProviderAdapter } from "./types";

function buildOpenAICompatibleUrl(baseUrl: string): string {
  const cleaned = baseUrl.replace(/\/+$/, "");
  if (cleaned.endsWith("/chat/completions")) return cleaned;
  return `${cleaned}/chat/completions`;
}

type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const openAICompatibleProviderAdapter: ProviderAdapter = {
  providerId: "openai-compatible",
  label: "OpenAI-compatible",
  getAvailability() {
    const env = getOpenAICompatibleEnv();
    if (!env) {
      return {
        available: false,
        missingEnv: "ETHEN_OPENAI_COMPATIBLE_BASE_URL and ETHEN_OPENAI_COMPATIBLE_MODEL",
        reason: "OpenAI-compatible routing needs a base URL and model before it can be selected.",
      };
    }
    if (!env.apiKey && !isLoopbackProviderUrl(env.baseUrl)) {
      return {
        available: false,
        missingEnv: "ETHEN_OPENAI_COMPATIBLE_API_KEY",
        reason: "Remote OpenAI-compatible endpoints require an API key. Localhost runtimes may omit it.",
      };
    }
    return { available: true };
  },
  async streamChat({ request, route, apiKeyOverride, signal }) {
    const env = getOpenAICompatibleEnv();
    if (!env) {
      throw new GatewayError({
        code: "provider_key_missing",
        message: "ETHEN_OPENAI_COMPATIBLE_BASE_URL and ETHEN_OPENAI_COMPATIBLE_MODEL are not configured.",
        status: 503,
        details: { provider: "openai-compatible" },
      });
    }
    const { apiKey: envApiKey, baseUrl, model: envModel } = env;

    const apiKey = apiKeyOverride ?? envApiKey ?? getProviderApiKey("openai-compatible") ?? "";
    if (!apiKey && !isLoopbackProviderUrl(baseUrl)) {
      throw new GatewayError({
        code: "provider_key_missing",
        message: "ETHEN_OPENAI_COMPATIBLE_API_KEY is required for non-localhost OpenAI-compatible endpoints.",
        status: 503,
        details: { provider: "openai-compatible" },
      });
    }
    const model =
      (route.routingApplied && route.selectedModelAlias) ||
      route.profile.models?.["openai-compatible"] ||
      envModel;

    const url = buildOpenAICompatibleUrl(baseUrl);
    if (needsContractV2(request)) return streamContractV2({provider:"openai-compatible",request,model,url:url,apiKey,signal});

    const messages: OpenAIMessage[] = request.messages.map((m) => ({
      role: m.role as OpenAIMessage["role"],
      content: gatewayContentText(m.content),
    }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxOutputTokens ?? 2048,
      stream: true,
      messages,
    };

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw new GatewayError({
        code: "provider_unavailable",
        message: "Could not reach the OpenAI-compatible endpoint. Check the base URL and network connectivity.",
        status: 503,
        details: { provider: "openai-compatible", cause: String(err) },
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
        message: `OpenAI-compatible endpoint returned HTTP ${response.status}.`,
        status: response.status >= 500 ? 502 : response.status,
        details: {
          provider: "openai-compatible",
          httpStatus: response.status,
          body: errBody.slice(0, 400),
        },
      });
    }

    if (!response.body) {
      throw new GatewayError({
        code: "provider_error",
        message: "OpenAI-compatible endpoint returned an empty response body.",
        status: 502,
        details: { provider: "openai-compatible" },
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
              message: "OpenAI-compatible stream read failed mid-response.",
              status: 502,
              details: { provider: "openai-compatible", cause: String(err) },
            }),
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
