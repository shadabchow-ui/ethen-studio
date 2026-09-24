import "server-only";

import {
  assertSupported,
  type UpstreamAdapter,
  type UpstreamCapability,
  type UpstreamRequest,
  type UpstreamResponse,
  type UpstreamToolCall,
  UpstreamAdapterError,
} from "./upstream-adapter";

const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1";

const capabilities: Readonly<Record<UpstreamCapability, boolean>> = Object.freeze({
  streaming: true,
  non_streaming: true,
  tool_calls: true,
  usage: true,
  read_only_discovery: false,
});

function mapStatus(status: number): UpstreamAdapterError {
  const code =
    status === 401 || status === 403
      ? "authentication"
      : status === 429
        ? "rate_limit"
        : status === 408 || status === 504
          ? "timeout"
          : status >= 500
            ? "unavailable"
            : status === 400 || status === 404 || status === 422
              ? "invalid_request"
              : "upstream_error";
  return new UpstreamAdapterError({
    code,
    retryable: code === "rate_limit" || code === "timeout" || code === "unavailable",
    status,
    messageRedacted: `vercel-ai-gateway request failed with HTTP ${status}.`,
  });
}

function parseToolCalls(value: unknown): UpstreamToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const fn = record.function as Record<string, unknown> | undefined;
    if (typeof record.id !== "string" || typeof fn?.name !== "string") return [];
    let args: Record<string, unknown> = {};
    if (typeof fn.arguments === "string") {
      try {
        const parsed = JSON.parse(fn.arguments) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
    }
    return [{ id: record.id, name: fn.name, arguments: args }];
  });
}

function requestBody(request: UpstreamRequest): Record<string, unknown> {
  return {
    model: request.model,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    })),
    stream: request.stream,
    ...(request.maxOutputTokens == null ? {} : { max_tokens: request.maxOutputTokens }),
    ...(request.tools?.length
      ? {
          tools: request.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
        }
      : {}),
  };
}

function parseUsage(value: unknown): UpstreamResponse["usage"] {
  const usage = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const inputTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null;
  const outputTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : null;
  return {
    inputTokens,
    outputTokens,
    source: inputTokens == null && outputTokens == null ? "unavailable" : "provider",
  };
}

export function createVercelAIGatewayAdapter(options?: {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): UpstreamAdapter {
  const adapter: UpstreamAdapter = {
    id: "vercel-ai-gateway",
    capabilities,
    async execute(request, apiKeyOverride) {
      assertSupported(adapter, request);
      const apiKey = apiKeyOverride ?? options?.apiKey ?? process.env.AI_GATEWAY_API_KEY;
      if (!apiKey) {
        throw new UpstreamAdapterError({
          code: "authentication",
          retryable: false,
          status: 503,
          messageRedacted: "Vercel AI Gateway authentication is not configured.",
        });
      }
      const baseUrl = (options?.baseUrl ?? process.env.VERCEL_AI_GATEWAY_BASE_URL ?? DEFAULT_BASE_URL)
        .replace(/\/+$/, "");
      let response: Response;
      try {
        response = await (options?.fetchImpl ?? fetch)(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(requestBody(request)),
          signal: request.signal,
        });
      } catch (error) {
        const aborted = request.signal?.aborted;
        throw new UpstreamAdapterError({
          code: aborted ? "timeout" : "unavailable",
          retryable: true,
          status: aborted ? 408 : 503,
          messageRedacted: aborted
            ? "Vercel AI Gateway request was cancelled or timed out."
            : "Vercel AI Gateway is unavailable.",
        });
      }
      if (!response.ok) throw mapStatus(response.status);
      const providerRequestId =
        response.headers.get("x-vercel-ai-gateway-request-id") ??
        response.headers.get("x-request-id");

      if (!request.stream) {
        let payload: Record<string, unknown>;
        try {
          payload = await response.json() as Record<string, unknown>;
        } catch {
          throw new UpstreamAdapterError({
            code: "upstream_error",
            retryable: false,
            status: 502,
            messageRedacted: "Vercel AI Gateway returned malformed JSON.",
          });
        }
        const choice = Array.isArray(payload.choices)
          ? payload.choices[0] as Record<string, unknown> | undefined
          : undefined;
        const message = choice?.message as Record<string, unknown> | undefined;
        return {
          text: typeof message?.content === "string" ? message.content : null,
          textStream: null,
          toolCalls: parseToolCalls(message?.tool_calls),
          usage: parseUsage(payload.usage),
          providerRequestId,
        };
      }

      if (!response.body) {
        throw new UpstreamAdapterError({
          code: "upstream_error",
          retryable: true,
          status: 502,
          messageRedacted: "Vercel AI Gateway returned an empty stream.",
        });
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const textStream = new ReadableStream<string>({
        async start(controller) {
          let buffer = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6).trim();
                if (!raw || raw === "[DONE]") continue;
                try {
                  const payload = JSON.parse(raw) as Record<string, unknown>;
                  const choice = Array.isArray(payload.choices)
                    ? payload.choices[0] as Record<string, unknown> | undefined
                    : undefined;
                  const delta = choice?.delta as Record<string, unknown> | undefined;
                  if (typeof delta?.content === "string") controller.enqueue(delta.content);
                } catch {
                  // A malformed event is isolated; a later valid event can still complete the stream.
                }
              }
            }
            controller.close();
          } catch {
            controller.error(new UpstreamAdapterError({
              code: "upstream_error",
              retryable: true,
              status: 502,
              messageRedacted: "Vercel AI Gateway stream was interrupted.",
            }));
          }
        },
      });
      return {
        text: null,
        textStream,
        toolCalls: [],
        usage: { inputTokens: null, outputTokens: null, source: "unavailable" },
        providerRequestId,
      };
    },
  };
  return adapter;
}

export const vercelAIGatewayAdapter = createVercelAIGatewayAdapter();
