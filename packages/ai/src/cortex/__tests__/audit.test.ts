import { describe, it, expect, afterEach } from "vitest";
import {
  emitCortexAuditEvent,
  createCortexCorrelationId,
  createCortexRunId,
  createCortexRequestId,
  cortexHealthSignal,
  __setCortexAuditPersistFn,
} from "../audit";
import type { CortexAuditEvent } from "../audit";

describe("cortex/audit", () => {
  afterEach(() => {
    __setCortexAuditPersistFn(null);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  describe("ID generators", () => {
    it("creates correlation IDs with cortex- prefix", () => {
      const id = createCortexCorrelationId();
      expect(id).toMatch(/^cortex-/);
      expect(id.length).toBeGreaterThan(7);
    });

    it("creates unique correlation IDs", () => {
      const a = createCortexCorrelationId();
      const b = createCortexCorrelationId();
      expect(a).not.toBe(b);
    });

    it("creates run IDs with run_ prefix", () => {
      const id = createCortexRunId();
      expect(id).toMatch(/^run_/);
    });

    it("creates request IDs with req_ prefix", () => {
      const id = createCortexRequestId();
      expect(id).toMatch(/^req_/);
    });
  });

  describe("emitCortexAuditEvent", () => {
    it("returns a fully formed event", () => {
      const event = emitCortexAuditEvent({
        correlationId: "cortex-test-123",
        runId: "run_test123",
        requestId: "req_test123",
        eventType: "cortex.run.started",
        tenantId: "tenant-1",
        sessionId: "session-1",
        projectId: "project-1",
        message: "Test started",
        data: { foo: "bar" },
      });

      expect(event.eventId).toBeTruthy();
      expect(event.correlationId).toBe("cortex-test-123");
      expect(event.runId).toBe("run_test123");
      expect(event.requestId).toBe("req_test123");
      expect(event.eventType).toBe("cortex.run.started");
      expect(event.severity).toBe("info");
      expect(event.tenantId).toBe("tenant-1");
      expect(event.sessionId).toBe("session-1");
      expect(event.projectId).toBe("project-1");
      expect(event.message).toBe("Test started");
      expect(event.data).toEqual({ foo: "bar" });
      expect(event.timestamp).toBeTruthy();
    });

    it("defaults severity to info when not provided", () => {
      const event = emitCortexAuditEvent({
        correlationId: "cortex-test",
        runId: "run_test",
        requestId: "req_test",
        eventType: "cortex.run.completed",
        message: "Done",
      });
      expect(event.severity).toBe("info");
    });

    it("accepts error severity", () => {
      const event = emitCortexAuditEvent({
        correlationId: "cortex-test",
        runId: "run_test",
        requestId: "req_test",
        eventType: "cortex.run.failed",
        severity: "error",
        message: "Failure",
      });
      expect(event.severity).toBe("error");
    });

    it("defaults tenant/session/project to null when omitted", () => {
      const event = emitCortexAuditEvent({
        correlationId: "cortex-test",
        runId: "run_test",
        requestId: "req_test",
        eventType: "cortex.run.started",
        message: "No context",
      });
      expect(event.tenantId).toBeNull();
      expect(event.sessionId).toBeNull();
      expect(event.projectId).toBeNull();
    });

    it("calls the registered persist function", async () => {
      // Audit module gates persistence on hasSupabaseEnv().
      // Set dummy Supabase env so the persist path activates.
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";

      const persisted: CortexAuditEvent[] = [];
      __setCortexAuditPersistFn(async (e) => {
        persisted.push(e);
      });

      emitCortexAuditEvent({
        correlationId: "cortex-test",
        runId: "run_test",
        requestId: "req_test",
        eventType: "cortex.run.started",
        message: "Test",
      });

      // Small delay for async persist
      await new Promise((r) => setTimeout(r, 10));
      expect(persisted.length).toBe(1);
      expect(persisted[0].correlationId).toBe("cortex-test");
    });

    it("does not throw when persist function throws", () => {
      __setCortexAuditPersistFn(async () => {
        throw new Error("persist failure");
      });

      // Must not throw
      expect(() =>
        emitCortexAuditEvent({
          correlationId: "cortex-test",
          runId: "run_test",
          requestId: "req_test",
          eventType: "cortex.run.started",
          message: "Test",
        }),
      ).not.toThrow();
    });
  });

  describe("cortexHealthSignal", () => {
    it("returns default healthy signal", () => {
      const signal = cortexHealthSignal();
      expect(signal.status).toBe("healthy");
      expect(signal.timestamp).toBeTruthy();
      expect(signal.providerStates).toEqual({});
      expect(signal.recentRunCount).toBe(0);
      expect(signal.recentFailureCount).toBe(0);
      expect(signal.message).toContain("Cortex");
    });

    it("accepts overrides", () => {
      const signal = cortexHealthSignal({
        status: "degraded",
        recentRunCount: 42,
        message: "Custom",
      });
      expect(signal.status).toBe("degraded");
      expect(signal.recentRunCount).toBe(42);
      expect(signal.message).toBe("Custom");
    });
  });
});
