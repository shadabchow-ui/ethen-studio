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

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    const lower = msg.toLowerCase();
    if (
      lower.includes("api key") ||
      lower.includes("x-api-key") ||
      lower.includes("auth") ||
      lower.includes("token") ||
      lower.includes("key") ||
      lower.includes("invalid") ||
      lower.includes("authentication")
    ) {
      return "Authentication failed — check your Anthropic API key.";
    }
    if (lower.includes("not found") || lower.includes("404")) {
      return "Endpoint not found — verify the Anthropic API URL.";
    }
    if (lower.includes("timeout") || lower.includes("econnrefused") || lower.includes("fetch failed")) {
      return "Could not reach Anthropic — check your network.";
    }
    if (msg.length > 200) return msg.slice(0, 200);
    return msg;
  }
  return "An unknown error occurred.";
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export async function anthropicChat(
  config: ProviderConnectionConfig,
  messages: Array<{ role: string; content: string }>,
  options?: {
    system?: string;
    tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
    maxTokens?: number;
    signal?: AbortSignal;
  },
): Promise<{
  responseText: string | null;
  usage: ProbeUsage | null;
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  stopReason: string | null;
}> {
  const conversationMessages: AnthropicMessage[] = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options?.maxTokens ?? 1024,
    messages: conversationMessages,
  };

  if (options?.system) {
    body.system = options.system;
  }

  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
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
  const content = data.content as Array<Record<string, unknown>> | undefined;
  const stopReason = (data.stop_reason as string) ?? null;

  let responseText: string | null = null;
  const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

  if (content) {
    for (const block of content) {
      if (block.type === "text" && typeof block.text === "string") {
        responseText = (responseText ?? "") + block.text;
      }
      if (block.type === "tool_use") {
        toolUses.push({
          id: block.id as string,
          name: block.name as string,
          input: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }
  }

  const rawUsage = data.usage as Record<string, unknown> | undefined;
  const usage: ProbeUsage | null =
    rawUsage && typeof rawUsage.input_tokens === "number" && typeof rawUsage.output_tokens === "number"
      ? {
          promptTokens: rawUsage.input_tokens as number,
          completionTokens: rawUsage.output_tokens as number,
          totalTokens: ((rawUsage.input_tokens as number) + (rawUsage.output_tokens as number)),
        }
      : null;

  return { responseText, usage, toolUses, stopReason };
}

async function streamAnthropic(
  config: ProviderConnectionConfig,
  messages: Array<{ role: string; content: string }>,
  options?: {
    system?: string;
    tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
    maxTokens?: number;
  },
): Promise<{ content: string; chunks: number }> {
  const conversationMessages: AnthropicMessage[] = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options?.maxTokens ?? 1024,
    messages: conversationMessages,
    stream: true,
  };

  if (options?.system) {
    body.system = options.system;
  }

  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
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
  let eventType = "";
  let fullContent = "";
  let chunks = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (eventType === "content_block_delta" && parsed.delta) {
            const delta = parsed.delta as Record<string, unknown>;
            if (delta.type === "text_delta" && typeof delta.text === "string") {
              fullContent += delta.text;
              chunks++;
            }
          }
        } catch {
          // skip malformed SSE
        }
      }
    }
  }

  return { content: fullContent, chunks };
}

export async function testAnthropicChat(config: ProviderConnectionConfig): Promise<ChatResult> {
  const start = Date.now();
  try {
    const result = await anthropicChat(config, [
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

export async function testAnthropicStreaming(config: ProviderConnectionConfig): Promise<StreamingResult> {
  const start = Date.now();
  try {
    const result = await streamAnthropic(config, [
      { role: "user", content: "Count from 1 to 5 slowly, one number per line." },
    ]);
    return {
      success: result.chunks > 1,
      chunks: result.chunks,
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

export async function testAnthropicToolCalling(config: ProviderConnectionConfig): Promise<ToolCallingResult> {
  const start = Date.now();
  try {
    const result = await anthropicChat(
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
            name: EthenProbeTool.name,
            description: EthenProbeTool.description,
            input_schema: EthenProbeTool.input_schema,
          },
        ],
      },
    );

    const toolCalled = result.toolUses.length > 0;
    const toolUse = result.toolUses[0];

    return {
      success: toolCalled,
      toolCalled,
      toolName: toolUse?.name ?? null,
      toolArgs: toolUse?.input ?? null,
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

export async function testAnthropicToolResultContinuation(
  config: ProviderConnectionConfig,
): Promise<ToolResultContinuationResult> {
  const start = Date.now();
  try {
    const toolResult = await anthropicChat(
      config,
      [
        {
          role: "user",
          content:
            "Call the tool ethen_probe_echo with message=hello. After you get the result, reply with exactly: CONTINUATION_OK",
        },
      ],
      {
        tools: [
          {
            name: EthenProbeTool.name,
            description: EthenProbeTool.description,
            input_schema: EthenProbeTool.input_schema,
          },
        ],
      },
    );

    if (toolResult.toolUses.length === 0) {
      return {
        success: false,
        continuationValid: false,
        content: null,
        error: "Provider did not call the tool. Tool-result continuation cannot be tested.",
        errorSafeDetail: null,
        latencyMs: Date.now() - start,
      };
    }

    const toolUse = toolResult.toolUses[0];

    // Build continuation messages with proper Anthropic structured content
    const continuationResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content:
              "Call the tool ethen_probe_echo with message=hello. After you get the result, reply with exactly: CONTINUATION_OK",
          },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: toolUse.id,
                name: toolUse.name,
                input: toolUse.input,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify({ echoed: "hello", received: true }),
              },
            ],
          },
        ],
      }),
    });

    if (!continuationResponse.ok) {
      return {
        success: false,
        continuationValid: false,
        content: null,
        error: `Anthropic continuation returned HTTP ${continuationResponse.status}`,
        errorSafeDetail: "Tool-result continuation request failed.",
        latencyMs: Date.now() - start,
      };
    }

    const continuationData = (await continuationResponse.json()) as Record<string, unknown>;
    const continuationContent = continuationData.content as Array<Record<string, unknown>> | undefined;
    let continuationText = "";
    if (continuationContent) {
      for (const block of continuationContent) {
        if (block.type === "text" && typeof block.text === "string") {
          continuationText += block.text;
        }
      }
    }

    const continuationValid = continuationText.includes("CONTINUATION_OK");

    return {
      success: continuationValid,
      continuationValid,
      content: continuationText,
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
