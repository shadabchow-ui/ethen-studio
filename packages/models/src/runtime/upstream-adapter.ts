export type UpstreamCapability =
  | "streaming"
  | "non_streaming"
  | "tool_calls"
  | "usage"
  | "read_only_discovery";

export interface UpstreamMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface UpstreamTool {
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
}

export interface UpstreamRequest {
  model: string;
  messages: readonly UpstreamMessage[];
  stream: boolean;
  maxOutputTokens?: number;
  tools?: readonly UpstreamTool[];
  signal?: AbortSignal;
}

export interface UpstreamUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  source: "provider" | "estimated" | "unavailable";
}

export interface UpstreamToolCall {
  id: string;
  name: string;
  arguments: Readonly<Record<string, unknown>>;
}

export interface UpstreamResponse {
  text: string | null;
  textStream: ReadableStream<string> | null;
  toolCalls: readonly UpstreamToolCall[];
  usage: UpstreamUsage;
  providerRequestId: string | null;
}

export interface UpstreamError {
  code:
    | "authentication"
    | "rate_limit"
    | "timeout"
    | "unavailable"
    | "invalid_request"
    | "unsupported_capability"
    | "upstream_error";
  retryable: boolean;
  status: number;
  messageRedacted: string;
}

export class UpstreamAdapterError extends Error {
  constructor(readonly detail: UpstreamError) {
    super(detail.messageRedacted);
    this.name = "UpstreamAdapterError";
  }
}

export interface UpstreamAdapter {
  id: string;
  capabilities: Readonly<Record<UpstreamCapability, boolean>>;
  execute(request: UpstreamRequest, apiKeyOverride?: string): Promise<UpstreamResponse>;
  discover?(): Promise<unknown>;
}

export function assertSupported(
  adapter: UpstreamAdapter,
  request: UpstreamRequest,
): void {
  const missing =
    request.stream && !adapter.capabilities.streaming
      ? "streaming"
      : !request.stream && !adapter.capabilities.non_streaming
        ? "non_streaming"
        : request.tools?.length && !adapter.capabilities.tool_calls
          ? "tool_calls"
          : null;
  if (missing) {
    throw new UpstreamAdapterError({
      code: "unsupported_capability",
      retryable: false,
      status: 400,
      messageRedacted: `${adapter.id} is not certified for ${missing}.`,
    });
  }
}
