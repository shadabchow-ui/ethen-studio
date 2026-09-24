// Cortex Route Receipt Builder — unit tests
// Run with: npx tsx lib/cortex/__tests__/route-receipt.test.ts

import {
  buildCortexRouteReceipt,
  redactCortexRouteReceipt,
  summarizeCortexRouteReceipt,
  mergeGatewayMetadataIntoReceipt,
} from "../route-receipt";
import type { BuildReceiptParams } from "../route-receipt";
import type {
  EthenRouteReceipt,
  IntentClassification,
  CortexRouteProfile,
} from "../types";
import type {
  GatewayResult,
  GatewayProviderRoute,
  GatewayRouteProfile,
} from "@ethen/models/gateway/types";
import { getCortexRouteProfile } from "../routes";
import { classifyIntent } from "../intent-classifier";

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

function assertType<T>(_value: T): void {}

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

function createMockGatewayResult(overrides?: Partial<GatewayResult>): GatewayResult {
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
    route: createMockRoute(),
    warnings: [],
    ...overrides,
  } as GatewayResult;
}

function createClassification(): IntentClassification {
  return {
    primaryIntent: "general.chat",
    secondaryIntents: [],
    confidence: 0.75,
    reasonCodes: ["keyword_match"],
    requiresFreshness: false,
    requiresTools: false,
    requiresRepoContext: false,
    requiresVerifier: false,
    riskLevel: "low",
  };
}

const classification = createClassification();
const cortexProfile = getCortexRouteProfile("cortex");
const gatewayResult = createMockGatewayResult();

// ── buildCortexRouteReceipt ────────────────────────────────────────────

{
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
    sessionId: "sess-123",
  });

  assertEqual(receipt.receiptVersion, "ethen.route_receipt.v1", "receiptVersion is correct");
  assert(typeof receipt.requestId === "string" && receipt.requestId.startsWith("req-"), `requestId starts with req-: ${receipt.requestId}`);
  assert(typeof receipt.runId === "string" && receipt.runId.startsWith("run-"), `runId starts with run-: ${receipt.runId}`);
  assertEqual(receipt.mode, "cortex", "mode is cortex");
  assertEqual(receipt.intent, "general.chat", "intent is general.chat");
  assertEqual(receipt.routeProfile, "cortex", "routeProfile is cortex");
  assertEqual(receipt.routeClass, "single_model", "routeClass is single_model for low-risk chat");
  assert(typeof receipt.timestamp === "string", "timestamp is a string");

  // Provider
  assertEqual(receipt.provider.selectedProvider, "OpenAI", "provider name set");
  assertEqual(receipt.provider.selectedModel, "gpt-4o-mini", "model alias set");
  assertEqual(receipt.provider.providerVisible, true, "providerVisible is true for cortex mode");
  assertEqual(receipt.provider.modelVisible, false, "modelVisible is false by default");

  // Selection
  assert(receipt.selection.reasonCodes.includes("selected_by_intent"), "reasonCodes includes selected_by_intent");
  assertEqual(receipt.selection.candidateCount, 1, "candidateCount is 1");

  // Fallback
  assertEqual(receipt.fallback.attempted, false, "no fallback attempted");
  assertEqual(receipt.fallback.used, false, "no fallback used");
  assertEqual(receipt.fallback.finalStatus, "primary_success", "finalStatus is primary_success");

  // Verifier
  assertEqual(receipt.verifier.used, false, "verifier not used");
  assertEqual(receipt.verifier.status, "skipped", "verifier status is skipped");
  assert(receipt.verifier.warnings !== undefined && receipt.verifier.warnings.length > 0, "verifier has skip warnings");

  // Usage
  assertEqual(receipt.usage.inputTokens, 50, "inputTokens set");
  assertEqual(receipt.usage.outputTokens, 100, "outputTokens set");
  assertEqual(receipt.usage.totalTokens, 150, "totalTokens computed");
  assertEqual(receipt.usage.estimatedCostUsd, 5, "estimatedCostUsd from creditCost");
  assertEqual(receipt.usage.latencyMs, undefined, "latencyMs omitted when not observed");

  // Quality
  assertEqual(receipt.quality.confidence, "medium", "confidence is medium for 0.75");
  assertEqual(receipt.quality.sourceGrounded, undefined, "sourceGrounded omitted when not observed");
  assertEqual(receipt.quality.citationChecked, undefined, "citationChecked omitted when not observed");
  assertEqual(receipt.tools.used, false, "tool usage explicitly false when not observed (no toolsExecuted evidence)");

  assertType<EthenRouteReceipt>(receipt);
}

