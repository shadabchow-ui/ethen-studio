// GW-R6 Smart Routing — behavior tests (Vitest suite).
// Covers: alias registry, requirements extraction, capability-safe
// filtering, explainable scoring + weight dominance, determinism, live
// telemetry influence, routing receipts, canary routing, and the
// Model-Intelligence-backed candidate pool.
//
// Run: node ./node_modules/vitest/vitest.mjs run lib/gateway/smart-routing/__tests__/smart-router.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import {
  SMART_ALIAS_IDS,
  isSmartAlias,
  getSmartAlias,
  ROUTING_POLICY_VERSION,
  ROUTING_WEIGHT_PROFILES,
  mergeAliasGates,
  extractSmartRoutingRequirements,
  normalizeProviderRestrictions,
  filterCandidates,
  scoreCandidates,
  buildSmartRoutingReceipt,
  resolveSmartRoute,
  canaryBucket,
  setCanaryConfig,
  resetCanaryConfig,
  applyCanaryGate,
  recordGatewayTelemetry,
  seedGatewayTelemetry,
  resetGatewayTelemetry,
  getTelemetryStats,
  buildSmartCandidates,
  getModelIntelligenceEnrichment,
  parseContextWindowTokens,
} from "..";
import type {
  SmartRoutingCandidate,
  SmartRoutingDecision,
  SmartRoutingRequirements,
} from "..";
import { resetCircuitBreaker } from "@ethen/ai/cortex/circuit-breaker";

// ── Fixtures ────────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<SmartRoutingCandidate> & { providerId: string; modelId: string }): SmartRoutingCandidate {
  return {
    visibleName: overrides.modelId,
    qualityScore: 0.5,
    qualitySource: "quality-tier",
    priceSource: "tier",
    supportsTools: false,
    supportsVision: false,
    supportsStructuredOutput: false,
    supportsStreaming: true,
    latencyClass: "unknown",
    health: "healthy",
    certified: false,
    source: "test",
    ...overrides,
  };
}

const baseRequirements: SmartRoutingRequirements = {
  modality: "text",
  requiresVision: false,
  requiresTools: false,
  requiresStructuredOutput: false,
  estimatedInputTokens: 1000,
  latencyTarget: "balanced",
  certificationLevel: "any",
  source: "request",
};

// ── Alias registry ──────────────────────────────────────────────────────

describe("smart aliases", () => {
  it("ships exactly the eight documented aliases", () => {
    expect(SMART_ALIAS_IDS).toEqual([
      "ethen/auto",
      "ethen/fast",
      "ethen/best",
      "ethen/cheap",
      "ethen/reasoning",
      "ethen/coding",
      "ethen/vision",
      "ethen/long-context",
    ]);
  });

  it("every alias has a versioned weight profile", () => {
    for (const aliasId of SMART_ALIAS_IDS) {
      const alias = getSmartAlias(aliasId);
      expect(alias, `alias ${aliasId} is registered`).not.toBeNull();
      expect(ROUTING_WEIGHT_PROFILES[aliasId]).toBeDefined();
    }
    expect(ROUTING_POLICY_VERSION).toBe("ethen.routing-policy.v1");
  });

  it("isSmartAlias recognizes aliases and rejects concrete models", () => {
    expect(isSmartAlias("ethen/auto")).toBe(true);
    expect(isSmartAlias(" ethen/fast ")).toBe(true);
    expect(isSmartAlias("gpt-4o-mini")).toBe(false);
    expect(isSmartAlias("")).toBe(false);
    expect(isSmartAlias(null)).toBe(false);
    expect(isSmartAlias("ethen/not-shipped")).toBe(false);
  });

  it("alias gates are fully specified for capability-implying aliases", () => {
    expect(getSmartAlias("ethen/vision")?.aliasGates.requiresVision).toBe(true);
    expect(getSmartAlias("ethen/coding")?.aliasGates.requiresTools).toBe(true);
    expect(getSmartAlias("ethen/coding")?.aliasGates.minContextTokens).toBe(64_000);
    expect(getSmartAlias("ethen/long-context")?.aliasGates.minContextTokens).toBe(128_000);
    expect(getSmartAlias("ethen/auto")?.aliasGates).toEqual({});
  });

  it("mergeAliasGates unions request and alias requirements", () => {
    const merged = mergeAliasGates(getSmartAlias("ethen/vision")!, {
      ...baseRequirements,
      estimatedInputTokens: 500,
    });
    expect(merged.requiresVision).toBe(true);
    expect(merged.estimatedInputTokens).toBe(500);
  });
});

