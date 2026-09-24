import { describe, it, expect } from "vitest";
import {
  emitResearchAuditEvent,
  researchHealthSignal,
  createResearchCorrelationId,
} from "../audit";

describe("research/audit", () => {
  describe("createResearchCorrelationId", () => {
    it("creates IDs with research- prefix", () => {
      const id = createResearchCorrelationId();
      expect(id).toMatch(/^research-/);
    });

    it("creates unique IDs", () => {
      const a = createResearchCorrelationId();
      const b = createResearchCorrelationId();
      expect(a).not.toBe(b);
    });
  });

  describe("emitResearchAuditEvent", () => {
    it("returns a fully formed event", () => {
      const event = emitResearchAuditEvent({
        correlationId: "research-test-123",
        runId: "run_abc",
        eventType: "research.run.started",
        tenantId: "tenant-1",
        message: "Test started",
        data: { mode: "search" },
      });

      expect(event.eventId).toBeTruthy();
      expect(event.correlationId).toBe("research-test-123");
      expect(event.runId).toBe("run_abc");
      expect(event.eventType).toBe("research.run.started");
      expect(event.tenantId).toBe("tenant-1");
      expect(event.message).toBe("Test started");
      expect(event.data).toEqual({ mode: "search" });
      expect(event.timestamp).toBeTruthy();
    });

    it("defaults tenantId and runId to null when omitted", () => {
      const event = emitResearchAuditEvent({
        correlationId: "test",
        eventType: "research.run.planned",
        message: "Plan",
      });
      expect(event.tenantId).toBeNull();
      expect(event.runId).toBeUndefined();
    });

    it("never throws", () => {
      expect(() =>
        emitResearchAuditEvent({
          correlationId: "test",
          eventType: "research.run.failed",
          message: "Error",
        }),
      ).not.toThrow();
    });
  });

  describe("researchHealthSignal", () => {
    it("reports healthy when provider is configured", () => {
      const signal = researchHealthSignal({
        providerConfigured: true,
        mockMode: false,
      });
      expect(signal.status).toBe("healthy");
      expect(signal.provider).toBe("exa");
      expect(signal.providerConfigured).toBe(true);
      expect(signal.mockFallbackActive).toBe(false);
    });

    it("reports degraded in mock mode", () => {
      const signal = researchHealthSignal({
        providerConfigured: false,
        mockMode: true,
      });
      expect(signal.status).toBe("degraded");
      expect(signal.provider).toBe("mock");
      expect(signal.providerConfigured).toBe(false);
      expect(signal.mockFallbackActive).toBe(true);
    });

    it("reports setup_required when neither configured nor mock", () => {
      const signal = researchHealthSignal({
        providerConfigured: false,
        mockMode: false,
      });
      expect(signal.status).toBe("setup_required");
      expect(signal.provider).toBe("none");
    });
  });
});
