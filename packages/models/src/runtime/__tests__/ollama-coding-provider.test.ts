import {
  createOllamaCodingProvider,
  probeOllamaCodingCapabilities,
} from "../ollama-coding-provider";
import type { OllamaLocalModelAdapter } from "@ethen/contracts/local-models/local-model-types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

function createFixtureAdapter(options: { detected?: boolean; installed?: boolean; response?: string } = {}): OllamaLocalModelAdapter {
  const detected = options.detected ?? true;
  const installed = options.installed ?? true;
  const response = options.response ?? "ETHEN_LOCAL_PROBE_OK";
  return {
    status: async () => ({ provider: "ollama", version: "fixture", detected, baseUrlLabel: "localhost", installedModelCount: installed ? 1 : 0, detail: detected ? "ready" : "offline", checkedAt: new Date().toISOString() }),
    listInstalled: async () => installed ? [{ id: "ollama:fixture", provider: "ollama", name: "fixture", model: "fixture", modifiedAt: null, sizeBytes: null, digest: null, family: null, parameterSize: null, quantizationLevel: null }] : [],
    listRunning: async () => [],
    show: async () => ({ id: "ollama:fixture", provider: "ollama", name: "fixture", model: "fixture", modifiedAt: null, sizeBytes: null, digest: null, family: null, parameterSize: null, quantizationLevel: null, license: null, modelfile: null, template: null, parameters: null, system: null, capabilities: ["chat"], rawMetadata: undefined }),
    pull: async function* () { return; },
    delete: async () => ({ model: "fixture", deleted: true, detail: "fixture" }),
    chat: async function* () {
      yield { type: "delta" as const, content: response, done: false };
      yield { type: "done" as const, content: "", done: true };
    },
  };
}

async function main(): Promise<void> {
  const ready = await probeOllamaCodingCapabilities("fixture", createFixtureAdapter());
  assert(ready.reachable && ready.modelInstalled && ready.streaming, "installed streamed model is eligible for plain local planning");
  assert(ready.contextWindow === null, "context window remains unknown when runtime metadata does not provide it");
  assert(!ready.supportsTools && !ready.supportsStructuredOutput, "unsupported request formats remain fail-closed");
  assert(ready.cancellationSupported, "existing adapter cancellation support is retained");

  const missing = await probeOllamaCodingCapabilities("fixture", createFixtureAdapter({ installed: false }));
  assert(!missing.modelInstalled && !missing.streaming, "missing selected model is rejected before chat execution");

  const offline = await probeOllamaCodingCapabilities("fixture", createFixtureAdapter({ detected: false }));
  assert(!offline.reachable && !offline.streaming, "unreachable runtime is rejected");

  const provider = createOllamaCodingProvider({
    model: "fixture",
    adapter: createFixtureAdapter({ response: '{"goal":"g","findings":[],"proposedChanges":[],"nonScope":[],"validation":[],"risks":[]}' }),
  });
  const plan = await provider.createPlan({ prompt: "fixture", context: "fixture" });
  assert(plan.goal === "g", "local provider consumes the established streaming adapter");
  assert(provider.lastProviderUsage === null, "local provider does not fabricate usage");

  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

void main();
