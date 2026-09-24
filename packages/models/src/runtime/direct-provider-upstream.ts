import type { ProviderAdapter } from "../types";
import type { GatewayProviderRoute, GatewayRouteProfile } from "../gateway/types";
import { GatewayError } from "../gateway/errors";
import {
  assertSupported,
  type UpstreamAdapter,
  type UpstreamCapability,
  type UpstreamRequest,
  UpstreamAdapterError,
} from "./upstream-adapter";

const capabilities: Readonly<Record<UpstreamCapability, boolean>> = Object.freeze({
  streaming: true,
  non_streaming: false,
  tool_calls: false,
  usage: true,
  read_only_discovery: false,
});

export function directProviderAsUpstream(
  provider: ProviderAdapter,
): UpstreamAdapter {
  const adapter: UpstreamAdapter = {
    id: provider.providerId,
    capabilities,
    async execute(request: UpstreamRequest, apiKeyOverride?: string) {
      assertSupported(adapter, request);
      const profile: GatewayRouteProfile = {
        routeId: "text-general",
        capability: "generic",
        description: "Direct provider compatibility route.",
        models: { [provider.providerId]: request.model } as GatewayRouteProfile["models"],
      };
      const route = {
        routeId: "text-general",
        providerId: provider.providerId,
        mode: "production",
        source: "env-default",
        selectedModelAlias: request.model,
        routingApplied: true,
        profile,
      } as GatewayProviderRoute;
      let response;
      try {
        response = await provider.streamChat({
          request: {
            messages: request.messages
              .filter((message) => message.role !== "tool")
              .map((message) => ({
                role: message.role as "system" | "user" | "assistant",
                content: message.content,
              })),
            maxOutputTokens: request.maxOutputTokens,
            agent: null,
            routeId: "text-general",
          },
          route,
          apiKeyOverride,
          signal: request.signal,
        });
      } catch (error) {
        if (!(error instanceof GatewayError)) throw error;
        const code =
          error.status === 401 || error.status === 403
            ? "authentication"
            : error.status === 429
              ? "rate_limit"
              : error.status === 408 || error.status === 504
                ? "timeout"
                : error.status === 503
                  ? "unavailable"
                  : error.status === 400
                    ? "invalid_request"
                    : "upstream_error";
        throw new UpstreamAdapterError({
          code,
          retryable: code === "rate_limit" || code === "timeout" || code === "unavailable",
          status: error.status,
          messageRedacted: `${provider.providerId} request failed (${error.code}).`,
        });
      }
      return {
        text: null,
        textStream: response.textStream,
        toolCalls: [],
        usage: {
          inputTokens: response.usage.inputTokens ?? null,
          outputTokens: response.usage.outputTokens ?? null,
          source:
            response.usage.inputTokens == null &&
            response.usage.outputTokens == null
              ? "unavailable"
              : "provider",
        },
        providerRequestId: null,
      };
    },
  };
  return adapter;
}
