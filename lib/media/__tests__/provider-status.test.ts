// Media Provider Router & Status — Validation Suite
// Run with: npx tsx lib/media/__tests__/provider-status.test.ts

import { getMediaProviderStatus } from "../provider-status";
import { selectMediaProvider } from "../router";
import { getProviderAdapter } from "../providers/index";
import {
  providerUnavailableError,
  setupRequiredError,
  invalidRequestError,
  rateLimitedError,
  moderationBlockedError,
  insufficientCreditsError,
  timeoutError,
  providerFailedError,
  unknownError,
  isRetryableError,
  httpStatusToProviderError,
  classifyError,
} from "../errors";
import type { ProviderError, ProviderErrorCode } from "../types";

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

function assertDefined<T>(value: T | null | undefined, label: string): T {
  if (value != null) { passed += 1; return value; }
  failed += 1; console.error(`  FAIL: ${label} — value is null or undefined`);
  return undefined as T;
}

function isConfigured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

// ── Provider Status Tests ─────────────────────────────────────────────────────

console.log("\n[Provider Status — All Providers]");
function testAllProvidersPresent(): void {
  const status = getMediaProviderStatus();
  const ids = status.providers.map((p) => p.id).sort();
  const expected = [
    "cortex", "custom", "elevenlabs", "fal", "generic-video",
    "kling", "luma", "mock", "openai", "pika", "replicate", "runway", "stability",
  ];
  assertEqual(ids.join(","), expected.join(","), "All 13 providers present");
}

console.log("\n[Provider Status — Mock is Live]");
function testMockProviderLive(): void {
  const status = getMediaProviderStatus();
  const mock = status.byProvider.mock;
  assertDefined(mock, "Mock provider exists");
  assertEqual(mock.trust, "mock", "Mock trust is mock");
  assert(mock.available, "Mock provider available");
  assert(!mock.setupRequired, "Mock not setup-required");
}

console.log("\n[Provider Status — Cortex Setup Required]");
function testCortexSetupRequired(): void {
  const status = getMediaProviderStatus();
  const cortex = status.byProvider.cortex;
  assertDefined(cortex, "Cortex exists");
  assert(cortex.trust === "setup_required" || cortex.trust === "not_provided", "Cortex is setup_required or not_provided");
  assert(cortex.setupRequired, "Cortex setup-required");
  assert(!cortex.available, "Cortex not available");
}

console.log("\n[Provider Status — All Others Setup Required or Planned]");
function testAllOthersSetupRequired(): void {
  const status = getMediaProviderStatus();
  const setupIds = ["replicate", "elevenlabs", "runway", "kling", "luma", "pika", "stability"];
  for (const id of setupIds) {
    const p = status.byProvider[id];
    assertDefined(p, `Provider ${id} exists`);
    assert(p.setupRequired, `${id} is setup-required`);
    assert(!p.available, `${id} is not available`);
  }
  // OpenAI may be live if configured, or setup-required if not
  const openai = status.byProvider.openai;
  assertDefined(openai, "openai exists");
  if (!openai.available) {
    assert(openai.setupRequired, "openai is setup-required when not configured");
  }
  // fal may be live if FAL_KEY is configured, or setup-required if not.
  // Either way it must never claim a capability beyond image-to-video.
  const fal = status.byProvider.fal;
  assertDefined(fal, "fal exists");
  const isFalConfigured = isConfigured("FAL_KEY");
  if (isFalConfigured) {
    assertEqual(fal.trust, "live", "fal is live when FAL_KEY is configured");
    assert(fal.available, "fal is available when FAL_KEY is configured");
  } else {
    assert(fal.setupRequired, "fal is setup-required when FAL_KEY is not configured");
    assert(!fal.available, "fal is not available when FAL_KEY is not configured");
  }
  assertEqual((fal.capabilities ?? []).join(","), "image-to-video", "fal capability is image-to-video only");

  const genericVideo = status.byProvider["generic-video"];
  assertDefined(genericVideo, "generic-video exists");
  const isGenericVideoConfigured = isConfigured("GENERIC_VIDEO_API_URL") && isConfigured("GENERIC_VIDEO_API_KEY");
  if (isGenericVideoConfigured) {
    assertEqual(genericVideo.trust, "live", "generic-video is live when both env vars are configured");
    assert(genericVideo.available, "generic-video is available when configured");
  } else {
    assert(genericVideo.setupRequired, "generic-video is setup-required when env vars are missing");
    assert(!genericVideo.available, "generic-video is not available when env vars are missing");
  }
  assertEqual((genericVideo.capabilities ?? []).join(","), "text-to-video", "generic-video capability is text-to-video only");

  const custom = status.byProvider.custom;
  assertDefined(custom, "custom exists");
  assert(custom.setupRequired, "custom is setup-required");
  assert(!custom.available, "custom is not available");
}

