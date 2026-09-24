/**
 * STU-22 — Video/I2V delivery + recovery tests (Job 04).
 * Run with: pnpm validate:studio-video-delivery
 *
 * Deterministic failure injection over the canonical video path with fake
 * fal/storage/ledger seams — no network, no DB:
 * capability qualification, routing receipts, quote/admit, container
 * validation, handler success, acked/unacked submit crash, duplicate and
 * out-of-order inbox, polling errors, deadline expiry, missing reference,
 * wrong modality/model, cancel false/timeout, late success after cancel,
 * expired result URL, slow ingest/lease loss, restart durability, duration
 * and dimensions, tenant scoping, takes, duplicate commands.
 */

import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { InMemoryJobRepository } from "@ethen/ai/platform/jobs/in-memory-repository";
import type { JobRecord } from "@ethen/ai/platform/jobs/index";
import { CancellationRequestedError, PostDispatchUncertainError } from "@ethen/ai/platform/worker/types";
import {
  admitVideoQuote,
  qualifyVideoCapability,
  quoteVideoCommand,
  resolveVideoRoute,
  validateVideoCommand,
  VIDEO_FLAT_CREDITS,
} from "../video-capability";
import { validateVideoBytes } from "../video-validation";
import { MemoryImageCreditLedger } from "../image-settlement";
import { MemoryStudioRepository } from "../persistence/studio-repository";
import { recordVideoTake, listVideoTakes } from "../takes";
import { createFalVideoHandler } from "../worker/fal-video-handler";
import { applyProviderCallback, verifyCallbackSignature } from "../video-inbox";
import { setupRequiredError } from "../errors";

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

const PRICING = { id: "b2000000-0000-4000-8000-000000000002", version: "v1", flatCredits: VIDEO_FLAT_CREDITS };
const SCOPE = { organizationId: "user:actor-a", projectId: "22222222-2222-4222-8222-222222222222", actorId: "actor-a" };
const SCOPE_B = { organizationId: "user:actor-b", projectId: "33333333-3333-4333-8333-333333333333", actorId: "actor-b" };
const RECEIPT = { providerId: "fal" as const, modelId: "fal-ai/wan-i2v" as const, adapterVersion: "2026-08-02" as const, capability: "image-to-video" as const };

function makeJob(payload: Record<string, unknown>, overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "vjob-test-1", organizationId: SCOPE.organizationId, projectId: SCOPE.projectId,
    queueName: "default", payload, idempotencyKey: "vid-key-1", status: "claimed",
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
function freshCalls(): CtxCalls { return { marks: [], heartbeats: 0, events: [] }; }
function makeCtx(calls: CtxCalls, overrides: Record<string, unknown> = {}): never {
  return {
    jobId: "vjob-test-1", workerId: "worker-1",
    heartbeat: async () => { calls.heartbeats += 1; },
    markProviderDispatched: async (key: string) => { calls.marks.push(key); },
    appendEvent: async (event: string, detail: unknown) => { calls.events.push({ event, detail }); },
    isCancellationRequested: async () => false,
    isAborted: () => false,
    wait: async () => {},
    ...overrides,
  } as never;
}

function payloadFor(key: string): Record<string, unknown> {
  return {
    kind: "fal-video", mediaJobId: "media-1", providerId: "fal", modelId: "fal-ai/wan-i2v",
    prompt: "a lighthouse at dawn", imageUrl: "https://example.com/ref.png", resolution: "480p",
    actorId: SCOPE.actorId, reservationKey: key, quotedCredits: VIDEO_FLAT_CREDITS,
    pricingVersionId: PRICING.id, receipt: { ...RECEIPT }, referenceRole: "i2v-reference",
  };
}

async function reserveFor(ledger: MemoryImageCreditLedger, key: string): Promise<void> {
  await ledger.reserve({
    organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, jobId: "vjob-test-1", actorId: SCOPE.actorId,
    idempotencyKey: key, pricingVersionId: PRICING.id, approvedCeiling: VIDEO_FLAT_CREDITS, reservedCredits: VIDEO_FLAT_CREDITS,
  });
}

/** Minimal well-formed mp4: ftyp + moov/mvhd(v0, timescale 1000, duration 5000) + trak/tkhd(v0, 640x480). */
function craftMp4(duration = 5000, width = 640, height = 480): Uint8Array {
  const parts: number[][] = [];
  const box = (type: string, body: number[]): number[] => {
    const size = 8 + body.length;
    return [(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff,
      type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3), ...body];
  };
  const u32 = (v: number): number[] => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
  parts.push(box("ftyp", [...ascii("isom"), 0, 0, 0, 0, ...ascii("isom")]));
  const mvhdBody = [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(duration)];
  const matrix = new Array(36).fill(0);
  // v0 tkhd body: ver/flags(4) + creation(4) + modification(4) + trackId(4) +
  // reserved(4) + duration(4) + reserved(8) + layer/alt/vol/reserved(2+2+2+2) +
  // matrix(36) + width/height 16.16 fixed point.
  const tkhdBody = [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1), ...u32(0), ...u32(0),
    ...u32(0), ...u32(0), 0, 0, 0, 0, 0, 0, 0, 0, ...matrix, ...u32(width * 65536), ...u32(height * 65536)];
  const trak = box("trak", box("tkhd", tkhdBody));
  parts.push(box("moov", [...box("mvhd", mvhdBody), ...trak]));
  return new Uint8Array(parts.flat());
}

