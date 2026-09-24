import { strict as assert } from "node:assert";
import { DurableStudioJobOrchestrator, InMemoryStudioJobRepository } from "../job-orchestrator";

function submission(key: string, overrides: Record<string, unknown> = {}) {
  return { organizationId: "org-a", projectId: "project-a", actorId: "actor-a", idempotencyKey: key, immutableInput: { prompt: "immutable" }, sourceAssetIds: ["asset-a"], policyVersion: "studio-v1", providerId: "mock", adapterVersion: "1", modelId: "model-a", capability: "text-to-image", costEstimate: { credits: 1 }, maxAttempts: 2, timeoutAt: "2099-01-01T00:00:00.000Z", ...overrides };
}

async function ready(key = "key") {
  const service = new DurableStudioJobOrchestrator(new InMemoryStudioJobRepository());
  const job = await service.submit(submission(key));
  const claimed = await service.claim("worker-a"); assert.equal(claimed?.id, job.id);
  await service.startProviderRun("project-a", job.id, "worker-a");
  return { service, job };
}

async function main() {
  { const repository = new InMemoryStudioJobRepository(); const service = new DurableStudioJobOrchestrator(repository); const first = await service.submit(submission("same")); const second = await service.submit(submission("same", { immutableInput: { prompt: "changed" } })); assert.equal(first.id, second.id); assert.equal(second.immutableInput.prompt, "immutable"); }
  { const { service, job } = await ready("events"); assert.equal(await service.reconcileProviderEvent("project-a", job.id, "worker-a", { providerRunId: null, eventKey: "run", sequence: 2, type: "running", occurredAt: new Date().toISOString(), payload: {} }), true); assert.equal(await service.reconcileProviderEvent("project-a", job.id, "worker-a", { providerRunId: null, eventKey: "old", sequence: 1, type: "queued", occurredAt: new Date().toISOString(), payload: {} }), false); assert.equal(await service.reconcileProviderEvent("project-a", job.id, "worker-a", { providerRunId: null, eventKey: "run", sequence: 2, type: "running", occurredAt: new Date().toISOString(), payload: {} }), false); }
  { const { service, job } = await ready("cancel"); const requested = await service.requestCancellation("project-a", job.id, "user requested"); assert.equal(requested.state, "cancel_requested"); assert.equal(await service.finalize("project-a", job.id, "worker-a", { assetId: "x" }), false); assert.equal(await service.acknowledgeCancellation("project-a", job.id, "worker-a"), true); }
  { const { service, job } = await ready("finalize"); assert.equal(await service.finalize("project-a", job.id, "worker-a", { assetId: "asset-output", usageReservationId: "reservation-a" }), true); assert.equal(await service.finalize("project-a", job.id, "worker-a", { assetId: "duplicate" }), false); }
  { const repository = new InMemoryStudioJobRepository(); const service = new DurableStudioJobOrchestrator(repository); const job = await service.submit(submission("recovery")); const first = await service.claim("dead-worker", 1, "2026-01-01T00:00:00.000Z"); assert.equal(first?.id, job.id); const recovered = await service.recoverExpiredLeases("new-worker", "2026-01-01T00:00:02.000Z"); assert.equal(recovered?.id, job.id); assert.equal(recovered?.attemptCount, 2); }
  { const { service, job } = await ready("deadline"); assert.equal(await service.timeout("project-a", job.id, "2100-01-01T00:00:00.000Z"), true); }
  console.log("STU-06 media job orchestration tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
