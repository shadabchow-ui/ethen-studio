// Media Studio V1 — Pricing, Evaluation & State Contracts
// Run with: npx tsx lib/media/__tests__/media-v1-contracts.test.ts

import { ACTION_ESTIMATES, getActionEstimate, getModeEstimate, isSetupRequiredEstimate } from "../pricing";
import { EVAL_SCORE_DEFINITIONS, getApplicableScores, generateMockScores, scoreToPercent, scoreTone, generateMockEvalMetadata } from "../evaluation";
import { MEDIA_STUDIO_READINESS, getReadinessSummary, getReadinessByState } from "../status";
import { classifyMediaSafety, isGateBlocking, isConsentRequired } from "../safety";
import { createJob, advanceJob, failJob, cancelJob, getJob, clearStores } from "../jobs";
import type { MediaGenerationRequest, MediaProviderStatus } from "../types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Pricing estimates ────────────────────────────────────────────────────

console.log("\n[Pricing — Action Estimates]");
assert(ACTION_ESTIMATES.length > 0, "Has at least one action estimate");
for (const e of ACTION_ESTIMATES) {
  assert(e.isEstimate === true, `${e.action} is marked as estimate`);
  assert(typeof e.estimatedCredits === "number", `${e.action} has numeric credits`);
  assert(e.estimatedCredits >= 0, `${e.action} credits are non-negative`);
  assert(e.note.length > 0, `${e.action} has a note`);
}

console.log("\n[Pricing — Mode Estimates]");
const modes = ["image", "video", "audio", "marketing", "product", "influencer", "motion", "canvas"] as const;
for (const mode of modes) {
  const estimate = getModeEstimate(mode);
  assert(Boolean(estimate), `Mode "${mode}" has estimate`);
  assert(estimate.isEstimate === true, `Mode "${mode}" estimate is labeled as estimate`);
}

console.log("\n[Pricing — Action Lookup]");
const estimate = getActionEstimate("generate-image");
assert(Boolean(estimate), "generate-image action has estimate");
assertEqual(estimate?.modality ?? "", "image", "generate-image modality is image");
assertEqual(getActionEstimate("nonexistent-action"), undefined, "Nonexistent action returns undefined");

console.log("\n[Pricing — Export Free]");
const exportEst = getActionEstimate("export");
assert(Boolean(exportEst), "Export action has estimate");
assertEqual(exportEst?.estimatedCredits ?? -1, 0, "Export is zero credits");

console.log("\n[Pricing — Honesty Labels]");
for (const e of ACTION_ESTIMATES) {
  assert(!e.note.includes("$") && !e.note.includes("USD"), `${e.action} note has no real currency`);
}

// ── Evaluation metadata ──────────────────────────────────────────────────

console.log("\n[Eval — Score Definitions]");
assert(EVAL_SCORE_DEFINITIONS.length > 0, "Has at least one eval score definition");
for (const def of EVAL_SCORE_DEFINITIONS) {
  assert(def.applicableModalities.length > 0, `${def.key} has applicable modalities`);
}

console.log("\n[Eval — Applicable Scores]");
for (const modality of ["image", "video", "audio"] as const) {
  const scores = getApplicableScores(modality);
  assert(scores.length > 0, `${modality} has applicable scores`);
}

console.log("\n[Eval — Mock Scores]");
const mockJob = createJob({ modality: "image", prompt: "Test prompt", mode: "image" } as MediaGenerationRequest);
const scores = generateMockScores(mockJob);
assertEqual(typeof scores.overall, "number", "Has overall score");
assert(scores.overall >= 0 && scores.overall <= 100, "Overall score in range 0-100");
const metadata = generateMockEvalMetadata(mockJob);
assert(metadata.isMock === true, "Eval metadata marked as mock");
assert(metadata.notes.length > 0, "Eval metadata has notes");

