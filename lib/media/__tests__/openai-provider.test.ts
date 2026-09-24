// Media OpenAI Image Provider — Unit Tests
// Run with: NODE_OPTIONS=--conditions=react-server npx tsx lib/media/__tests__/openai-provider.test.ts

import { openaiImageProvider } from "../providers/openai";
import { getProviderAdapter, getProviderMeta } from "../providers/index";
import { selectMediaProvider } from "../router";

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

function assertDefined<T>(value: T | null | undefined, label: string): T {
  if (value != null) { passed += 1; return value; }
  failed += 1; console.error(`  FAIL: ${label} — value is null or undefined`);
  return undefined as T;
}

// ── Provider identity ──────────────────────────────────────────────────────────

console.log("\n[OpenAI Adapter — Provider identity]");
function testProviderIdentity(): void {
  assertEqual(openaiImageProvider.providerId, "openai", "providerId is 'openai'");
  assertEqual(openaiImageProvider.label, "OpenAI", "label is 'OpenAI'");
}

// ── Availability ───────────────────────────────────────────────────────────────

console.log("\n[OpenAI Adapter — Availability]");
function testAvailability(): void {
  const availability = openaiImageProvider.getAvailability();
  assert(typeof availability.available === "boolean", "available is boolean");
  if (!availability.available) {
    assert(Array.isArray(availability.missingEnv), "missingEnv is array when unavailable");
    assert(typeof availability.reason === "string", "Has reason string when unavailable");
  }
}

// ── Status shape ───────────────────────────────────────────────────────────────

console.log("\n[OpenAI Adapter — Status shape]");
function testStatusShape(): void {
  const status = openaiImageProvider.getStatus();
  assertEqual(status.id, "openai", "Status id is 'openai'");
  assertEqual(status.modality, "image", "Modality is 'image'");
  assert(typeof status.available === "boolean", "available is boolean");
  assert(typeof status.configured === "boolean", "configured is boolean");
  assert(typeof status.setupRequired === "boolean", "setupRequired is boolean");
  assert(typeof status.mode === "string", "mode is string");
  assert(typeof status.trust === "string", "trust is string");
  assert(typeof status.lastCheckedAt === "string", "lastCheckedAt is string");
  assert(typeof status.label === "string", "label is string");
}

// ── Cost estimate always returns structured data ───────────────────────────────

console.log("\n[OpenAI Adapter — Cost estimate structure]");
function testCostEstimateStructure(): void {
  const estimate = openaiImageProvider.getCostEstimate({
    modality: "image",
    prompt: "A test image",
  });
  assertDefined(estimate, "Returns cost estimate");
  assertEqual(estimate!.providerId, "openai", "Provider id in estimate");
  assert(typeof estimate!.modelId === "string", "modelId is string");
  assert(typeof estimate!.minCredits === "number", "minCredits is number");
  assert(typeof estimate!.maxCredits === "number", "maxCredits is number");
  assert(estimate!.minCredits > 0, "minCredits > 0");
  assert(estimate!.maxCredits >= estimate!.minCredits, "maxCredits >= minCredits");
  assert(estimate!.status === "estimated" || estimate!.status === "tier_only" || estimate!.status === "not_available", "status is valid");
}

// ── Quality preference affects cost estimate ───────────────────────────────────

console.log("\n[OpenAI Adapter — Premium quality increases cost]");
function testPremiumCost(): void {
  const standard = openaiImageProvider.getCostEstimate({
    modality: "image",
    prompt: "test",
    qualityPreference: "balanced",
  });
  const premium = openaiImageProvider.getCostEstimate({
    modality: "image",
    prompt: "test",
    qualityPreference: "premium",
  });
  assertDefined(standard, "Standard estimate exists");
  assertDefined(premium, "Premium estimate exists");
  assert(premium!.minCredits >= standard!.minCredits, "Premium costs >= standard");
}

// ── Provider registry integration ──────────────────────────────────────────────

console.log("\n[OpenAI Adapter — Registry integration]");
function testRegistryIntegration(): void {
  const adapter = getProviderAdapter("openai");
  assertDefined(adapter, "OpenAI adapter is registered");
  assertEqual(adapter!.providerId, "openai", "Registered adapter has correct providerId");

  const meta = getProviderMeta("openai");
  assertDefined(meta, "OpenAI meta is registered");
  assertEqual(meta!.adapterNotImplemented, false, "adapterNotImplemented is false");
  assertEqual(meta!.requiresApiKey, true, "requiresApiKey is true");
  assert(meta!.modalities.includes("image"), "Modalities include 'image'");
}

// ── Router fails closed without a live provider ───────────────────────────────

console.log("\n[OpenAI Adapter — Router fails closed for image without live provider]");
function testRouterReturnsForImage(): void {
  // LIVE-PATH-SIMULATION-REMOVAL-01 (STU-P0-09): with no live provider
  // configured, auto-selection fails closed with a typed setup_required error
  // instead of returning mock output.
  try {
    const result = selectMediaProvider({ modality: "image" });
    assertDefined(result, "Router returns result for image");
    assert(typeof result.providerId === "string", "providerId is string");
    assert(result.providerId !== "mock", "auto-selection never returns mock");
    assert(typeof result.selectedModelId === "string", "selectedModelId is string");
    assert(typeof result.fallbackUsed === "boolean", "fallbackUsed is boolean");
    assertDefined(result.adapter, "Adapter is present in result");
    assert(typeof result.adapter.providerId === "string", "adapter has providerId");
  } catch (err) {
    assertEqual((err as { code?: string }).code, "setup_required",
      "auto-selection without live provider throws setup_required");
  }
}

// ── Router prefers explicit mock request ──────────────────────────────────────

console.log("\n[OpenAI Adapter — Router explicit mock]");
function testRouterExplicitMock(): void {
  const result = selectMediaProvider({ modality: "image", providerId: "mock" });
  assertEqual(result.providerId, "mock", "Explicit mock returns mock");
  assert(!result.fallbackUsed, "No fallback when mock explicitly requested");
}

// ── Generate function exists (don't call it — may hit real API) ────────────────

console.log("\n[OpenAI Adapter — Generate function exists]");
function testGenerateFunctionExists(): void {
  assert(typeof openaiImageProvider.generate === "function", "generate is a function");
  assert(
    typeof openaiImageProvider.getAvailability === "function",
    "getAvailability is a function",
  );
  assert(
    typeof openaiImageProvider.getStatus === "function",
    "getStatus is a function",
  );
  assert(
    typeof openaiImageProvider.getCostEstimate === "function",
    "getCostEstimate is a function",
  );
}

// ── Run all tests ──────────────────────────────────────────────────────────────

testProviderIdentity();
testAvailability();
testStatusShape();
testCostEstimateStructure();
testPremiumCost();
testRegistryIntegration();
testRouterReturnsForImage();
testRouterExplicitMock();
testGenerateFunctionExists();

console.log(`\n${"=".repeat(40)}`);
console.log(`OpenAI provider tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(40)}`);

if (failed > 0) process.exit(1);