// ── Requirements extraction ─────────────────────────────────────────────

describe("requirements extraction", () => {
  it("detects tools, vision, structured output, and max tokens", () => {
    const req = extractSmartRoutingRequirements({
      model: "ethen/auto",
      messages: [
        { role: "user", content: "describe this" },
        {
          role: "user",
          content: [
            { type: "text", text: "look at" },
            { type: "image_url", image_url: { url: "https://example.com/a.png" } },
          ],
        },
      ],
      tools: [{ type: "function", function: { name: "f" } }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });
    expect(req.requiresVision).toBe(true);
    expect(req.modality).toBe("image");
    expect(req.requiresTools).toBe(true);
    expect(req.requiresStructuredOutput).toBe(true);
    expect(req.maxOutputTokens).toBe(4096);
    expect(req.estimatedInputTokens).toBeGreaterThan(0);
  });

  it("extracts request-level budget ceiling and certification level", () => {
    const req = extractSmartRoutingRequirements({
      model: "ethen/cheap",
      messages: [{ role: "user", content: "hi" }],
      metadata: {
        routing: { budget_ceiling_usd: 0.02, certification_level: "live", latency_target: "fast" },
      },
    });
    expect(req.budgetCeilingUsd).toBe(0.02);
    expect(req.certificationLevel).toBe("live");
    expect(req.latencyTarget).toBe("fast");
  });

  it("defaults to no hard requirements for plain text", () => {
    const req = extractSmartRoutingRequirements({
      model: "ethen/auto",
      messages: [{ role: "user", content: "plain text" }],
    });
    expect(req.requiresVision).toBe(false);
    expect(req.requiresTools).toBe(false);
    expect(req.requiresStructuredOutput).toBe(false);
    expect(req.certificationLevel).toBe("any");
    expect(req.budgetCeilingUsd).toBeUndefined();
  });

  it("normalizes provider restrictions and drops unknown ids", () => {
    expect(normalizeProviderRestrictions(["openai", "fake", "deepseek"])).toEqual(["openai", "deepseek"]);
    expect(normalizeProviderRestrictions("openai")).toBeUndefined();
    expect(normalizeProviderRestrictions([])).toBeUndefined();
  });
});

// ── Capability-safe filtering ───────────────────────────────────────────

describe("capability filter", () => {
  const vision = makeCandidate({ providerId: "openai", modelId: "gpt-4o", supportsVision: true, contextWindowTokens: 128_000 });
  const tools = makeCandidate({ providerId: "anthropic", modelId: "claude-x", supportsTools: true, contextWindowTokens: 200_000 });
  const plain = makeCandidate({ providerId: "deepseek", modelId: "ds-flash", contextWindowTokens: 1_000_000 });
  const small = makeCandidate({ providerId: "deepseek", modelId: "ds-tiny", contextWindowTokens: 8_000 });
  const mock = makeCandidate({ providerId: "mock", modelId: "mock-1" });

  it("vision requirement excludes non-vision candidates with an explicit reason", async () => {
    const { pass, rejected } = await filterCandidates([vision, tools, plain], {
      ...baseRequirements,
      requiresVision: true,
    });
    expect(pass.map((c) => c.modelId)).toEqual(["gpt-4o"]);
    expect(rejected.map((r) => r.reason)).toEqual(["requires_vision", "requires_vision"]);
  });

  it("tools requirement excludes non-tool candidates", async () => {
    const { pass, rejected } = await filterCandidates([vision, tools, plain], {
      ...baseRequirements,
      requiresTools: true,
    });
    expect(pass.map((c) => c.modelId)).toEqual(["claude-x"]);
    expect(rejected.some((r) => r.reason === "requires_tool_support")).toBe(true);
  });

  it("context requirement excludes candidates with insufficient windows", async () => {
    const { pass, rejected } = await filterCandidates([tools, small], {
      ...baseRequirements,
      estimatedInputTokens: 64_000,
    });
    expect(pass.map((c) => c.modelId)).toEqual(["claude-x"]);
    expect(rejected.some((r) => r.reason === "insufficient_context_window")).toBe(true);
  });

  it("unknown-context candidates fail closed for large requests", async () => {
    const unknownCtx = makeCandidate({ providerId: "openai", modelId: "unknown-ctx" });
    const { pass, rejected } = await filterCandidates([unknownCtx], {
      ...baseRequirements,
      estimatedInputTokens: 100_000,
    });
    expect(pass).toHaveLength(0);
    expect(rejected[0].reason).toBe("insufficient_context_window");
  });

  it("budget ceiling excludes candidates whose estimated cost exceeds it", async () => {
    const expensive = makeCandidate({
      providerId: "openai", modelId: "opus", qualityScore: 0.9,
      costPerInputTokenUsd: 0.000_015, costPerOutputTokenUsd: 0.000_075,
      priceSource: "pricing-registry",
    });
    const cheap = makeCandidate({
      providerId: "deepseek", modelId: "flash", qualityScore: 0.4,
      costPerInputTokenUsd: 0.000_000_14, costPerOutputTokenUsd: 0.000_000_28,
      priceSource: "pricing-registry",
    });
    // ~0.00015 + 2048*0.000075 ≈ $0.154 (expensive) vs ≈ $0.00057 (cheap).
    const { pass, rejected } = await filterCandidates([expensive, cheap], {
      ...baseRequirements,
      budgetCeilingUsd: 0.01,
    });
    expect(pass.map((c) => c.modelId)).toEqual(["flash"]);
    expect(rejected.some((r) => r.reason === "estimated_cost_exceeds_budget_ceiling")).toBe(true);
  });

  it("request provider restrictions exclude disallowed providers", async () => {
    const { pass, rejected } = await filterCandidates([vision, tools, plain], baseRequirements, {
      onlyProviders: ["openai"],
    });
    expect(pass.map((c) => c.providerId)).toEqual(["openai"]);
    expect(rejected.every((r) => r.reason === "provider_restricted_by_request")).toBe(true);
  });

  it("project policy can exclude providers via injected checker", async () => {
    const { pass, rejected } = await filterCandidates([vision, tools], baseRequirements, {
      isProviderAllowed: (providerId) => providerId !== "anthropic",
    });
    expect(pass.map((c) => c.providerId)).toEqual(["openai"]);
    expect(rejected.some((r) => r.reason === "provider_blocked_by_project_policy")).toBe(true);
  });

  it("mock is never a smart-routing candidate", async () => {
    const { pass, rejected } = await filterCandidates([mock, plain], baseRequirements);
    expect(pass.map((c) => c.providerId)).toEqual(["deepseek"]);
    expect(rejected[0].reason).toBe("mock_provider_excluded_from_smart_routing");
  });

  it("live certification requirement excludes uncertified providers", async () => {
    const certified = makeCandidate({ providerId: "openai", modelId: "gpt-4o-mini", certified: true });
    const uncertified = makeCandidate({ providerId: "anthropic", modelId: "haiku", certified: false });
    const { pass, rejected } = await filterCandidates([certified, uncertified], {
      ...baseRequirements,
      certificationLevel: "live",
    });
    expect(pass.map((c) => c.providerId)).toEqual(["openai"]);
    expect(rejected[0].reason).toBe("requires_live_certification");
  });

  it("circuit-open providers are excluded", async () => {
    const a = makeCandidate({ providerId: "openai", modelId: "gpt-4o" });
    const b = makeCandidate({ providerId: "deepseek", modelId: "ds" });
    const { pass } = await filterCandidates([a, b], baseRequirements, {
      isProviderUnavailable: (providerId) => providerId === "deepseek",
    });
    expect(pass.map((c) => c.providerId)).toEqual(["openai"]);
  });
});

// ── Explainable scoring & weight dominance ──────────────────────────────

describe("scoring", () => {
  const expensiveQuality = makeCandidate({
    providerId: "openai", modelId: "flagship", qualityScore: 0.9,
    costPerInputTokenUsd: 0.000_015, costPerOutputTokenUsd: 0.000_075,
    priceSource: "pricing-registry", latencyClass: "slow", contextWindowTokens: 200_000,
  });
  const cheapFast = makeCandidate({
    providerId: "deepseek", modelId: "flash", qualityScore: 0.4,
    costPerInputTokenUsd: 0.000_000_14, costPerOutputTokenUsd: 0.000_000_28,
    priceSource: "pricing-registry", latencyClass: "fast", contextWindowTokens: 1_000_000,
  });
  const mid = makeCandidate({
    providerId: "anthropic", modelId: "mid", qualityScore: 0.6,
    costPerInputTokenUsd: 0.000_003, costPerOutputTokenUsd: 0.000_015,
    priceSource: "pricing-registry", latencyClass: "balanced", contextWindowTokens: 200_000,
  });

  it("ethen/cheap selects the cheapest capable candidate", () => {
    const { scored } = scoreCandidates({
      candidates: [expensiveQuality, cheapFast, mid],
      requirements: baseRequirements,
      weights: ROUTING_WEIGHT_PROFILES["ethen/cheap"],
    });
    expect(scored[0].candidate.modelId).toBe("flash");
    expect(scored[0].components.cost).toBeGreaterThan(scored[1].components.cost);
  });

  it("ethen/fast selects the fastest candidate", () => {
    const { scored } = scoreCandidates({
      candidates: [expensiveQuality, cheapFast, mid],
      requirements: baseRequirements,
      weights: ROUTING_WEIGHT_PROFILES["ethen/fast"],
    });
    expect(scored[0].candidate.modelId).toBe("flash");
    expect(scored[0].components.latency).toBe(1);
  });

  it("ethen/best selects the highest-quality candidate", () => {
    const { scored } = scoreCandidates({
      candidates: [expensiveQuality, cheapFast, mid],
      requirements: baseRequirements,
      weights: ROUTING_WEIGHT_PROFILES["ethen/best"],
    });
    expect(scored[0].candidate.modelId).toBe("flagship");
    expect(scored[0].components.quality).toBe(0.9);
  });

  it("scoring is deterministic for a fixed input", () => {
    const input = {
      candidates: [expensiveQuality, cheapFast, mid],
      requirements: baseRequirements,
      weights: ROUTING_WEIGHT_PROFILES["ethen/auto"],
    };
    const first = scoreCandidates(input);
    const second = scoreCandidates(input);
    expect(first.scored.map((s) => s.candidate.modelId)).toEqual(second.scored.map((s) => s.candidate.modelId));
    expect(first.scored.map((s) => s.score)).toEqual(second.scored.map((s) => s.score));
  });

  it("ties break by provider/model id", () => {
    const a = makeCandidate({ providerId: "openai", modelId: "same-score" });
    const b = makeCandidate({ providerId: "deepseek", modelId: "same-score" });
    const { scored } = scoreCandidates({
      candidates: [a, b],
      requirements: baseRequirements,
      weights: ROUTING_WEIGHT_PROFILES["ethen/auto"],
    });
    // Equal scores → alphabetical (deepseek < openai) wins the tiebreak.
    expect(scored[0].candidate.providerId).toBe("deepseek");
    expect(scored[0].score).toBe(scored[1].score);
  });

  it("live telemetry downgrades unreliable candidates", () => {
    resetGatewayTelemetry();
    // The quality leader has terrible recent reliability.
    seedGatewayTelemetry(
      Array.from({ length: 20 }, () => ({
        providerId: "openai", modelId: "flagship", requestId: "r",
        succeeded: Math.random() < 0.1,
        errorClass: "provider_error" as const,
        latencyMs: 8000,
      })),
    );
    const { scored, telemetryIncluded } = scoreCandidates({
      candidates: [expensiveQuality, cheapFast, mid],
      requirements: baseRequirements,
      weights: ROUTING_WEIGHT_PROFILES["ethen/auto"],
      telemetryByKey: new Map([
        ["openai:flagship", { providerId: "openai", modelId: "flagship", samples: 20, successRate: 0.1, p50LatencyMs: 8000, p95LatencyMs: 20000, avgTtftMs: 4000, timeoutRate: 0, rateLimitRate: 0, streamInterruptionRate: 0, avgCostUsd: 0.1, fallbackRate: 0, observedAt: null }],
      ]),
    });
    expect(telemetryIncluded).toBe(true);
    // The unreliable flagship must not win despite its quality lead.
    expect(scored[0].candidate.modelId).not.toBe("flagship");
    expect(scored.find((s) => s.candidate.modelId === "flagship")!.components.reliability).toBeLessThan(0.5);
  });
});

// ── Telemetry store ─────────────────────────────────────────────────────

describe("telemetry store", () => {
  beforeEach(() => resetGatewayTelemetry());

  it("computes success rate and percentile latencies", () => {
    seedGatewayTelemetry([
      { providerId: "openai", modelId: "gpt-4o-mini", requestId: "r1", succeeded: true, latencyMs: 1000 },
      { providerId: "openai", modelId: "gpt-4o-mini", requestId: "r2", succeeded: true, latencyMs: 2000 },
      { providerId: "openai", modelId: "gpt-4o-mini", requestId: "r3", succeeded: false, errorClass: "timeout" },
    ]);
    const stats = getTelemetryStats("openai", "gpt-4o-mini")!;
    expect(stats.samples).toBe(3);
    expect(stats.successRate).toBeCloseTo(2 / 3, 5);
    expect(stats.timeoutRate).toBeCloseTo(1 / 3, 5);
  });

  it("uses the mean as p50/p95 below 5 samples (honest small-sample label)", () => {
    seedGatewayTelemetry([
      { providerId: "deepseek", modelId: "flash", requestId: "r1", succeeded: true, latencyMs: 100 },
      { providerId: "deepseek", modelId: "flash", requestId: "r2", succeeded: true, latencyMs: 300 },
    ]);
    const stats = getTelemetryStats("deepseek", "flash")!;
    expect(stats.p50LatencyMs).toBe(200);
    expect(stats.p95LatencyMs).toBe(200);
  });

  it("returns null for cold keys and tracks stream interruption / fallback", () => {
    expect(getTelemetryStats("openai", "never-seen")).toBeNull();
    seedGatewayTelemetry([
      { providerId: "openai", modelId: "gpt-4o-mini", requestId: "r1", succeeded: false, errorClass: "stream_interrupted", fallbackUsed: true },
    ]);
    const stats = getTelemetryStats("openai", "gpt-4o-mini")!;
    expect(stats.streamInterruptionRate).toBe(1);
    expect(stats.fallbackRate).toBe(1);
  });
});

// ── Model Intelligence integration ──────────────────────────────────────

describe("Model Intelligence integration", () => {
  it("enriches real MI profiles (deepseek-v4-flash)", () => {
    const enrichment = getModelIntelligenceEnrichment("deepseek-v4-flash");
    expect(enrichment).not.toBeNull();
    expect(enrichment!.qualitySource).toBe("model-intelligence");
    expect(enrichment!.qualityScore).toBeCloseTo(0.4, 1);
    expect(enrichment!.supportsReasoning).toBe(true);
    expect(enrichment!.supportsVision).toBe(false);
    expect(enrichment!.contextWindowTokens).toBe(1_000_000);
    expect(enrichment!.ttftSeconds).toBeCloseTo(1.26, 1);
  });

  it("parses context window strings", () => {
    expect(parseContextWindowTokens("1.0M tokens")).toBe(1_000_000);
    expect(parseContextWindowTokens("128K")).toBe(131_072);
    expect(parseContextWindowTokens("160K")).toBe(163_840);
    expect(parseContextWindowTokens("garbage")).toBeNull();
    expect(parseContextWindowTokens(null)).toBeNull();
  });

  it("builds a deterministic candidate pool from route profiles", async () => {
    const candidates = await buildSmartCandidates("text-general");
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    expect(candidates.map((c) => c.providerId).sort()).toEqual(
      ["anthropic", "deepseek", "openai"].sort(),
    );
    // Sorted deterministically by provider:model.
    const ids = candidates.map((c) => `${c.providerId}:${c.modelId}`);
    expect([...ids].sort()).toEqual(ids);
    // Registry-priced candidate carries exact per-token price.
    const gpt4oMini = candidates.find((c) => c.modelId === "gpt-4o-mini");
    expect(gpt4oMini?.priceSource).toBe("pricing-registry");
    expect(gpt4oMini?.costPerInputTokenUsd).toBeCloseTo(0.15 / 1_000_000, 12);
    // MI-enriched candidate carries quality + context from real data.
    const flash = candidates.find((c) => c.modelId === "deepseek-v4-flash");
    expect(flash?.qualitySource).toBe("model-intelligence");
    expect(flash?.contextWindowTokens).toBe(1_000_000);
  });
});

// ── Router end-to-end (real repo data + env keys) ──────────────────────

describe("resolveSmartRoute (integration)", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"]) {
      savedEnv[key] = process.env[key];
      process.env[key] = "test-key";
    }
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetGatewayTelemetry();
    resetCircuitBreaker();
  });

  beforeEach(() => {
    resetGatewayTelemetry();
    resetCircuitBreaker();
    resetCanaryConfig();
  });

  it("ethen/cheap resolves to the cheapest capable provider (deepseek)", async () => {
    const { decision, receipt } = await resolveSmartRoute({
      aliasId: "ethen/cheap",
      requirements: baseRequirements,
      routeId: "text-general",
      requestId: "req-cheap-1",
      isProviderAllowed: () => true,
    });
    expect(decision.selected).not.toBeNull();
    expect(decision.selected!.providerId).toBe("deepseek");
    expect(decision.selected!.modelId).toBe("deepseek-v4-flash");
    expect(receipt.requested_model).toBe("ethen/cheap");
    expect(receipt.selected_provider).toBe("deepseek");
    expect(receipt.routing_policy_version).toBe("ethen.routing-policy.v1");
    expect(receipt.reason_codes).toContain("supports_required_capabilities");
    expect(receipt.rejected_count).toBeGreaterThanOrEqual(0);
  });

  it("ethen/best resolves to the highest-quality measured candidate (deepseek-v4-flash)", async () => {
    const { decision } = await resolveSmartRoute({
      aliasId: "ethen/best",
      requirements: baseRequirements,
      routeId: "text-general",
      requestId: "req-best-1",
      isProviderAllowed: () => true,
    });
    expect(decision.selected).not.toBeNull();
    // Model Intelligence measures deepseek-v4-flash at intelligence 40 vs
    // gpt-4o-mini at 7 (claude-haiku has no MI profile, so its tier default
    // is a fallback, not a measurement). The measured quality leader wins.
    expect(decision.selected!.providerId).toBe("deepseek");
    expect(decision.selected!.modelId).toBe("deepseek-v4-flash");
  });

  it("vision hard requirement filters before scoring (only gpt-4o-mini is vision-capable)", async () => {
    const { decision } = await resolveSmartRoute({
      aliasId: "ethen/auto",
      requirements: { ...baseRequirements, requiresVision: true, modality: "image" },
      routeId: "text-general",
      requestId: "req-vision-1",
      isProviderAllowed: () => true,
    });
    expect(decision.selected?.providerId).toBe("openai");
    expect(decision.selected?.modelId).toBe("gpt-4o-mini");
    // Every ranked fallback must also be vision-capable (capability-safe fallback).
    expect(decision.ranked.every((c) => c.supportsVision)).toBe(true);
  });

  it("ethen/coding requires tools and preserves capability in the fallback chain", async () => {
    const { decision } = await resolveSmartRoute({
      aliasId: "ethen/coding",
      requirements: baseRequirements,
      routeId: "text-general",
      requestId: "req-coding-1",
      isProviderAllowed: () => true,
    });
    expect(decision.selected).not.toBeNull();
    // claude-haiku (unknown context) must be excluded by the 64K gate.
    expect(decision.ranked.every((c) => c.supportsTools)).toBe(true);
    expect(decision.ranked.every((c) => c.contextWindowTokens != null)).toBe(true);
  });

  it("ethen/long-context only admits >= 128K candidates", async () => {
    const { decision, receipt } = await resolveSmartRoute({
      aliasId: "ethen/long-context",
      requirements: baseRequirements,
      routeId: "text-general",
      requestId: "req-long-1",
      isProviderAllowed: () => true,
    });
    expect(decision.selected).not.toBeNull();
    for (const candidate of decision.ranked) {
      expect(candidate.contextWindowTokens).toBeGreaterThanOrEqual(128_000);
    }
    expect(receipt.reason_codes).toContain("supports_required_capabilities");
  });

  it("live certification requirement fails closed until a provider has dated live evidence", async () => {
    const { decision } = await resolveSmartRoute({
      aliasId: "ethen/auto",
      requirements: { ...baseRequirements, certificationLevel: "live" },
      routeId: "text-general",
      requestId: "req-live-1",
      isProviderAllowed: () => true,
    });
    // Provider metadata deliberately records no dated live certification for
    // any Gateway provider. A configured API key is not live evidence, so a
    // `live` requirement must not silently promote OpenAI or any other route.
    expect(decision.selected).toBeNull();
    expect(decision.ranked).toEqual([]);
  });

  it("request provider restrictions narrow the pool", async () => {
    const { decision } = await resolveSmartRoute({
      aliasId: "ethen/cheap",
      requirements: baseRequirements,
      routeId: "text-general",
      requestId: "req-only-1",
      onlyProviders: ["openai"],
      isProviderAllowed: () => true,
    });
    expect(decision.selected?.providerId).toBe("openai");
    expect(decision.rejected.some((r) => r.reason === "provider_restricted_by_request")).toBe(true);
  });

  it("is deterministic for a fixed input + state", async () => {
    const first = await resolveSmartRoute({
      aliasId: "ethen/auto",
      requirements: baseRequirements,
      routeId: "text-general",
      requestId: "req-det-1",
      isProviderAllowed: () => true,
    });
    const second = await resolveSmartRoute({
      aliasId: "ethen/auto",
      requirements: baseRequirements,
      routeId: "text-general",
      requestId: "req-det-1",
      isProviderAllowed: () => true,
    });
    expect(first.decision.selected?.providerId).toBe(second.decision.selected?.providerId);
    expect(first.decision.selected?.modelId).toBe(second.decision.selected?.modelId);
    expect(first.decision.ranked.map((c) => `${c.providerId}:${c.modelId}`)).toEqual(
      second.decision.ranked.map((c) => `${c.providerId}:${c.modelId}`),
    );
  });

  it("fails closed with explainable reasons when no candidate satisfies the request", async () => {
    const { decision, receipt } = await resolveSmartRoute({
      aliasId: "ethen/vision",
      requirements: { ...baseRequirements, requiresVision: true, modality: "image" },
      routeId: "text-general",
      requestId: "req-none-1",
      isProviderAllowed: () => false, // project blocks every provider
    });
    expect(decision.selected).toBeNull();
    expect(decision.reasonCodes).toContain("no_capability_compatible_candidate");
    expect(receipt.selected_model).toBe("none");
    expect(receipt.rejected_count).toBeGreaterThan(0);
  });

  it("telemetry influences real routing decisions", async () => {
    // Mark deepseek (the usual cheap winner) as failing constantly.
    recordGatewayTelemetry({
      providerId: "deepseek", modelId: "deepseek-v4-flash", requestId: "r",
      succeeded: false, errorClass: "provider_error", latencyMs: 9000,
    });
    recordGatewayTelemetry({
      providerId: "deepseek", modelId: "deepseek-v4-flash", requestId: "r",
      succeeded: false, errorClass: "provider_error", latencyMs: 9000,
    });
    recordGatewayTelemetry({
      providerId: "deepseek", modelId: "deepseek-v4-flash", requestId: "r",
      succeeded: false, errorClass: "provider_error", latencyMs: 9000,
    });
    const { decision } = await resolveSmartRoute({
      aliasId: "ethen/cheap",
      requirements: baseRequirements,
      routeId: "text-general",
      requestId: "req-tel-1",
      isProviderAllowed: () => true,
    });
    // 0% success over 3 samples → excluded by the telemetry hard gate.
    expect(decision.rejected.some((r) => r.reason === "provider_telemetry_failing")).toBe(true);
    // The next-cheapest healthy candidate wins instead of the failing one.
    expect(decision.selected?.providerId).toBe("openai");
    expect(decision.selected?.modelId).toBe("gpt-4o-mini");
  });
});

