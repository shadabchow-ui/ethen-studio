import { describe, it, expect } from "vitest";
import { emitMediaAuditEvent, mediaHealthSignal, createMediaCorrelationId } from "../audit";
describe("media/audit",()=>{
  describe("createMediaCorrelationId",()=>{
    it("creates IDs with studio- prefix",()=>{expect(createMediaCorrelationId()).toMatch(/^studio-/)});
    it("creates unique IDs",()=>{expect(createMediaCorrelationId()).not.toBe(createMediaCorrelationId())});
  });
  describe("emitMediaAuditEvent",()=>{
    it("forms full event",()=>{
      const e=emitMediaAuditEvent({correlationId:"s-test",eventType:"studio.media.generated",tenantId:"t1",message:"Done"});
      expect(e.correlationId).toBe("s-test"); expect(e.eventType).toBe("studio.media.generated"); expect(e.tenantId).toBe("t1");
    });
    it("defaults optional fields",()=>{
      const e=emitMediaAuditEvent({correlationId:"t",eventType:"studio.health",message:"OK"});
      expect(e.tenantId).toBeNull();
    });
    it("never throws",()=>{expect(()=>emitMediaAuditEvent({correlationId:"t",eventType:"studio.health",message:"OK"})).not.toThrow()});
  });
  describe("mediaHealthSignal",()=>{
    it("reports frozen truthfully",()=>{
      const s=mediaHealthSignal(); expect(s.status).toBe("frozen");
      expect(s.safetyClassifierActive).toBe(true); expect(s.rightsChecklistActive).toBe(true);
    });
    it("accepts overrides",()=>{const s=mediaHealthSignal({status:"unavailable"}); expect(s.status).toBe("unavailable")});
  });
});