// ── Capability qualification + routing receipts ──

function testCapability(): void {
  assert(qualifyVideoCapability("image-to-video") === "image-to-video", "i2v qualified");
  assert(qualifyVideoCapability("first-frame") === "first-frame", "first-frame qualified as a role");
  let t2v = false;
  try {
    qualifyVideoCapability("text-to-video");
  } catch (error) {
    t2v = error instanceof Error && error.message.includes("DISABLED");
  }
  assert(t2v, "t2v stays disabled, never queued");
  let last = false;
  try {
    qualifyVideoCapability("last-frame");
  } catch (error) {
    last = error instanceof Error && error.message.includes("RESTRICTED");
  }
  assert(last, "last-frame restricted without provider support");
  const ok = validateVideoCommand({ prompt: "  hello  ", capability: "image-to-video", referenceUrl: "https://example.com/r.png" });
  assert(ok.referenceRole === "i2v-reference" && ok.resolution === "480p", "command normalizes with role");
  const first = validateVideoCommand({ prompt: "x", capability: "first-frame", referenceAssetId: "asset-1" });
  assert(first.referenceRole === "first-frame" && first.referenceUrl === null, "first-frame keeps its semantic role");
  for (const bad of [
    { prompt: "", capability: "image-to-video", referenceUrl: "https://example.com/r.png" },
    { prompt: "x", capability: "image-to-video" },
    { prompt: "x", capability: "image-to-video", referenceUrl: "http://insecure/r.png" },
    { prompt: "x", capability: "image-to-video", referenceUrl: "https://example.com/r.png", referenceRole: "first-frame" },
  ]) {
    let threw = false;
    try {
      validateVideoCommand(bad);
    } catch {
      threw = true;
    }
    assert(threw, `invalid command rejected: ${JSON.stringify(bad).slice(0, 60)}`);
  }
  const receipt = resolveVideoRoute({ prompt: "x", capability: "image-to-video" }, { providerId: "fal", modelId: "fal-ai/wan-i2v" });
  assert(receipt.modelId === "fal-ai/wan-i2v", "agreeing receipt resolves");
  let mismatch = false;
  try {
    resolveVideoRoute({ prompt: "x", capability: "image-to-video" }, { providerId: "other", modelId: "other-model" });
  } catch (error) {
    mismatch = error instanceof Error && error.message.includes("VIDEO_ROUTE_MISMATCH");
  }
  assert(mismatch, "router drift fails closed instead of mis-executing");
  const quote = quoteVideoCommand(receipt, PRICING);
  assert(quote.credits === VIDEO_FLAT_CREDITS && quote.pricingVersionId === PRICING.id, "flat quote binds pricing version");
  let noPricing = false;
  try {
    quoteVideoCommand(receipt, null);
  } catch {
    noPricing = true;
  }
  assert(noPricing, "missing pricing fails closed");
  let over = false;
  try {
    admitVideoQuote(quote, quote.credits - 1);
  } catch {
    over = true;
  }
  assert(over, "over-ceiling video admission denied");
}

// ── Container validation ──

