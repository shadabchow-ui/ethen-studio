// Media Safety Gate — Validation Suite
// Run with: npx tsx lib/media/__tests__/media-safety.test.ts

import { classifyMediaSafety, mergeGateOutcomes, isGateBlocking, isConsentRequired, getGateSummary } from "../safety";
import { buildMediaAuditTrace, stampJobSafetyMeta } from "../audit";
import type { MediaSafetyGateResult, MediaWorkflowId } from "../safety-types";
import {
  MEDIA_SAFETY_CATEGORY_LABELS,
  GATE_OUTCOME_LABELS,
} from "../safety-types";

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

// ── Category label coverage ─────────────────────────────────────────────

function testCategoryLabels(): void {
  console.log("\n[Category Labels]");
  const cats: string[] = [
    "face_swap", "character_swap", "voice_change", "voice_cloning",
    "identity_voiceover", "public_figures", "minors", "impersonation",
    "deceptive_ads", "copyrighted_style", "product_claims",
    "uploaded_media", "external_publishing",
  ];
  assertEqual(cats.length, 13, "13 safety categories defined");
  for (const cat of cats) {
    assert(Boolean(MEDIA_SAFETY_CATEGORY_LABELS[cat as keyof typeof MEDIA_SAFETY_CATEGORY_LABELS]), `Label for ${cat}`);
  }
}

function testGateOutcomeLabels(): void {
  console.log("\n[Gate Outcome Labels]");
  const outcomes = ["allowed", "warn", "consent_required", "approval_required", "blocked", "setup_required"];
  assertEqual(outcomes.length, 6, "6 gate outcomes defined");
  for (const o of outcomes) {
    assert(Boolean(GATE_OUTCOME_LABELS[o as keyof typeof GATE_OUTCOME_LABELS]), `Label for ${o}`);
  }
}

// ── Safe workflow (no triggers) ──────────────────────────────────────────

function testSafeWorkflow(): void {
  console.log("\n[Safe Workflow — Allowed]");
  const result = classifyMediaSafety({
    workflowId: "media.generate_image" as MediaWorkflowId,
    mode: "image",
    prompt: "A beautiful sunset over the ocean",
  });
  assertEqual(result.outcome, "allowed", "simple image gen → allowed");
  assert(!result.blocked, "not blocked");
  assert(!result.requiresConsent, "no consent required");
  assertEqual(result.triggeredCategories.length, 0, "no categories triggered for simple text-to-image");
}

function testUpscaleWorkflow(): void {
  console.log("\n[Upscale Workflow — Allowed]");
  const result = classifyMediaSafety({
    workflowId: "media.upscale_image" as MediaWorkflowId,
    mode: "image",
    prompt: "Upscale this image",
  });
  assertEqual(result.outcome, "allowed", "upscale → allowed");
  assertEqual(result.triggeredCategories.length, 0, "no categories triggered");
}

// ── Identity-based workflows ─────────────────────────────────────────────

function testFaceSwapTriggersConsent(): void {
  console.log("\n[Face Swap — Consent Required]");
  const result = classifyMediaSafety({
    workflowId: "media.edit_image" as MediaWorkflowId,
    mode: "image",
    prompt: "Swap my face onto this character",
    usesFaceSwap: true,
    hasUploadedMedia: true,
  });
  assertEqual(result.outcome, "consent_required", "face swap → consent_required");
  assert(result.requiresConsent, "requiresConsent=true");
  assert(!result.blocked, "not blocked");
  assert(result.triggeredCategories.includes("face_swap"), "face_swap triggered");
}

function testVoiceCloningTriggersConsent(): void {
  console.log("\n[Voice Cloning — Consent Required]");
  const result = classifyMediaSafety({
    workflowId: "media.change_voice" as MediaWorkflowId,
    mode: "audio",
    prompt: "Clone my voice for this narration",
    usesVoiceCloning: true,
  });
  assertEqual(result.outcome, "consent_required", "voice cloning → consent_required");
  assert(result.requiresConsent, "requiresConsent=true");
}

