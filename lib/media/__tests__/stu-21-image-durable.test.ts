/**
 * STU-21 — Durable Create Image slice tests (Job 02).
 * Run with: pnpm validate:studio-image-durable
 *
 * Deterministic failure injection over the canonical image path with fake
 * provider/storage/ledger seams — no network, no DB:
 * contract + quote + admission, ledger guards + concurrency, handler
 * success, pre-send failure, post-send uncertainty, recovery replay,
 * kill/restart without output, download failure, partial batch, event
 * interruption, empty outputs, missing reservation, duplicate command.
 */

import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { InMemoryJobRepository } from "@ethen/ai/platform/jobs/in-memory-repository";
import type { JobRecord } from "@ethen/ai/platform/jobs/index";
import { PostDispatchUncertainError } from "@ethen/ai/platform/worker/types";
import {
  IMAGE_CREDITS_HD,
  IMAGE_CREDITS_STANDARD,
  admitImageQuote,
  quoteImageCommand,
  validateImageCommand,
} from "../image-capability";
import { MemoryImageCreditLedger } from "../image-settlement";
import { createOpenAIImageHandler } from "../worker/openai-image-handler";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label}`);
}

// 1x1 transparent PNG: real bytes so L0 magic-byte + dimension checks run.
const PNG_1X1_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PRICING = { id: "a1000000-0000-4000-8000-000000000001", version: "v1", standardCredits: IMAGE_CREDITS_STANDARD, hdCredits: IMAGE_CREDITS_HD };
const SCOPE = { organizationId: "user:actor-a", projectId: "11111111-1111-4111-8111-111111111111", actorId: "actor-a" };

function makeJob(payload: Record<string, unknown>, overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-test-1", organizationId: SCOPE.organizationId, projectId: SCOPE.projectId,
    queueName: "default", payload, idempotencyKey: "img-key-1", status: "claimed",
    priority: 0, maxAttempts: 3, attemptCount: 1, lastError: null, deadLetterAt: null, deadLetterReason: null,
    leaseId: "lease-1", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), claimedBy: "worker-1",
    leaseGeneration: 1, cancellationRequestedAt: null, cancellationReason: null,
    scheduledAt: new Date().toISOString(), backoffBaseSeconds: 30,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    providerDispatchStartedAt: null, providerOperationKey: null,
    escalatedAt: null, escalationReason: null, lastReconciledAt: null, reconcileCount: 0,
    ...overrides,
  } as JobRecord;
}

interface CtxCalls { marks: string[]; heartbeats: number; events: Array<{ event: string; detail: unknown }>; }
function makeCtx(calls: CtxCalls, overrides: Record<string, unknown> = {}): never {
  return {
    jobId: "job-test-1", workerId: "worker-1",
    heartbeat: async () => { calls.heartbeats += 1; },
    markProviderDispatched: async (key: string) => { calls.marks.push(key); },
    appendEvent: async (event: string, detail: unknown) => { calls.events.push({ event, detail }); },
    isCancellationRequested: async () => false,
    isAborted: () => false,
    wait: async () => {},
    ...overrides,
  } as never;
}

function freshCalls(): CtxCalls { return { marks: [], heartbeats: 0, events: [] }; }

async function reserveFor(ledger: MemoryImageCreditLedger, key: string, credits = IMAGE_CREDITS_STANDARD): Promise<void> {
  await ledger.reserve({
    organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, jobId: "job-test-1", actorId: SCOPE.actorId,
    idempotencyKey: key, pricingVersionId: PRICING.id, approvedCeiling: credits, reservedCredits: credits,
  });
}

function payloadFor(key: string): Record<string, unknown> {
  return {
    kind: "openai-image", prompt: "a lighthouse at dawn", model: "gpt-image-1",
    size: "1024x1024", quality: "standard", actorId: SCOPE.actorId,
    reservationKey: key, quotedCredits: IMAGE_CREDITS_STANDARD, pricingVersionId: PRICING.id,
  };
}

// ── Contract + quote + admission ──

function testContract(): void {
  const ok = validateImageCommand({ prompt: "  hello  " });
  assert(ok.prompt === "hello" && ok.size === "1024x1024" && ok.quality === "standard", "command normalizes defaults");
  for (const bad of [{ prompt: "" }, { prompt: "x", size: "9:99" }, { prompt: "x", model: "other" }, { prompt: "x", imageCount: 2 }, { prompt: "x".repeat(4001) }]) {
    let threw = false;
    try {
      validateImageCommand(bad as never);
    } catch {
      threw = true;
    }
    assert(threw, `invalid command rejected: ${JSON.stringify(bad).slice(0, 40)}`);
  }
  const std = quoteImageCommand(validateImageCommand({ prompt: "x" }), PRICING);
  assert(std.credits === IMAGE_CREDITS_STANDARD && std.pricingVersionId === PRICING.id, "standard quote math");
  const hd = quoteImageCommand(validateImageCommand({ prompt: "x", quality: "hd" }), PRICING);
  assert(hd.credits === IMAGE_CREDITS_HD, "hd quote math");
  let noPricing = false;
  try {
    quoteImageCommand(validateImageCommand({ prompt: "x" }), null);
  } catch {
    noPricing = true;
  }
  assert(noPricing, "missing pricing fails closed, never code-math billing");
  let over = false;
  try {
    admitImageQuote(std, std.credits - 1);
  } catch {
    over = true;
  }
  assert(over, "over-ceiling admission denied");
  admitImageQuote(std, std.credits);
  assert(true, "exact-ceiling admission allowed");
}

// ── Ledger guards + concurrency ──

async function testLedger(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  const first = await ledger.reserve({
    organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, jobId: "job-test-1", actorId: SCOPE.actorId,
    idempotencyKey: "k-1", pricingVersionId: PRICING.id, approvedCeiling: 6, reservedCredits: 6,
  });
  assert(first.replayed === false && first.state === "reserved", "reserve applies");
  const replay = await ledger.reserve({
    organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, jobId: "job-test-1", actorId: SCOPE.actorId,
    idempotencyKey: "k-1", pricingVersionId: PRICING.id, approvedCeiling: 6, reservedCredits: 6,
  });
  assert(replay.replayed === true && replay.id === first.id, "same-key reserve replays");
  let mismatch = false;
  try {
    await ledger.reserve({
      organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, jobId: "job-test-1", actorId: SCOPE.actorId,
      idempotencyKey: "k-1", pricingVersionId: PRICING.id, approvedCeiling: 99, reservedCredits: 99,
    });
  } catch {
    mismatch = true;
  }
  assert(mismatch, "same-key different-terms conflicts, never double-reserves");

  // Concurrent same-key reserves: exactly one logical row.
  const ledger2 = new MemoryImageCreditLedger();
  const results = await Promise.all(Array.from({ length: 10 }, () =>
    ledger2.reserve({
      organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, jobId: "job-test-1", actorId: SCOPE.actorId,
      idempotencyKey: "k-race", pricingVersionId: PRICING.id, approvedCeiling: 6, reservedCredits: 6,
    }).catch((error: unknown) => error),
  ));
  const applied = results.filter((result) => !(result instanceof Error) && (result as { replayed: boolean }).replayed === false);
  assert(applied.length === 1, "concurrent reservations produce one winner");

  const settled = await ledger.settle(SCOPE.projectId, "k-1", 6, "evidence-1");
  assert(settled.state === "settled" && settled.settledCredits === 6, "settle applies");
  const settledReplay = await ledger.settle(SCOPE.projectId, "k-1", 6, "evidence-1");
  assert(settledReplay.replayed === true, "identical repeated settlement replays");
  let settleConflict = false;
  try {
    await ledger.settle(SCOPE.projectId, "k-1", 5, "evidence-2");
  } catch {
    settleConflict = true;
  }
  assert(settleConflict, "different-amount repeated settlement conflicts");
  let overSettle = false;
  try {
    await ledger.reserve({
      organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, jobId: "job-test-1", actorId: SCOPE.actorId,
      idempotencyKey: "k-2", pricingVersionId: PRICING.id, approvedCeiling: 6, reservedCredits: 6,
    });
    await ledger.settle(SCOPE.projectId, "k-2", 7, "evidence-x");
  } catch {
    overSettle = true;
  }
  assert(overSettle, "settle above reserved rejected");
  let releaseAfterSettle = false;
  try {
    await ledger.release(SCOPE.projectId, "k-1", "too-late");
  } catch {
    releaseAfterSettle = true;
  }
  assert(releaseAfterSettle, "release after settle rejected");
  const released = await ledger.release(SCOPE.projectId, "k-2", "no-charge");
  assert(released.state === "released", "release applies while reserved");
  const releasedReplay = await ledger.release(SCOPE.projectId, "k-2", "again");
  assert(releasedReplay.replayed === true, "repeated release replays");
}

// ── Handler: success with real ingest wiring ──

async function testHandlerSuccess(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "img-key-1");
  const calls = freshCalls();
  let stores = 0;
  let variants = 0;
  // Real ingest wiring with fake store/variant/edge sinks.
  const { ingestGeneratedImage: realIngest } = await import("../image-ingest");
  const wired = createOpenAIImageHandler({
    ledger,
    generateImage: async () => ({ outputs: [{ b64: PNG_1X1_B64 }] }),
    download: async () => { throw new Error("must not download for b64 outputs"); },
    ingest: (scope, input) => realIngest(scope, input, {
      storeBytes: async (stored) => { stores += 1; return { objectKey: `projects/p/objects/${stored.filename}` }; },
      recordVariant: async (_scope, variant) => { variants += 1; return { ...variant, id: "variant-1", createdAt: new Date().toISOString(), immutable: true as const }; },
      recordEdge: async (_scope, edge) => ({ ...edge, id: "edge-1", createdAt: new Date().toISOString(), immutable: true as const }),
    }),
  });
  const result = await wired.execute({ job: makeJob(payloadFor("img-key-1")), ctx: makeCtx(calls) });
  assert(result.ok === true, "success path completes");
  if (result.ok) {
    const data = result.result as Record<string, unknown>;
    assert(Array.isArray(data.assets) && (data.assets as unknown[]).length === 1, "one billed output ingested");
    assert(data.overDelivered === false && data.recovered === false, "result flags honest");
    assert(typeof data.evidenceHash === "string", "evidence hash attributed");
  }
  assert(stores === 1 && variants === 1, "bytes stored once with one immutable variant");
  assert(calls.marks.length === 1 && calls.marks[0]?.startsWith("openai-img:"), "dispatch marker recorded before send");
  const reservation = await ledger.get(SCOPE.projectId, "img-key-1");
  assert(reservation?.state === "settled" && reservation.settledCredits === IMAGE_CREDITS_STANDARD, "actuals settled for quoted amount");
}

// ── Handler: pre-send failure releases, never sends blindly ──

async function testHandlerPresendFailure(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "img-key-2");
  let sends = 0;
  const handler = createOpenAIImageHandler({
    ledger,
    generateImage: async () => { sends += 1; throw new Error("OPENAI_SETUP_REQUIRED: no key"); },
    ingest: async () => { throw new Error("must not ingest on pre-send failure"); },
  });
  const result = await handler.execute({ job: makeJob(payloadFor("img-key-2")), ctx: makeCtx(freshCalls()) });
  assert(result.ok === false && result.retryable === false, "pre-send failure is terminal, not retried");
  const reservation = await ledger.get(SCOPE.projectId, "img-key-2");
  assert(reservation?.state === "released", "pre-send failure releases the reservation");
  assert(sends === 1, "send attempted once and classified");
}

// ── Handler: post-send uncertainty retains liability ──

async function testHandlerPostSendUncertain(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "img-key-3");
  const calls = freshCalls();
  const handler = createOpenAIImageHandler({
    ledger,
    generateImage: async () => { throw new Error("OPENAI_SEND_UNCERTAIN: timeout after 120s"); },
    ingest: async () => { throw new Error("must not ingest on uncertain send"); },
  });
  let indeterminate = false;
  try {
    await handler.execute({ job: makeJob(payloadFor("img-key-3")), ctx: makeCtx(calls) });
  } catch (error) {
    indeterminate = error instanceof PostDispatchUncertainError;
  }
  assert(indeterminate, "post-send timeout becomes indeterminate, never blind retry or false failure");
  const reservation = await ledger.get(SCOPE.projectId, "img-key-3");
  assert(reservation?.state === "reserved", "uncertain effect retains reservation liability");
  assert(calls.marks.length === 1, "marker exists so reclaim cannot resend");
}

// ── Handler: recovery replay (kill/restart after ingest) ──

async function testHandlerRecoveryReplay(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "img-key-4");
  let sends = 0;
  const handler = createOpenAIImageHandler({
    ledger,
    generateImage: async () => { sends += 1; return { outputs: [{ b64: PNG_1X1_B64 }] }; },
    ingest: async () => ({ assetId: "asset-1", variantId: "variant-1", objectKey: "k", contentHash: "c".repeat(64), byteSize: 100, mimeType: "image/png", width: 1, height: 1, lockId: "lock-1" }),
    findIngest: async () => ({ assetId: "asset-1", objectKey: "k", contentHash: "c".repeat(64) }),
  });
  const first = await handler.execute({ job: makeJob(payloadFor("img-key-4")), ctx: makeCtx(freshCalls()) });
  assert(first.ok === true && sends === 1, "first attempt sends once");
  // Reclaim after kill/restart: marker present, output durable.
  const second = await handler.execute({
    job: makeJob(payloadFor("img-key-4"), { providerOperationKey: "openai-img:job-test-1", attemptCount: 2 }),
    ctx: makeCtx(freshCalls()),
  });
  assert(second.ok === true && sends === 1, "reclaim never re-sends");
  if (second.ok) assert((second.result as Record<string, unknown>).recovered === true, "reclaim reports recovery");
  const reservation = await ledger.get(SCOPE.projectId, "img-key-4");
  assert(reservation?.state === "settled", "recovery settles idempotently");
}

// ── Handler: kill/restart with no output means indeterminate ──

async function testHandlerRecoveryNoOutput(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "img-key-5");
  let sends = 0;
  const handler = createOpenAIImageHandler({
    ledger,
    generateImage: async () => { sends += 1; return { outputs: [{ b64: PNG_1X1_B64 }] }; },
    findIngest: async () => null,
  });
  let indeterminate = false;
  try {
    await handler.execute({
      job: makeJob(payloadFor("img-key-5"), { providerOperationKey: "openai-img:job-test-1", attemptCount: 2 }),
      ctx: makeCtx(freshCalls()),
    });
  } catch (error) {
    indeterminate = error instanceof PostDispatchUncertainError;
  }
  assert(indeterminate && sends === 0, "sent-before with no output is indeterminate without resend");
}

// ── Handler: download failure is bounded-retryable, liability retained ──

async function testHandlerDownloadFailure(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "img-key-6");
  const handler = createOpenAIImageHandler({
    ledger,
    generateImage: async () => ({ outputs: [{ url: "https://provider.example/img.png" }] }),
    download: async () => { throw new Error("OPENAI_DOWNLOAD_FAILED: socket hangup"); },
    ingest: async () => { throw new Error("must not ingest without bytes"); },
  });
  const result = await handler.execute({ job: makeJob(payloadFor("img-key-6")), ctx: makeCtx(freshCalls()) });
  assert(result.ok === false && result.retryable === true, "download failure retries bounded, reclaim converts to indeterminate via marker");
  const reservation = await ledger.get(SCOPE.projectId, "img-key-6");
  assert(reservation?.state === "reserved", "download failure retains liability");
}

// ── Handler: partial/over batch ingests everything ──

async function testHandlerPartialBatch(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "img-key-7");
  let ingests = 0;
  const handler = createOpenAIImageHandler({
    ledger,
    generateImage: async () => ({ outputs: [{ b64: PNG_1X1_B64 }, { b64: PNG_1X1_B64 }] }),
    ingest: async () => {
      ingests += 1;
      return { assetId: `asset-${ingests}`, variantId: "v", objectKey: "k", contentHash: "c".repeat(64), byteSize: 100, mimeType: "image/png", width: 1, height: 1, lockId: "l" };
    },
  });
  const result = await handler.execute({ job: makeJob(payloadFor("img-key-7")), ctx: makeCtx(freshCalls()) });
  assert(result.ok === true && ingests === 2, "every billed output ingested, none discarded");
  if (result.ok) assert((result.result as Record<string, unknown>).overDelivered === true, "over-delivery flagged in result");
  const reservation = await ledger.get(SCOPE.projectId, "img-key-7");
  assert(reservation?.state === "settled" && reservation.settledCredits === IMAGE_CREDITS_STANDARD, "settles quoted while absorbing over-delivery");
}

// ── Handler: event/finalization interruption never blocks truth ──

async function testHandlerEventInterruption(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "img-key-8");
  const handler = createOpenAIImageHandler({
    ledger,
    generateImage: async () => ({ outputs: [{ b64: PNG_1X1_B64 }] }),
    ingest: async () => ({ assetId: "asset-8", variantId: "v", objectKey: "k", contentHash: "c".repeat(64), byteSize: 100, mimeType: "image/png", width: 1, height: 1, lockId: "l" }),
  });
  const result = await handler.execute({
    job: makeJob(payloadFor("img-key-8")),
    ctx: makeCtx(freshCalls(), { appendEvent: async () => { throw new Error("event store down"); }, heartbeat: async () => { throw new Error("lease store down"); } }),
  });
  assert(result.ok === true, "event/heartbeat outage does not corrupt the execution outcome");
}

// ── Handler: empty outputs, missing reservation ──

async function testHandlerGuards(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "img-key-9");
  let sends = 0;
  const empty = createOpenAIImageHandler({
    ledger,
    generateImage: async () => { sends += 1; return { outputs: [] }; },
  });
  let indeterminate = false;
  try {
    await empty.execute({ job: makeJob(payloadFor("img-key-9")), ctx: makeCtx(freshCalls()) });
  } catch (error) {
    indeterminate = error instanceof PostDispatchUncertainError;
  }
  assert(indeterminate, "empty provider outputs are uncertain, never success");
  const unreserved = createOpenAIImageHandler({
    ledger,
    generateImage: async () => { sends += 1; return { outputs: [{ b64: PNG_1X1_B64 }] }; },
  });
  const denied = await unreserved.execute({ job: makeJob(payloadFor("img-missing")), ctx: makeCtx(freshCalls()) });
  assert(denied.ok === false && sends === 1, "missing reservation blocks provider send");
}

// ── Duplicate command: one logical execution ──

async function testDuplicateCommand(): Promise<void> {
  const service = new DurableJobService({ repository: new InMemoryJobRepository() });
  const input = {
    organizationId: SCOPE.organizationId, projectId: SCOPE.projectId,
    idempotencyKey: "img-dup-key",
    payload: { kind: "openai-image", prompt: "x", actorId: SCOPE.actorId, reservationKey: "img-dup-key", quotedCredits: 6, pricingVersionId: PRICING.id },
  };
  const first = await service.createJob(input);
  const second = await service.createJob(input);
  assert(first.id === second.id, "duplicate command returns the same durable job");
  const found = await service.findByIdempotencyKey({ projectId: SCOPE.projectId }, "img-dup-key");
  assert(found?.id === first.id, "idempotency lookup resolves the single execution");
}

async function main(): Promise<void> {
  testContract();
  await testLedger();
  await testHandlerSuccess();
  await testHandlerPresendFailure();
  await testHandlerPostSendUncertain();
  await testHandlerRecoveryReplay();
  await testHandlerRecoveryNoOutput();
  await testHandlerDownloadFailure();
  await testHandlerPartialBatch();
  await testHandlerEventInterruption();
  await testHandlerGuards();
  await testDuplicateCommand();
  console.log(`stu-21 image durable tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
