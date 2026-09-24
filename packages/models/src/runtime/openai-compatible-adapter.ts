import "server-only";

import type {
  ChatResult,
  ProbeUsage,
  ProviderConnectionConfig,
  StreamingResult,
  ToolCallingResult,
  ToolResultContinuationResult,
} from "./types";
import { EthenProbeTool } from "./types";

function buildOpenAICompatibleUrl(baseUrl: string): string {
  const cleaned = baseUrl.replace(/\/+$/, "");
  if (cleaned.endsWith("/chat/completions")) return cleaned;
  return `${cleaned}/chat/completions`;
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    const lower = msg.toLowerCase();
    if (
      lower.includes("api key") ||
      lower.includes("bearer") ||
      lower.includes("auth") ||
      lower.includes("token") ||
      lower.includes("key")
    ) {
      return "Authentication failed — check your API key.";
    }
    if (lower.includes("not found") || lower.includes("404")) {
      return "Endpoint not found — verify the base URL.";
    }
    if (lower.includes("timeout") || lower.includes("econnrefused") || lower.includes("fetch failed")) {
      return "Could not reach the provider — check the base URL and network.";
    }
    if (msg.length > 200) return msg.slice(0, 200);
    return msg;
  }
  return "An unknown error occurred.";
}

export async function openAICompatibleChat(
  config: ProviderConnectionConfig,
  messages: Array<Record<string, unknown>>,
  options?: { tools?: Array<Record<string, unknown>>; toolChoice?: string; signal?: AbortSignal },
): Promise<{ responseText: string | null; usage: ProbeUsage | null; toolCalls?: Array<{ id: string; name: string; arguments: string }> }> {
  const url = buildOpenAICompatibleUrl(config.baseUrl);

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: 1024,
    stream: false,
  };

  if (options?.tools) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options?.signal,
  });

  if (!response.ok) {
    let errBody = "";
    try {
      errBody = await response.text();
    } catch {
      // ignore
    }
    throw new Error(`HTTP ${response.status}: ${safeErrorMessage(new Error(errBody || `Status ${response.status}`))}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const choice = choices?.[0];
  const message = choice?.message as Record<string, unknown> | undefined;

  const responseText = (message?.content as string) ?? null;
  const rawToolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
  const toolCalls = rawToolCalls?.map((tc) => ({
    id: tc.id as string,
    name: (tc.function as Record<string, unknown>)?.name as string,
    arguments: (tc.function as Record<string, unknown>)?.arguments as string,
  }));

  const rawUsage = data.usage as Record<string, unknown> | undefined;
  const usage: ProbeUsage | null =
    rawUsage && typeof rawUsage.prompt_tokens === "number" && typeof rawUsage.completion_tokens === "number"
      ? {
          promptTokens: rawUsage.prompt_tokens as number,
          completionTokens: rawUsage.completion_tokens as number,
          totalTokens: (rawUsage.total_tokens as number) ?? ((rawUsage.prompt_tokens as number) + (rawUsage.completion_tokens as number)),
        }
      : null;

  return { responseText, usage, toolCalls };
}

async function streamOpenAICompatible(
  config: ProviderConnectionConfig,
  messages: Array<Record<string, unknown>>,
  options?: { tools?: Array<Record<string, unknown>>; toolChoice?: string },
): Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; arguments: string }> }> {
  const url = buildOpenAICompatibleUrl(config.baseUrl);

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: 1024,
    stream: true,
  };

  if (options?.tools) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errBody = "";
    try {
      errBody = await response.text();
    } catch {
      // ignore
    }
    throw new Error(`HTTP ${response.status}: ${safeErrorMessage(new Error(errBody || `Status ${response.status}`))}`);
  }

  if (!response.body) {
    throw new Error("Empty response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;
      const raw = trimmed.slice(6);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
        const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;

        if (delta?.content && typeof delta.content === "string") {
          fullContent += delta.content;
        }

        const deltaToolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined;
        if (deltaToolCalls) {
          for (const dtc of deltaToolCalls) {
            const idx = dtc.index as number;
            if (!toolCallMap.has(idx)) {
              toolCallMap.set(idx, {
                id: (dtc.id as string) ?? `call_${idx}`,
                name: ((dtc.function as Record<string, unknown>)?.name as string) ?? "",
                arguments: "",
              });
            }
            const existing = toolCallMap.get(idx)!;
            if (dtc.id && typeof dtc.id === "string") existing.id = dtc.id;
            if ((dtc.function as Record<string, unknown>)?.name) {
              existing.name = (dtc.function as Record<string, unknown>).name as string;
            }
            if ((dtc.function as Record<string, unknown>)?.arguments) {
              existing.arguments += (dtc.function as Record<string, unknown>).arguments as string;
            }
          }
        }
      } catch {
        // skip malformed SSE
      }
    }
  }

  const toolCalls = toolCallMap.size > 0 ? Array.from(toolCallMap.values()) : undefined;

  return { content: fullContent, toolCalls };
}

export async function testOpenAICompatibleChat(config: ProviderConnectionConfig): Promise<ChatResult> {
  const start = Date.now();
  try {
    const result = await openAICompatibleChat(config, [
      { role: "user", content: "Reply with exactly: PROBE_OK" },
    ]);
    return {
      success: true,
      content: result.responseText,
      usage: result.usage ?? null,
      error: null,
      errorSafeDetail: null,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      content: null,
      usage: null,
      error: err instanceof Error ? err.message : "Unknown error",
      errorSafeDetail: safeErrorMessage(err),
      latencyMs: Date.now() - start,
    };
  }
}

export async function testOpenAICompatibleStreaming(config: ProviderConnectionConfig): Promise<StreamingResult> {
  const start = Date.now();
  try {
    const result = await streamOpenAICompatible(config, [
      { role: "user", content: "Count from 1 to 5 slowly, one number per line." },
    ]);
    return {
      success: true,
      chunks: result.content.split("\n").filter(Boolean).length,
      content: result.content,
      error: null,
      errorSafeDetail: null,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      chunks: 0,
      content: null,
      error: err instanceof Error ? err.message : "Unknown error",
      errorSafeDetail: safeErrorMessage(err),
      latencyMs: Date.now() - start,
    };
  }
}

export async function testOpenAICompatibleToolCalling(config: ProviderConnectionConfig): Promise<ToolCallingResult> {
  const start = Date.now();
  try {
    const result = await openAICompatibleChat(
      config,
      [
        {
          role: "user",
          content: "Call the tool ethen_probe_echo with message=hello. Do not reply in text — only call the tool.",
        },
      ],
      {
        tools: [
          {
            type: "function",
            function: {
              name: EthenProbeTool.name,
              description: EthenProbeTool.description,
              parameters: EthenProbeTool.input_schema,
            },
          },
        ],
        toolChoice: "required",
      },
    );

    const toolCalled = Boolean(result.toolCalls && result.toolCalls.length > 0);
    const toolCall = result.toolCalls?.[0];

    return {
      success: toolCalled,
      toolCalled,
      toolName: toolCall?.name ?? null,
      toolArgs: toolCall ? (() => {
        try { return JSON.parse(toolCall.arguments); } catch { return null; }
      })() : null,
      content: result.responseText,
      error: toolCalled ? null : "Provider did not call the tool when instructed.",
      errorSafeDetail: null,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      toolCalled: false,
      toolName: null,
      toolArgs: null,
      content: null,
      error: err instanceof Error ? err.message : "Unknown error",
      errorSafeDetail: safeErrorMessage(err),
      latencyMs: Date.now() - start,
    };
  }
}

export async function testOpenAICompatibleToolResultContinuation(
  config: ProviderConnectionConfig,
): Promise<ToolResultContinuationResult> {
  const start = Date.now();
  try {
    const messages: Array<Record<string, unknown>> = [
      {
        role: "user",
        content: "Call the tool ethen_probe_echo with message=hello. After you get the result, reply with exactly: CONTINUATION_OK",
      },
    ];

    const toolResult = await openAICompatibleChat(
      config,
      messages,
      {
        tools: [
          {
            type: "function",
            function: {
              name: EthenProbeTool.name,
              description: EthenProbeTool.description,
              parameters: EthenProbeTool.input_schema,
            },
          },
        ],
        toolChoice: "required",
      },
    );

    if (!toolResult.toolCalls || toolResult.toolCalls.length === 0) {
      return {
        success: false,
        continuationValid: false,
        content: null,
        error: "Provider did not call the tool. Tool-result continuation cannot be tested.",
        errorSafeDetail: null,
        latencyMs: Date.now() - start,
      };
    }

    const toolCall = toolResult.toolCalls[0];

    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments || "{}",
          },
        },
      ],
    });
    messages.push({
      role: "tool",
      content: JSON.stringify({ echoed: "hello", received: true }),
      tool_call_id: toolCall.id,
    });

    const continuationResult = await openAICompatibleChat(config, messages);

    const continuationValid =
      continuationResult.responseText !== null &&
      continuationResult.responseText.includes("CONTINUATION_OK");

    return {
      success: continuationValid,
      continuationValid,
      content: continuationResult.responseText,
      error: continuationValid ? null : "Provider did not process the tool result and continue correctly.",
      errorSafeDetail: null,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      continuationValid: false,
      content: null,
      error: err instanceof Error ? err.message : "Unknown error",
      errorSafeDetail: safeErrorMessage(err),
      latencyMs: Date.now() - start,
    };
  }
}
