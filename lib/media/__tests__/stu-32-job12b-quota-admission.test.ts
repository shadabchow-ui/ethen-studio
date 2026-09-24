/**
 * Studio V2 Job 12B (Gate C) — durable quota/concurrency admission proof.
 * Run with: node --conditions=react-server --import tsx lib/media/__tests__/stu-32-job12b-quota-admission.test.ts
 *
 * Proves the canonical admission path enforces durable quotas, using the
 * real command-service core + real worker hooks against memory adapters
 * (durable SQL semantics are proven separately by the migration apply
 * battery). Every assertion below fails if quota is bypassed, double-claimed,
 * or never released.
 */
import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { InMemoryJobRepository } from "@ethen/ai/platform/jobs/in-memory-repository";
import type { JobRecord } from "@ethen/ai/platform/jobs/index";
import { enqueueWithReservation } from "../command-service";
import { MemoryImageCreditLedger } from "../image-settlement";
import { MemoryStudioQuotaService } from "../durable-quota";
import { createOpenAIImageHandler } from "../worker/openai-image-handler";
import { classifyError } from "../errors";

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

const SCOPE = { organizationId: "user:actor-a", projectId: "12121212-1212-4121-8121-121212121212", actorId: "actor-a" };
const PNG_1X1_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function adapters(policy = { maxConcurrentJobs: 10, dailyCredits: 1000, enforced: true }) {
  const quota = new MemoryStudioQuotaService();
  quota.setPolicy(SCOPE.projectId, policy);
  return {
    ledger: new MemoryImageCreditLedger(),
    service: new DurableJobService({ repository: new InMemoryJobRepository() }),
    quota,
  };
}

function payload(key: string): Record<string, unknown> {
  return {
    kind: "openai-image", prompt: "quota probe", model: "gpt-image-1",
    size: "1024x1024", quality: "standard", actorId: SCOPE.actorId,
    reservationKey: key, quotedCredits: 6, pricingVersionId: "price-12b",
  };
}

async function issue(
  deps: ReturnType<typeof adapters>,
  key: string,
  credits = 6,
  ceiling = 6,
) {
  return enqueueWithReservation({
    scope: SCOPE, actorId: SCOPE.actorId, idempotencyKey: key, payload: payload(key),
    quote: { credits, pricingVersionId: "price-12b" }, approvedCeiling: ceiling,
    ledger: deps.ledger, service: deps.service, quota: deps.quota,
  });
}

function makeCtx(): never {
  return {
    jobId: "job-12b", workerId: "worker-1",
    heartbeat: async () => {},
    markProviderDispatched: async () => {},
    appendEvent: async () => {},
    isCancellationRequested: async () => false,
    isAborted: () => false,
    wait: async () => {},
  } as never;
}

function makeJob(jobPayload: Record<string, unknown>): JobRecord {
  return {
    id: "job-12b", organizationId: SCOPE.organizationId, projectId: SCOPE.projectId,
    queueName: "default", payload: jobPayload, idempotencyKey: "q-12b", status: "claimed",
    priority: 0, maxAttempts: 3, attemptCount: 1, lastError: null, deadLetterAt: null, deadLetterReason: null,
    leaseId: "lease-1", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), claimedBy: "worker-1",
    leaseGeneration: 1, cancellationRequestedAt: null, cancellationReason: null,
    scheduledAt: new Date().toISOString(), backoffBaseSeconds: 30,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    providerDispatchStartedAt: null, providerOperationKey: null,
    escalatedAt: null, escalationReason: null, lastReconciledAt: null, reconcileCount: 0,
  } as JobRecord;
}

// ── Happy path: claim held alongside the reservation ──

async function testClaimHeld(): Promise<void> {
  const deps = adapters();
  const issued = await issue(deps, "q-happy");
  assert(issued.job.status === "queued", "admitted job enqueues");
  assert(issued.reservation.state === "reserved", "admitted spend reserves");
  const counters = deps.quota.peek(SCOPE.projectId);
  assert(counters.concurrentCount === 1, "claim holds one concurrency slot");
  assert(counters.creditsConsumed === 6, "claim consumes the quoted credits once");
}