function testValidation(): void {
  const report = validateVideoBytes(craftMp4(), "video/mp4");
  assert(report.container === "mp4" && report.brand === "isom", "ftyp brand parsed");
  assert(report.durationSeconds === 5, "mvhd duration parsed");
  assert(report.width === 640 && report.height === 480, "tkhd dimensions parsed");
  assert(report.decodeVerified === false, "decode honestly unverified");
  for (const [label, bytes, mime] of [
    ["empty", new Uint8Array(0), "video/mp4"],
    ["no-ftyp", new Uint8Array([0, 0, 0, 8, 109, 111, 111, 118]), "video/mp4"],
    ["bad-mime", craftMp4(), "video/avi"],
  ] as Array<[string, Uint8Array, string]>) {
    let threw = false;
    try {
      validateVideoBytes(bytes, mime);
    } catch {
      threw = true;
    }
    assert(threw, `invalid bytes rejected: ${label}`);
  }
  const partial = validateVideoBytes(new Uint8Array([...craftMp4().slice(0, 24)]), "video/mp4");
  assert(partial.container === "mp4" && partial.durationSeconds === null, "truncated moov yields unknown duration, not failure");
}

// ── Handler: success with owned output + take + settle ──

async function testHandlerSuccess(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "vid-key-1");
  const repository = new MemoryStudioRepository();
  const calls = freshCalls();
  let stores = 0;
  const mp4 = craftMp4();
  const handler = createFalVideoHandler({
    ledger, repository,
    submit: async () => ({ requestId: "req-1", statusUrl: "", responseUrl: "" }),
    pollStatus: async () => ({ status: "COMPLETED" }),
    fetchResult: async () => ({ videoUrl: "https://fal.media/v.mp4", mimeType: "video/mp4", previewUrl: "https://fal.media/p.jpg" }),
    download: async () => ({ bytes: mp4, contentType: "video/mp4" }),
    storeBytes: async (input) => { stores += 1; return { objectKey: `projects/p/objects/${input.filename}`, signedUrl: "https://signed/x" }; },
  });
  const result = await handler.execute({ job: makeJob(payloadFor("vid-key-1")), ctx: makeCtx(calls) });
  assert(result.ok === true, "success path completes");
  if (result.ok) {
    const data = result.result as Record<string, unknown>;
    assert(typeof data.assetId === "string" && typeof data.takeId === "string" && data.takeNumber === 1, "asset + first take materialized");
    assert(data.durationSeconds === 5 && data.width === 640, "actual duration/dimensions reported");
    assert(data.previewUrl === "https://fal.media/p.jpg", "provider preview captured as proxy reference");
    assert(typeof data.evidenceHash === "string", "evidence attributed");
  }
  assert(stores === 1, "bytes stored once");
  assert(calls.marks.length === 1 && calls.marks[0] === "fal:req-1", "dispatch marker recorded");
  const reservation = await ledger.get(SCOPE.projectId, "vid-key-1");
  assert(reservation?.state === "settled" && reservation.settledCredits === VIDEO_FLAT_CREDITS, "actuals settled");
  const assets = await repository.list(SCOPE, "studio_assets");
  assert(assets.length === 1 && ((assets[0]?.payload as Record<string, unknown>).asset_kind as string) === "video", "owned video asset row persisted");
  const takes = await listVideoTakes(SCOPE, "vjob-test-1", repository);
  assert(takes.length === 1 && takes[0]?.takeNumber === 1, "timeline-ready take recorded");
}

// ── Handler: acked submit crash replays without resend or duplicate ──

async function testHandlerRestartDurability(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "vid-key-2");
  const repository = new MemoryStudioRepository();
  let submits = 0;
  let stores = 0;
  const mp4 = craftMp4();
  const handler = createFalVideoHandler({
    ledger, repository,
    submit: async () => { submits += 1; return { requestId: "req-2", statusUrl: "", responseUrl: "" }; },
    pollStatus: async () => ({ status: "COMPLETED" }),
    fetchResult: async () => ({ videoUrl: "https://fal.media/v.mp4", mimeType: "video/mp4" }),
    download: async () => ({ bytes: mp4, contentType: "video/mp4" }),
    storeBytes: async (input) => { stores += 1; return { objectKey: `projects/p/objects/${input.filename}`, signedUrl: "https://signed/x" }; },
  });
  const first = await handler.execute({ job: makeJob(payloadFor("vid-key-2")), ctx: makeCtx(freshCalls()) });
  assert(first.ok === true && submits === 1, "first attempt submits once");
  // Kill/restart after ack: marker present, output durable.
  const second = await handler.execute({
    job: makeJob(payloadFor("vid-key-2"), { providerOperationKey: "fal:req-2", attemptCount: 2 }),
    ctx: makeCtx(freshCalls()),
  });
  assert(second.ok === true && submits === 1, "reclaim never re-submits");
  assert(stores === 2, "reclaim re-runs ingest through idempotent keys");
  const assets = await repository.list(SCOPE, "studio_assets");
  assert(assets.length === 1, "no duplicate asset on restart");
  const takes = await listVideoTakes(SCOPE, "vjob-test-1", repository);
  assert(takes.length === 1, "no duplicate take on restart");
  const reservation = await ledger.get(SCOPE.projectId, "vid-key-2");
  assert(reservation?.state === "settled", "recovery settles idempotently");
}