console.log("\n[Provider Status — Counts]");
function testStatusCounts(): void {
  const status = getMediaProviderStatus();
  assertEqual(status.counts.mock, 1, "1 mock provider");
  assert(status.counts.setup_required >= 0, "Counts include setup_required");
  assert(status.counts.live >= 0, "Counts include live");
  assertEqual(status.counts.live + status.counts.mock + status.counts.setup_required + status.counts.not_provided + status.counts.disabled + status.counts.failed + status.counts.fallback + status.counts.unavailable, 13, "All 13 accounted for");
}

console.log("\n[Provider Status — Response Shape]");
function testStatusResponseShape(): void {
  const status = getMediaProviderStatus();
  assert(Array.isArray(status.providers), "providers is array");
  assert(typeof status.byProvider === "object", "byProvider is object");
  assert(typeof status.counts === "object", "counts is object");
  assert(typeof status.generatedAt === "string", "generatedAt is string");
  for (const p of status.providers) {
    assert(typeof p.id === "string", `Provider ${p.id} has id`);
    assert(typeof p.label === "string", `Provider ${p.id} has label`);
    assert(typeof p.mode === "string", `Provider ${p.id} has mode`);
    assert(typeof p.available === "boolean", `Provider ${p.id} has available`);
    assert(typeof p.trust === "string", `Provider ${p.id} has trust`);
  }
  assertEqual((status.byProvider.openai.capabilities ?? []).join(","), "text-to-image", "openai capability is text-to-image");
  assertEqual((status.byProvider["generic-video"].capabilities ?? []).join(","), "text-to-video", "generic-video reports text-to-video capability");
}

// ── Router Tests ───────────────────────────────────────────────────────────────

console.log("\n[Router — Image Fails Closed Without a Live Provider]");
function testRouterSelectsAvailableForImage(): void {
  const isOpenaiConfigured = isConfigured("OPENAI_API_KEY");
  if (isOpenaiConfigured) {
    const result = selectMediaProvider({ modality: "image" });
    assertDefined(result, "Router returns result for image");
    assertEqual(result.providerId, "openai", "Router selects openai when configured");
  } else {
    // LIVE-PATH-SIMULATION-REMOVAL-01 (STU-P0-09): no live provider means a
    // typed setup-required error — never mock output.
    let threw = false;
    try {
      selectMediaProvider({ modality: "image" });
    } catch (err) {
      threw = true;
      assertEqual((err as { code?: string }).code, "setup_required", "Image with no live provider throws setup_required");
    }
    assert(threw, "Image with no live provider fails closed (setup_required), never mock");
  }
}

console.log("\n[Router — Video Fails Closed Without a Live Provider]");
function testRouterSelectsMockForVideo(): void {
  const isFalConfigured = isConfigured("FAL_KEY");
  if (isFalConfigured) {
    const result = selectMediaProvider({ modality: "video" });
    assertEqual(result.providerId, "fal", "Router selects fal for video when FAL_KEY is configured");
  } else {
    let threw = false;
    try {
      selectMediaProvider({ modality: "video" });
    } catch (err) {
      threw = true;
      assertEqual((err as { code?: string }).code, "setup_required", "Video with no live provider throws setup_required");
    }
    assert(threw, "Video with no live provider fails closed (setup_required), never mock");
  }
}

console.log("\n[Router — Text-to-Video Requires Generic Video]");
function testRouterSelectsCapabilityAwareTextToVideoProvider(): void {
  const isGenericVideoConfigured = isConfigured("GENERIC_VIDEO_API_URL") && isConfigured("GENERIC_VIDEO_API_KEY");

  if (isGenericVideoConfigured) {
    const result = selectMediaProvider({ modality: "video", capability: "text-to-video" });
    assertEqual(result.providerId, "generic-video", "Router selects generic-video for text-to-video when configured");
  } else {
    let threw = false;
    try {
      selectMediaProvider({ modality: "video", capability: "text-to-video" });
    } catch (err) {
      threw = true;
      assertEqual((err as { code?: string }).code, "setup_required", "Text-to-video with no live provider throws setup_required");
    }
    assert(threw, "Text-to-video with no live provider fails closed, never mock");
  }
}

