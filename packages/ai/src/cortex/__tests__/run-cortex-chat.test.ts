// Cortex Run Chat Orchestrator — unit tests
// Run with: npx tsx lib/cortex/__tests__/run-cortex-chat.test.ts
//
// Integration-level tests that require live providers are not included.
// This file tests the pre-gateway orchestration logic:
//   - classification of diverse messages
//   - mode resolution (auto, override)
//   - profile lookup from resolved mode
//   - receipt building from classification + profile + mock gateway data
//   - router wiring (invoked when candidates exist, honest skip when not)
//   - verifier wiring (skipped honestly when output unavailable in streaming)

import { classifyIntent, getDefaultModeForIntent } from "../intent-classifier";
import { selectCandidates } from "../model-router";
import { getCortexRouteProfile } from "../routes";
import { buildCortexRouteReceipt } from "../route-receipt";
import type {
  CortexRouteProfile,
  EthenMode,
  EthenRouteReceipt,
  IntentClassification,
  ModelCandidate,
} from "../types";
import { verifyCortexOutput } from "../verifier";
import type {
  GatewayResult,
  GatewayProviderRoute,
  GatewayModelRegistry,
} from "@ethen/models/gateway/types";

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

function createEmptyStream(): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      controller.close();
    },
  });
}

function createMockRoute(overrides?: Partial<GatewayProviderRoute>): GatewayProviderRoute {
  return {
    routeId: "text-general",
    profile: {
      routeId: "text-general",
      capability: "generic",
      description: "General-purpose text responses.",
    },
    providerId: "openai",
    fallbackProviderId: null,
    mode: "production",
    source: "env-default",
    selectedProvider: "OpenAI",
    selectedModelAlias: "gpt-4o-mini",
    attemptCount: 1,
    attempts: [
      { attemptNumber: 1, providerId: "openai", timestamp: new Date().toISOString(), succeeded: true },
    ],
    cortexSelection: {
      reasonCodes: ["selected_by_intent"],
      candidateCount: 1,
      selectedCandidateRank: 1,
    },
    ...overrides,
  };
}

function createMockGatewayResult(routeOverrides?: Partial<GatewayProviderRoute>): GatewayResult {
  return {
    textStream: createEmptyStream(),
    usage: {
      inputMessages: 2,
      inputCharacters: 100,
      outputCharacters: 200,
      inputTokens: 50,
      outputTokens: 100,
      creditCost: 5,
    },
    route: createMockRoute(routeOverrides),
    warnings: [],
  } as GatewayResult;
}

// ── Classification → Mode Resolution ───────────────────────────────────

const testCases: Array<{
  message: string;
  expectedIntentPrefix: string;
  expectedDefaultMode: EthenMode;
}> = [
  {
    message: "Fix the bug in src/auth.ts",
    expectedIntentPrefix: "coding.",
    expectedDefaultMode: "code",
  },
  {
    message: "Research AI gateways for routing and fallback design",
    expectedIntentPrefix: "planning.",
    expectedDefaultMode: "cortex-pro",
  },
  {
    message: "Compare competitor prices for cloud hosting",
    expectedIntentPrefix: "research.",
    expectedDefaultMode: "research",
  },
  {
    message: "Write a tweet about our new product launch",
    expectedIntentPrefix: "writing.",
    expectedDefaultMode: "writer",
  },
  {
    message: "Schedule a meeting for tomorrow",
    expectedIntentPrefix: "automation.",
    expectedDefaultMode: "operator",
  },
  {
    message: "Design a system architecture for multi-tenant routing",
    expectedIntentPrefix: "planning.",
    expectedDefaultMode: "cortex-pro",
  },
  {
    message: "Hello, how are you?",
    expectedIntentPrefix: "general.chat",
    expectedDefaultMode: "cortex",
  },
];

{
  for (const tc of testCases) {
    const classification = classifyIntent({
      message: tc.message,
      selectedMode: "auto",
    });

    const mode = getDefaultModeForIntent(classification.primaryIntent);

    assert(
      classification.primaryIntent.startsWith(tc.expectedIntentPrefix),
      `"${tc.message}" → intent starts with "${tc.expectedIntentPrefix}" (got ${classification.primaryIntent})`
    );
    assertEqual(
      mode,
      tc.expectedDefaultMode,
      `"${tc.message}" → default mode "${tc.expectedDefaultMode}"`
    );
  }
}

// ── Mode Override ──────────────────────────────────────────────────────