// ── Handler: unacked submit crash retains liability ──

async function testHandlerUnackedSubmit(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "vid-key-3");
  const handler = createFalVideoHandler({
    ledger,
    submit: async () => { throw new Error("FAL_DISPATCH_UNCERTAIN: submit transport failed: socket hangup"); },
  });
  let indeterminate = false;
  try {
    await handler.execute({ job: makeJob(payloadFor("vid-key-3")), ctx: makeCtx(freshCalls()) });
  } catch (error) {
    indeterminate = error instanceof PostDispatchUncertainError;
  }
  assert(indeterminate, "unacknowledged submit becomes indeterminate");
  const reservation = await ledger.get(SCOPE.projectId, "vid-key-3");
  assert(reservation?.state === "reserved", "unacked submit retains liability");
}

// ── Handler: pre-send validation failure releases ──

async function testHandlerPresendFailure(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  await reserveFor(ledger, "vid-key-4");
  let submits = 0;
  const handler = createFalVideoHandler({
    ledger,
    submit: async () => { submits += 1; throw setupRequiredError("FAL_KEY is not configured"); },
  });
  const result = await handler.execute({ job: makeJob(payloadFor("vid-key-4")), ctx: makeCtx(freshCalls()) });
  assert(result.ok === false && result.retryable === false, "setup failure is terminal");
  const reservation = await ledger.get(SCOPE.projectId, "vid-key-4");
  assert(reservation?.state === "released" && submits === 1, "pre-send failure releases");
}

// ── Inbox: duplicate + out-of-order collapse, late success attribution ──

async function testInbox(): Promise<void> {
  const seen = new Set<string>();
  const events: unknown[] = [];
  const deps = {
    findJobByOperationKey: async (key: string) => key === "fal:req-9"
      ? { id: "vjob-9", project_id: SCOPE.projectId, status: "running", organization_id: SCOPE.organizationId }
      : null,
    recordCallback: async (row: { provider_id: string; request_id: string; status: string; verified: boolean }) => {
      const key = `${row.provider_id}:${row.request_id}:${row.status}:${row.verified}`;
      if (seen.has(key)) return { duplicate: true };
      seen.add(key);
      return { duplicate: false };
    },
    appendJobEvent: async (_jobId: string, _detail: Record<string, unknown>) => { events.push(_detail); },
  };
  const first = await applyProviderCallback({ providerId: "fal", requestId: "req-9", status: "COMPLETED" }, deps);
  assert(first.matched === true && first.duplicate === false && first.terminalUnchanged === true, "first delivery matches without terminalizing");
  const dup = await applyProviderCallback({ providerId: "fal", requestId: "req-9", status: "COMPLETED" }, deps);
  assert(dup.duplicate === true && dup.terminalUnchanged === true, "duplicate delivery collapses");
  const ooo = await applyProviderCallback({ providerId: "fal", requestId: "req-9", status: "IN_PROGRESS" }, deps);
  assert(ooo.matched === true && ooo.duplicate === false, "out-of-order delivery recorded, never reorders truth");
  assert(events.length === 3, "every delivery leaves one durable event");
  const missed = await applyProviderCallback({ providerId: "fal", requestId: "req-unknown", status: "COMPLETED" }, deps);
  assert(missed.matched === false, "unknown request id matches nothing");
  const cancelledDeps = {
    ...deps,
    findJobByOperationKey: async () => ({ id: "vjob-10", project_id: SCOPE.projectId, status: "cancelled", organization_id: SCOPE.organizationId }),
  };
  const late = await applyProviderCallback({ providerId: "fal", requestId: "req-10", status: "COMPLETED" }, cancelledDeps);
  assert(late.lateSuccessAfterCancel === true && late.terminalUnchanged === true, "late success after cancel attributed without touching output");
  assert(verifyCallbackSignature("body", null, undefined) === false, "unconfigured secret never verifies");
  assert(verifyCallbackSignature("body", "00", "secret") === false, "wrong signature rejected");
}

