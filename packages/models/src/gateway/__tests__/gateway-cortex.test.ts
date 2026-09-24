// Gateway Cortex metadata — backward compatibility tests
// Run with: npx tsx lib/gateway/__tests__/gateway-cortex.test.ts

import type {
  GatewayProviderRoute,
  GatewayResult,
  GatewayChatRequest,
  GatewayChatMessage,
  GatewayRouteProfile,
  GatewayModelRegistry,
} from "../types";
import type { CortexRouteProfile, CortexFallbackAttempt, CortexSelectionMetadata } from "@ethen/ai/cortex/types";

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

function assertType<T>(_value: T): void {
  // compile-time type assertion — simply verifies the value satisfies T
}

// ── GatewayProviderRoute backward compatibility ────────────────────────

{
  // Minimal route object — must still be valid without new cortex fields
  const route: GatewayProviderRoute = {
    routeId: "text-general",
    profile: {
      routeId: "text-general",
      capability: "generic",
      description: "General-purpose text responses.",
      models: { openai: "gpt-4o-mini" },
    },
    providerId: "openai",
    fallbackProviderId: null,
    mode: "production",
    source: "auto-detected",
  };

  assertEqual(route.routeId, "text-general", "minimal route has routeId");
  assertEqual(route.providerId, "openai", "minimal route has providerId");
  assertEqual(route.mode, "production", "minimal route has mode");
  assertEqual(route.source, "auto-detected", "minimal route has source");
  assertEqual(route.fallbackUsed, undefined, "minimal route has no fallbackUsed");
  assertEqual(route.fallbackReason, undefined, "minimal route has no fallbackReason");
  // New optional fields default to undefined
  assertEqual(route.cortexProfile, undefined, "minimal route cortexProfile is undefined");
  assertEqual(route.attempts, undefined, "minimal route attempts is undefined");
  assertEqual(route.attemptCount, undefined, "minimal route attemptCount is undefined");
  assertEqual(route.selectedProvider, undefined, "minimal route selectedProvider is undefined");
  assertEqual(route.selectedModelAlias, undefined, "minimal route selectedModelAlias is undefined");
  assertEqual(route.cortexSelection, undefined, "minimal route cortexSelection is undefined");
}

// ── GatewayProviderRoute with Cortex metadata ──────────────────────────

{
  const attempts: CortexFallbackAttempt[] = [
    { attemptNumber: 1, providerId: "openai", timestamp: "2026-01-01T00:00:00Z", succeeded: false, errorReason: "503", errorCode: "provider_unavailable" },
    { attemptNumber: 2, providerId: "anthropic", timestamp: "2026-01-01T00:00:01Z", succeeded: true },
  ];

  const selection: CortexSelectionMetadata = {
    reasonCodes: ["selected_by_intent"],
    candidateCount: 2,
    selectedCandidateRank: 1,
  };

  const route: GatewayProviderRoute = {
    routeId: "text-reasoning",
    profile: {
      routeId: "text-reasoning",
      capability: "reasoning",
      description: "Reasoning tasks.",
    },
    providerId: "anthropic",
    fallbackProviderId: null,
    fallbackUsed: true,
    fallbackReason: "provider_unavailable: Could not reach OpenAI API.",
    mode: "production",
    source: "env-default",
    cortexProfile: null,
    attempts,
    attemptCount: 2,
    selectedProvider: "Anthropic",
    selectedModelAlias: "claude-sonnet-4-6",
    cortexSelection: selection,
  };

  assertEqual(route.fallbackUsed, true, "fallback route has fallbackUsed=true");
  assertEqual(route.attemptCount, 2, "fallback route has attemptCount=2");
  assert(route.attempts !== undefined && route.attempts.length === 2, "fallback route has 2 attempts");
  assertEqual(route.attempts![0].succeeded, false, "first attempt failed");
  assertEqual(route.attempts![1].succeeded, true, "second attempt succeeded");
  assertEqual(route.selectedProvider, "Anthropic", "selectedProvider is Anthropic");
  assertEqual(route.selectedModelAlias, "claude-sonnet-4-6", "selectedModelAlias is correct");
  assert(route.cortexSelection !== null, "cortexSelection is non-null");
  assertEqual(route.cortexSelection!.candidateCount, 2, "cortexSelection has candidateCount");
}