{
  const classification = classifyIntent({
    message: "Fix the bug in src/auth.ts",
    selectedMode: "cortex-pro",
  });

  // When selectedMode is explicit and not auto, it should override
  assertEqual(
    classification.primaryIntent,
    "planning.technical",
    "explicit cortex-pro mode overrides coding classification"
  );
  assert(classification.reasonCodes.includes("mode_override"), "reasonCodes includes mode_override");
}

{
  const classification = classifyIntent({
    message: "Write a tweet about AI",
    selectedMode: "code",
  });

  const mode = getDefaultModeForIntent(classification.primaryIntent);
  assertEqual(mode, "code", "explicit code mode → code intent → code default mode");
  assert(classification.primaryIntent.startsWith("coding."), "write tweet with code mode → coding intent via override");
}

// ── Profile Lookup From Resolved Mode ──────────────────────────────────

{
  const modes: EthenMode[] = ["cortex-lite", "cortex", "cortex-pro", "code", "research", "writer", "operator"];

  for (const mode of modes) {
    const profile = getCortexRouteProfile(mode);
    assert(profile !== null, `profile exists for mode "${mode}"`);
    if (profile) {
      assertEqual(profile.mode, mode, `profile.mode matches "${mode}"`);
      assert(typeof profile.label === "string" && profile.label.length > 0, `profile has label for "${mode}"`);
      assert(typeof profile.status === "string", `profile has status for "${mode}"`);
    }
  }
}

{
  const nullProfile = getCortexRouteProfile(null);
  assert(nullProfile === null, "null input returns null profile");
}

{
  const unknownProfile = getCortexRouteProfile("nonexistent-mode-id");
  assert(unknownProfile === null, "unknown mode returns null profile");
}

// ── Receipt Building with Various Profiles ─────────────────────────────

{
  const classification = classifyIntent({
    message: "Compare competitor prices for cloud hosting",
    selectedMode: "auto",
  });

  const resolvedMode = getDefaultModeForIntent(classification.primaryIntent);
  const profile = getCortexRouteProfile(resolvedMode);
  const gatewayResult = createMockGatewayResult();

  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: profile,
    gatewayResult,
    verifierSkippedNote: "Test: verifier not wired.",
  });

  assertEqual(receipt.mode, "research", "competitor prices message → receipt mode research");
  assertEqual(receipt.routeProfile, "research", "competitor prices message → receipt routeProfile research");
  // toolPolicy "required" describes policy/intent, not actual execution. No
  // tool call ran here, so the receipt must not claim tool_augmented —
  // overclaiming tool use would be a truthfulness violation. It falls back
  // to "verified" because research intents also require verification.
  assertEqual(receipt.routeClass, "verified", "research without actual tool execution falls back to verified, not tool_augmented");
  assertEqual(receipt.tools.used, false, "tools.used is false when no tool actually ran");
}

{
  // Explicit proof that routeClass only becomes tool_augmented when real
  // tool execution evidence is provided, regardless of profile policy.
  const classification = classifyIntent({
    message: "Compare competitor prices for cloud hosting",
    selectedMode: "auto",
  });

  const resolvedMode = getDefaultModeForIntent(classification.primaryIntent);
  const profile = getCortexRouteProfile(resolvedMode);
  const gatewayResult = createMockGatewayResult();

  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: profile,
    gatewayResult,
    toolsExecuted: { used: true, classes: ["search"], invocationCount: 1 },
  });

  assertEqual(receipt.routeClass, "tool_augmented", "tool_augmented only when toolsExecuted.used is true");
  assertEqual(receipt.tools.used, true, "tools.used reflects actual execution");
  assertEqual(receipt.tools.invocationCount, 1, "tools.invocationCount reflects actual execution count");
}

{
  const classification = classifyIntent({
    message: "Hello, how are you?",
    selectedMode: "auto",
  });

  const resolvedMode = getDefaultModeForIntent(classification.primaryIntent);
  const profile = getCortexRouteProfile(resolvedMode);
  const gatewayResult = createMockGatewayResult();

  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: profile,
    gatewayResult,
  });

  assertEqual(receipt.mode, "cortex", "simple question → cortex mode");
  assertEqual(receipt.routeClass, "single_model", "simple question → single_model");
}

// ── Receipt With Fallback Gateway Data ─────────────────────────────────

