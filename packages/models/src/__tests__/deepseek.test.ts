// DeepSeek Gateway Provider Adapter — Validation Suite (mocked network only)
// Run with: NODE_OPTIONS="--conditions=react-server" npx tsx lib/providers/__tests__/deepseek.test.ts
//
// The --conditions=react-server flag is required because lib/providers/deepseek.ts
// imports "server-only", whose default export throws outside a React Server
// Component bundler. The "react-server" export condition resolves it to a
// no-op, matching how Next.js's RSC bundler treats it.

import { deepseekProviderAdapter } from "../deepseek";
import type { GatewayChatRequest, GatewayProviderRoute } from "../gateway/types";
import { GatewayError } from "../gateway/errors";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

type FetchCall = { url: string; init: RequestInit };

function mockFetchOnce(response: { ok: boolean; status?: number; bodyChunks?: string[]; text?: string }) {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status ?? 401,
        text: async () => response.text ?? "",
        body: null,
      } as unknown as Response;
    }

    const chunks = response.bodyChunks ?? [];
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(new TextEncoder().encode(chunks[index]));
        index += 1;
      },
    });

    return { ok: true, status: 200, body: stream } as unknown as Response;
  }) as typeof fetch;

  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

async function readStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += value;
  }
  return out;
}

function buildRequest(messages: GatewayChatRequest["messages"]): GatewayChatRequest {
  return { messages };
}

function buildRoute(model?: string): GatewayProviderRoute {
  return {
    routeId: "text-general",
    profile: {
      routeId: "text-general",
      capability: "generic",
      description: "test",
      models: model ? { deepseek: model } : undefined,
    },
    providerId: "deepseek",
    mode: "production",
    source: "auto-detected",
  };
}

async function testAvailabilityMissingKey(): Promise<void> {
  console.log("\n[Availability: missing DEEPSEEK_API_KEY]");
  const original = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const availability = deepseekProviderAdapter.getAvailability();
    assertEqual(availability.available, false, "unavailable without DEEPSEEK_API_KEY");
    assertEqual(availability.missingEnv, "DEEPSEEK_API_KEY", "missingEnv reports DEEPSEEK_API_KEY");
  } finally {
    if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
  }
}

async function testAvailabilityWithKey(): Promise<void> {
  console.log("\n[Availability: DEEPSEEK_API_KEY present]");
  const original = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  try {
    const availability = deepseekProviderAdapter.getAvailability();
    assertEqual(availability.available, true, "available when DEEPSEEK_API_KEY is set");
  } finally {
    if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
    else delete process.env.DEEPSEEK_API_KEY;
  }
}

async function testRequestUsesDefaultBaseUrlAndModel(): Promise<void> {
  console.log("\n[Request: default base URL and model]");
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  delete process.env.DEEPSEEK_API_BASE_URL;
  delete process.env.DEEPSEEK_MODEL;

  const mock = mockFetchOnce({ ok: true, bodyChunks: ['data: [DONE]\n\n'] });
  try {
    await deepseekProviderAdapter.streamChat({
      request: buildRequest([{ role: "user", content: "hello" }]),
      route: buildRoute(),
    });

    assertEqual(mock.calls.length, 1, "exactly one fetch call is made");
    const call = mock.calls[0];
    assertEqual(call.url, "https://api.deepseek.com/chat/completions", "URL defaults to https://api.deepseek.com/chat/completions");

    const headers = call.init.headers as Record<string, string>;
    assertEqual(headers.Authorization, "Bearer test-deepseek-key", "Authorization header carries the bearer key");

    const body = JSON.parse(call.init.body as string) as Record<string, unknown>;
    assertEqual(body.model, "deepseek-v4-flash", "request body model defaults to deepseek-v4-flash");
  } finally {
    mock.restore();
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
  }
}