// ── buildCortexRouteReceipt with observed verifier metadata ────────────

{
  const receipt = buildCortexRouteReceipt({
    classification: classifyIntent({
      message: "Research the latest AI model launches",
      selectedMode: "auto",
    }),
    cortexProfile: getCortexRouteProfile("research"),
    gatewayResult,
    observedTimeToFirstTokenMs: 275,
    verifierResult: {
      status: "passed",
      score: 0.92,
      verifierType: "source",
      findings: [
        { type: "source_grounded", detail: "Sources are present" },
        { type: "citations_available", detail: "Citations are present" },
      ],
      warnings: [],
      suggestedFixes: [],
      requiresRerun: false,
      summary: "Output verified successfully",
    },
  });

  assertEqual(receipt.usage.timeToFirstTokenMs, 275, "timeToFirstTokenMs recorded when observed");
  assertEqual(receipt.quality.sourceGrounded, true, "sourceGrounded reflects verifier findings");
  assertEqual(receipt.quality.citationChecked, true, "citationChecked reflects verifier findings");
}

// ── buildCortexRouteReceipt with fallback ──────────────────────────────

{
  const fallbackResult = createMockGatewayResult({
    route: createMockRoute({
      fallbackUsed: true,
      fallbackReason: "rate_limited",
      attemptCount: 2,
      attempts: [
        { attemptNumber: 1, providerId: "openai", timestamp: new Date().toISOString(), succeeded: false, errorReason: "429", errorCode: "rate_limited" },
        { attemptNumber: 2, providerId: "anthropic", timestamp: new Date().toISOString(), succeeded: true },
      ],
      selectedProvider: "Anthropic",
      selectedModelAlias: "claude-haiku-4-5-20251001",
      providerId: "anthropic",
    }),
  });

  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult: fallbackResult,
  });

  assertEqual(receipt.fallback.attempted, true, "fallback attempted is true");
  assertEqual(receipt.fallback.used, true, "fallback used is true");
  assertEqual(receipt.fallback.finalStatus, "fallback_success", "finalStatus is fallback_success");
  assertEqual(receipt.fallback.attempts.length, 2, "two attempts recorded");
  assertEqual(receipt.fallback.attempts[0].succeeded, false, "first attempt failed");
  assertEqual(receipt.fallback.attempts[1].succeeded, true, "second attempt succeeded");
}

// ── buildCortexRouteReceipt with high-risk classification ─────────────

{
  const highRiskClassification = classifyIntent({
    message: "delete all production data permanently",
    selectedMode: "auto",
  });

  const receipt = buildCortexRouteReceipt({
    classification: highRiskClassification,
    cortexProfile: getCortexRouteProfile("cortex"),
    gatewayResult,
  });

  assertEqual(receipt.routeClass, "verified", "high-risk produces verified routeClass");
}

// ── tools.used / routeClass must reflect real execution, not policy ───