console.log("\n[Router — Image-to-Video Stays On fal]");
function testRouterKeepsImageToVideoOnFal(): void {
  const isFalConfigured = isConfigured("FAL_KEY");

  if (isFalConfigured) {
    const result = selectMediaProvider({ modality: "video", capability: "image-to-video" });
    assertEqual(result.providerId, "fal", "Router selects fal for image-to-video when FAL_KEY is configured");
  } else {
    let threw = false;
    try {
      selectMediaProvider({ modality: "video", capability: "image-to-video" });
    } catch (err) {
      threw = true;
      assertEqual((err as { code?: string }).code, "setup_required", "Image-to-video with no live provider throws setup_required");
    }
    assert(threw, "Image-to-video with no live provider fails closed, never mock");
  }
}

console.log("\n[fal — Rejects Text-to-Video Instead of Silently Generating]");
async function testFalRejectsTextToVideo(): Promise<void> {
  // Even though the router picks fal for any "video" modality request, the
  // fal adapter itself must refuse anything but image-to-video so a
  // text-to-video request can never be silently fulfilled as "live".
  const isFalConfigured = isConfigured("FAL_KEY");
  if (!isFalConfigured) return;
  const fal = getProviderAdapter("fal");
  assertDefined(fal, "fal adapter resolves");
  try {
    await fal!.generate({ modality: "video", capability: "text-to-video", prompt: "a test prompt" });
    failed += 1;
    console.error("  FAIL: fal.generate did not reject a text-to-video capability request");
  } catch (err) {
    const code = (err as { code?: string }).code;
    assertEqual(code, "invalid_request", "fal rejects text-to-video with invalid_request");
  }
}

console.log("\n[Router — Audio Fails Closed Without a Live Provider]");
function testRouterSelectsMockForAudio(): void {
  // No real audio provider is configured in this environment — fail closed.
  let threw = false;
  try {
    selectMediaProvider({ modality: "audio" });
  } catch (err) {
    threw = true;
    assertEqual((err as { code?: string }).code, "setup_required", "Audio with no live provider throws setup_required");
  }
  assert(threw, "Audio with no live provider fails closed (setup_required), never mock");
}

console.log("\n[Router — Returns Fallback Info]");
function testRouterReturnsFallbackInfo(): void {
  try {
    const result = selectMediaProvider({ modality: "image" });
    assert(typeof result.fallbackReason === "string", "fallbackReason is present");
    assert(typeof result.fallbackProviderId === "string", "fallbackProviderId is present");
    assert(typeof result.selectedModelId === "string", "selectedModelId is present");
  } catch (err) {
    assertEqual((err as { code?: string }).code, "setup_required", "No live providers → setup_required (fallback info N/A)");
  }
}

// ── Error Mapping Tests ───────────────────────────────────────────────────────

console.log("\n[Errors — All Factory Functions]");
function testErrorFactories(): void {
  const errors: ProviderError[] = [
    providerUnavailableError(),
    setupRequiredError(),
    invalidRequestError(),
    rateLimitedError(),
    moderationBlockedError(),
    insufficientCreditsError(),
    timeoutError(),
    providerFailedError(),
    unknownError(),
  ];
  assertEqual(errors.length, 9, "9 error factories");
  for (const e of errors) {
    assert(typeof e.code === "string", `Error has code: ${e.code}`);
    assert(typeof e.message === "string", `Error has message: ${e.code}`);
    assert(typeof e.retryable === "boolean", `Error has retryable: ${e.code}`);
    assert(typeof e.statusCode === "number", `Error has statusCode: ${e.code}`);
  }
}

console.log("\n[Errors — Retryable Classification]");
function testRetryableClassification(): void {
  assert(isRetryableError(providerUnavailableError()), "provider_unavailable is retryable");
  assert(!isRetryableError(setupRequiredError()), "setup_required is not retryable");
  assert(!isRetryableError(invalidRequestError()), "invalid_request is not retryable");
  assert(isRetryableError(rateLimitedError()), "rate_limited is retryable");
  assert(!isRetryableError(moderationBlockedError()), "moderation_blocked is not retryable");
  assert(!isRetryableError(insufficientCreditsError()), "insufficient_credits is not retryable");
  assert(isRetryableError(timeoutError()), "timeout is retryable");
  assert(isRetryableError(providerFailedError()), "provider_failed is retryable");
  assert(!isRetryableError(unknownError()), "unknown is not retryable");
}