// ── Handler: polling errors, deadline, guards, cancel truth, expiry, lease loss ──

async function testHandlerPollMatrix(): Promise<void> {
  // Transient UNKNOWN tolerated, then success.
  {
    const ledger = new MemoryImageCreditLedger();
    await reserveFor(ledger, "vid-key-10");
    const repository = new MemoryStudioRepository();
    let polls = 0;
    const mp4 = craftMp4();
    const handler = createFalVideoHandler({
      ledger, repository, pollIntervalMs: 1,
      submit: async () => ({ requestId: "req-10", statusUrl: "", responseUrl: "" }),
      pollStatus: async () => { polls += 1; return polls < 3 ? { status: "UNKNOWN" } : { status: "COMPLETED" }; },
      fetchResult: async () => ({ videoUrl: "https://fal.media/v.mp4", mimeType: "video/mp4" }),
      download: async () => ({ bytes: mp4, contentType: "video/mp4" }),
      storeBytes: async (input) => ({ objectKey: `k/${input.filename}`, signedUrl: "https://signed/x" }),
    });
    const result = await handler.execute({ job: makeJob(payloadFor("vid-key-10")), ctx: makeCtx(freshCalls()) });
    assert(result.ok === true && polls === 3, "transient polling errors tolerated via heartbeat");
  }
  // Terminal provider failure.
  {
    const ledger = new MemoryImageCreditLedger();
    await reserveFor(ledger, "vid-key-11");
    const handler = createFalVideoHandler({
      ledger, pollIntervalMs: 1,
      submit: async () => ({ requestId: "req-11", statusUrl: "", responseUrl: "" }),
      pollStatus: async () => ({ status: "FAILED", error: "nsfw" }),
    });
    const result = await handler.execute({ job: makeJob(payloadFor("vid-key-11")), ctx: makeCtx(freshCalls()) });
    assert(result.ok === false && result.retryable === false, "terminal provider failure fails closed");
  }
  // UNKNOWN with error content.
  {
    const ledger = new MemoryImageCreditLedger();
    await reserveFor(ledger, "vid-key-12");
    const handler = createFalVideoHandler({
      ledger, pollIntervalMs: 1,
      submit: async () => ({ requestId: "req-12", statusUrl: "", responseUrl: "" }),
      pollStatus: async () => ({ status: "UNKNOWN", error: "queue lost it" }),
    });
    let indeterminate = false;
    try {
      await handler.execute({ job: makeJob(payloadFor("vid-key-12")), ctx: makeCtx(freshCalls()) });
    } catch (error) {
      indeterminate = error instanceof PostDispatchUncertainError;
    }
    assert(indeterminate, "unknown-with-error goes indeterminate");
  }
  // Deadline expiry is bounded and retryable.
  {
    const ledger = new MemoryImageCreditLedger();
    await reserveFor(ledger, "vid-key-13");
    const handler = createFalVideoHandler({
      ledger, pollIntervalMs: 1, deadlineMs: 5,
      submit: async () => ({ requestId: "req-13", statusUrl: "", responseUrl: "" }),
      pollStatus: async () => ({ status: "IN_PROGRESS" }),
    });
    const result = await handler.execute({ job: makeJob(payloadFor("vid-key-13")), ctx: makeCtx(freshCalls()) });
    assert(result.ok === false && result.retryable === true, "deadline expiry bounded, reclaim continues on same id");
  }
  // Missing reference releases.
  {
    const ledger = new MemoryImageCreditLedger();
    await reserveFor(ledger, "vid-key-14");
    const handler = createFalVideoHandler({ ledger });
    const payload = payloadFor("vid-key-14");
    delete payload.imageUrl;
    const result = await handler.execute({ job: makeJob(payload), ctx: makeCtx(freshCalls()) });
    assert(result.ok === false, "missing reference fails closed");
    const reservation = await ledger.get(SCOPE.projectId, "vid-key-14");
    assert(reservation?.state === "released", "missing reference releases");
  }
  // Wrong model vs receipt.
  {
    const ledger = new MemoryImageCreditLedger();
    await reserveFor(ledger, "vid-key-15");
    const handler = createFalVideoHandler({ ledger });
    const payload = { ...payloadFor("vid-key-15"), modelId: "other-model" };
    const result = await handler.execute({ job: makeJob(payload), ctx: makeCtx(freshCalls()) });
    assert(result.ok === false, "payload/receipt drift fails closed");
  }
}

