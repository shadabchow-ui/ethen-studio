// Run with: NODE_OPTIONS=--conditions=react-server npx tsx lib/providers/runtime/__tests__/coding-provider-contract.test.ts

import {
  abortCodingProviderExecution,
  beginCodingProviderExecution,
  createConnectedCodingProvider,
  endCodingProviderExecution,
} from "../coding-provider";
import { createMockCodingProvider } from "../mock-coding-provider";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed++; return; }
  failed++; console.error(`FAIL: ${label}`);
}

function isPlan(value: unknown): value is { goal: string } {
  return typeof value === "object" && value !== null && "goal" in value && typeof value.goal === "string";
}

async function main(): Promise<void> {
  const mock = createMockCodingProvider({
    plan: { goal: "fixture", findings: [], proposedChanges: [], nonScope: [], validation: [], risks: [] },
    patch: { title: "fixture", reason: "fixture", patch: "*** Begin Patch\n*** End Patch\n", expectedFiles: [] },
  });
  if (!mock.execute) throw new Error("mock provider must implement the shared execution seam");
  const fixture = await mock.execute<{ goal: string }>({ operation: "plan", input: { prompt: "x", context: "y" } });
  assert(isPlan(fixture.value) && fixture.value.goal === "fixture", "fixture mode uses the shared execution envelope");
  assert(fixture?.usage === null, "fixture mode does not fabricate usage");
  assert(fixture?.warnings[0]?.includes("Fixture mode"), "fixture provenance is explicit");

  const originalFetch = globalThis.fetch;
  let sawSignal = false;
  globalThis.fetch = (async (_url, init) => {
    sawSignal = init?.signal instanceof AbortSignal;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ goal: "connected", findings: [], proposedChanges: [], nonScope: [], validation: [], risks: [] }) } }],
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const connected = createConnectedCodingProvider({
      label: "Connected fixture",
      config: { providerId: "contract-provider", protocol: "openai-compatible", baseUrl: "https://example.test/v1", apiKey: "test", model: "test-model" },
      capabilities: { toolCalling: true, toolResultContinuation: true, codingMode: true },
    });
    if (!connected.execute) throw new Error("connected provider must implement the shared execution seam");
    const signal = beginCodingProviderExecution("contract-run");
    const result = await connected.execute<{ goal: string }>({ operation: "plan", input: { prompt: "x", context: "y" }, signal });
    assert(isPlan(result.value) && result.value.goal === "connected", "connected provider uses the same execution envelope");
    assert(result?.usage?.totalTokens === 8, "reported provider usage is retained exactly");
    assert(sawSignal, "connected provider forwards cancellation signal to fetch");
    assert(abortCodingProviderExecution("contract-run"), "first cancellation aborts the active provider call");
    assert(!abortCodingProviderExecution("contract-run"), "cancellation is idempotent");
    endCodingProviderExecution("contract-run");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

void main();