// ── Denied claim: no surviving enqueue, no reservation ──

async function testDeniedClaimPreventsEnqueue(): Promise<void> {
  const deps = adapters({ maxConcurrentJobs: 1, dailyCredits: 1000, enforced: true });
  await issue(deps, "q-fill");
  let code = "";
  try {
    await issue(deps, "q-denied");
  } catch (error) {
    code = error instanceof Error ? error.message : "";
  }
  assert(code.includes("STUDIO_QUOTA_CONCURRENCY"), "concurrency breach denies with a typed code");
  const denied = await deps.service.findByIdempotencyKey({ projectId: SCOPE.projectId }, "q-denied");
  assert(denied?.status === "cancelled", "denied claim leaves no surviving queued job");
  const reservation = await deps.ledger.get(SCOPE.projectId, "q-denied");
  assert(reservation === null, "denied claim reserves no spend");
  // The surviving admission still holds its slot; the project is not poisoned.
  const counters = deps.quota.peek(SCOPE.projectId);
  assert(counters.concurrentCount === 1, "denied attempt holds no slot");
}

// ── Fail-closed defaults ──

async function testFailClosed(): Promise<void> {
  const deps = adapters();
  const bare = new MemoryStudioQuotaService(); // no policy seeded
  let code = "";
  try {
    await enqueueWithReservation({
      scope: SCOPE, actorId: SCOPE.actorId, idempotencyKey: "q-unconfigured",
      payload: payload("q-unconfigured"), quote: { credits: 6, pricingVersionId: "price-12b" },
      approvedCeiling: 6, ledger: deps.ledger, service: deps.service, quota: bare,
    });
  } catch (error) {
    code = error instanceof Error ? error.message : "";
  }
  assert(code.includes("STUDIO_QUOTA_UNCONFIGURED"), "unconfigured project denies, never admits");
  const job = await deps.service.findByIdempotencyKey({ projectId: SCOPE.projectId }, "q-unconfigured");
  assert(job?.status === "cancelled", "unconfigured denial cancels the queued job");
  void bare;
}

// ── Retries never double-claim ──

async function testRetryNoDoubleClaim(): Promise<void> {
  const deps = adapters();
  const first = await issue(deps, "q-retry");
  assert(first.replayed === false, "first admission is fresh");
  const second = await issue(deps, "q-retry");
  assert(second.replayed === true, "same-key retry replays the reservation");
  assert(second.job.id === first.job.id, "retry resolves the same durable job");
  const counters = deps.quota.peek(SCOPE.projectId);
  assert(counters.concurrentCount === 1, "retry holds no second slot");
  assert(counters.creditsConsumed === 6, "retry consumes no second quote");
}

// ── Same-key races claim exactly once ──

async function testConcurrentRaceClaimsOnce(): Promise<void> {
  const deps = adapters({ maxConcurrentJobs: 10, dailyCredits: 1000, enforced: true });
  const attempts = await Promise.all(
    Array.from({ length: 10 }, () => issue(deps, "q-race").then(
      (issued) => ({ ok: true as const, issued }),
      (error: unknown) => ({ ok: false as const, error }),
    )),
  );
  assert(attempts.every((attempt) => attempt.ok), "same-key race admits without throwing");
  const counters = deps.quota.peek(SCOPE.projectId);
  assert(counters.concurrentCount === 1, "race holds exactly one slot");
  assert(counters.creditsConsumed === 6, "race consumes exactly one quote");
}

// ── Reserve failure releases the claim ──