// ── Handler: cancellation truth ──

async function testHandlerCancel(): Promise<void> {
  // Cancel requested, upstream confirms false but intent still wins.
  {
    const ledger = new MemoryImageCreditLedger();
    await reserveFor(ledger, "vid-key-20");
    const calls = freshCalls();
    let cancelled = 0;
    const handler = createFalVideoHandler({
      ledger, pollIntervalMs: 1,
      submit: async () => ({ requestId: "req-20", statusUrl: "", responseUrl: "" }),
      pollStatus: async () => ({ status: "IN_PROGRESS" }),
      cancel: async () => { cancelled += 1; return false; },
    });
    let threw: unknown = null;
    try {
      await handler.execute({
        job: makeJob(payloadFor("vid-key-20")),
        ctx: makeCtx(calls, { isCancellationRequested: async () => true }),
      });
    } catch (error) {
      threw = error;
    }
    assert(threw instanceof CancellationRequestedError, "cancel intent wins even when upstream is unconfirmed");
    assert(cancelled === 1, "upstream cancel attempted exactly once");
    const detail = (calls.events[0]?.detail ?? {}) as Record<string, unknown>;
    assert(detail.upstreamCancel === false && detail.cancelConfirmed === false, "unconfirmed cancel recorded truthfully");
  }
  // Late COMPLETED after cancel never ingests.
  {
    const ledger = new MemoryImageCreditLedger();
    await reserveFor(ledger, "vid-key-21");
    let stores = 0;
    const handler = createFalVideoHandler({
      ledger, pollIntervalMs: 1,
      submit: async () => ({ requestId: "req-21", statusUrl: "", responseUrl: "" }),
      pollStatus: async () => ({ status: "COMPLETED" }),
      fetchResult: async () => ({ videoUrl: "https://fal.media/v.mp4", mimeType: "video/mp4" }),
      download: async () => ({ bytes: craftMp4(), contentType: "video/mp4" }),
      storeBytes: async () => { stores += 1; return { objectKey: "k", signedUrl: "s" }; },
      cancel: async () => true,
    });
    let threw: unknown = null;
    try {
      await handler.execute({
        job: makeJob(payloadFor("vid-key-21")),
        ctx: makeCtx(freshCalls(), { isCancellationRequested: async () => true }),
      });
    } catch (error) {
      threw = error;
    }
    assert(threw instanceof CancellationRequestedError && stores === 0, "late success after cancel never ingests");
  }
  // Expired result URL is indeterminate, not failure.
  {
    const ledger = new MemoryImageCreditLedger();
    await reserveFor(ledger, "vid-key-22");
    const handler = createFalVideoHandler({
      ledger, pollIntervalMs: 1,
      submit: async () => ({ requestId: "req-22", statusUrl: "", responseUrl: "" }),
      pollStatus: async () => ({ status: "COMPLETED" }),
      fetchResult: async () => ({ videoUrl: "https://fal.media/gone.mp4", mimeType: "video/mp4" }),
      download: async () => {
        const error = new Error("fal result download failed with HTTP 410.") as Error & { httpStatus: number };
        error.httpStatus = 410;
        throw error;
      },
    });
    let indeterminate = false;
    try {
      await handler.execute({ job: makeJob(payloadFor("vid-key-22")), ctx: makeCtx(freshCalls()) });
    } catch (error) {
      indeterminate = error instanceof PostDispatchUncertainError;
    }
    assert(indeterminate, "expired result URL retains liability as indeterminate");
  }
  // Slow ingest with lease loss aborts without completing.
  {
    const ledger = new MemoryImageCreditLedger();
    await reserveFor(ledger, "vid-key-23");
    const handler = createFalVideoHandler({
      ledger, pollIntervalMs: 1,
      submit: async () => ({ requestId: "req-23", statusUrl: "", responseUrl: "" }),
      pollStatus: async () => ({ status: "COMPLETED" }),
      fetchResult: async () => ({ videoUrl: "https://fal.media/v.mp4", mimeType: "video/mp4" }),
      download: async () => ({ bytes: craftMp4(), contentType: "video/mp4" }),
      storeBytes: async (input) => ({ objectKey: `k/${input.filename}`, signedUrl: "s" }),
    });
    let leaseLost = false;
    try {
      await handler.execute({
        job: makeJob(payloadFor("vid-key-23")),
        ctx: makeCtx(freshCalls(), { heartbeat: async () => { throw new Error("lease lost"); } }),
      });
    } catch (error) {
      leaseLost = error instanceof Error && error.message === "lease lost";
    }
    assert(leaseLost, "lease loss during ingest aborts without completing");
    const reservation = await ledger.get(SCOPE.projectId, "vid-key-23");
    assert(reservation?.state === "reserved", "aborted ingest retains liability");
  }
}

