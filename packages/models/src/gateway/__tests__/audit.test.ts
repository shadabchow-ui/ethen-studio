import { describe, it, expect } from "vitest";
import { emitGatewayAuditEvent, gatewayHealthSignal, createGatewayCorrelationId } from "../audit";
describe("gateway/audit",()=>{
  describe("createGatewayCorrelationId",()=>{
    it("creates IDs with gw- prefix",()=>{expect(createGatewayCorrelationId()).toMatch(/^gw-/)});
    it("creates unique IDs",()=>{expect(createGatewayCorrelationId()).not.toBe(createGatewayCorrelationId())});
  });
  describe("emitGatewayAuditEvent",()=>{
    it("forms full event",()=>{
      const e=emitGatewayAuditEvent({correlationId:"gw-test",eventType:"gateway.request.routed",tenantId:"t1",message:"Routed"});
      expect(e.correlationId).toBe("gw-test"); expect(e.tenantId).toBe("t1");
    });
    it("defaults optional",()=>{const e=emitGatewayAuditEvent({correlationId:"t",eventType:"gateway.health",message:"OK"});expect(e.tenantId).toBeNull()});
    it("never throws",()=>{expect(()=>emitGatewayAuditEvent({correlationId:"t",eventType:"gateway.health",message:"OK"})).not.toThrow()});
  });
  describe("gatewayHealthSignal",()=>{
    it("reports healthy with providers",()=>{
      const s=gatewayHealthSignal();expect(s.status).toBe("healthy");
      expect(s.providersAvailable).toContain("openai");expect(s.keyManagementActive).toBe(true);
    });
    it("accepts overrides",()=>{expect(gatewayHealthSignal({status:"degraded"}).status).toBe("degraded")});
  });
});