// ── Routing receipts ────────────────────────────────────────────────────

describe("routing receipts", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"]) {
      savedEnv[key] = process.env[key];
      process.env[key] = "test-key";
    }
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("expose only routing facts, never internal data", async () => {
    const { decision, receipt } = await resolveSmartRoute({
      aliasId: "ethen/cheap",
      requirements: baseRequirements,
      routeId: "text-general",
      requestId: "req-receipt-1",
      isProviderAllowed: () => true,
    });
    expect(receipt.requested_model).toBe("ethen/cheap");
    expect(receipt.selected_model).toBe(decision.selected!.modelId);
    expect(receipt.selected_provider).toBe(decision.selected!.providerId);
    expect(Array.isArray(receipt.reason_codes)).toBe(true);
    expect(receipt.reason_codes.length).toBeGreaterThan(0);
    // No secrets, no telemetry internals, no tenant identifiers.
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("project_id");
    // Score components are rounded to 2 decimals when present.
    if (receipt.score_components) {
      for (const value of Object.values(receipt.score_components)) {
        expect(Math.round(value * 100) / 100).toBe(value);
      }
    }
  });
});

// ── Canary routing ──────────────────────────────────────────────────────

describe("canary routing", () => {
  beforeEach(() => {
    resetCanaryConfig();
    resetGatewayTelemetry();
  });

  it("buckets deterministically", () => {
    const a = canaryBucket("ethen/auto", "openai", "gpt-4o-mini", "req-1");
    const b = canaryBucket("ethen/auto", "openai", "gpt-4o-mini", "req-1");
    const c = canaryBucket("ethen/auto", "openai", "gpt-4o-mini", "req-2");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
    // Different request ids land in different (or at least not necessarily equal) buckets.
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThan(100);
  });

  it("rollout 0% never promotes; 100% always promotes the target", async () => {
    const decision: SmartRoutingDecision = {
      aliasId: "ethen/auto",
      policyVersion: ROUTING_POLICY_VERSION,
      selected: makeCandidate({ providerId: "openai", modelId: "gpt-4o-mini" }),
      ranked: [
        makeCandidate({ providerId: "openai", modelId: "gpt-4o-mini" }),
        makeCandidate({ providerId: "deepseek", modelId: "deepseek-v4-flash" }),
      ],
      rejected: [],
      score: 0.8,
      reasonCodes: ["supports_required_capabilities"],
      scoreComponents: { quality: 0.5, latency: 0.5, ttft: 0.5, cost: 0.5, reliability: 0.5, health: 1, context: 0.5, tools: 0.5 },
      telemetryIncluded: false,
      canary: null,
      createdAt: new Date().toISOString(),
    };

    setCanaryConfig([{ aliasId: "ethen/auto", providerId: "openai", modelId: "gpt-4o-mini", rolloutPercent: 0, minSuccessRate: 0.9, minSamples: 10 }]);
    const zero = applyCanaryGate(decision, "req-canary-1");
    expect(zero.canary).toBeNull();

    setCanaryConfig([{ aliasId: "ethen/auto", providerId: "openai", modelId: "gpt-4o-mini", rolloutPercent: 100, minSuccessRate: 0.9, minSamples: 10 }]);
    const full = applyCanaryGate(decision, "req-canary-1");
    expect(full.canary).not.toBeNull();
    expect(full.canary!.bucketHit).toBe(true);
    expect(full.canary!.promoted).toBe(true);
    // Canary candidate moved to rank 1 (it already was rank 1 here).
    expect(full.decision.ranked[0].providerId).toBe("openai");
  });

  it("acceptance criteria are measured from telemetry, never assumed", () => {
    seedGatewayTelemetry(
      Array.from({ length: 20 }, () => ({
        providerId: "deepseek", modelId: "deepseek-v4-flash", requestId: "r",
        succeeded: true,
      })),
    );
    const decision: SmartRoutingDecision = {
      aliasId: "ethen/auto",
      policyVersion: ROUTING_POLICY_VERSION,
      selected: makeCandidate({ providerId: "deepseek", modelId: "deepseek-v4-flash" }),
      ranked: [makeCandidate({ providerId: "deepseek", modelId: "deepseek-v4-flash" })],
      rejected: [],
      score: 0.6,
      reasonCodes: ["supports_required_capabilities"],
      scoreComponents: { quality: 0.5, latency: 0.5, ttft: 0.5, cost: 0.5, reliability: 0.5, health: 1, context: 0.5, tools: 0.5 },
      telemetryIncluded: true,
      canary: null,
      createdAt: new Date().toISOString(),
    };
    setCanaryConfig([{ aliasId: "ethen/auto", providerId: "deepseek", modelId: "deepseek-v4-flash", rolloutPercent: 100, minSuccessRate: 0.9, minSamples: 10 }]);
    const stats = getTelemetryStats("deepseek", "deepseek-v4-flash")!;
    const telemetryByKey = new Map([["deepseek:deepseek-v4-flash", stats]]);
    const result = applyCanaryGate(decision, "req-canary-2", telemetryByKey);
    expect(result.canary!.acceptance.measurable).toBe(true);
    expect(result.canary!.acceptance.samples).toBe(20);
    expect(result.canary!.acceptance.meetsCriteria).toBe(true);
  });

  it("failing acceptance criteria report meetsCriteria=false", () => {
    seedGatewayTelemetry(
      Array.from({ length: 10 }, () => ({
        providerId: "deepseek", modelId: "deepseek-v4-flash", requestId: "r",
        succeeded: false, errorClass: "provider_error" as const,
      })),
    );
    const decision: SmartRoutingDecision = {
      aliasId: "ethen/auto",
      policyVersion: ROUTING_POLICY_VERSION,
      selected: makeCandidate({ providerId: "deepseek", modelId: "deepseek-v4-flash" }),
      ranked: [makeCandidate({ providerId: "deepseek", modelId: "deepseek-v4-flash" })],
      rejected: [],
      score: 0.6,
      reasonCodes: ["supports_required_capabilities"],
      scoreComponents: { quality: 0.5, latency: 0.5, ttft: 0.5, cost: 0.5, reliability: 0.5, health: 1, context: 0.5, tools: 0.5 },
      telemetryIncluded: true,
      canary: null,
      createdAt: new Date().toISOString(),
    };
    setCanaryConfig([{ aliasId: "ethen/auto", providerId: "deepseek", modelId: "deepseek-v4-flash", rolloutPercent: 100, minSuccessRate: 0.9, minSamples: 10 }]);
    const stats = getTelemetryStats("deepseek", "deepseek-v4-flash")!;
    const result = applyCanaryGate(decision, "req-canary-3", new Map([["deepseek:deepseek-v4-flash", stats]]));
    expect(result.canary!.acceptance.meetsCriteria).toBe(false);
  });
});
