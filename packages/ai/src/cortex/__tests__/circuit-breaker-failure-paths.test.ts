import { describe, it, expect, beforeEach } from "vitest";
import {
  isProviderCircuitOpen,
  recordProviderFailure,
  recordProviderSuccess,
  resetCircuitBreaker,
  getCircuitBreakerSnapshot,
} from "../circuit-breaker";

describe("cortex/circuit-breaker", () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  describe("initial state", () => {
    it("has no providers in circuit break state initially", () => {
      expect(isProviderCircuitOpen("openai")).toBe(false);
      expect(isProviderCircuitOpen("anthropic")).toBe(false);
    });

    it("snapshot is empty", () => {
      expect(getCircuitBreakerSnapshot()).toEqual({});
    });
  });

  describe("failure accumulation", () => {
    it("does not open circuit on first failure", () => {
      recordProviderFailure("openai");
      expect(isProviderCircuitOpen("openai")).toBe(false);
    });

    it("does not open circuit on second failure", () => {
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      expect(isProviderCircuitOpen("openai")).toBe(false);
    });

    it("opens circuit after three consecutive failures", () => {
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      expect(isProviderCircuitOpen("openai")).toBe(true);
    });
  });

  describe("success resets", () => {
    it("resets failures after a success", () => {
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      recordProviderSuccess("openai");
      // Two more failures after success
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      expect(isProviderCircuitOpen("openai")).toBe(false);
    });

    it("opens circuit after three new failures post-reset", () => {
      recordProviderFailure("openai");
      recordProviderSuccess("openai");
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      expect(isProviderCircuitOpen("openai")).toBe(true);
    });
  });

  describe("cooldown expiry", () => {
    it("circuit closes after cooldown period", () => {
      const now = 100_000;
      recordProviderFailure("openai", now);
      recordProviderFailure("openai", now);
      recordProviderFailure("openai", now);
      expect(isProviderCircuitOpen("openai", now)).toBe(true);

      // After 30s cooldown + 1ms
      const afterCooldown = now + 30_001;
      expect(isProviderCircuitOpen("openai", afterCooldown)).toBe(false);
    });
  });

  describe("provider isolation", () => {
    it("one provider's circuit does not affect another", () => {
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      expect(isProviderCircuitOpen("openai")).toBe(true);
      expect(isProviderCircuitOpen("anthropic")).toBe(false);
    });
  });

  describe("resetCircuitBreaker", () => {
    it("resets a specific provider", () => {
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      expect(isProviderCircuitOpen("openai")).toBe(true);
      resetCircuitBreaker("openai");
      expect(isProviderCircuitOpen("openai")).toBe(false);
    });

    it("resets all providers with no argument", () => {
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      recordProviderFailure("anthropic");
      resetCircuitBreaker();
      expect(isProviderCircuitOpen("openai")).toBe(false);
      expect(isProviderCircuitOpen("anthropic")).toBe(false);
    });
  });

  describe("snapshot", () => {
    it("reflects current circuit state", () => {
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      recordProviderFailure("openai");
      const snap = getCircuitBreakerSnapshot();
      expect(snap.openai).toBeDefined();
      expect(snap.openai.consecutiveFailures).toBe(3);
      expect(snap.openai.cooldownUntil).toBeGreaterThan(0);
    });
  });
});