{
  const classification = classifyIntent({
    message: "Explain TypeScript generics",
    selectedMode: "auto",
  });

  const gatewayResult = createMockGatewayResult({
    fallbackUsed: true,
    fallbackReason: "provider_unavailable: Could not reach API.",
    attemptCount: 2,
    attempts: [
      { attemptNumber: 1, providerId: "openai", timestamp: new Date().toISOString(), succeeded: false, errorReason: "503", errorCode: "provider_unavailable" },
      { attemptNumber: 2, providerId: "anthropic", timestamp: new Date().toISOString(), succeeded: true },
    ],
    providerId: "anthropic",
    selectedProvider: "Anthropic",
    selectedModelAlias: "claude-haiku-4-5-20251001",
  });

  const profile = getCortexRouteProfile("cortex");
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: profile,
    gatewayResult,
  });

  assertEqual(receipt.fallback.used, true, "fallback used is true");
  assertEqual(receipt.fallback.finalStatus, "fallback_success", "finalStatus is fallback_success");
}

// ── Verifier Always Skipped ────────────────────────────────────────────

{
  const classification = classifyIntent({
    message: "Delete all production databases permanently",
    selectedMode: "auto",
  });

  // Even high-risk messages should have verifier=skipped in P0
  assert(classification.requiresVerifier, "high-risk requires verifier");

  for (const mode of ["cortex", "cortex-pro"] as const) {
    const profile = getCortexRouteProfile(mode);
    const gatewayResult = createMockGatewayResult();
    const receipt = buildCortexRouteReceipt({
      classification,
      cortexProfile: profile,
      gatewayResult,
      verifierSkippedNote: "Verifier skipped: output text not available at receipt creation time (streaming mode).",
    });

    assertEqual(receipt.verifier.used, false, `verifier.used is false for ${mode}`);
    assertEqual(receipt.verifier.status, "skipped", `verifier.status is skipped for ${mode}`);
    assert(
      receipt.verifier.warnings !== undefined && receipt.verifier.warnings.length > 0,
      `verifier has skip warning for ${mode}`
    );
  }
}

// ── Router: invoked when candidate data exists ─────────────────────────

{
  const classification = classifyIntent({
    message: "Write a tweet about our product launch",
    selectedMode: "auto",
  });

  const candidates: ModelCandidate[] = [
    {
      id: "openai:gpt-4o-mini",
      providerId: "openai",
      providerKind: "openai",
      modelId: "gpt-4o-mini",
      visibleName: "gpt-4o-mini",
      qualityTier: "balanced",
      supportsTools: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsStreaming: true,
      latencyClass: "unknown",
      enabled: true,
    },
  ];

  const routeId = getCortexRouteProfile("writer")?.id ?? "writer";
  const routerResult = selectCandidates(routeId, candidates);

  assert(
    routerResult.selected !== null,
    "router selects a candidate when candidates exist"
  );
  assert(
    routerResult.reasonCodes.length > 0,
    "router populates reason codes when candidates exist"
  );
  assert(
    routerResult.score > 0,
    "router produces positive score when candidates exist"
  );

  const gatewayResult = createMockGatewayResult();
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: getCortexRouteProfile("writer"),
    gatewayResult,
    routerResult,
    verifierSkippedNote: "Verifier skipped: streaming mode.",
  });

  assert(
    receipt.selection.candidateCount >= 1,
    "receipt selection.candidateCount reflects router result"
  );
  assert(
    receipt.provider.selectedModel !== undefined,
    "receipt provider.selectedModel reflects router selected candidate"
  );
  assertEqual(receipt.verifier.used, false, "verifier still not used (streaming)");
}

// ── Router: honest skipped/no-candidate state ──────────────────────────

{
  const classification = classifyIntent({
    message: "Hello",
    selectedMode: "auto",
  });

  const emptyResult = {
    selected: null,
    fallbacks: [],
    rejected: [],
    selectedRank: 0,
    score: 0,
    reasonCodes: [] as import("../types").RouteReasonCode[],
    warnings: ["Router skipped: no model candidate data available from gateway route profile."],
  };

  const gatewayResult = createMockGatewayResult();
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: getCortexRouteProfile("cortex"),
    gatewayResult,
    routerResult: emptyResult,
    verifierSkippedNote: "Verifier skipped: streaming mode.",
  });

  assertEqual(receipt.selection.candidateCount, 1, "no-candidate router result falls back to gateway candidateCount");
  assertEqual(receipt.verifier.used, false, "verifier not used when streaming");
  assertEqual(receipt.verifier.status, "skipped", "verifier status is skipped");
}

