// GW-R6 Smart Routing — telemetry feedback loop tests (Vitest suite).
// Covers the live telemetry store that the Gateway feeds after every
// request and the router reads for reliability scoring.
//
// Run: node ./node_modules/vitest/vitest.mjs run lib/gateway/smart-routing/__tests__/telemetry.test.ts

import { describe, it, expect, beforeEach } from "vitest";

import {
  recordGatewayTelemetry,
  getTelemetryStats,
  getTelemetrySnapshot,
  resetGatewayTelemetry,
  seedGatewayTelemetry,
  deriveReliabilitySignal,
} from "..";
import type { SmartRoutingCandidate } from "..";

function candidate(overrides: Partial<SmartRoutingCandidate> & { providerId: string; modelId: string }): SmartRoutingCandidate {
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

describe("telemetry feedback loop", () => {
  beforeEach(() => resetGatewayTelemetry());

  it("records and aggregates success/failure/latency/cost outcomes", () => {
    recordGatewayTelemetry({
      providerId: "openai", modelId: "gpt-4o-mini", requestId: "r1",
      succeeded: true, latencyMs: 500, ttftMs: 120, inputTokens: 10, outputTokens: 40, estimatedCostUsd: 0.001,
    });
    recordGatewayTelemetry({
      providerId: "openai", modelId: "gpt-4o-mini", requestId: "r2",
      succeeded: false, latencyMs: 900, errorClass: "timeout",
    });
    const stats = getTelemetryStats("openai", "gpt-4o-mini")!;
    expect(stats.samples).toBe(2);
    expect(stats.successRate).toBe(0.5);
    expect(stats.timeoutRate).toBe(0.5);
    expect(stats.p50LatencyMs).toBe(700); // mean for < 5 samples
    expect(stats.avgCostUsd).toBeCloseTo(0.001, 6); // only r1 carried a cost
  });

  it("caps the sliding window at 100 samples per key", () => {
    for (let i = 0; i < 150; i += 1) {
      recordGatewayTelemetry({
        providerId: "deepseek", modelId: "flash", requestId: `r${i}`, succeeded: true,
      });
    }
    expect(getTelemetryStats("deepseek", "flash")!.samples).toBe(100);
  });

  it("snapshot is deterministic and sorted", () => {
    seedGatewayTelemetry([
      { providerId: "openai", modelId: "gpt-4o-mini", requestId: "r1", succeeded: true },
      { providerId: "deepseek", modelId: "flash", requestId: "r2", succeeded: true },
    ]);
    const snapshot = getTelemetrySnapshot();
    expect(snapshot).toHaveLength(2);
    const keys = snapshot.map((s) => `${s.providerId}:${s.modelId}`);
    expect([...keys].sort()).toEqual(keys);
  });

  it("deriveReliabilitySignal is neutral for cold candidates and honest for warm ones", () => {
    const cold = candidate({ providerId: "openai", modelId: "gpt-4o-mini" });
    const coldSignal = deriveReliabilitySignal(cold, null);
    expect(coldSignal.reliabilityScore).toBe(0.5);
    expect(coldSignal.telemetryIncluded).toBe(false);

    seedGatewayTelemetry(
      Array.from({ length: 10 }, () => ({
        providerId: "openai", modelId: "gpt-4o-mini", requestId: "r",
        succeeded: true, latencyMs: 1000,
      })),
    );
    const warm = deriveReliabilitySignal(cold, getTelemetryStats("openai", "gpt-4o-mini")!);
    expect(warm.telemetryIncluded).toBe(true);
    expect(warm.reliabilityScore).toBeCloseTo(1, 5);
    expect(warm.latencyPenalty).toBe(0); // p50 1000ms < 4000ms threshold
  });

  it("failed streams and timeouts depress the reliability signal", () => {
    seedGatewayTelemetry(
      Array.from({ length: 10 }, () => ({
        providerId: "openai", modelId: "gpt-4o-mini", requestId: "r",
        succeeded: false, errorClass: "stream_interrupted" as const, latencyMs: 6000,
      })),
    );
    const candidate = { providerId: "openai", modelId: "gpt-4o-mini" };
    const signal = deriveReliabilitySignal(
      candidate as SmartRoutingCandidate,
      getTelemetryStats("openai", "gpt-4o-mini")!,
    );
    expect(signal.reliabilityScore).toBeLessThan(0.5);
    expect(signal.latencyPenalty).toBeGreaterThan(0);
  });
});