// ── Handler: tenant scoping + takes + duplicate commands ──

async function testScopingAndTakes(): Promise<void> {
  const ledger = new MemoryImageCreditLedger();
  // No reservation at all: no send, ever.
  {
    let submits = 0;
    const handler = createFalVideoHandler({
      ledger,
      submit: async () => { submits += 1; return { requestId: "req-x", statusUrl: "", responseUrl: "" }; },
    });
    const result = await handler.execute({ job: makeJob(payloadFor("vid-none")), ctx: makeCtx(freshCalls()) });
    assert(result.ok === false && submits === 0, "missing reservation blocks provider send");
  }
  // Cross-project reservation does not authorize.
  {
    await ledger.reserve({
      organizationId: SCOPE_B.organizationId, projectId: SCOPE_B.projectId, jobId: "vjob-test-1", actorId: SCOPE_B.actorId,
      idempotencyKey: "vid-cross", pricingVersionId: PRICING.id, approvedCeiling: VIDEO_FLAT_CREDITS, reservedCredits: VIDEO_FLAT_CREDITS,
    });
    let submits = 0;
    const handler = createFalVideoHandler({
      ledger,
      submit: async () => { submits += 1; return { requestId: "req-x", statusUrl: "", responseUrl: "" }; },
    });
    const result = await handler.execute({ job: makeJob(payloadFor("vid-cross")), ctx: makeCtx(freshCalls()) });
    assert(result.ok === false && submits === 0, "cross-project reservation does not authorize");
  }
  // Takes number per job and replay the same take.
  {
    const repository = new MemoryStudioRepository();
    const first = await recordVideoTake(SCOPE, { jobId: "vjob-t", assetId: "asset-a", variantId: "v-a" }, repository);
    const second = await recordVideoTake(SCOPE, { jobId: "vjob-t", assetId: "asset-b", variantId: "v-b" }, repository);
    const replay = await recordVideoTake(SCOPE, { jobId: "vjob-t", assetId: "asset-a", variantId: "v-a" }, repository);
    assert(first.takeNumber === 1 && second.takeNumber === 2 && replay.id === first.id, "takes number per job and replay stable");
    const listed = await listVideoTakes(SCOPE, "vjob-t", repository);
    assert(listed.length === 2 && listed[0]?.takeNumber === 1, "takes list oldest-first");
  }
  // Duplicate video command yields one durable job.
  {
    const service = new DurableJobService({ repository: new InMemoryJobRepository() });
    const input = {
      organizationId: SCOPE.organizationId, projectId: SCOPE.projectId,
      idempotencyKey: "vid-dup-key",
      payload: { kind: "fal-video", prompt: "x", imageUrl: "https://example.com/r.png", actorId: SCOPE.actorId, reservationKey: "vid-dup-key", quotedCredits: 20, pricingVersionId: PRICING.id },
    };
    const first = await service.createJob(input);
    const second = await service.createJob(input);
    assert(first.id === second.id, "duplicate video command returns the same durable job");
  }
}

async function main(): Promise<void> {
  testCapability();
  testValidation();
  await testHandlerSuccess();
  await testHandlerRestartDurability();
  await testHandlerUnackedSubmit();
  await testHandlerPresendFailure();
  await testInbox();
  await testHandlerPollMatrix();
  await testHandlerCancel();
  await testScopingAndTakes();
  console.log(`stu-22 video delivery tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