{
  const researchClassification: IntentClassification = {
    primaryIntent: "research.web",
    secondaryIntents: [],
    confidence: 0.9,
    reasonCodes: ["keyword_match"],
    requiresFreshness: true,
    requiresTools: true,
    requiresRepoContext: false,
    requiresVerifier: true,
    riskLevel: "low",
  };
  const researchProfile = getCortexRouteProfile("research");

  const receiptNoTools = buildCortexRouteReceipt({
    classification: researchClassification,
    cortexProfile: researchProfile,
    gatewayResult,
  });

  assertEqual(receiptNoTools.tools.used, false, "tools.used defaults to false with no toolsExecuted evidence");
  assertEqual(
    receiptNoTools.routeClass,
    "verified",
    "toolPolicy 'required' alone must not produce tool_augmented; falls back to verified due to requiresVerifier"
  );

  const receiptWithTools = buildCortexRouteReceipt({
    classification: researchClassification,
    cortexProfile: researchProfile,
    gatewayResult,
    toolsExecuted: { used: true, classes: ["search"], invocationCount: 2 },
  });

  assertEqual(receiptWithTools.tools.used, true, "tools.used is true when toolsExecuted.used is true");
  assertEqual(receiptWithTools.routeClass, "tool_augmented", "routeClass is tool_augmented only with real execution evidence");
  assertEqual(receiptWithTools.tools.invocationCount, 2, "tools.invocationCount carries through");
}

// ── buildCortexRouteReceipt auto mode ──────────────────────────────────

{
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile: null,
    gatewayResult,
  });

  assertEqual(receipt.mode, "auto", "null profile yields mode auto");
  assertEqual(receipt.routeProfile, "unknown", "null profile yields routeProfile unknown");
}

// ── redactCortexRouteReceipt basic ─────────────────────────────────────

{
  const original = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
  });

  const basic = redactCortexRouteReceipt(original, "basic");

  assertEqual(basic.provider.selectedProvider, "redacted", "basic level redacts provider name");
  assertEqual(basic.provider.selectedModel, "redacted", "basic level redacts model");
  assertEqual(basic.provider.providerVisible, false, "basic level sets providerVisible=false");
  assertEqual(basic.usage.estimatedCostUsd, undefined, "basic level redacts cost");
  assert(basic.redactions.length >= 3, `basic level has 3+ redactions, got ${basic.redactions.length}`);
}

// ── redactCortexRouteReceipt advanced ──────────────────────────────────

{
  const original = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
  });

  const advanced = redactCortexRouteReceipt(original, "advanced");

  assertEqual(advanced.provider.selectedProvider, original.provider.selectedProvider, "advanced keeps provider name");
  assertEqual(advanced.provider.selectedModel, "redacted", "advanced redacts model");
  assertEqual(advanced.provider.modelVisible, false, "advanced sets modelVisible=false");
}

// ── redactCortexRouteReceipt full ──────────────────────────────────────

{
  const original = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
  });

  const full = redactCortexRouteReceipt(original, "full");

  assertEqual(full.provider.selectedProvider, original.provider.selectedProvider, "full preserves provider");
  assertEqual(full.provider.selectedModel, original.provider.selectedModel, "full preserves model");
}

// ── summarizeCortexRouteReceipt ────────────────────────────────────────

{
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
  });

  const summary = summarizeCortexRouteReceipt(receipt);
  assert(summary.length > 0, "summary is non-empty");
  assert(summary.includes("cortex"), `summary includes mode 'cortex': ${summary}`);
  assert(summary.includes("No fallback"), `summary includes 'No fallback': ${summary}`);
}

{
  const fallbackResult = createMockGatewayResult({
    route: createMockRoute({
      fallbackUsed: true,
      fallbackReason: "timeout",
      attemptCount: 2,
      attempts: [
        { attemptNumber: 1, providerId: "openai", timestamp: new Date().toISOString(), succeeded: false, errorReason: "timeout", errorCode: "timeout" },
        { attemptNumber: 2, providerId: "deepseek", timestamp: new Date().toISOString(), succeeded: true },
      ],
      providerId: "deepseek",
      selectedProvider: "DeepSeek",
    }),
  });

  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult: fallbackResult,
  });

  const summary = summarizeCortexRouteReceipt(receipt);
  assert(summary.includes("Fallback used"), `summary includes 'Fallback used': ${summary}`);
}

// ── mergeGatewayMetadataIntoReceipt ────────────────────────────────────

