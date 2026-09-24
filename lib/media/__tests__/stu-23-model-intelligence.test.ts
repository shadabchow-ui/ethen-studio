/**
 * STU-23 — Model intelligence + evaluation + bounded repair (Job 05).
 * Run with: pnpm validate:studio-model-intelligence
 *
 * Pure plus memory-backed checks, no network, no DB:
 * shared catalog resolution, health cold-start and computation, ranking
 * determinism and unknown handling, labeled-fixture false accept/reject,
 * subjective human gating, locked-attribute evaluation, repair stop
 * conditions, repair execution with idempotent attempts, receipt
 * reproducibility.
 */

import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { InMemoryJobRepository } from "@ethen/ai/platform/jobs/in-memory-repository";
import { projectCapability, resolveCatalogId } from "../model-catalog";
import { computeHealth } from "../provider-health";
import { rankRoutes } from "../routing";
import {
  RUBRIC_SUBJECTIVE_V1,
  runPreservationTools,
  runTechnicalTools,
} from "../eval-rubrics";
import { evaluateOutput } from "../evaluation-service";
import { executeRepairAttempt, planRepairAttempt, type RepairEvidence } from "../repair";
import { MemoryStudioQuotaService } from "../durable-quota";
import { MemoryImageCreditLedger } from "../image-settlement";
import { MemoryStudioRepository } from "../persistence/studio-repository";

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

const SCOPE = { organizationId: "user:actor-a", projectId: "44444444-4444-4444-8444-444444444444", actorId: "actor-a" };
const HASH = "a".repeat(64);

// ── Shared catalog ──

function testCatalog(): void {
  const direct = resolveCatalogId({ providerId: "openai", modelId: "gpt-image-1" });
  assert(direct.known === true && direct.known && direct.ref.catalogId === "openai/gpt-image-1", "provider/model resolves to shared id");
  const media = resolveCatalogId({ mediaModelId: "fal-ai/wan-i2v" });
  assert(media.known === true, "legacy media id maps");
  const stale = resolveCatalogId({ studioCardId: "openai-image-standard" });
  assert(stale.known === false, "stale display copy stays unmapped, never ranked");
  const unknown = resolveCatalogId({ providerId: "midjourney", modelId: "v6" });
  assert(unknown.known === false && !("ref" in unknown) && unknown.reason.length > 0, "unmeasured route resolves unknown with reason");
  assert(projectCapability("text-to-image").length === 1, "image capability projects one route");
  assert(projectCapability("text-to-video").length === 0, "unqualified capability projects nothing");
}

// ── Health: cold start, computation, honesty ──

