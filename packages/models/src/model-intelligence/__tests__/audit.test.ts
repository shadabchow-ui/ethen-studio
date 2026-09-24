import { describe, it, expect } from "vitest";
import { emitModelIntelligenceAuditEvent, modelIntelligenceHealthSignal, createModelIntelligenceCorrelationId } from "../audit";
describe("model-intelligence/audit",()=>{
  describe("createModelIntelligenceCorrelationId",()=>{
    it("creates IDs with mi- prefix",()=>{expect(createModelIntelligenceCorrelationId()).toMatch(/^mi-/)});
    it("creates unique IDs",()=>{expect(createModelIntelligenceCorrelationId()).not.toBe(createModelIntelligenceCorrelationId())});
  });
  describe("emitModelIntelligenceAuditEvent",()=>{
    it("forms full event",()=>{
      const e=emitModelIntelligenceAuditEvent({correlationId:"mi-test",eventType:"mi.catalog.updated",tenantId:"t1",message:"Updated"});
      expect(e.correlationId).toBe("mi-test"); expect(e.tenantId).toBe("t1");
    });
    it("defaults optional",()=>{const e=emitModelIntelligenceAuditEvent({correlationId:"t",eventType:"mi.health",message:"OK"});expect(e.tenantId).toBeNull()});
    it("never throws",()=>{expect(()=>emitModelIntelligenceAuditEvent({correlationId:"t",eventType:"mi.health",message:"OK"})).not.toThrow()});
  });
  describe("modelIntelligenceHealthSignal",()=>{
    it("derives healthy status only after all source records are accounted for",()=>{const s=modelIntelligenceHealthSignal();expect(s.status).toBe("healthy");expect(s.leaderboardsAvailable).toBe(true)});
    it("accepts overrides",()=>{expect(modelIntelligenceHealthSignal({status:"degraded",catalogSize:550}).catalogSize).toBe(550)});
  });
});