function testCharacterSwapConsent(): void {
  console.log("\n[Character Swap — Consent Required]");
  const result = classifyMediaSafety({
    workflowId: "media.image_to_video" as MediaWorkflowId,
    mode: "video",
    prompt: "Animate this character scene",
    usesCharacterSwap: true,
    hasUploadedMedia: true,
  });
  assertEqual(result.outcome, "consent_required", "character swap → consent_required");
  assert(result.triggeredCategories.includes("character_swap"), "character_swap triggered");
}

// ── Blocking workflows ───────────────────────────────────────────────────

function testMinorsBlocked(): void {
  console.log("\n[Minors — Blocked]");
  const result = classifyMediaSafety({
    workflowId: "media.generate_image" as MediaWorkflowId,
    mode: "image",
    prompt: "A child model for a clothing ad",
    involvesMinors: true,
  });
  assertEqual(result.outcome, "blocked", "minors → blocked");
  assert(result.blocked, "blocked=true");
  assert(result.messages.some((m) => m.includes("blocked for minors")), "blocked message present");
}

function testImpersonationBlocked(): void {
  console.log("\n[Impersonation — Blocked]");
  const result = classifyMediaSafety({
    workflowId: "media.generate_video" as MediaWorkflowId,
    mode: "video",
    prompt: "Deepfake of the CEO making an announcement",
    isImpersonation: true,
  });
  assertEqual(result.outcome, "blocked", "impersonation → blocked");
  assert(result.blocked, "blocked=true");
}

function testDeceptiveAdsBlocked(): void {
  console.log("\n[Deceptive Ads — Blocked]");
  const result = classifyMediaSafety({
    workflowId: "media.product_url_to_ad" as MediaWorkflowId,
    mode: "marketing",
    prompt: "Create a misleading ad for this product",
    isDeceptiveAd: true,
  });
  assertEqual(result.outcome, "blocked", "deceptive ads → blocked");
}

// ── Warning workflows ────────────────────────────────────────────────────

function testProductClaimsWarning(): void {
  console.log("\n[Product Claims — Warning]");
  const result = classifyMediaSafety({
    workflowId: "media.product_url_to_ad" as MediaWorkflowId,
    mode: "marketing",
    prompt: "Ad showing this supplement cures all ailments",
    makesProductClaims: true,
  });
  assertEqual(result.outcome, "warn", "product claims with no other flags → warn");
  assert(result.warnOnly, "warnOnly=true");
  assert(!result.blocked, "not blocked");
}

function testExternalPublishingWarning(): void {
  console.log("\n[External Publishing — Warning]");
  const result = classifyMediaSafety({
    workflowId: "media.export_asset" as MediaWorkflowId,
    mode: "video",
    prompt: "Export this video for YouTube",
    targetsExternalPublishing: true,
  });
  assertEqual(result.outcome, "warn", "external publishing → warn");
  assert(result.triggeredCategories.includes("external_publishing"), "external_publishing triggered");
}

// ── Public figures ───────────────────────────────────────────────────────

function testPublicFigureConsent(): void {
  console.log("\n[Public Figures — Consent Required]");
  const result = classifyMediaSafety({
    workflowId: "media.generate_image" as MediaWorkflowId,
    mode: "image",
    prompt: "A famous politician giving a speech",
    targetsPublicFigure: true,
  });
  assertEqual(result.outcome, "consent_required", "public figure → consent_required");
  assert(result.messages.some((m) => m.includes("public figures")), "public figure message present");
}

// ── Character training ──────────────────────────────────────────────────

function testCharacterTrainingConsent(): void {
  console.log("\n[Character Training — Consent Required]");
  const result = classifyMediaSafety({
    workflowId: "media.train_character" as MediaWorkflowId,
    mode: "image",
    prompt: "Train a custom character model from uploaded photos",
    hasUploadedMedia: true,
    usesCharacterSwap: true,
    usesFaceSwap: true,
  });
  assertEqual(result.outcome, "consent_required", "character training → consent_required");
  assert(result.triggeredCategories.includes("character_swap"), "character_swap triggered from input flag");
  assert(result.triggeredCategories.includes("face_swap"), "face_swap triggered from input flag");
  assert(result.triggeredCategories.includes("uploaded_media"), "uploaded_media triggered");
}

