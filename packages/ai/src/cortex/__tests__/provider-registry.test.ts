// Cortex Provider Registry — unit tests
// Run with: npx tsx lib/cortex/__tests__/provider-registry.test.ts

import { buildCandidatesFromModelRegistry, PROVIDER_CONFIG } from "../provider-registry";
import type { GatewayModelRegistry } from "@ethen/models/gateway/types";

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

// ── Capability precision: no candidate overclaims tool/vision/json support ──

{
  const models: GatewayModelRegistry = {
    openai: "gpt-4o-mini",
    anthropic: "claude-haiku-4-5-20251001",
    deepseek: "deepseek-v4-flash",
    "openai-compatible": "custom-model",
  };

  const candidates = buildCandidatesFromModelRegistry(models);
  assertEqual(candidates.length, 4, "one candidate per configured provider/model pair");

  for (const candidate of candidates) {
    assert(
      candidate.supportsTools === true,
      `${candidate.id} declares executed V2 tool payload support`
    );
    assert(
      candidate.supportsVision === (candidate.providerId !== "deepseek"),
      `${candidate.id} declares vision only for image-capable adapters`
    );
    assert(
      candidate.supportsJsonMode === true,
      `${candidate.id} declares executed V2 JSON mode`
    );
    assert(
      candidate.contextWindowTokens === candidate.canonical?.contextWindowTokens || candidate.contextWindowTokens === undefined,
      `${candidate.id} uses canonical context when MI maps it, otherwise remains unknown`
    );
    assert(
      candidate.costPerInputTokenUsd === undefined,
      `${candidate.id} leaves costPerInputTokenUsd undefined rather than fabricating it`
    );
  }
}

// MI canonical facts are available to Cortex while executable adapter support
// remains Gateway-owned. Unknown values are kept as null in the projection.
{
  const [candidate] = buildCandidatesFromModelRegistry({ openai: "gpt-4o-mini" });
  assert(candidate?.canonical?.modelId === "mi:gpt-4o-mini", "canonical model identity is attached to candidate");
  assert(candidate?.canonical?.providerId === "openai", "canonical provider identity is attached to candidate");
  assert(candidate?.canonical?.supportsTools === null, "unknown canonical tool capability remains null");
  assert(candidate?.supportsTools === true, "adapter execution support remains Gateway-owned");
}

// ── Provider config is repo-grounded and conservative ────────────────────

{
  assertEqual(PROVIDER_CONFIG.openai.envKey, "OPENAI_API_KEY", "openai provider config envKey matches lib/gateway/env.ts");
  assertEqual(PROVIDER_CONFIG.anthropic.envKey, "ANTHROPIC_API_KEY", "anthropic provider config envKey matches lib/gateway/env.ts");
  assertEqual(PROVIDER_CONFIG.deepseek.envKey, "DEEPSEEK_API_KEY", "deepseek provider config envKey matches lib/gateway/env.ts");
  assert(PROVIDER_CONFIG.deepseek.baseUrlConfigurable, "deepseek base URL is configurable per lib/gateway/env.ts DEEPSEEK_API_BASE_URL");
  assert(!PROVIDER_CONFIG.openai.baseUrlConfigurable, "openai base URL is fixed in lib/providers/openai.ts");
  assert(!PROVIDER_CONFIG["openai-compatible"].fallbackEligible, "operator-supplied openai-compatible endpoint is not an implicit fallback target");
}

// ── Availability flag still respected ────────────────────────────────────

{
  const models: GatewayModelRegistry = { openai: "gpt-4o-mini", anthropic: "claude-haiku-4-5-20251001" };
  const candidates = buildCandidatesFromModelRegistry(models, { availableProviders: ["openai"] });

  const openaiCandidate = candidates.find((c) => c.providerId === "openai");
  const anthropicCandidate = candidates.find((c) => c.providerId === "anthropic");

  assert(openaiCandidate?.enabled === true, "openai candidate enabled when in availableProviders");
  assert(anthropicCandidate?.enabled === false, "anthropic candidate disabled when not in availableProviders");
}

// ── Empty/undefined registry ─────────────────────────────────────────────

{
  assertEqual(buildCandidatesFromModelRegistry(undefined).length, 0, "undefined registry produces no candidates");
  assertEqual(buildCandidatesFromModelRegistry({}).length, 0, "empty registry produces no candidates");
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
