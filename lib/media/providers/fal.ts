import "server-only";

import { hasConfiguredServerEnv, getServerEnv } from "@ethen/config/env";
import { createJob, setJobOutput, setJobResult, setJobStatus, setJobProgress, failJob, getJob } from "../jobs";
import { addAsset } from "../assets";
import { classifyError, setupRequiredError, invalidRequestError, providerFailedError, insufficientCreditsError } from "../errors";
import { TERMINAL_MEDIA_JOB_STATUSES } from "@ethen/contracts/media/types";
import { validateCallbackUrl } from "@ethen/security/http/ssrf-guard";
import type {
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaJob,
  MediaJobResult,
  MediaProviderStatus,
  VideoParams,
} from "@ethen/contracts/media/types";
import type {
  MediaProviderAdapter,
  MediaProviderAvailability,
  MediaCostEstimate,
} from "./types";

// ── fal.ai image-to-video (V1: fal-ai/wan-i2v only) ──────────────────────────
//
// V1 scope: image-to-video only, one registered model, queue/status-safe.
// No arbitrary client model ids, no identity-sensitive workflows.

const FAL_MODEL_ID = "fal-ai/wan-i2v";
const ALLOWED_MODEL_IDS = new Set([FAL_MODEL_ID]);
const FAL_QUEUE_BASE = "https://queue.fal.run";
const MAX_PROMPT_LENGTH = 1500;

// STU-P0-05: provider-supplied status/result URLs are only ever fetched
// (with the FAL_KEY credential attached) after scheme/origin/host validation
// against this explicit allowlist of fal-controlled domains. Fail closed.
const ALLOWED_FAL_CALLBACK_HOSTS = ["queue.fal.run", "fal.run", "fal.ai"] as const;

// Result byte download (no credential attached) still validates the host to
// prevent SSRF against internal networks — fail closed.
const ALLOWED_FAL_RESULT_HOSTS = [
  ...ALLOWED_FAL_CALLBACK_HOSTS,
  "fal.media",
  "v3.fal.media",
  "storage.fal.ai",
] as const;

function assertSafeFalCallbackUrl(value: string): void {
  const result = validateCallbackUrl(value, ALLOWED_FAL_CALLBACK_HOSTS);
  if (!result.allowed) {
    throw providerFailedError(`Unsafe fal callback URL rejected before fetch: ${result.reason}`);
  }
}

function assertSafeFalResultUrl(value: string): void {
  const result = validateCallbackUrl(value, ALLOWED_FAL_RESULT_HOSTS);
  if (!result.allowed) {
    throw providerFailedError(`Unsafe fal result URL rejected before fetch: ${result.reason}`);
  }
}

function getApiKey(): string | undefined {
  return getServerEnv("FAL_KEY");
}

function isConfigured(): boolean {
  return hasConfiguredServerEnv("FAL_KEY");
}

function resolveImageUrl(request: MediaGenerationRequest): string | null {
  const direct = request.imageUrl?.trim();
  if (direct) return direct;
  const fromParams = (request.params as VideoParams | null | undefined)?.referenceImage?.trim();
  return fromParams || null;
}

function resolveResolution(request: MediaGenerationRequest): "480p" | "720p" {
  return request.qualityPreference === "premium" ? "720p" : "480p";
}

interface FalQueueSubmitResponse {
  request_id?: string;
  status_url?: string;
  response_url?: string;
}

interface FalQueueStatusResponse {
  status?: string;
  error?: string;
}

interface FalVideoResult {
  video?: { url?: string; content_type?: string };
  output?: { video?: { url?: string } };
  error?: string;
}

function buildVideoJob(
  request: MediaGenerationRequest,
  estimatedCredits: number,
): MediaJob {
  const job = createJob({
    ...request,
    modelId: FAL_MODEL_ID,
    providerId: "fal",
  });
  // Explicitly stamp provider/model identity — the shared model registry may
  // not resolve this id, and we never want a fal job to be mislabeled.
  job.providerId = "fal";
  job.providerName = "fal.ai";
  job.modelId = FAL_MODEL_ID;
  job.modelName = "fal · wan-i2v";
  job.estimatedCredits = estimatedCredits;
  return job;
}