function testHealth(): void {
  const cold = computeHealth("openai", "gpt-image-1", "text-to-image", [], { nowMs: Date.now() });
  assert(cold.sampleSize === 0 && cold.confidence === "unknown" && cold.successRate === null, "cold start reports unknown, never zero-as-data");
  assert(cold.unknownFields.length > 1 && cold.fresh === false, "unknown fields listed, freshness false");
  const warm = computeHealth("fal", "fal-ai/wan-i2v", "image-to-video", [
    { jobId: "j1", status: "completed", accepted: true, settledCredits: 20, repairAttempts: 0, updatedAt: new Date(Date.now() - 1000).toISOString() },
    { jobId: "j2", status: "completed", accepted: false, settledCredits: 0, repairAttempts: 1, updatedAt: new Date(Date.now() - 2000).toISOString() },
    { jobId: "j3", status: "failed", accepted: false, settledCredits: 0, repairAttempts: 0, updatedAt: new Date(Date.now() - 3000).toISOString() },
  ], { nowMs: Date.now() });
  assert(warm.successRate !== null && Math.abs((warm.successRate as number) - 2 / 3) < 1e-9, "success rate measured");
  assert(warm.acceptanceRate !== null && Math.abs((warm.acceptanceRate as number) - 1 / 2) < 1e-9, "acceptance rate measured over completions");
  assert(warm.latencyMsP50 === null, "latency stays unknown without a timing source");
  assert(warm.confidence === "low" && warm.fresh === true, "small sample is low confidence but fresh");
  const stale = computeHealth("fal", "fal-ai/wan-i2v", "image-to-video", [
    { jobId: "j1", status: "completed", accepted: true, settledCredits: 20, repairAttempts: 0, updatedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  ], { nowMs: Date.now() });
  assert(stale.fresh === false, "old samples marked stale, never silently fresh");
}

// ── Ranking: determinism, unknowns, cold start, reproducibility ──

function testRanking(): void {
  const quotes = { "openai/gpt-image-1": { credits: 6, pricingVersionId: "a1000000-0000-4000-8000-000000000001" } };
  const cold = rankRoutes({ capability: "text-to-image", quotes, health: {} });
  assert(cold.winner === "openai/gpt-image-1", "sole qualified route wins on cold start");
  assert(cold.receipt.confidence === "unknown", "cold-start win is explicitly unknown confidence");
  assert(cold.candidates[0]?.total === null && (cold.candidates[0]?.unknownFields.length ?? 0) > 0, "no fabricated totals on cold start");
  const again = rankRoutes({ capability: "text-to-image", quotes, health: {} });
  assert(again.receipt.inputsHash === cold.receipt.inputsHash, "receipt reproducible from inputs");
  const richer = rankRoutes({
    capability: "text-to-image", quotes,
    health: {
      "openai/gpt-image-1": computeHealth("openai", "gpt-image-1", "text-to-image", [
        { jobId: "j1", status: "completed", accepted: true, settledCredits: 6, repairAttempts: 0, updatedAt: new Date().toISOString() },
      ]),
    },
  });
  assert(richer.receipt.inputsHash !== cold.receipt.inputsHash, "measured inputs change the receipt");
  const empty = rankRoutes({ capability: "text-to-video", quotes: {}, health: {} });
  assert(empty.winner === null && empty.unranked.length === 1, "unqualified capability ranks nothing with reason");
}

// ── Labeled fixtures: false accept / false reject ──

interface LabeledCase {
  label: string;
  expected: "pass" | "needs-review" | "fail";
  input: Parameters<typeof evaluateOutput>[0];
}

const LABELED: LabeledCase[] = [
  {
    label: "clean deterministic re-check passes",
    expected: "pass",
    input: {
      jobId: "job-pass", kind: "image", requested: { size: "1024x1024" },
      actual: { assetId: "a1", contentHash: HASH, width: 1024, height: 1024 },
      locks: [{ entityKind: "asset", entityId: "a1", entityRevision: 1, payloadHash: HASH, currentDigest: HASH }],
      noSubjectiveDimension: true,
    },
  },
  {
    label: "fresh creative output needs review",
    expected: "needs-review",
    input: {
      jobId: "job-review", kind: "image", requested: { size: "1024x1024" },
      actual: { assetId: "a2", contentHash: HASH, width: 1024, height: 1024 },
      locks: [],
    },
  },
  {
    label: "dimension mismatch fails",
    expected: "fail",
    input: {
      jobId: "job-dims", kind: "image", requested: { size: "1024x1024" },
      actual: { assetId: "a3", contentHash: HASH, width: 1536, height: 1024 },
      locks: [],
    },
  },
  {
    label: "missing hash fails",
    expected: "fail",
    input: {
      jobId: "job-hash", kind: "video", requested: {},
      actual: { assetId: "a4", contentHash: null, width: 640, height: 480, durationSeconds: 5 },
      locks: [],
    },
  },
  {
    label: "broken lock fails and is not auto-repairable",
    expected: "fail",
    input: {
      jobId: "job-lock", kind: "image", requested: { size: "1024x1024" },
      actual: { assetId: "a5", contentHash: HASH, width: 1024, height: 1024 },
      locks: [{ entityKind: "asset", entityId: "a5", entityRevision: 1, payloadHash: HASH, currentDigest: "b".repeat(64) }],
    },
  },
  {
    label: "unknown dims without subjective dimension stays review, not fail",
    expected: "needs-review",
    input: {
      jobId: "job-unk", kind: "video", requested: {},
      actual: { assetId: "a6", contentHash: HASH, width: null, height: null, durationSeconds: 5 },
      locks: [],
    },
  },
];

function testLabeledFixtures(): void {
  let falseAccepts = 0;
  let falseRejects = 0;
  for (const fixture of LABELED) {
    const result = evaluateOutput(fixture.input);
    if (result.verdict !== fixture.expected) {
      if (fixture.expected === "fail") falseRejects += 1;
      else falseAccepts += 1;
      console.error(`  FAIL: fixture "${fixture.label}" -> ${result.verdict}, expected ${fixture.expected}`);
      failed += 1;
    } else {
      passed += 1;
    }
  }
  assert(falseAccepts === 0 && falseRejects === 0, "zero false accepts and zero false rejects on held-out fixtures");
  const lockCase = evaluateOutput(LABELED[4]?.input as Parameters<typeof evaluateOutput>[0]);
  assert(lockCase.defects.every((defect) => defect.autoRepairable === false), "lock defects never auto-repairable");
  assert(RUBRIC_SUBJECTIVE_V1.autoPass === false && RUBRIC_SUBJECTIVE_V1.tools.length === 0, "subjective rubric cannot auto-pass by construction");
}

// ── Preservation tools direct ──

function testPreservation(): void {
  const intact = runPreservationTools([{ entityKind: "asset", entityId: "a", entityRevision: 1, payloadHash: HASH, currentDigest: HASH }]);
  assert(intact[0]?.outcome === "pass", "intact locks pass");
  const none = runPreservationTools([]);
  assert(none[0]?.outcome === "unknown", "no locks yields unknown, not pass");
  const tech = runTechnicalTools({ kind: "image", requestedSize: null, actualWidth: 1, actualHeight: 1, contentHash: HASH });
  assert(tech.some((tool) => tool.tool === "dims-match" && tool.outcome === "unknown"), "missing request records unknown dims-match");
}

// ── Repair stop conditions ──

function evidenceFor(overrides: Partial<RepairEvidence> = {}): RepairEvidence {
  return {
    id: "ev-1", jobId: "job-1", kind: "image", verdict: "fail",
    defects: [{ signature: "dims-match-failed", target: "output", kind: "dims-match", detail: "requested 1024x1024, actual 512x512", autoRepairable: true }],
    request: { prompt: "a lighthouse", model: "gpt-image-1", size: "1024x1024", quality: "standard" },
    quotedCredits: 6, pricingVersionId: "a1000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

function testRepairStops(): void {
  const eligible = planRepairAttempt({ evidence: evidenceFor(), priorAttempts: [], locks: [], ceiling: 6 });
  assert(eligible.eligible === true && eligible.attemptNumber === 1, "first repair eligible");
  const review = planRepairAttempt({ evidence: evidenceFor({ verdict: "needs-review" }), priorAttempts: [], locks: [], ceiling: 6 });
  assert(review.eligible === false && review.stopReason === "human-review-required", "subjective findings escalate to humans");
  const noAuto = planRepairAttempt({
    evidence: evidenceFor({ defects: [{ signature: "lock-changed", target: "locked-attribute", kind: "lock-intact", detail: "changed", autoRepairable: false }] }),
    priorAttempts: [], locks: [], ceiling: 6,
  });
  assert(noAuto.eligible === false, "no auto-repairable defect stops");
  const deep = planRepairAttempt({
    evidence: evidenceFor(),
    priorAttempts: [
      { attemptNumber: 1, defectSignature: "other", status: "issued" },
      { attemptNumber: 2, defectSignature: "other", status: "issued" },
    ],
    locks: [], ceiling: 6,
  });
  assert(deep.eligible === false && deep.stopReason === "max-depth", "retry depth bounded");
  const stalled = planRepairAttempt({
    evidence: evidenceFor(),
    priorAttempts: [{ attemptNumber: 1, defectSignature: "dims-match-failed", status: "issued" }],
    locks: [], ceiling: 6,
  });
  assert(stalled.eligible === false && stalled.stopReason === "no-progress", "repeated defect stops without progress");
  const locked = planRepairAttempt({
    evidence: evidenceFor({ defects: [{ signature: "lock-changed", target: "locked-attribute", kind: "lock-intact", detail: "x", autoRepairable: true }] }),
    priorAttempts: [], locks: [], ceiling: 6,
  });
  assert(locked.eligible === false && locked.stopReason === "lock-preserved", "locks never weakened for a passing score");
  const broke = planRepairAttempt({ evidence: evidenceFor(), priorAttempts: [], locks: [], ceiling: 5 });
  assert(broke.eligible === false && broke.stopReason === "budget-exceeded", "repair cannot exceed budget");
  const unsafe = planRepairAttempt({
    evidence: evidenceFor({ request: { prompt: "" } }),
    priorAttempts: [], locks: [], ceiling: 6,
  });
  assert(unsafe.eligible === false && unsafe.stopReason === "unsafe", "unsafe re-issue refused");
}

// ── Repair execution: bounded, budgeted, idempotent ──

async function testRepairExecution(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const ledger = new MemoryImageCreditLedger();
  const service = new DurableJobService({ repository: new InMemoryJobRepository() });
  const quota = new MemoryStudioQuotaService();
  quota.setPolicy(SCOPE.projectId, { maxConcurrentJobs: 10, dailyCredits: 1000, enforced: true });
  const plan = planRepairAttempt({ evidence: evidenceFor(), priorAttempts: [], locks: [], ceiling: 6 });
  assert(plan.eligible === true, "execution test starts from eligible plan");
  const first = await executeRepairAttempt({ repo, scope: SCOPE, plan, evidence: evidenceFor(), ledger, service, quota });
  assert(typeof first.attemptId === "string", "attempt recorded");
  assert(first.issued.job.payload !== undefined, "canonical command issued");
  const issuedPayload = first.issued.job.payload as Record<string, unknown>;
  assert((issuedPayload.repairOf as Record<string, unknown>).evidenceId === "ev-1", "issued command links its evidence");
  assert(first.issued.reservation.state === "reserved" && first.issued.reservation.reservedCredits === 6, "repair spend reserved with its own quote");
  const rows = await repo.list(SCOPE, "studio_repair_attempts");
  assert(rows.length === 1, "one attempt row");
  // Replay: same evidence + number resolves the original row.
  const replay = await executeRepairAttempt({ repo, scope: SCOPE, plan, evidence: evidenceFor(), ledger, service, quota });
  assert(replay.attemptId === first.attemptId, "repeated execution replays the attempt");
  const rowsAfter = await repo.list(SCOPE, "studio_repair_attempts");
  assert(rowsAfter.length === 1, "no duplicate attempt rows");
}

async function main(): Promise<void> {
  testCatalog();
  testHealth();
  testRanking();
  testLabeledFixtures();
  testPreservation();
  testRepairStops();
  await testRepairExecution();
  console.log(`stu-23 model intelligence tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