{
  const original = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
  });

  const merged = mergeGatewayMetadataIntoReceipt(original, {
    latencyMs: 4200,
    usage: {
      outputTokens: 250,
      creditCost: 8,
    },
  });

  assertEqual(merged.usage.latencyMs, 4200, "latencyMs merged");
  assertEqual(merged.usage.outputTokens, 250, "outputTokens updated");
  assertEqual(merged.usage.estimatedCostUsd, 8, "cost updated");
}

// ── Cost truth: estimated / unknown / not_available ─────────────────────

{
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult: createMockGatewayResult(),
  });

  assertEqual(receipt.usage.costEstimateStatus, "estimated", "creditCost present -> estimated");
  assertEqual(receipt.usage.estimatedCostUsd, 5, "estimatedCostUsd carried through");
  assertEqual(receipt.usage.costEstimateReason, undefined, "no reason needed when estimated");
}

{
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult: createMockGatewayResult({
      usage: { inputMessages: 2, inputCharacters: 100, outputCharacters: 200, inputTokens: 50, outputTokens: 100 },
    }),
  });

  assertEqual(receipt.usage.costEstimateStatus, "unknown", "no creditCost but a provider was selected -> unknown");
  assertEqual(receipt.usage.estimatedCostUsd, undefined, "no fabricated cost when unknown");
  assert(typeof receipt.usage.costEstimateReason === "string" && receipt.usage.costEstimateReason.length > 0, "unknown status has a reason");
}

{
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult: createMockGatewayResult({
      usage: { inputMessages: 2, inputCharacters: 100, outputCharacters: 200, inputTokens: 50, outputTokens: 100 },
      route: createMockRoute({ selectedProvider: "", providerId: "" as unknown as GatewayProviderRoute["providerId"] }),
    }),
  });

  assertEqual(receipt.usage.costEstimateStatus, "not_available", "no provider selected -> not_available");
  assertEqual(receipt.usage.estimatedCostUsd, undefined, "no fabricated cost when not_available");
}

// ── Receipt does not expose private fields ─────────────────────────────

{
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
  });

  const json = JSON.stringify(receipt).toLowerCase();
  assert(!json.includes("api_key"), "receipt does not contain api_key");
  assert(!json.includes("apikey"), "receipt does not contain apikey");
  assert(!json.includes("secret"), "receipt does not contain secret");
  assert(!json.includes("password"), "receipt does not contain password");
  assert(!json.includes("credential"), "receipt does not contain credential");
}

// ── researchTool truth overrides verifier inference ─────────────────────

{
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
    toolsExecuted: { used: true, classes: ["search"], invocationCount: 1 },
    researchTool: { sourceGrounded: true, citationsAvailable: true },
  });

  assertEqual(receipt.tools.used, true, "researchTool case: tools.used is true");
  assertEqual(receipt.quality.sourceGrounded, true, "researchTool case: sourceGrounded reflects research truth");
  assertEqual(receipt.quality.citationChecked, true, "researchTool case: citationChecked reflects research truth");
}

{
  // A research call that ran but returned zero sources/evidence (e.g. mock
  // mode with no fixture data) must not claim grounding it doesn't have.
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
    toolsExecuted: { used: true, classes: ["search"], invocationCount: 1 },
    researchTool: { sourceGrounded: false, citationsAvailable: false },
  });

  assertEqual(receipt.tools.used, true, "empty researchTool case: tools.used still true (tool ran)");
  assertEqual(receipt.quality.sourceGrounded, false, "empty researchTool case: sourceGrounded is false");
  assertEqual(receipt.quality.citationChecked, false, "empty researchTool case: citationChecked is false");
}

{
  // Without a researchTool param, behavior is unchanged: quality falls back
  // to verifier-inferred grounding (or undefined when no verifier ran).
  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
  });

  assertEqual(receipt.quality.sourceGrounded, undefined, "no researchTool: sourceGrounded falls back to verifier inference (undefined here)");
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
