// DeepSeek Coding Provider — Validation Suite (mocked network only)
// Run with: NODE_OPTIONS="--conditions=react-server" npx tsx lib/providers/runtime/__tests__/deepseek-provider.test.ts
//
// The --conditions=react-server flag is required because adapter modules in
// this directory import "server-only", whose default export throws outside
// a React Server Component bundler. The "react-server" export condition
// resolves it to a no-op, matching how Next.js's RSC bundler treats it.

import { openAICompatibleChat, testOpenAICompatibleChat } from "../openai-compatible-adapter";
import { resolveProtocol } from "../capability-probe";
import { createConnectedCodingProvider } from "../coding-provider";
import type { ProviderConnectionConfig } from "../types";
import { BUILT_IN_PROVIDERS } from "../../metadata";

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

function mockFetchOnce(response: { ok: boolean; status?: number; json?: unknown; text?: string }) {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 401),
      json: async () => response.json,
      text: async () => response.text ?? JSON.stringify(response.json ?? {}),
    } as Response;
  }) as typeof fetch;

  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

const DEEPSEEK_CONFIG: ProviderConnectionConfig = {
  providerId: "deepseek",
  protocol: "openai-compatible",
  baseUrl: "https://api.deepseek.com",
  apiKey: "test-deepseek-key",
  model: "deepseek-v4-flash",
};

async function testMetadata(): Promise<void> {
  console.log("\n[Metadata: DeepSeek provider entry]");

  const meta = BUILT_IN_PROVIDERS.find((p) => p.id === "deepseek");
  assert(Boolean(meta), "DeepSeek is registered in BUILT_IN_PROVIDERS");
  assertEqual(meta?.defaultModels[0], "deepseek-v4-flash", "default model is deepseek-v4-flash");
  assert(Boolean(meta?.defaultModels.includes("deepseek-v4-pro")), "deepseek-v4-pro is an available model");
  assert(Boolean(meta?.legacyModels?.includes("deepseek-chat")), "deepseek-chat is marked legacy");
  assert(Boolean(meta?.legacyModels?.includes("deepseek-reasoner")), "deepseek-reasoner is marked legacy");
  assert(meta?.isOpenAICompatible === true, "DeepSeek is flagged OpenAI-compatible");
  assertEqual(meta?.docsUrl, "https://api.deepseek.com", "default base URL is https://api.deepseek.com");
}

function testProtocolResolution(): void {
  console.log("\n[Protocol resolution]");
  assertEqual(resolveProtocol("deepseek"), "openai-compatible", "deepseek resolves to the openai-compatible protocol");
}

async function testRequestConstruction(): Promise<void> {
  console.log("\n[Request construction]");

  const mock = mockFetchOnce({
    ok: true,
    json: {
      choices: [{ message: { content: "PROBE_OK" } }],
    },
  });

  try {
    const result = await openAICompatibleChat(DEEPSEEK_CONFIG, [
      { role: "user", content: "Reply with exactly: PROBE_OK" },
    ]);

    assertEqual(mock.calls.length, 1, "exactly one fetch call is made");
    const call = mock.calls[0];
    assertEqual(call.url, "https://api.deepseek.com/chat/completions", "request URL is the DeepSeek chat/completions endpoint");

    const headers = call.init.headers as Record<string, string>;
    assertEqual(headers.Authorization, "Bearer test-deepseek-key", "Authorization header carries the bearer key");

    const body = JSON.parse(call.init.body as string) as Record<string, unknown>;
    assertEqual(body.model, "deepseek-v4-flash", "request body model is deepseek-v4-flash");
    assertEqual(body.stream, false, "non-streaming chat sends stream: false");

    assertEqual(result.responseText, "PROBE_OK", "response text is parsed from choices[0].message.content");
  } finally {
    mock.restore();
  }
}

async function testMissingApiKeyIsNotSent(): Promise<void> {
  console.log("\n[No API key -> no Authorization header]");

  const mock = mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "ok" } }] } });
  try {
    const configWithoutKey: ProviderConnectionConfig = { ...DEEPSEEK_CONFIG, apiKey: "" };
    await openAICompatibleChat(configWithoutKey, [{ role: "user", content: "hi" }]);
    const headers = mock.calls[0].init.headers as Record<string, string>;
    assert(!("Authorization" in headers), "no Authorization header is sent when apiKey is empty");
  } finally {
    mock.restore();
  }
}

async function testProviderErrorHandling(): Promise<void> {
  console.log("\n[HTTP error handling]");

  const mock = mockFetchOnce({ ok: false, status: 401, text: '{"error":{"message":"invalid api key"}}' });
  try {
    const result = await testOpenAICompatibleChat(DEEPSEEK_CONFIG);
    assertEqual(result.success, false, "chat test reports failure on HTTP 401");
    assert(Boolean(result.errorSafeDetail?.toLowerCase().includes("authentication")), "error is classified as an authentication failure without leaking the raw key");
  } finally {
    mock.restore();
  }
}

async function testCreateConnectedCodingProviderUsesDeepSeekConfig(): Promise<void> {
  console.log("\n[createConnectedCodingProvider routes through the openai-compatible adapter for deepseek]");

  const mock = mockFetchOnce({
    ok: true,
    json: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              goal: "test goal",
              findings: [],
              proposedChanges: [],
              nonScope: [],
              validation: [],
              risks: [],
            }),
          },
        },
      ],
    },
  });

  try {
    const provider = createConnectedCodingProvider({
      label: "DeepSeek",
      config: DEEPSEEK_CONFIG,
      capabilities: { toolCalling: false, toolResultContinuation: false, codingMode: false },
    });

    const plan = await provider.createPlan({ prompt: "do the thing", context: "repo context" });

    assertEqual(mock.calls[0].url, "https://api.deepseek.com/chat/completions", "plan request hits the DeepSeek endpoint");
    assertEqual(plan.goal, "test goal", "plan JSON is parsed from the mocked DeepSeek response");
  } finally {
    mock.restore();
  }
}

async function main(): Promise<void> {
  await testMetadata();
  testProtocolResolution();
  await testRequestConstruction();
  await testMissingApiKeyIsNotSent();
  await testProviderErrorHandling();
  await testCreateConnectedCodingProviderUsesDeepSeekConfig();

  console.log(`\n[deepseek-provider.test.ts] Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main();