function extractVideoUrl(result: FalVideoResult): string | null {
  return result.video?.url ?? result.output?.video?.url ?? null;
}

export const falVideoProvider: MediaProviderAdapter = {
  providerId: "fal",
  label: "fal.ai",

  getAvailability(): MediaProviderAvailability {
    if (!isConfigured()) {
      return {
        available: false,
        missingEnv: ["FAL_KEY"],
        reason: "FAL_KEY is not configured.",
      };
    }
    return { available: true };
  },

  getStatus(): MediaProviderStatus {
    const configured = isConfigured();
    return {
      id: "fal",
      label: "fal.ai",
      modality: "video",
      mode: configured ? "live" : "setup-required",
      available: configured,
      configured,
      setupRequired: !configured,
      setupRequiredReason: configured ? undefined : "FAL_KEY is not configured.",
      lastCheckedAt: new Date().toISOString(),
      trust: configured ? "live" : "setup_required",
      capabilities: ["image-to-video"],
    };
  },

  getCostEstimate(request: MediaGenerationRequest): MediaCostEstimate {
    const draft = request.qualityPreference !== "premium";
    const minCredits = draft ? 12 : 24;
    const maxCredits = draft ? 18 : 36;
    return {
      providerId: "fal",
      modelId: FAL_MODEL_ID,
      minCredits,
      maxCredits,
      status: "estimated",
      note: "Rough V1 estimate for fal wan-i2v image-to-video. Not exact pricing.",
    };
  },

  async generate(request: MediaGenerationRequest): Promise<MediaGenerationResponse> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw setupRequiredError("FAL_KEY is not configured. Set FAL_KEY in your environment.");
    }

    if (request.modelId && !ALLOWED_MODEL_IDS.has(request.modelId)) {
      throw invalidRequestError(
        `Unsupported model id "${request.modelId}" for fal provider. Only ${FAL_MODEL_ID} is registered in V1.`,
      );
    }

    if (request.capability && request.capability !== "image-to-video") {
      throw invalidRequestError(
        "The fal provider only supports the image-to-video capability in V1.",
      );
    }

    if (!request.prompt?.trim()) {
      throw invalidRequestError("A prompt is required for image-to-video generation.");
    }
    if (request.prompt.length > MAX_PROMPT_LENGTH) {
      throw invalidRequestError(`Prompt exceeds ${MAX_PROMPT_LENGTH} characters.`);
    }

    const imageUrl = resolveImageUrl(request);
    if (!imageUrl) {
      throw invalidRequestError(
        "Image-to-video needs a reference image. Upload one in Studio or paste a public image URL.",
      );
    }

    const resolution = resolveResolution(request);
    const draft = resolution === "480p";
    const estimatedCredits = draft ? 15 : 30;

    const job = buildVideoJob(request, estimatedCredits);
    setJobStatus(job.id, "processing");

    let submitResponse: Response;
    try {
      submitResponse = await fetch(`${FAL_QUEUE_BASE}/${FAL_MODEL_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify({
          prompt: request.prompt,
          image_url: imageUrl,
          resolution,
        }),
      });
    } catch (err) {
      const error = classifyError(err);
      failJob(job.id, error.message);
      throw error;
    }

    if (!submitResponse.ok) {
      let errBody = "";
      try {
        errBody = await submitResponse.text();
      } catch {
        // ignore read errors
      }

      if (submitResponse.status === 401) {
        const error = setupRequiredError("fal API key is invalid or unauthorized.");
        failJob(job.id, error.message);
        throw error;
      }

      if (submitResponse.status === 403) {
        const lowerBody = errBody.toLowerCase();
        const error =
          lowerBody.includes("balance") || lowerBody.includes("billing")
            ? insufficientCreditsError("fal account balance is exhausted. Top up billing at fal.ai to resume video generation.")
            : providerFailedError("fal rejected this request (403 Forbidden).");
        failJob(job.id, error.message);
        throw error;
      }

      const error = classifyError(
        new Error(`fal queue submit returned HTTP ${submitResponse.status}: ${errBody.slice(0, 200)}`),
      );
      failJob(job.id, error.message);
      throw error;
    }

    const submitData = (await submitResponse.json()) as FalQueueSubmitResponse;
    const requestId = submitData.request_id;
    if (!requestId) {
      const error = classifyError(new Error("fal queue submit returned no request_id."));
      failJob(job.id, error.message);
      throw error;
    }

    const statusUrl = submitData.status_url ?? `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${requestId}/status`;
    const responseUrl = submitData.response_url ?? `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${requestId}`;

    // STU-P0-05: fail closed on provider-supplied callback URLs before they
    // are stored or ever fetched with credentials.
    assertSafeFalCallbackUrl(statusUrl);
    assertSafeFalCallbackUrl(responseUrl);

    setJobOutput(job.id, {
      fal: { requestId, statusUrl, responseUrl, modelId: FAL_MODEL_ID },
    });

    return {
      ok: true,
      job,
      provider: {
        id: "fal",
        label: "fal.ai",
        mode: "live",
        selectedModelId: FAL_MODEL_ID,
        fallbackUsed: false,
        trust: "live",
      },
      metadata: {
        estimatedCredits,
      },
      jobId: job.id,
      assetIds: [],
      state: job.status,
      urls: [],
      createdAt: job.createdAt,
      estimatedCredits,
      providerAvailable: true,
      providerName: "fal.ai",
      modelName: "fal · wan-i2v",
    };
  },

  async poll(jobId: string): Promise<MediaJob | null> {
    const job = getJob(jobId);
    if (!job || job.providerId !== "fal") return null;
    if (TERMINAL_MEDIA_JOB_STATUSES.includes(job.status)) return job;

    const output = job.output as { fal?: { requestId: string; statusUrl: string; responseUrl: string } } | null;
    const falMeta = output?.fal;
    if (!falMeta) return job;

    const apiKey = getApiKey();
    if (!apiKey) {
      return failJob(job.id, "FAL_KEY is no longer configured on the server.");
    }

    // STU-P0-05: never fetch a provider-supplied URL with the credential
    // until it passes scheme/origin/host validation. Fail closed (job
    // failure) rather than allowing a malicious callback host to receive
    // the FAL_KEY or forcing the job to a false success.
    try {
      assertSafeFalCallbackUrl(falMeta.statusUrl);
      assertSafeFalCallbackUrl(falMeta.responseUrl);
    } catch {
      return failJob(job.id, "fal returned an unsafe status or result URL; refusing to fetch it with credentials.");
    }

    try {
      const statusResponse = await fetch(falMeta.statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
        // Redirects are not followed: a redirect to an attacker-controlled
        // host must not receive the credential.
        redirect: "error",
      });

      if (!statusResponse.ok) {
        // Transient — keep the job processing rather than failing on a blip.
        return job;
      }

      const statusBody = (await statusResponse.json()) as FalQueueStatusResponse;
      const status = (statusBody.status ?? "").toUpperCase();

      if (status === "COMPLETED") {
        const resultResponse = await fetch(falMeta.responseUrl, {
          headers: { Authorization: `Key ${apiKey}` },
          redirect: "error",
        });
        if (!resultResponse.ok) {
          return failJob(job.id, "fal reported completion but the result could not be retrieved.");
        }
        const result = (await resultResponse.json()) as FalVideoResult;
        const videoUrl = extractVideoUrl(result);
        if (!videoUrl) {
          return failJob(job.id, "fal returned a completed job with no video output.");
        }

        const jobResult: MediaJobResult = {
          modality: "video",
          assetUrl: videoUrl,
          previewUrl: videoUrl,
          metadata: {
            width: null,
            height: null,
            durationSeconds: null,
            fileSizeBytes: 0,
            mimeType: result.video?.content_type ?? "video/mp4",
            format: "mp4",
            label: "fal · wan-i2v video",
            extra: null,
            prompt: job.prompt ?? undefined,
          },
          generatedAt: new Date().toISOString(),
          isMock: false,
        };
        const updated = setJobResult(job.id, jobResult);

        addAsset({
          type: "video",
          modality: "video",
          kind: "video",
          url: videoUrl,
          thumbnailUrl: null,
          jobId: job.id,
          projectId: job.projectId,
          prompt: job.prompt,
          modelId: FAL_MODEL_ID,
          modelName: "fal · wan-i2v",
          providerId: "fal",
          providerName: "fal.ai",
          mimeType: result.video?.content_type ?? "video/mp4",
          width: null,
          height: null,
          source: "provider_result",
          isMock: false,
        });

        return updated;
      }

      if (status === "ERROR" || status === "FAILED") {
        return failJob(job.id, statusBody.error ?? "fal reported a failed video generation.");
      }

      // IN_QUEUE / IN_PROGRESS — nudge progress without flipping status.
      setJobProgress(job.id, Math.min(90, (job.progress ?? 75) + 5));
      return getJob(job.id);
    } catch {
      // Transient network error while polling — leave job processing.
      return job;
    }
  },
};

// ── JOB 05: durable-worker-facing fal API ─────────────────────────────────
// Deterministic submit/poll/result/cancel driven by the provider request id
// (recoverable after a crash WITHOUT a second spend), through the Job-01
// hardened URL discipline (scheme/origin/host allowlist, redirect: "error").

export interface FalSubmitReceipt {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

/**
 * Marker for submit-boundary uncertainty: the request may have committed
 * provider-side (spend happened) but the receipt is unknown — transport
 * loss, timeout, unparseable reply, or an ambiguous provider status.
 * Handlers must reconcile, never blind-retry and never release liability.
 */
export const FAL_DISPATCH_UNCERTAIN = "FAL_DISPATCH_UNCERTAIN";

export function isFalDispatchUncertain(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(FAL_DISPATCH_UNCERTAIN);
}

function uncertainDispatchError(detail: string): ReturnType<typeof providerFailedError> {
  return providerFailedError(`${FAL_DISPATCH_UNCERTAIN}: ${detail}`);
}

/**
 * Submit one image-to-video generation to the fal queue. All pre-dispatch
 * validation happens BEFORE the POST; the receipt is returned only after a
 * successful dispatch (provider request id known).
 */
export async function submitFalVideoGeneration(
  request: MediaGenerationRequest,
  options?: { timeoutMs?: number },
): Promise<FalSubmitReceipt> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw setupRequiredError("FAL_KEY is not configured. Set FAL_KEY in your environment.");
  }
  if (request.modelId && !ALLOWED_MODEL_IDS.has(request.modelId)) {
    throw invalidRequestError(`Unsupported model id "${request.modelId}" for fal provider. Only ${FAL_MODEL_ID} is registered in V1.`);
  }
  if (request.capability && request.capability !== "image-to-video") {
    throw invalidRequestError("The fal provider only supports the image-to-video capability in V1.");
  }
  if (!request.prompt?.trim()) {
    throw invalidRequestError("A prompt is required for image-to-video generation.");
  }
  if (request.prompt.length > MAX_PROMPT_LENGTH) {
    throw invalidRequestError(`Prompt exceeds ${MAX_PROMPT_LENGTH} characters.`);
  }
  const imageUrl = resolveImageUrl(request);
  if (!imageUrl) {
    throw invalidRequestError("Image-to-video needs a reference image. Upload one in Studio or paste a public image URL.");
  }
  const resolution = resolveResolution(request);
  const timeoutMs = options?.timeoutMs ?? 30_000;

  let submitResponse: Response;
  try {
    submitResponse = await fetch(`${FAL_QUEUE_BASE}/${FAL_MODEL_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({ prompt: request.prompt, image_url: imageUrl, resolution }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Transport loss around the POST: the provider may have committed.
    throw uncertainDispatchError(`submit transport failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!submitResponse.ok) {
    let errBody = "";
    try {
      errBody = await submitResponse.text();
    } catch {
      // ignore read errors
    }
    if (submitResponse.status === 401) {
      throw setupRequiredError("fal API key is invalid or unauthorized.");
    }
    if (submitResponse.status === 403) {
      const lowerBody = errBody.toLowerCase();
      throw lowerBody.includes("balance") || lowerBody.includes("billing")
        ? insufficientCreditsError("fal account balance is exhausted. Top up billing at fal.ai to resume video generation.")
        : providerFailedError("fal rejected this request (403 Forbidden).");
    }
    if (submitResponse.status === 429 || submitResponse.status >= 500) {
      // Ambiguous provider status: admission-side throttles and server
      // failures may follow an accepted commit.
      throw uncertainDispatchError(`submit returned HTTP ${submitResponse.status}: ${errBody.slice(0, 200)}`);
    }
    throw classifyError(new Error(`fal queue submit returned HTTP ${submitResponse.status}: ${errBody.slice(0, 200)}`));
  }

  let submitData: FalQueueSubmitResponse;
  try {
    submitData = (await submitResponse.json()) as FalQueueSubmitResponse;
  } catch (error) {
    throw uncertainDispatchError(`submit reply unparseable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const requestId = submitData.request_id;
  if (!requestId) {
    throw uncertainDispatchError("submit returned no request_id.");
  }
  const statusUrl = submitData.status_url ?? `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${requestId}/status`;
  const responseUrl = submitData.response_url ?? `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${requestId}`;

  // STU-P0-05: fail closed on provider-supplied callback URLs before they are
  // ever fetched with credentials.
  assertSafeFalCallbackUrl(statusUrl);
  assertSafeFalCallbackUrl(responseUrl);

  return { requestId, statusUrl, responseUrl };
}

/** Poll the fal queue status for a request id (hardened; transient blips return "UNKNOWN"). */
export async function pollFalVideoStatus(
  requestId: string,
  options?: { timeoutMs?: number },
): Promise<{ status: string; error?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw setupRequiredError("FAL_KEY is no longer configured on the server.");
  const statusUrl = `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${encodeURIComponent(requestId)}/status`;
  assertSafeFalCallbackUrl(statusUrl);
  try {
    const response = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(options?.timeoutMs ?? 20_000),
    });
    if (!response.ok) return { status: "UNKNOWN" };
    const body = (await response.json()) as FalQueueStatusResponse;
    return { status: (body.status ?? "UNKNOWN").toUpperCase(), error: body.error };
  } catch {
    return { status: "UNKNOWN" };
  }
}

/** Fetch the completed fal result for a request id (hardened). */
export async function fetchFalVideoResult(
  requestId: string,
  options?: { timeoutMs?: number },
): Promise<{ videoUrl: string; mimeType: string; previewUrl?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw setupRequiredError("FAL_KEY is no longer configured on the server.");
  const responseUrl = `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${encodeURIComponent(requestId)}`;
  assertSafeFalCallbackUrl(responseUrl);
  const response = await fetch(responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
    redirect: "error",
    signal: AbortSignal.timeout(options?.timeoutMs ?? 30_000),
  });
  if (!response.ok) {
    throw providerFailedError("fal reported completion but the result could not be retrieved.");
  }
  const result = (await response.json()) as FalVideoResult;
  const videoUrl = extractVideoUrl(result);
  if (!videoUrl) {
    throw providerFailedError("fal returned a completed job with no video output.");
  }
  const preview = (result as { video?: { preview_url?: string; thumbnail_url?: string } }).video;
  const previewUrl = typeof preview?.preview_url === "string" ? preview.preview_url : typeof preview?.thumbnail_url === "string" ? preview.thumbnail_url : undefined;
  return { videoUrl, mimeType: result.video?.content_type ?? "video/mp4", ...(previewUrl ? { previewUrl } : {}) };
}

/** Truthful upstream cancellation (best effort): fal supports cancelling a queued request. */
export async function cancelFalVideo(requestId: string, options?: { timeoutMs?: number }): Promise<boolean> {
  const apiKey = getApiKey();
  if (!apiKey) return false;
  const cancelUrl = `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${encodeURIComponent(requestId)}/cancel`;
  assertSafeFalCallbackUrl(cancelUrl);
  try {
    const response = await fetch(cancelUrl, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(options?.timeoutMs ?? 15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Download the final video bytes from a validated fal result URL (no credential attached). */
export async function downloadFalVideoBytes(
  videoUrl: string,
  options?: { timeoutMs?: number },
): Promise<{ bytes: Uint8Array; contentType: string; status?: number }> {
  assertSafeFalResultUrl(videoUrl);
  const response = await fetch(videoUrl, { redirect: "error", signal: AbortSignal.timeout(options?.timeoutMs ?? 120_000) });
  if (!response.ok) {
    const error = providerFailedError(`fal result download failed with HTTP ${response.status}.`) as unknown as Error & { httpStatus?: number };
    error.httpStatus = response.status;
    throw error;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, contentType: response.headers.get("content-type") ?? "video/mp4", status: response.status };
}

/**
 * Studio V3 Job 3 — parameterized fal queue seam for the verified fal-media
 * routes (flux text-to-image, Qwen image-editing, Wan text-to-video).
 * Same hardening as the pinned image-to-video lane; new exports only, so the
 * pinned lane's behavior is untouched.
 */

export function isFalMediaConfigured(): boolean {
  return isConfigured();
}

const FAL_MEDIA_ENDPOINTS = new Set([
  "fal-ai/flux/dev",
  "alibaba/qwen-image-3/edit",
  "wan/v2.6/text-to-video",
]);

const FAL_MEDIA_PROMPT_MAX = 4000;

function assertFalMediaEndpoint(endpointId: string): void {
  if (!FAL_MEDIA_ENDPOINTS.has(endpointId)) {
    throw invalidRequestError(`Unsupported fal endpoint "${endpointId}". Only the verified fal-media routes may execute.`);
  }
}

/**
 * Submit one fal-media generation to the fal queue. All pre-dispatch
 * validation happens BEFORE the POST; the receipt returns only after a
 * successful dispatch (provider request id known).
 */
export async function submitFalMediaGeneration(
  endpointId: string,
  input: Record<string, unknown>,
  options?: { timeoutMs?: number },
): Promise<FalSubmitReceipt> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw setupRequiredError("FAL_KEY is not configured. Set FAL_KEY in your environment.");
  }
  assertFalMediaEndpoint(endpointId);
  const prompt = input["prompt"];
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw invalidRequestError("A prompt is required for fal generation.");
  }
  if (prompt.length > FAL_MEDIA_PROMPT_MAX) {
    throw invalidRequestError(`Prompt exceeds ${FAL_MEDIA_PROMPT_MAX} characters.`);
  }
  const timeoutMs = options?.timeoutMs ?? 30_000;

  let submitResponse: Response;
  try {
    submitResponse = await fetch(`${FAL_QUEUE_BASE}/${endpointId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Transport loss around the POST: the provider may have committed.
    throw uncertainDispatchError(`submit transport failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!submitResponse.ok) {
    let errBody = "";
    try {
      errBody = await submitResponse.text();
    } catch {
      // ignore read errors
    }
    if (submitResponse.status === 401) {
      throw setupRequiredError("fal API key is invalid or unauthorized.");
    }
    if (submitResponse.status === 403) {
      const lowerBody = errBody.toLowerCase();
      throw lowerBody.includes("balance") || lowerBody.includes("billing")
        ? insufficientCreditsError("fal account balance is exhausted. Top up billing at fal.ai to resume generation.")
        : providerFailedError("fal rejected this request (403 Forbidden).");
    }
    if (submitResponse.status === 429 || submitResponse.status >= 500) {
      // Ambiguous provider status: admission-side throttles and server
      // failures may follow an accepted commit.
      throw uncertainDispatchError(`submit returned HTTP ${submitResponse.status}: ${errBody.slice(0, 200)}`);
    }
    throw classifyError(new Error(`fal queue submit returned HTTP ${submitResponse.status}: ${errBody.slice(0, 200)}`));
  }

  let submitData: FalQueueSubmitResponse;
  try {
    submitData = (await submitResponse.json()) as FalQueueSubmitResponse;
  } catch (error) {
    throw uncertainDispatchError(`submit reply unparseable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const requestId = submitData.request_id;
  if (!requestId) {
    throw uncertainDispatchError("submit returned no request_id.");
  }
  const statusUrl = submitData.status_url ?? `${FAL_QUEUE_BASE}/${endpointId}/requests/${requestId}/status`;
  const responseUrl = submitData.response_url ?? `${FAL_QUEUE_BASE}/${endpointId}/requests/${requestId}`;

  assertSafeFalCallbackUrl(statusUrl);
  assertSafeFalCallbackUrl(responseUrl);

  return { requestId, statusUrl, responseUrl };
}

/** Poll the fal queue status for a fal-media request (transient blips return "UNKNOWN"). */
export async function pollFalMediaStatus(
  endpointId: string,
  requestId: string,
  options?: { timeoutMs?: number },
): Promise<{ status: string; error?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw setupRequiredError("FAL_KEY is no longer configured on the server.");
  assertFalMediaEndpoint(endpointId);
  const statusUrl = `${FAL_QUEUE_BASE}/${endpointId}/requests/${encodeURIComponent(requestId)}/status`;
  assertSafeFalCallbackUrl(statusUrl);
  try {
    const response = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(options?.timeoutMs ?? 20_000),
    });
    if (!response.ok) return { status: "UNKNOWN" };
    const body = (await response.json()) as FalQueueStatusResponse;
    return { status: (body.status ?? "UNKNOWN").toUpperCase(), error: body.error };
  } catch {
    return { status: "UNKNOWN" };
  }
}

export interface FalMediaOutput {
  url: string;
  contentType: string | null;
  kind: "image" | "video";
}

interface FalMediaResultPayload {
  images?: Array<{ url?: string; content_type?: string }>;
  video?: string | { url?: string; content_type?: string };
}

/** Fetch the completed fal-media result (images[] for image routes, video for Wan t2v). */
export async function fetchFalMediaResult(
  endpointId: string,
  requestId: string,
  options?: { timeoutMs?: number },
): Promise<{ outputs: FalMediaOutput[] }> {
  const apiKey = getApiKey();
  if (!apiKey) throw setupRequiredError("FAL_KEY is no longer configured on the server.");
  assertFalMediaEndpoint(endpointId);
  const responseUrl = `${FAL_QUEUE_BASE}/${endpointId}/requests/${encodeURIComponent(requestId)}`;
  assertSafeFalCallbackUrl(responseUrl);
  const response = await fetch(responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
    redirect: "error",
    signal: AbortSignal.timeout(options?.timeoutMs ?? 30_000),
  });
  if (!response.ok) {
    throw providerFailedError("fal reported completion but the result could not be retrieved.");
  }
  const result = (await response.json()) as FalMediaResultPayload;
  const outputs: FalMediaOutput[] = [];
  if (Array.isArray(result.images)) {
    for (const image of result.images) {
      if (image && typeof image.url === "string" && image.url.trim()) {
        outputs.push({
          url: image.url.trim(),
          contentType: typeof image.content_type === "string" ? image.content_type : null,
          kind: "image",
        });
      }
    }
  }
  const video = result.video;
  const videoUrl = typeof video === "string" ? video : typeof video?.url === "string" ? video.url : null;
  if (videoUrl && videoUrl.trim()) {
    outputs.push({
      url: videoUrl.trim(),
      contentType: typeof video === "object" && video && typeof video.content_type === "string" ? video.content_type : null,
      kind: "video",
    });
  }
  if (outputs.length === 0) {
    throw providerFailedError("fal returned a completed job with no image or video output.");
  }
  return { outputs };
}

/** Truthful upstream cancellation (best effort) for a fal-media request. */
export async function cancelFalMedia(endpointId: string, requestId: string, options?: { timeoutMs?: number }): Promise<boolean> {
  const apiKey = getApiKey();
  if (!apiKey) return false;
  assertFalMediaEndpoint(endpointId);
  const cancelUrl = `${FAL_QUEUE_BASE}/${endpointId}/requests/${encodeURIComponent(requestId)}/cancel`;
  assertSafeFalCallbackUrl(cancelUrl);
  try {
    const response = await fetch(cancelUrl, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(options?.timeoutMs ?? 15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Download final fal-media bytes from a validated fal result URL (no credential attached). */
export async function downloadFalMediaBytes(
  mediaUrl: string,
  options?: { timeoutMs?: number },
): Promise<{ bytes: Uint8Array; contentType: string; status?: number }> {
  return downloadFalVideoBytes(mediaUrl, options);
}