console.log("\n[Errors — HTTP Status Mapping]");
function testHttpStatusMapping(): void {
  assertEqual(httpStatusToProviderError(400).code, "invalid_request", "400 → invalid_request");
  assertEqual(httpStatusToProviderError(402).code, "insufficient_credits", "402 → insufficient_credits");
  assertEqual(httpStatusToProviderError(422).code, "moderation_blocked", "422 → moderation_blocked");
  assertEqual(httpStatusToProviderError(429).code, "rate_limited", "429 → rate_limited");
  assertEqual(httpStatusToProviderError(502).code, "provider_failed", "502 → provider_failed");
  assertEqual(httpStatusToProviderError(503).code, "provider_unavailable", "503 → provider_unavailable");
  assertEqual(httpStatusToProviderError(504).code, "timeout", "504 → timeout");
  assertEqual(httpStatusToProviderError(500).code, "provider_unavailable", "500 → provider_unavailable");
  assertEqual(httpStatusToProviderError(200).code, "unknown", "200 → unknown");
}

console.log("\n[Errors — classifyError]");
function testClassifyError(): void {
  const prov = providerUnavailableError("test");
  assertEqual(classifyError(prov).code, "provider_unavailable", "Returns same error for ProviderError");

  const rate = classifyError(new Error("Rate limit exceeded: 429"));
  assertEqual(rate.code, "rate_limited", "Rate message → rate_limited");

  const timeout = classifyError(new Error("request timeout 504"));
  assertEqual(timeout.code, "timeout", "Timeout message → timeout");

  const apiKey = classifyError(new Error("API key unauthorized 401"));
  assertEqual(apiKey.code, "setup_required", "API key message → setup_required");

  const generic = classifyError(new Error("Something went wrong"));
  assertEqual(generic.code, "provider_failed", "Generic error → provider_failed");

  const unknown = classifyError("just a string");
  assertEqual(unknown.code, "unknown", "Non-Error → unknown");
}

// ── Router Edge Cases ─────────────────────────────────────────────────────────

console.log("\n[Router — Explicit Mock Request]");
function testRouterExplicitMock(): void {
  const result = selectMediaProvider({ modality: "image", providerId: "mock" });
  assertEqual(result.providerId, "mock", "Explicit mock returns mock");
  assert(!result.fallbackUsed, "No fallback when mock explicitly requested");
}

console.log("\n[Router — Explicit Unavailable Provider]");
function testRouterExplicitUnavailable(): void {
  // Request an explicitly unavailable provider (replicate shim). Either a real
  // provider is selected as a fallback or the router fails closed — mock is
  // never substituted.
  try {
    const result = selectMediaProvider({ modality: "image", providerId: "replicate" });
    assert(result.providerId !== "replicate", "Replicate is not available, falls back");
    assert(result.providerId !== "mock", "Unavailable explicit provider never falls back to mock");
    assert(result.fallbackUsed, "Fallback used when explicit provider unavailable");
  } catch (err) {
    assertEqual((err as { code?: string }).code, "setup_required", "Unavailable explicit provider with no live alternative throws setup_required");
  }
}

console.log("\n[Router — Quality/Latency Preferences]");
function testRouterPreferences(): void {
  try {
    const result = selectMediaProvider({ modality: "image", qualityPreference: "premium", latencyPreference: "fast" });
    const isOpenaiConfigured = isConfigured("OPENAI_API_KEY");
    if (isOpenaiConfigured) {
      assertEqual(result.providerId, "openai", "Selects openai when configured");
    }
    assert(result.providerId !== "mock", "Preferences path never falls back to mock");
  } catch (err) {
    assertEqual((err as { code?: string }).code, "setup_required", "Preferences path with no live provider throws setup_required");
  }
}

// ── Run all tests ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  testAllProvidersPresent();
  testMockProviderLive();
  testCortexSetupRequired();
  testAllOthersSetupRequired();
  testStatusCounts();
  testStatusResponseShape();
  testRouterSelectsAvailableForImage();
  testRouterSelectsMockForVideo();
  testRouterSelectsCapabilityAwareTextToVideoProvider();
  testRouterKeepsImageToVideoOnFal();
  testRouterSelectsMockForAudio();
  testRouterReturnsFallbackInfo();
  testRouterExplicitMock();
  testRouterExplicitUnavailable();
  testRouterPreferences();
  await testFalRejectsTextToVideo();
  testErrorFactories();
  testRetryableClassification();
  testHttpStatusMapping();
  testClassifyError();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Provider status & router tests: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(40)}`);

  if (failed > 0) process.exit(1);
}

void main();