// ── Merge gate outcomes ─────────────────────────────────────────────────

function testMergeOutcomes(): void {
  console.log("\n[Merge Gate Outcomes]");

  const allowed: MediaSafetyGateResult = {
    outcome: "allowed",
    triggeredCategories: [],
    reasons: [],
    messages: [],
    requiresConsent: false,
    requiresApproval: false,
    blocked: false,
    warnOnly: false,
  };

  const warn: MediaSafetyGateResult = {
    outcome: "warn",
    triggeredCategories: ["product_claims"],
    reasons: ["Claims need review"],
    messages: ["Review claims"],
    requiresConsent: false,
    requiresApproval: false,
    blocked: false,
    warnOnly: true,
  };

  const consent: MediaSafetyGateResult = {
    outcome: "consent_required",
    triggeredCategories: ["face_swap"],
    reasons: ["Consent required"],
    messages: ["Consent required before identity-based generation."],
    requiresConsent: true,
    requiresApproval: false,
    blocked: false,
    warnOnly: false,
  };

  const blocked: MediaSafetyGateResult = {
    outcome: "blocked",
    triggeredCategories: ["minors"],
    reasons: ["Minors blocked"],
    messages: ["This workflow is blocked for minors."],
    requiresConsent: false,
    requiresApproval: false,
    blocked: true,
    warnOnly: false,
  };

  const mergedSafe = mergeGateOutcomes([allowed, warn]);
  assertEqual(mergedSafe.outcome, "warn", "allowed+warn → warn");

  const mergedConsent = mergeGateOutcomes([warn, consent]);
  assertEqual(mergedConsent.outcome, "consent_required", "warn+consent → consent_required");
  assert(mergedConsent.requiresConsent, "merged requires consent");

  const mergedBlocked = mergeGateOutcomes([consent, blocked]);
  assertEqual(mergedBlocked.outcome, "blocked", "consent+blocked → blocked");
  assert(mergedBlocked.blocked, "merged is blocked");

  const emptyMerge = mergeGateOutcomes([]);
  assertEqual(emptyMerge.outcome, "allowed", "empty merge → allowed");
}

// ── Helper functions ────────────────────────────────────────────────────

function testHelperFunctions(): void {
  console.log("\n[Helper Functions]");

  const blocked: MediaSafetyGateResult = {
    outcome: "blocked",
    triggeredCategories: ["minors"],
    reasons: [],
    messages: [],
    requiresConsent: false,
    requiresApproval: false,
    blocked: true,
    warnOnly: false,
  };

  const consent: MediaSafetyGateResult = {
    outcome: "consent_required",
    triggeredCategories: ["face_swap"],
    reasons: ["Consent required"],
    messages: [],
    requiresConsent: true,
    requiresApproval: false,
    blocked: false,
    warnOnly: false,
  };

  const allowed: MediaSafetyGateResult = {
    outcome: "allowed",
    triggeredCategories: [],
    reasons: [],
    messages: [],
    requiresConsent: false,
    requiresApproval: false,
    blocked: false,
    warnOnly: false,
  };

  assert(isGateBlocking(blocked), "blocked → gate is blocking");
  assert(!isGateBlocking(consent), "consent → gate is not blocking");
  assert(!isGateBlocking(allowed), "allowed → gate is not blocking");

  assert(isConsentRequired(consent), "consent → consent required");
  assert(!isConsentRequired(blocked), "blocked → consent not applicable");
  assert(!isConsentRequired(allowed), "allowed → no consent needed");

  const summary = getGateSummary(blocked);
  assert(summary.includes("Blocked"), "blocked summary contains Blocked");

  const consentSummary = getGateSummary(consent);
  assert(consentSummary.includes("Consent required"), "consent summary contains Consent required");
}

// ── Audit trace ─────────────────────────────────────────────────────────

