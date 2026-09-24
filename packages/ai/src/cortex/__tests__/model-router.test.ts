// Cortex Model Router — unit tests
// Run with: npx tsx lib/cortex/__tests__/model-router.test.ts

import {
  selectCandidates,
  getRouterWeightsForRoute,
  type RouterResult,
  type RouterOptions,
} from "../model-router";
import type { ModelCandidate, QualityTier } from "../types";

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

function assertClose(actual: number, expected: number, epsilon: number, label: string): void {
  if (Math.abs(actual - expected) <= epsilon) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — expected ${expected} ± ${epsilon}, got ${actual}`);
}

function makeCandidate(overrides: Partial<ModelCandidate> & { id: string }): ModelCandidate {
  return {
    providerId: "openai",
    providerKind: "openai",
    modelId: overrides.id,
    visibleName: overrides.id,
    qualityTier: "balanced",
    supportsTools: false,
    supportsVision: false,
    supportsJsonMode: false,
    supportsStreaming: true,
    latencyClass: "balanced",
    enabled: true,
    ...overrides,
  };
}

// ── getRouterWeightsForRoute ──────────────────────────────────────────

{
  const w = getRouterWeightsForRoute("cortex-lite");
  assert(w !== null, "getRouterWeightsForRoute('cortex-lite') returns weights");
  if (w) {
    assertEqual(w.cost, 4, "cortex-lite cost weight is 4");
    assertEqual(w.latency, 4, "cortex-lite latency weight is 4");
    assertEqual(w.quality, 1, "cortex-lite quality weight is 1");
  }
}

{
  const w = getRouterWeightsForRoute("nonexistent");
  assertEqual(w, null, "getRouterWeightsForRoute('nonexistent') returns null");
}

// ── Quality-first selection (cortex-pro) ──────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "low-quality", qualityTier: "starter", costPerInputTokenUsd: 0.0001 }),
    makeCandidate({ id: "high-quality", qualityTier: "premium", qualityScore: 0.95, costPerInputTokenUsd: 0.003 }),
    makeCandidate({ id: "mid-quality", qualityTier: "balanced", costPerInputTokenUsd: 0.0005 }),
  ];

  const result = selectCandidates("cortex-pro", candidates);
  assertEqual(result.selected?.id, "high-quality", "cortex-pro selects highest quality candidate");
  assert(result.reasonCodes.includes("highest_quality_candidate"), "cortex-pro reason includes highest_quality_candidate");
  assert(result.score > 0, "cortex-pro result has positive score");
}

// ── Cost-first selection (cortex-lite) ────────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "cheap", qualityTier: "starter", costPerInputTokenUsd: 0.0001, latencyClass: "fast" }),
    makeCandidate({ id: "expensive", qualityTier: "premium", costPerInputTokenUsd: 0.01, latencyClass: "slow" }),
    makeCandidate({ id: "mid", qualityTier: "balanced", costPerInputTokenUsd: 0.001, latencyClass: "balanced" }),
  ];

  const result = selectCandidates("cortex-lite", candidates);
  assertEqual(result.selected?.id, "cheap", "cortex-lite selects cheapest candidate");
  assert(result.reasonCodes.includes("lowest_cost_candidate"), "cortex-lite reason includes lowest_cost_candidate");
}

// ── Disabled candidate excluded ───────────────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "enabled-one", enabled: true }),
    makeCandidate({ id: "disabled-one", enabled: false }),
  ];

  const result = selectCandidates("cortex", candidates);
  assertEqual(result.selected?.id, "enabled-one", "disabled candidate excluded from selection");
  assert(
    result.rejected.some((r) => r.candidate.id === "disabled-one" && r.reason === "provider_unavailable"),
    "disabled candidate rejected with provider_unavailable"
  );
}

// ── Unavailable provider excluded via health override ────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "healthy-provider", providerId: "provider-a" }),
    makeCandidate({ id: "unhealthy-provider", providerId: "provider-b" }),
  ];

  const result = selectCandidates("cortex", candidates, {
    healthOverride: { "provider-b": "unavailable" },
  });

  assertEqual(result.selected?.id, "healthy-provider", "healthy candidate selected over unhealthy");
  assert(
    result.rejected.some((r) => r.candidate.id === "unhealthy-provider" && r.reason === "provider_unavailable"),
    "unhealthy provider rejected with provider_unavailable"
  );
}

// ── Tools-required filters candidates without tools (code route) ───────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "with-tools", supportsTools: true }),
    makeCandidate({ id: "no-tools", supportsTools: false }),
  ];

  const result = selectCandidates("code", candidates, {
    requiredCapabilities: { tools: true },
  });

  assertEqual(result.selected?.id, "with-tools", "code route selects tools-capable candidate");
  assert(
    result.rejected.some((r) => r.candidate.id === "no-tools" && r.reason === "requires_tool_support"),
    "no-tools candidate rejected with requires_tool_support"
  );
  assert(result.reasonCodes.includes("requires_tool_support"), "reason codes include requires_tool_support");
}

// ── Long-context filter ──────────────────────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "big-context", contextWindowTokens: 128000 }),
    makeCandidate({ id: "small-context", contextWindowTokens: 4000 }),
  ];

  const result = selectCandidates("cortex", candidates, {
    requiredCapabilities: { longContext: true },
    estimatedContextTokens: 8000,
  });

  assertEqual(result.selected?.id, "big-context", "large context candidate selected");
  assert(
    result.rejected.some((r) => r.candidate.id === "small-context" && r.reason === "requires_long_context"),
    "small-context rejected with requires_long_context"
  );
  assert(result.reasonCodes.includes("requires_long_context"), "reason codes include requires_long_context");
}

// ── JSON mode filter ─────────────────────────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "supports-json", supportsJsonMode: true }),
    makeCandidate({ id: "no-json", supportsJsonMode: false }),
  ];

  const result = selectCandidates("cortex", candidates, {
    requiredCapabilities: { jsonMode: true },
  });

  assertEqual(result.selected?.id, "supports-json", "json-capable candidate selected");
  assert(
    result.rejected.some((r) => r.candidate.id === "no-json" && r.reason === "requires_json_mode"),
    "no-json rejected with requires_json_mode"
  );
}

// ── No-candidate returns safe result ──────────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "only-one", supportsTools: false }),
  ];

  const result = selectCandidates("code", candidates, {
    requiredCapabilities: { tools: true },
  });

  assertEqual(result.selected, null, "no valid candidate → selected is null");
  assert(Array.isArray(result.fallbacks), "no valid candidate → fallbacks is empty array");
  assert(result.fallbacks.length === 0, "no valid candidate → fallbacks length 0");
  assert(result.rejected.length === 1, "no valid candidate → rejected has 1 entry");
  assertEqual(result.score, 0, "no valid candidate → score is 0");
}

// ── No candidates at all ──────────────────────────────────────────────

{
  const result = selectCandidates("cortex", []);
  assertEqual(result.selected, null, "empty candidate list → selected is null");
  assert(result.fallbacks.length === 0, "empty candidate list → fallbacks empty");
  assert(result.rejected.length === 0, "empty candidate list → rejected empty");
  assertEqual(result.score, 0, "empty candidate list → score is 0");
}

// ── Unknown route ID ─────────────────────────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "any" }),
  ];

  const result = selectCandidates("nonexistent-route", candidates);
  assertEqual(result.selected, null, "unknown route → selected is null");
  assert(
    result.warnings.some((w) => w.includes("Unknown route")),
    "unknown route → warning with 'Unknown route'"
  );
}

// ── Fallback ordering is deterministic ────────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "c", qualityTier: "starter", costPerInputTokenUsd: 0.001 }),
    makeCandidate({ id: "a", qualityTier: "premium", costPerInputTokenUsd: 0.01 }),
    makeCandidate({ id: "b", qualityTier: "balanced", costPerInputTokenUsd: 0.005 }),
  ];

  const result1 = selectCandidates("cortex-pro", candidates);
  const result2 = selectCandidates("cortex-pro", candidates);

  assertEqual(result1.selected?.id, result2.selected?.id, "fallback ordering: same selected across runs");
  assertEqual(
    result1.fallbacks.map((f) => f.id).join(","),
    result2.fallbacks.map((f) => f.id).join(","),
    "fallback ordering: same fallback order across runs"
  );
}

// ── Reason codes explain selection ────────────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "a", qualityTier: "premium", qualityScore: 0.95, costPerInputTokenUsd: 0.01, supportsTools: true }),
    makeCandidate({ id: "b", qualityTier: "starter", costPerInputTokenUsd: 0.0001, enabled: false }),
    makeCandidate({ id: "c", qualityTier: "starter", costPerInputTokenUsd: 0.0005, supportsTools: false }),
  ];

  const result = selectCandidates("code", candidates, {
    requiredCapabilities: { tools: true },
  });

  assert(result.reasonCodes.length > 0, "reason codes are populated");
  assert(
    result.rejected.some((r) => r.candidate.id === "b" && r.reason === "provider_unavailable"),
    "disabled candidate rejected with provider_unavailable"
  );
  assert(
    result.rejected.some((r) => r.candidate.id === "c" && r.reason === "requires_tool_support"),
    "no-tools candidate rejected with requires_tool_support"
  );
}

// ── Determinism: same input produces same output ─────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "x", qualityTier: "premium", qualityScore: 0.9, costPerInputTokenUsd: 0.001, latencyClass: "fast", supportsTools: true, supportsJsonMode: true, contextWindowTokens: 64000 }),
    makeCandidate({ id: "y", qualityTier: "balanced", costPerInputTokenUsd: 0.0005, latencyClass: "balanced", supportsTools: false }),
  ];

  const opts: RouterOptions = {
    requiredCapabilities: { tools: true, jsonMode: true },
    estimatedContextTokens: 32000,
  };

  const r1 = selectCandidates("cortex-pro", candidates, opts);
  const r2 = selectCandidates("cortex-pro", candidates, opts);

  assertEqual(JSON.stringify(r1), JSON.stringify(r2), "deterministic: same input → same output");
}

// ── Research route (tools + context preference) ──────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "tool-capable", supportsTools: true, qualityTier: "premium", contextWindowTokens: 128000, costPerInputTokenUsd: 0.003 }),
    makeCandidate({ id: "no-tools", supportsTools: false, qualityTier: "premium", contextWindowTokens: 128000, costPerInputTokenUsd: 0.002 }),
  ];

  const result = selectCandidates("research", candidates, {
    requiredCapabilities: { tools: true },
  });

  assertEqual(result.selected?.id, "tool-capable", "research route selects tools-capable candidate");
}

// ── Writer route (quality preference) ────────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "high-qual", qualityTier: "premium", qualityScore: 0.9, costPerInputTokenUsd: 0.003, latencyClass: "balanced" }),
    makeCandidate({ id: "low-qual", qualityTier: "starter", costPerInputTokenUsd: 0.003, latencyClass: "balanced" }),
  ];

  const result = selectCandidates("writer", candidates);
  assertEqual(result.selected?.id, "high-qual", "writer route prefers quality");
}

// ── Vision filter ────────────────────────────────────────────────────

{
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "with-vision", supportsVision: true }),
    makeCandidate({ id: "no-vision", supportsVision: false }),
  ];

  const result = selectCandidates("cortex", candidates, {
    requiredCapabilities: { vision: true },
  });

  assertEqual(result.selected?.id, "with-vision", "vision-capable candidate selected");
  assert(
    result.rejected.some((r) => r.candidate.id === "no-vision"),
    "no-vision candidate rejected"
  );
}

// ── Cost truth: unknown cost must not score as free/cheapest ──────────

{
  // No candidate has an exact per-token cost configured (e.g. registry
  // hasn't been priced yet). The cheapest-leaning route should still pick
  // based on costTier rather than treating every candidate as equally free.
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "tier-low", costTier: "low" }),
    makeCandidate({ id: "tier-high", costTier: "high" }),
  ];

  const result = selectCandidates("cortex-lite", candidates);
  assertEqual(result.selected?.id, "tier-low", "with no exact cost, low cost tier beats high cost tier on a cost-leaning route");
}

{
  // A candidate with a known exact cost must not lose to an unknown-cost
  // candidate purely because the unknown one defaults to looking free.
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "exact-cheap", costPerInputTokenUsd: 0.0001, costPerOutputTokenUsd: 0.0001 }),
    makeCandidate({ id: "unknown-cost" }),
  ];

  const result = selectCandidates("cortex-lite", candidates);
  assertEqual(result.selected?.id, "exact-cheap", "a candidate with known cheap exact cost beats an unknown-cost candidate");
}

{
  // Mixed set: exact-cost candidates are scored against each other, while
  // the unknown-cost candidate gets a deterministic mid-range tier score
  // rather than being normalized as the minimum (cheapest) of the group.
  const candidates: ModelCandidate[] = [
    makeCandidate({ id: "exact-expensive", costPerInputTokenUsd: 0.01, costPerOutputTokenUsd: 0.01 }),
    makeCandidate({ id: "exact-cheap", costPerInputTokenUsd: 0.0001, costPerOutputTokenUsd: 0.0001 }),
    makeCandidate({ id: "unknown-cost", costTier: "medium" }),
  ];

  const result = selectCandidates("cortex-lite", candidates);
  assertEqual(result.selected?.id, "exact-cheap", "in a mixed exact/unknown cost set, the cheapest exact-cost candidate still wins on a cost-leaning route");
  assert(
    result.fallbacks.some((c) => c.id === "exact-expensive") && result.fallbacks.some((c) => c.id === "unknown-cost"),
    "both the expensive exact-cost and unknown-cost candidates rank below the cheap exact-cost candidate"
  );
}

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