async function testReserveFailureReleasesClaim(): Promise<void> {
  const deps = adapters();
  let code = "";
  try {
    await issue(deps, "q-ceiling", 6, 1); // quote exceeds the approved ceiling
  } catch (error) {
    code = error instanceof Error ? error.message : "";
  }
  assert(/APPROVAL_REQUIRED/.test(code), "over-ceiling reserve still fails canonically");
  const counters = deps.quota.peek(SCOPE.projectId);
  assert(counters.concurrentCount === 0, "failed reserve frees the concurrency slot");
  assert(counters.creditsConsumed === 0, "failed reserve restores the advisory counter (no spend happened)");
  const job = await deps.service.findByIdempotencyKey({ projectId: SCOPE.projectId }, "q-ceiling");
  assert(job?.status === "cancelled", "failed reserve cancels the queued job");
}

// ── Terminal completion releases concurrency ──

async function testTerminalSettleReleases(): Promise<void> {
  const deps = adapters();
  const issued = await issue(deps, "q-terminal");
  const handler = createOpenAIImageHandler({
    ledger: deps.ledger,
    quota: deps.quota,
    generateImage: async () => ({ outputs: [{ b64: PNG_1X1_B64 }] }),
    ingest: async () => ({ assetId: "asset-1", variantId: "v-1", objectKey: "k", contentHash: "c".repeat(64), byteSize: 100, mimeType: "image/png", width: 1, height: 1, lockId: "l-1" }),
  });
  const result = await handler.execute({ job: makeJob(payload("q-terminal")), ctx: makeCtx() });
  assert(result.ok === true, "handler completes the admitted job");
  const counters = deps.quota.peek(SCOPE.projectId);
  assert(counters.concurrentCount === 0, "terminal settle frees the concurrency slot");
  assert(counters.creditsConsumed === 6, "terminal settle keeps consumed spend");
  const reservation = await deps.ledger.get(SCOPE.projectId, "q-terminal");
  assert(reservation?.state === "settled", "canonical settlement still commits");
  void issued;
}

// ── Pre-send failure releases the reservation AND the slot ──

async function testPresendFailureReleases(): Promise<void> {
  const deps = adapters();
  await issue(deps, "q-presend");
  const handler = createOpenAIImageHandler({
    ledger: deps.ledger,
    quota: deps.quota,
    generateImage: async () => { throw new Error("OPENAI_SETUP_REQUIRED: no key"); },
    ingest: async () => { throw new Error("must not ingest on pre-send failure"); },
  });
  const result = await handler.execute({ job: makeJob(payload("q-presend")), ctx: makeCtx() });
  assert(result.ok === false, "pre-send failure fails terminally");
  const counters = deps.quota.peek(SCOPE.projectId);
  assert(counters.concurrentCount === 0, "pre-send failure frees the concurrency slot");
  const reservation = await deps.ledger.get(SCOPE.projectId, "q-presend");
  assert(reservation?.state === "released", "pre-send failure releases the reservation");
}

// ── Unknown-effect reserve: committed is admitted, never cancelled ──

async function testUnknownEffectReserve(): Promise<void> {
  const deps = adapters();
  // First reserve commits, then the transport fails: the core must re-read
  // and stand by the admission instead of cancelling a reserved job.
  let throws = 1;
  const flaky = new MemoryImageCreditLedger();
  const inner = flaky.reserve.bind(flaky);
  flaky.reserve = (async (input: Parameters<MemoryImageCreditLedger["reserve"]>[0]) => {
    const receipt = await inner(input);
    if (throws > 0 && !receipt.replayed) {
      throws -= 1;
      throw new Error("TRANSPORT_TIMEOUT: response lost after commit");
    }
    return receipt;
  }) as MemoryImageCreditLedger["reserve"];
  const issued = await enqueueWithReservation({
    scope: SCOPE, actorId: SCOPE.actorId, idempotencyKey: "q-unknown",
    payload: payload("q-unknown"), quote: { credits: 6, pricingVersionId: "price-12b" },
    approvedCeiling: 6, ledger: flaky, service: deps.service, quota: deps.quota,
  });
  assert(issued.replayed === true, "unknown-effect commit resolves as an admission, not a failure");
  assert(issued.job.status === "queued", "unknown-effect admission is not cancelled");
  const counters = deps.quota.peek(SCOPE.projectId);
  assert(counters.concurrentCount === 1 && counters.creditsConsumed === 6, "unknown-effect claim held exactly once");
  // A later retry still replays cleanly through the same key.
  const retry = await enqueueWithReservation({
    scope: SCOPE, actorId: SCOPE.actorId, idempotencyKey: "q-unknown",
    payload: payload("q-unknown"), quote: { credits: 6, pricingVersionId: "price-12b" },
    approvedCeiling: 6, ledger: flaky, service: deps.service, quota: deps.quota,
  });
  assert(retry.replayed === true && retry.job.id === issued.job.id, "retry after unknown-effect replays");
  const after = deps.quota.peek(SCOPE.projectId);
  assert(after.concurrentCount === 1 && after.creditsConsumed === 6, "no double-claim after unknown-effect");
}