function testAuditTrace(): void {
  console.log("\n[Audit Trace]");

  const safetyResult: MediaSafetyGateResult = {
    outcome: "consent_required",
    triggeredCategories: ["face_swap"],
    reasons: ["Consent required before identity-based generation."],
    messages: ["Consent required before identity-based generation."],
    requiresConsent: true,
    requiresApproval: false,
    blocked: false,
    warnOnly: false,
  };

  const trace = buildMediaAuditTrace(
    "Swap my face onto this character",
    "mock",
    "image-default",
    safetyResult,
    false,
    false,
    null,
    "blurry, low quality",
    "cinematic",
  );

  assertEqual(trace.promptMetadata.prompt, "Swap my face onto this character", "trace captures prompt");
  assertEqual(trace.promptMetadata.negativePrompt, "blurry, low quality", "trace captures negative prompt");
  assertEqual(trace.promptMetadata.style, "cinematic", "trace captures style");
  assert(trace.providerMetadata !== null, "trace has provider metadata");
  assertEqual(trace.providerMetadata!.provider, "mock", "trace captures provider");
  assertEqual(trace.consentAccepted, false, "trace consent=false");
  assertEqual(trace.safetyGateResult.outcome, "consent_required", "trace captures outcome");
  assert(Boolean(trace.timestamp), "trace has timestamp");
}

// ── Job safety meta ─────────────────────────────────────────────────────

function testJobSafetyMeta(): void {
  console.log("\n[Job Safety Meta]");

  const safetyResult: MediaSafetyGateResult = {
    outcome: "consent_required",
    triggeredCategories: ["face_swap"],
    reasons: ["Consent required"],
    messages: [],
    requiresConsent: true,
    requiresApproval: false,
    blocked: false,
    warnOnly: false,
  };

  const meta = stampJobSafetyMeta(safetyResult, true, false, null, null);
  assertEqual(meta.consentAccepted, true, "meta consent=true");
  assert(meta.consentAcceptedAt !== null, "meta has consent timestamp");
  assert(meta.readPhaseCompleted, "read phase complete");
  assert(meta.proposePhaseCompleted, "propose phase complete");
  assert(meta.executeConfirmed, "execute confirmed");

  const metaNoConsent = stampJobSafetyMeta(safetyResult, false, false, null, null);
  assertEqual(metaNoConsent.consentAccepted, false, "meta consent=false");
  assert(!metaNoConsent.executeConfirmed, "execute not confirmed without consent");
}

// ── Blocked reason stamp ────────────────────────────────────────────────

function testBlockedMeta(): void {
  console.log("\n[Blocked Meta]");

  const safetyResult: MediaSafetyGateResult = {
    outcome: "blocked",
    triggeredCategories: ["minors"],
    reasons: ["This workflow is blocked for minors."],
    messages: ["This workflow is blocked for minors or sexualized identity manipulation."],
    requiresConsent: false,
    requiresApproval: false,
    blocked: true,
    warnOnly: false,
  };

  const meta = stampJobSafetyMeta(
    safetyResult,
    false,
    false,
    "This workflow is blocked for minors.",
    null,
  );

  assertEqual(meta.blockedReason, "This workflow is blocked for minors.", "blocked reason captured");
  assert(!meta.executeConfirmed, "not execute confirmed when blocked");
}

// ── Run all tests ────────────────────────────────────────────────────────

function main() {
  console.log("Media Safety Gate — Validation Suite\n");

  testCategoryLabels();
  testGateOutcomeLabels();
  testSafeWorkflow();
  testUpscaleWorkflow();
  testFaceSwapTriggersConsent();
  testVoiceCloningTriggersConsent();
  testCharacterSwapConsent();
  testMinorsBlocked();
  testImpersonationBlocked();
  testDeceptiveAdsBlocked();
  testProductClaimsWarning();
  testExternalPublishingWarning();
  testPublicFigureConsent();
  testCharacterTrainingConsent();
  testMergeOutcomes();
  testHelperFunctions();
  testAuditTrace();
  testJobSafetyMeta();
  testBlockedMeta();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Media safety tests: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(40)}`);

  if (failed > 0) process.exit(1);
}

main();