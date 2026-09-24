// Media runtime — unit tests
// Run with: npx tsx lib/media/__tests__/media.test.ts

import { clearStores, resetMediaStore } from "../jobs";
import {
  createJob,
  getJob,
  setJobStatus,
  setJobProgress,
  setJobResult,
  cancelJob,
  retryJob,
  expireJob,
  listJobs,
  listJobsByModality,
  listJobsByStatus,
} from "../jobs";
import {
  providerUnavailableError,
  rateLimitedError,
  invalidRequestError,
  moderationBlockedError,
  insufficientCreditsError,
  timeoutError,
  unknownError,
  setupRequiredError,
  isRetryableError,
  httpStatusToProviderError,
} from "../errors";
import type { MediaJobState, MediaJobResult, MediaGenerationRequest } from "../types";
import {
  TERMINAL_MEDIA_JOB_STATUSES,
  ACTIVE_MEDIA_JOB_STATUSES,
} from "../types";

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

function assertNotNull<T>(value: T | null | undefined, label: string): T {
  if (value != null) { passed += 1; return value; }
  failed += 1; console.error(`  FAIL: ${label} — value was null/undefined`);
  return null as unknown as T;
}

function afterEach(): void {
  resetMediaStore();
}

function makeRequest(modality: string, prompt: string): MediaGenerationRequest {
  return {
    modality: modality as MediaGenerationRequest["modality"],
    prompt,
    mode: modality as MediaGenerationRequest["mode"],
  };
}

// ── Job creation ─────────────────────────────────────────────────────────

{
  console.log("\n── Job creation ──");
  afterEach();

  const job = createJob(makeRequest("image", "Test prompt"));

  const fetched = assertNotNull(job, "createJob returns a job");
  assert(typeof fetched.id === "string" && fetched.id.startsWith("media-job-"), "job id starts with 'media-job-'");
  assertEqual(fetched.status, "queued", "new job status is 'queued'");
  assertEqual(fetched.modality, "image", "modality is 'image'");
  assertEqual(fetched.prompt, "Test prompt", "prompt is preserved");
  assertEqual(fetched.providerId, "mock", "default provider is 'mock'");
  assertEqual(fetched.progress, 0, "initial progress is 0");
  assert(fetched.result === null, "result is null for new job");

  const retrieved = getJob(job.id);
  assert(retrieved !== null, "getJob retrieves created job");
  assertEqual(retrieved!.id, job.id, "retrieved job id matches");
}

// ── Job get/set ──────────────────────────────────────────────────────────

{
  console.log("\n── Job get/set ──");
  afterEach();

  const missing = getJob("nonexistent");
  assertEqual(missing, null, "getJob returns null for nonexistent id");

  const job = assertNotNull(createJob(makeRequest("audio", "Test audio")), "create audio job");

  const updated = assertNotNull(setJobStatus(job.id, "planning"), "setJobStatus to planning");
  assertEqual(updated.status, "planning", "status updated to planning");

  const progressed = assertNotNull(setJobProgress(job.id, 45), "setJobProgress");
  assertEqual(progressed.progress, 45, "progress set to 45");

  const clamped = assertNotNull(setJobProgress(job.id, 150), "setJobProgress clamps high");
  assertEqual(clamped.progress, 100, "progress clamped to 100");

  const zeroed = assertNotNull(setJobProgress(job.id, -10), "setJobProgress clamps low");
  assertEqual(zeroed.progress, 0, "progress clamped to 0");
}

// ── Job result ────────────────────────────────────────────────────────────