console.log("\n[Eval — Score Helpers]");
assertEqual(scoreToPercent(75, 100), 75, "75/100 = 75%");
assertEqual(scoreToPercent(null, 100), 0, "null score = 0%");
assertEqual(scoreTone(80), "success", "80% tone is success");
assertEqual(scoreTone(60), "warning", "60% tone is warning");
assertEqual(scoreTone(30), "danger", "30% tone is danger");
assertEqual(scoreTone(10), "muted", "10% tone is muted");

// ── Readiness / status ───────────────────────────────────────────────────

console.log("\n[Status — Readiness Entries]");
assert(MEDIA_STUDIO_READINESS.length > 0, "Has at least one readiness entry");
for (const entry of MEDIA_STUDIO_READINESS) {
  assert(entry.surface.length > 0, `${entry.state}: surface name present`);
  assert(entry.description.length > 0, `${entry.surface}: description present`);
}

console.log("\n[Status — Readiness Summary]");
const summary = getReadinessSummary();
assert(summary.total === MEDIA_STUDIO_READINESS.length, "Total matches entry count");

console.log("\n[Status — Readiness by State]");
assert(getReadinessByState("implemented").length > 0, "Has implemented entries");
assert(getReadinessByState("blocked").length > 0, "Has blocked entries");

// ── Provider type contracts ──────────────────────────────────────────────

console.log("\n[Provider — Type Shape]");
const mockStatus: MediaProviderStatus = {
  id: "mock",
  label: "Mock",
  modality: "multi",
  mode: "mock",
  available: true,
  configured: true,
  setupRequired: false,
  lastCheckedAt: new Date().toISOString(),
  trust: "mock",
};
assertEqual(mockStatus.mode, "mock", "Mode is mock");
assertEqual(mockStatus.trust, "mock", "Trust is mock");

// ── Safety gate contracts ────────────────────────────────────────────────

console.log("\n[Safety — Classify Allowed]");
const allowedResult = classifyMediaSafety({ workflowId: "media.generate_image", prompt: "A beautiful sunset" });
assertEqual(allowedResult.outcome, "allowed", "Simple image gen is allowed");
assert(!allowedResult.blocked, "Not blocked");

console.log("\n[Safety — Classify Blocked]");
const blockedResult = classifyMediaSafety({ workflowId: "media.generate_image", prompt: "Test", involvesMinors: true });
assertEqual(blockedResult.outcome, "blocked", "Minor-involving workflow is blocked");
assert(isGateBlocking(blockedResult), "Blocked gate is blocking");

console.log("\n[Safety — Classify Consent]");
const consentResult = classifyMediaSafety({ workflowId: "media.edit_image", prompt: "Swap face", usesFaceSwap: true });
assertEqual(consentResult.outcome, "consent_required", "Face swap requires consent");
assert(isConsentRequired(consentResult), "Requires consent");

// ── Job state transitions ────────────────────────────────────────────────

clearStores();

console.log("\n[Jobs — Lifecycle]");
const job = createJob({ modality: "image", prompt: "Test lifecycle", mode: "image" } as MediaGenerationRequest);
assertEqual(job.status, "queued", "Initial status is queued");
const a1 = advanceJob(job.id);
assertEqual(a1?.status ?? "", "planning", "Status becomes planning");
const a2 = advanceJob(job.id);
assertEqual(a2?.status ?? "", "running", "Status becomes running");

console.log("\n[Jobs — Terminal States]");
const job2 = createJob({ modality: "image", prompt: "Test terminal", mode: "image" } as MediaGenerationRequest);
failJob(job2.id, "Test failure");
assertEqual(getJob(job2.id)?.status ?? "", "failed", "Failed status set");
assertEqual(advanceJob(job2.id)?.status ?? "", "failed", "Cannot advance from failed");

console.log("\n[Jobs — Cancel]");
const job3 = createJob({ modality: "image", prompt: "Test cancel", mode: "image" } as MediaGenerationRequest);
advanceJob(job3.id);
assertEqual(cancelJob(job3.id)?.status ?? "", "canceled", "Canceled status set");

clearStores();

// ── Results ──────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(40)}`);
console.log(`Media V1 contracts: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(40)}`);

if (failed > 0) process.exit(1);