// ── Memory adapter mirrors the SQL guards ──

async function testMemoryAdapterGuards(): Promise<void> {
  const quota = new MemoryStudioQuotaService();
  const project = "13131313-1313-4131-8131-131313131313";
  let code = "";
  try {
    await quota.claim(project, 1);
  } catch (error) {
    code = error instanceof Error ? error.message : "";
  }
  assert(code.includes("STUDIO_QUOTA_UNCONFIGURED"), "memory adapter denies unconfigured projects");
  quota.setPolicy(project, { maxConcurrentJobs: 1, dailyCredits: 5, enforced: false });
  code = "";
  try {
    await quota.claim(project, 1);
  } catch (error) {
    code = error instanceof Error ? error.message : "";
  }
  assert(code.includes("STUDIO_QUOTA_DISABLED"), "memory adapter denies disabled enforcement");
  quota.setPolicy(project, { maxConcurrentJobs: 1, dailyCredits: 5, enforced: true });
  await quota.claim(project, 5);
  code = "";
  try {
    await quota.claim(project, 1);
  } catch (error) {
    code = error instanceof Error ? error.message : "";
  }
  assert(code.includes("STUDIO_QUOTA_"), "memory adapter denies over-limit claims");
  await quota.release(project);
  const counters = quota.peek(project);
  assert(counters.concurrentCount === 0 && counters.creditsConsumed === 5, "release frees concurrency, spend stays consumed");
  await quota.release(project);
  assert(quota.peek(project).concurrentCount === 0, "release clamps at zero, never negative");
  const dup = "14141414-1414-4141-8141-141414141414";
  quota.setPolicy(dup, { maxConcurrentJobs: 2, dailyCredits: 100, enforced: true });
  await quota.claim(dup, 7);
  await quota.releaseDuplicate(dup, 7);
  const rolled = quota.peek(dup);
  assert(rolled.concurrentCount === 0 && rolled.creditsConsumed === 0, "duplicate rollback restores slot and advisory counter");
  await quota.releaseDuplicate(dup, 500);
  assert(quota.peek(dup).creditsConsumed === 0, "duplicate rollback clamps at zero, never negative");
}

// ── Denials surface as 429, never provider failures ──

async function testDenialMapping(): Promise<void> {
  const classified = classifyError(new Error("STUDIO_QUOTA_CONCURRENCY: too many concurrent Studio jobs for this project."));
  assert(classified.statusCode === 429, "quota denials classify as 429 rate limits");
}

async function main(): Promise<void> {
  await testClaimHeld();
  await testDeniedClaimPreventsEnqueue();
  await testFailClosed();
  await testRetryNoDoubleClaim();
  await testConcurrentRaceClaimsOnce();
  await testReserveFailureReleasesClaim();
  await testUnknownEffectReserve();
  await testTerminalSettleReleases();
  await testPresendFailureReleases();
  await testMemoryAdapterGuards();
  await testDenialMapping();
  console.log(`stu-32 job12b quota admission tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