{
  console.log("\n── Job result ──");
  afterEach();

  const job = assertNotNull(createJob(makeRequest("image", "Test")), "create job");

  const result: MediaJobResult = {
    modality: "image",
    assetUrl: "/mock-media/test.png",
    previewUrl: "/mock-media/test-thumb.png",
    metadata: {
      width: 512,
      height: 512,
      durationSeconds: null,
      fileSizeBytes: 1000000,
      mimeType: "image/png",
      format: "png",
      label: "Test result",
      extra: { generator: "test" },
    },
    generatedAt: new Date().toISOString(),
    isMock: true,
  };

  const completed = assertNotNull(setJobResult(job.id, result), "setJobResult");
  assertEqual(completed.status, "completed", "status is completed after setJobResult");
  assertEqual(completed.progress, 100, "progress is 100 after setJobResult");
  assert(completed.result !== null, "result is set");
  assertEqual(completed.result!.assetUrl, "/mock-media/test.png", "result assetUrl matches");
  assert(completed.result!.isMock, "result isMock is true");
}

// ── Job cancellation ─────────────────────────────────────────────────────

{
  console.log("\n── Job cancellation ──");
  afterEach();

  const job = assertNotNull(createJob(makeRequest("image", "Test")), "create job");
  const canceled = assertNotNull(cancelJob(job.id), "cancelJob");
  assertEqual(canceled.status, "canceled", "status is canceled");

  const cancelTwice = cancelJob(job.id);
  assert(cancelTwice === null, "cancelJob on terminal status returns null");

  const job2 = assertNotNull(createJob(makeRequest("video", "Test video")), "create video job");
  setJobStatus(job2.id, "running");
  const canceled2 = assertNotNull(cancelJob(job2.id), "cancelJob on running job");
  assertEqual(canceled2.status, "canceled", "running job canceled");
}

// ── Job retry ────────────────────────────────────────────────────────────

{
  console.log("\n── Job retry ──");
  afterEach();

  const completed = assertNotNull(createJob(makeRequest("image", "Done")), "create job");
  setJobResult(completed.id, {
    modality: "image",
    assetUrl: "/mock/test.png",
    previewUrl: null,
    metadata: { width: null, height: null, durationSeconds: null, fileSizeBytes: 0, mimeType: "image/png", format: "png", label: "Test", extra: {} },
    generatedAt: new Date().toISOString(),
    isMock: true,
  });
  const retryCompleted = retryJob(completed.id);
  assertEqual(retryCompleted, null, "retryJob returns null for completed job");

  const failed = assertNotNull(createJob(makeRequest("image", "Fail")), "create failed job");
  setJobStatus(failed.id, "running");
  setJobStatus(failed.id, "failed");
  const retried = assertNotNull(retryJob(failed.id), "retryJob on failed job");
  assertEqual(retried.status, "queued", "retried job status is queued");
  assertEqual(retried.originalJobId, failed.id, "originalJobId references parent");

  const canceled = assertNotNull(createJob(makeRequest("audio", "Cancel me")), "create cancel job");
  cancelJob(canceled.id);
  const retriedCanceled = assertNotNull(retryJob(canceled.id), "retryJob on canceled job");
  assertEqual(retriedCanceled.status, "queued", "retried canceled job is queued");

  const expired = assertNotNull(createJob(makeRequest("video", "Old")), "create expired job");
  expireJob(expired.id);
  const retriedExpired = assertNotNull(retryJob(expired.id), "retryJob on expired job");
  assertEqual(retriedExpired.status, "queued", "retried expired job is queued");
}

// ── Job expiration ───────────────────────────────────────────────────────

{
  console.log("\n── Job expiration ──");
  afterEach();

  const job2 = assertNotNull(createJob(makeRequest("audio", "Expire me")), "create audio job");
  const expired2 = assertNotNull(expireJob(job2.id), "expireJob");
  assertEqual(expired2.status, "expired", "job manually expired");
}

// ── Job listing ──────────────────────────────────────────────────────────

{
  console.log("\n── Job listing ──");
  afterEach();

  createJob(makeRequest("image", "Img 1"));
  createJob(makeRequest("image", "Img 2"));
  createJob(makeRequest("video", "Vid 1"));
  createJob(makeRequest("audio", "Aud 1"));

  const all = listJobs();
  assertEqual(all.length, 4, "listJobs returns all jobs");

  const images = listJobsByModality("image");
  assertEqual(images.length, 2, "filtered to 2 image jobs");

  const videos = listJobsByModality("video");
  assertEqual(videos.length, 1, "filtered to 1 video job");

  const audios = listJobsByModality("audio");
  assertEqual(audios.length, 1, "filtered to 1 audio job");

  const active = listJobsByStatus("queued");
  assertEqual(active.length, 4, "4 jobs in queued status");
}