// ── CortexFallbackAttempt shape check ──────────────────────────────────

{
  const attempt: CortexFallbackAttempt = {
    attemptNumber: 1,
    providerId: "deepseek",
    timestamp: new Date().toISOString(),
    succeeded: true,
  };
  assert(typeof attempt.attemptNumber === "number", "FallbackAttempt has attemptNumber");
  assert(typeof attempt.providerId === "string", "FallbackAttempt has providerId");
  assert(typeof attempt.timestamp === "string", "FallbackAttempt has timestamp");
  assert(typeof attempt.succeeded === "boolean", "FallbackAttempt has succeeded");
}

{
  const attempt: CortexFallbackAttempt = {
    attemptNumber: 3,
    providerId: "openai",
    timestamp: new Date().toISOString(),
    succeeded: false,
    errorReason: "rate limit exceeded",
    errorCode: "rate_limited",
  };
  assertEqual(attempt.errorReason, "rate limit exceeded", "failed attempt has errorReason");
  assertEqual(attempt.errorCode, "rate_limited", "failed attempt has errorCode");
}

// ── CortexRouteProfile shape check ─────────────────────────────────────

{
  const profile: CortexRouteProfile = {
    id: "cortex-pro",
    label: "Cortex Pro",
    shortLabel: "Pro",
    description: "Deep reasoning.",
    mode: "cortex-pro",
    qualityTier: "premium",
    costTier: "high",
    latencyTarget: "patient",
    toolPolicy: "optional",
    verifierPolicy: "default",
    fallbackPolicy: {
      enabled: true,
      maxAttempts: 2,
      allowQualityDowngrade: false,
      allowCostUpgrade: false,
      allowToolDowngrade: false,
      degradedModeAllowed: false,
    },
    traceVisibility: "advanced",
    status: "active",
    providerLabels: {
      deepseek: "DeepSeek V4 Pro",
      openai: "GPT-4o",
      anthropic: "Claude Sonnet",
    },
  };

  assertEqual(profile.id, "cortex-pro", "CortexRouteProfile id");
  assertEqual(profile.qualityTier, "premium", "CortexRouteProfile qualityTier");
  assert(profile.fallbackPolicy.enabled, "CortexRouteProfile fallback enabled");
  assert(profile.providerLabels !== undefined, "CortexRouteProfile has providerLabels");
}

// ── GatewayChatRequest backward compatibility ──────────────────────────

{
  const messages: GatewayChatMessage[] = [{ role: "user", content: "hello" }];

  const request: GatewayChatRequest = { messages };
  assertEqual(request.messages.length, 1, "request has messages");
  assertEqual(request.routeId, undefined, "request routeId defaults to undefined");
  assertEqual(request.sessionId, undefined, "request sessionId defaults to undefined");
  assertEqual(request.agent, undefined, "request agent defaults to undefined");
}

{
  const messages: GatewayChatMessage[] = [{ role: "user", content: "hello" }];

  const request: GatewayChatRequest = {
    sessionId: "sess-123",
    routeId: "text-quality",
    agent: {
      id: "agent-1",
      slug: "research",
      name: "Research Agent",
      routeId: "text-reasoning",
      creditCost: 5,
    },
    messages,
    maxOutputTokens: 4096,
  };

  assertEqual(request.sessionId, "sess-123", "full request has sessionId");
  assertEqual(request.routeId, "text-quality", "full request has routeId");
  assert(request.agent !== null && request.agent !== undefined, "full request has agent");
  assertEqual(request.agent!.name, "Research Agent", "agent has name");
  assertEqual(request.maxOutputTokens, 4096, "full request has maxOutputTokens");
}

// ── GatewayRouteProfile model lookup ───────────────────────────────────

{
  const models: GatewayModelRegistry = {
    openai: "gpt-4o",
    anthropic: "claude-sonnet-4-6",
    deepseek: "deepseek-v4-pro",
  };

  const profile: GatewayRouteProfile = {
    routeId: "text-quality",
    capability: "quality",
    description: "Precision text work.",
    models,
  };

  assertEqual(profile.models?.openai, "gpt-4o", "model registry resolves openai");
  assertEqual(profile.models?.anthropic, "claude-sonnet-4-6", "model registry resolves anthropic");
  assertEqual(profile.models?.deepseek, "deepseek-v4-pro", "model registry resolves deepseek");
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