async function testStreamingAppliesProviderUsageToReturnedObject(): Promise<void> {
  console.log("\n[Streaming: provider usage mutates the returned usage object]");
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";

  const mock = mockFetchOnce({
    ok: true,
    bodyChunks: [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":9,"completion_tokens":3,"prompt_tokens_details":{"cached_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ],
  });
  try {
    const result = await deepseekProviderAdapter.streamChat({
      request: buildRequest([{ role: "user", content: "hi" }]),
      route: buildRoute(),
    });
    await readStream(result.textStream);
    assertEqual(result.usage.inputTokens, 9, "prompt tokens from the final usage chunk are visible after the stream");
    assertEqual(result.usage.outputTokens, 3, "completion tokens from the final usage chunk are visible after the stream");
    assertEqual(result.usage.cachedTokens, 2, "cached tokens from prompt_tokens_details are visible after the stream");
  } finally {
    mock.restore();
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
  }
}

async function testStreamingParsesSseChunks(): Promise<void> {
  console.log("\n[Streaming: SSE chunks parse into text]");
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";

  const mock = mockFetchOnce({
    ok: true,
    bodyChunks: [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ],
  });
  try {
    const result = await deepseekProviderAdapter.streamChat({
      request: buildRequest([{ role: "user", content: "hi" }]),
      route: buildRoute("deepseek-v4-pro"),
    });

    const text = await readStream(result.textStream);
    assertEqual(text, "Hello world", "stream text is assembled from choices[0].delta.content chunks");
    assertEqual(result.usage.outputCharacters, "Hello world".length, "output character count tracks streamed deltas");

    const body = JSON.parse(mock.calls[0].init.body as string) as Record<string, unknown>;
    assertEqual(body.model, "deepseek-v4-pro", "route model override is used when present");
    assertEqual(
      Boolean((body.stream_options as { include_usage?: boolean } | undefined)?.include_usage),
      true,
      "request asks the provider to include usage on the stream",
    );
  } finally {
    mock.restore();
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
  }
}

async function testHttpErrorThrowsGatewayError(): Promise<void> {
  console.log("\n[HTTP error throws GatewayError]");
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";

  const mock = mockFetchOnce({ ok: false, status: 401, text: '{"error":"invalid api key"}' });
  try {
    let thrown: unknown = null;
    try {
      await deepseekProviderAdapter.streamChat({
        request: buildRequest([{ role: "user", content: "hi" }]),
        route: buildRoute(),
      });
    } catch (err) {
      thrown = err;
    }
    assert(thrown instanceof GatewayError, "throws a GatewayError on non-OK HTTP response");
    assertEqual((thrown as GatewayError | null)?.code, "provider_error", "GatewayError code is provider_error");
  } finally {
    mock.restore();
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
  }
}

async function testMissingApiKeyThrowsGatewayError(): Promise<void> {
  console.log("\n[Missing API key throws GatewayError before any fetch]");
  const original = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  const mock = mockFetchOnce({ ok: true, bodyChunks: [] });
  try {
    let thrown: unknown = null;
    try {
      await deepseekProviderAdapter.streamChat({
        request: buildRequest([{ role: "user", content: "hi" }]),
        route: buildRoute(),
      });
    } catch (err) {
      thrown = err;
    }
    assert(thrown instanceof GatewayError, "throws a GatewayError when DEEPSEEK_API_KEY is missing");
    assertEqual((thrown as GatewayError | null)?.code, "provider_key_missing", "GatewayError code is provider_key_missing");
    assertEqual(mock.calls.length, 0, "no fetch call is made without an API key");
  } finally {
    mock.restore();
    if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
  }
}

async function main(): Promise<void> {
  await testAvailabilityMissingKey();
  await testAvailabilityWithKey();
  await testRequestUsesDefaultBaseUrlAndModel();
  await testStreamingParsesSseChunks();
  await testStreamingAppliesProviderUsageToReturnedObject();
  await testHttpErrorThrowsGatewayError();
  await testMissingApiKeyThrowsGatewayError();

  console.log(`\n[deepseek.test.ts] Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main();