// ── Status constants ─────────────────────────────────────────────────────

{
  console.log("\n── Status constants ──");

  assertEqual(TERMINAL_MEDIA_JOB_STATUSES.length, 3, "3 terminal statuses");
  assert(TERMINAL_MEDIA_JOB_STATUSES.includes("completed"), "completed is terminal");
  assert(TERMINAL_MEDIA_JOB_STATUSES.includes("failed"), "failed is terminal");
  assert(TERMINAL_MEDIA_JOB_STATUSES.includes("canceled"), "canceled is terminal");

  assert(ACTIVE_MEDIA_JOB_STATUSES.includes("queued"), "queued is active");
  assert(ACTIVE_MEDIA_JOB_STATUSES.includes("planning"), "planning is active");
}

// ── Provider errors ──────────────────────────────────────────────────────

{
  console.log("\n── Provider errors ──");

  const unavailable = providerUnavailableError();
  assertEqual(unavailable.code, "provider_unavailable", "provider_unavailable code");
  assert(unavailable.retryable, "provider_unavailable is retryable");
  assertEqual(unavailable.statusCode, 503, "provider_unavailable status is 503");

  const rl = rateLimitedError("Custom rate limit");
  assertEqual(rl.code, "rate_limited", "rate_limited code");
  assert(rl.retryable, "rate_limited is retryable");
  assertEqual(rl.message, "Custom rate limit", "rate_limited custom message");

  const invalid = invalidRequestError();
  assertEqual(invalid.code, "invalid_request", "invalid_request code");
  assert(!invalid.retryable, "invalid_request is not retryable");
  assertEqual(invalid.statusCode, 400, "invalid_request status is 400");

  const mod = moderationBlockedError();
  assertEqual(mod.code, "moderation_blocked", "moderation_blocked code");
  assert(!mod.retryable, "moderation_blocked is not retryable");
  assertEqual(mod.statusCode, 422, "moderation_blocked status is 422");

  const credits = insufficientCreditsError();
  assertEqual(credits.code, "insufficient_credits", "insufficient_credits code");
  assert(!credits.retryable, "insufficient_credits is not retryable");
  assertEqual(credits.statusCode, 402, "insufficient_credits status is 402");

  const to = timeoutError();
  assertEqual(to.code, "timeout", "timeout code");
  assert(to.retryable, "timeout is retryable");
  assertEqual(to.statusCode, 504, "timeout status is 504");

  const unk = unknownError("Something weird");
  assertEqual(unk.code, "unknown", "unknown code");
  assert(!unk.retryable, "unknown is not retryable");
  assertEqual(unk.statusCode, 500, "unknown status is 500");

  const setup = setupRequiredError();
  assertEqual(setup.code, "setup_required", "setup_required code");

  assert(isRetryableError(unavailable), "isRetryableError for provider_unavailable");
  assert(isRetryableError(rl), "isRetryableError for rate_limited");
  assert(!isRetryableError(invalid), "isRetryableError false for invalid_request");
  assert(isRetryableError(to), "isRetryableError for timeout");

  const from429 = httpStatusToProviderError(429);
  assertEqual(from429.code, "rate_limited", "HTTP 429 maps to rate_limited");

  const from503 = httpStatusToProviderError(503);
  assertEqual(from503.code, "provider_unavailable", "HTTP 503 maps to provider_unavailable");

  const from400 = httpStatusToProviderError(400);
  assertEqual(from400.code, "invalid_request", "HTTP 400 maps to invalid_request");

  const from999 = httpStatusToProviderError(999);
  assertEqual(from999.code, "provider_unavailable", "HTTP 999 >= 500 maps to provider_unavailable");
}

// ── Provider status — tested separately due to server-only imports ──────

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