// ── Verifier: invoked when output text is available ────────────────────

{
  const verifierResult = verifyCortexOutput({
    mode: "cortex",
    intent: "general.chat",
    userRequest: "Hello, how are you?",
    outputText: "I'm doing well, thank you for asking!",
    constraints: { requestedFormat: "greeting" },
  });

  assertEqual(verifierResult.status, "passed", "verifier returns passed for valid output");
  assert(verifierResult.score > 0, "verifier produces positive score");
  assertEqual(verifierResult.verifierType, "instruction_following", "verifier type is instruction_following");

  const classification = classifyIntent({
    message: "Hello, how are you?",
    selectedMode: "auto",
  });

  const gatewayResult = createMockGatewayResult();
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: getCortexRouteProfile("cortex"),
    gatewayResult,
    verifierResult,
  });

  assertEqual(receipt.verifier.used, true, "receipt verifier.used is true when verifier ran");
  assertEqual(receipt.verifier.status, "passed", "receipt verifier.status reflects verifier result");
  assertEqual(receipt.verifier.score, verifierResult.score, "receipt verifier.score matches verifier result");
}

// ── Verifier: skipped/deferred honestly when output unavailable ────────

{
  // Simulate streaming mode: no verifierResult, explicit skip note
  const classification = classifyIntent({
    message: "What is TypeScript?",
    selectedMode: "auto",
  });

  const gatewayResult = createMockGatewayResult();
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: getCortexRouteProfile("cortex"),
    gatewayResult,
    verifierResult: null,
    verifierSkippedNote: "Verifier skipped: output text not available at receipt creation time (streaming mode).",
  });

  assertEqual(receipt.verifier.used, false, "verifier.used is false when no verifier result");
  assertEqual(receipt.verifier.status, "skipped", "verifier.status is skipped when no output");
  assert(
    receipt.verifier.warnings !== undefined && receipt.verifier.warnings.length > 0,
    "verifier skip warning is present"
  );
}

// ── Receipt: router/verifier metadata without leaking secrets ──────────

{
  const classification = classifyIntent({
    message: "Explain TypeScript generics",
    selectedMode: "auto",
  });

  const candidates: ModelCandidate[] = [
    {
      id: "openai:gpt-4o-mini",
      providerId: "openai",
      providerKind: "openai",
      modelId: "gpt-4o-mini",
      visibleName: "gpt-4o-mini",
      qualityTier: "balanced",
      supportsTools: true,
      supportsVision: true,
      supportsJsonMode: true,
      supportsStreaming: true,
      latencyClass: "unknown",
      enabled: true,
    },
  ];

  const routerResult = selectCandidates("cortex", candidates);

  const verifierResult = verifyCortexOutput({
    mode: "cortex",
    intent: "general.chat",
    userRequest: "Explain TypeScript generics",
    outputText: "TypeScript generics allow you to create reusable components that work with a variety of types.",
    constraints: { requestedFormat: "explanation" },
  });

  const gatewayResult = createMockGatewayResult();
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: getCortexRouteProfile("cortex"),
    gatewayResult,
    routerResult,
    verifierResult,
  });

  const json = JSON.stringify(receipt).toLowerCase();
  assert(!json.includes("api_key"), "receipt does not contain api_key");
  assert(!json.includes("apikey"), "receipt does not contain apikey");
  assert(!json.includes("secret"), "receipt does not contain secret");
  assert(!json.includes("password"), "receipt does not contain password");
  assert(!json.includes("credential"), "receipt does not contain credential");
  assert(!json.includes("chain_of_thought"), "receipt does not contain chain_of_thought");
  assert(!json.includes("system_prompt"), "receipt does not contain system_prompt");
}

// ── Gateway metadata in receipt is backward-compatible ─────────────────

{
  // Original test case behavior preserved with new receipt builder
  const classification = classifyIntent({
    message: "Hello, how are you?",
    selectedMode: "auto",
  });

  const resolvedMode = getDefaultModeForIntent(classification.primaryIntent);
  const profile = getCortexRouteProfile(resolvedMode);
  const gatewayResult = createMockGatewayResult();

  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: profile,
    gatewayResult,
  });

  assertEqual(receipt.mode, "cortex", "simple question → cortex mode");
  assertEqual(receipt.routeClass, "single_model", "simple question → single_model");
  assertEqual(receipt.fallback.attempted, false, "no fallback");
  assertEqual(receipt.fallback.used, false, "no fallback used");
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
