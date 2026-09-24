import { InMemoryStudioSettlementService, estimateStudioCost } from "../usage-settlement";

let failed = 0;
function expect(condition: boolean, message: string) { if (!condition) { failed++; console.error(`FAIL: ${message}`); } }
function throws(fn: () => void, message: string) { try { fn(); failed++; console.error(`FAIL: ${message}`); } catch { /* expected */ } }

const estimate = estimateStudioCost({ providerId: "provider", modelId: "model", capability: "image", pricingVersion: "2026-08-01", quantity: 2, unitCredits: 4, resolution: "1024x1024", quality: "standard" });
const quota = { creditBalance: 20, projectCeiling: 20, projectConsumed: 0, dailyLimit: 20, dailyConsumed: 0, concurrentLimit: 2, activeJobs: 0 };
const service = new InMemoryStudioSettlementService();
const base = { jobId: "job", projectId: "project", organizationId: "org", actorId: "actor", idempotencyKey: "key", estimate, approvedCeiling: 8 };
expect(service.reserve(base, quota).state === "reserved", "reserves before submission");
expect(service.reserve(base, quota).state === "reserved", "duplicate reservation is idempotent");
expect(service.settle("key", 6).settledCredits === 6, "settles actual usage and releases unused reserve");
throws(() => service.refund("key"), "settlement cannot be refunded twice");
throws(() => service.reserve({ ...base, idempotencyKey: "over", approvedCeiling: 7 }, quota), "cost increase requires approval");
throws(() => service.reserve({ ...base, idempotencyKey: "balance" }, { ...quota, creditBalance: 1 }), "ethen credit exhaustion blocks submission");
const cancel = service.reserve({ ...base, idempotencyKey: "cancel" }, quota);
expect(service.release("cancel").state === "released" && cancel.reservedCredits === 8, "cancellation releases reservation exactly once");
console.log(`STU-11 usage settlement: ${failed === 0 ? "PASS" : "FAIL"}`); if (failed) process.exitCode = 1;
