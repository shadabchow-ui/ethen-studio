import "server-only";

import { addAsset } from "../assets";
import { classifyError, invalidRequestError, providerFailedError, setupRequiredError } from "../errors";
import { createJob, failJob, getJob, setJobOutput, setJobProgress, setJobResult, setJobStatus } from "../jobs";
import { hasConfiguredServerEnv, getServerEnv } from "@ethen/config/env";
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
  MediaCostEstimate,
  MediaProviderAdapter,
  MediaProviderAvailability,
} from "./types";

const GENERIC_VIDEO_MODEL_ID = "generic-video-default";
const GENERIC_VIDEO_LABEL = "Generic Video";
const GENERIC_VIDEO_API_URL_ENV = "GENERIC_VIDEO_API_URL";
const GENERIC_VIDEO_API_KEY_ENV = "GENERIC_VIDEO_API_KEY";
const MAX_PROMPT_LENGTH = 2000;

type GenericVideoPendingStatus = "queued" | "pending" | "processing" | "running";
type GenericVideoTerminalStatus = "completed" | "failed" | "error" | "canceled";
type GenericVideoStatus = GenericVideoPendingStatus | GenericVideoTerminalStatus;

interface GenericVideoSyncResponse {
  videoUrl: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  thumbnailUrl?: string;
  providerJobId?: string;
}

interface GenericVideoAsyncResponse {
  jobId: string;
  statusUrl: string;
  resultUrl?: string;
}

interface GenericVideoStatusResponse {
  status?: string;
  progress?: number;
  error?: string;
  resultUrl?: string;
  videoUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  thumbnailUrl?: string;
  providerJobId?: string;
}

interface GenericVideoJobOutput {
  genericVideo?: {
    jobId: string;
    statusUrl: string;
    resultUrl?: string;
  };
}

function getApiUrl(): string | undefined {
  return getServerEnv(GENERIC_VIDEO_API_URL_ENV);
}

// STU-P0-05 (same defect class as fal): provider-supplied statusUrl/resultUrl
// values are only fetched with credentials after validating that they live on
// the same host as the operator-configured gateway endpoint.
function allowedCallbackHosts(): string[] {
  const apiUrl = getApiUrl();
  if (!apiUrl) return [];
  try {
    const host = new URL(apiUrl).hostname.toLowerCase().replace(/\.$/, "");
    return host ? [host] : [];
  } catch {
    return [];
  }
}

function assertSafeCallbackUrl(value: string): void {
  const hosts = allowedCallbackHosts();
  const result = validateCallbackUrl(value, hosts);
  if (!result.allowed) {
    throw providerFailedError(`Unsafe provider callback URL rejected before fetch: ${result.reason}`);
  }
}

function getApiKey(): string | undefined {
  return getServerEnv(GENERIC_VIDEO_API_KEY_ENV);
}

function isConfigured(): boolean {
  return hasConfiguredServerEnv(GENERIC_VIDEO_API_URL_ENV) && hasConfiguredServerEnv(GENERIC_VIDEO_API_KEY_ENV);
}

function getAvailabilityReason(): string {
  return "Configure GENERIC_VIDEO_API_URL and GENERIC_VIDEO_API_KEY to enable the local generic text-to-video contract.";
}

function getMissingEnv(): string[] {
  return [GENERIC_VIDEO_API_URL_ENV, GENERIC_VIDEO_API_KEY_ENV].filter((name) => !hasConfiguredServerEnv(name));
}

function buildHeaders(apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-API-Key": apiKey,
  };
}

function normalizeAspectRatio(request: MediaGenerationRequest): string | undefined {
  const fromConfig = request.config?.aspectRatio?.trim();
  if (fromConfig) return fromConfig;
  const fromParams = (request.params as VideoParams | null | undefined)?.aspectRatio?.trim();
  return fromParams || undefined;
}

function normalizeDurationSeconds(request: MediaGenerationRequest): number | undefined {
  if (typeof request.durationSeconds === "number" && Number.isFinite(request.durationSeconds)) {
    return request.durationSeconds;
  }
  if (typeof request.config?.durationSeconds === "number" && Number.isFinite(request.config.durationSeconds)) {
    return request.config.durationSeconds;
  }
  const fromParams = (request.params as VideoParams | null | undefined)?.durationSeconds;
  if (typeof fromParams === "number" && Number.isFinite(fromParams)) {
    return fromParams;
  }
  const rawDuration = (request.params as VideoParams | null | undefined)?.duration;
  if (typeof rawDuration === "number" && Number.isFinite(rawDuration)) {
    return rawDuration;
  }
  return undefined;
}

function parseJsonObject(payload: string): Record<string, unknown> {
  const parsed = JSON.parse(payload) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw providerFailedError("Generic Video provider returned a non-object response.");
  }
  return parsed as Record<string, unknown>;
}

async function readResponseObject(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    throw providerFailedError("Generic Video provider returned an empty response.");
  }

  try {
    return parseJsonObject(text);
  } catch (error) {
    if (error instanceof Error && error.name === "SyntaxError") {
      throw providerFailedError("Generic Video provider returned invalid JSON.");
    }
    throw error;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseCompletedResponse(body: Record<string, unknown>): GenericVideoSyncResponse | null {
  const videoUrl = asString(body.videoUrl);
  if (!videoUrl) return null;

  return {
    videoUrl,
    mimeType: asString(body.mimeType),
    width: asNumber(body.width),
    height: asNumber(body.height),
    durationSeconds: asNumber(body.durationSeconds),
    thumbnailUrl: asString(body.thumbnailUrl),
    providerJobId: asString(body.providerJobId) ?? asString(body.jobId),
  };
}

function parseAcceptedResponse(body: Record<string, unknown>): GenericVideoAsyncResponse | null {
  const jobId = asString(body.jobId);
  const statusUrl = asString(body.statusUrl);
  if (!jobId || !statusUrl) return null;

  return {
    jobId,
    statusUrl,
    resultUrl: asString(body.resultUrl),
  };
}

function normalizeStatus(value: unknown): GenericVideoStatus | null {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === "queued" || normalized === "pending" || normalized === "processing" || normalized === "running") return normalized;
  if (normalized === "completed" || normalized === "failed" || normalized === "error" || normalized === "canceled") return normalized;
  return null;
}

function buildVideoJob(request: MediaGenerationRequest, estimatedCredits: number): MediaJob {
  const job = createJob({
    ...request,
    modelId: GENERIC_VIDEO_MODEL_ID,
    providerId: "generic-video",
  });
  job.providerId = "generic-video";
  job.providerName = GENERIC_VIDEO_LABEL;
  job.modelId = GENERIC_VIDEO_MODEL_ID;
  job.modelName = "Generic Text-to-Video";
  job.estimatedCredits = estimatedCredits;
  return job;
}

function buildJobResult(job: MediaJob, response: GenericVideoSyncResponse): MediaJobResult {
  return {
    modality: "video",
    assetUrl: response.videoUrl,
    previewUrl: response.thumbnailUrl ?? response.videoUrl,
    metadata: {
      width: response.width ?? null,
      height: response.height ?? null,
      durationSeconds: response.durationSeconds ?? null,
      fileSizeBytes: 0,
      mimeType: response.mimeType ?? "video/mp4",
      format: "mp4",
      label: "Generic text-to-video output",
      extra: response.providerJobId ? { providerJobId: response.providerJobId } : null,
      prompt: job.prompt ?? undefined,
    },
    generatedAt: new Date().toISOString(),
    isMock: false,
  };
}

function finalizeCompletedJob(job: MediaJob, response: GenericVideoSyncResponse): MediaJob | null {
  const updated = setJobResult(job.id, buildJobResult(job, response));

  addAsset({
    type: "video",
    modality: "video",
    kind: "video",
    url: response.videoUrl,
    thumbnailUrl: response.thumbnailUrl ?? null,
    jobId: job.id,
    projectId: job.projectId,
    prompt: job.prompt,
    modelId: GENERIC_VIDEO_MODEL_ID,
    modelName: "Generic Text-to-Video",
    providerId: "generic-video",
    providerName: GENERIC_VIDEO_LABEL,
    mimeType: response.mimeType ?? "video/mp4",
    width: response.width ?? null,
    height: response.height ?? null,
    durationSeconds: response.durationSeconds ?? null,
    source: "provider_result",
    isMock: false,
    metadata: response.providerJobId ? { providerJobId: response.providerJobId } : null,
  });

  return updated;
}

function validateGenerateRequest(request: MediaGenerationRequest): void {
  if (request.capability && request.capability !== "text-to-video") {
    throw invalidRequestError("The Generic Video provider only supports the text-to-video capability.");
  }
  if (!request.prompt?.trim()) {
    throw invalidRequestError("A prompt is required for text-to-video generation.");
  }
  if (request.prompt.length > MAX_PROMPT_LENGTH) {
    throw invalidRequestError(`Prompt exceeds ${MAX_PROMPT_LENGTH} characters.`);
  }
}

/**
 * Local Generic Video contract:
 *
 * Request:
 * POST ${GENERIC_VIDEO_API_URL_ENV}
 * Headers:
 * - Authorization: Bearer ${GENERIC_VIDEO_API_KEY_ENV}
 * - X-API-Key: ${GENERIC_VIDEO_API_KEY_ENV}
 * JSON body:
 * {
 *   prompt: string,
 *   aspectRatio?: string,
 *   durationSeconds?: number,
 *   seed?: number,
 *   config?: Record<string, unknown>
 * }
 *
 * Response:
 * 1. Completed result:
 *    { videoUrl: string, mimeType?: string, width?: number, height?: number, durationSeconds?: number, thumbnailUrl?: string }
 * 2. Async accepted result:
 *    { jobId: string, statusUrl: string, resultUrl?: string }
 *
 * Polling:
 * GET statusUrl with the same auth headers.
 * - Pending:   { status: "queued" | "pending" | "processing" | "running", progress?: number }
 * - Completed: { status: "completed", videoUrl?: string, resultUrl?: string, ...metadata }
 * - Failed:    { status: "failed" | "error" | "canceled", error?: string }
 *
 * Result fetch:
 * If a completed poll response omits videoUrl, it must provide an explicit resultUrl.
 * The adapter never guesses poll or result endpoints from job ids.
 */
export const genericVideoProvider: MediaProviderAdapter = {
  providerId: "generic-video",
  label: GENERIC_VIDEO_LABEL,

  getAvailability(): MediaProviderAvailability {
    if (!isConfigured()) {
      return {
        available: false,
        missingEnv: getMissingEnv(),
        reason: getAvailabilityReason(),
      };
    }
    return { available: true };
  },

  getStatus(): MediaProviderStatus {
    const configured = isConfigured();
    return {
      id: "generic-video",
      label: GENERIC_VIDEO_LABEL,
      modality: "video",
      mode: configured ? "live" : "setup-required",
      available: configured,
      configured,
      setupRequired: !configured,
      setupRequiredReason: configured ? undefined : getAvailabilityReason(),
      lastCheckedAt: new Date().toISOString(),
      trust: configured ? "live" : "setup_required",
      capabilities: ["text-to-video"],
    };
  },

  getCostEstimate(_request: MediaGenerationRequest): MediaCostEstimate {
    return {
      providerId: "generic-video",
      modelId: GENERIC_VIDEO_MODEL_ID,
      minCredits: 20,
      maxCredits: 40,
      status: "tier_only",
      note: "Generic text-to-video estimate. Actual cost depends on your configured upstream provider.",
    };
  },

  async generate(request: MediaGenerationRequest): Promise<MediaGenerationResponse> {
    validateGenerateRequest(request);

    const apiUrl = getApiUrl();
    const apiKey = getApiKey();
    if (!apiUrl || !apiKey) {
      throw setupRequiredError(getAvailabilityReason());
    }

    const estimatedCredits = 24;
    const job = buildVideoJob(request, estimatedCredits);
    const body = {
      prompt: request.prompt.trim(),
      aspectRatio: normalizeAspectRatio(request),
      durationSeconds: normalizeDurationSeconds(request),
      seed: typeof request.seed === "number" ? request.seed : undefined,
      config: request.extraParams ?? request.config ?? undefined,
    };

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify(body),
      });
    } catch (error) {
      const classified = classifyError(error);
      failJob(job.id, classified.message);
      throw classified;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) {
        const error = setupRequiredError("Generic Video API credentials were rejected by the configured endpoint.");
        failJob(job.id, error.message);
        throw error;
      }

      const error = classifyError(
        new Error(`Generic Video endpoint returned HTTP ${response.status}: ${errorBody.slice(0, 200)}`),
      );
      failJob(job.id, error.message);
      throw error;
    }

    const parsed = await readResponseObject(response);
    const completed = parseCompletedResponse(parsed);
    if (completed) {
      const updated = finalizeCompletedJob(job, completed) ?? job;
      return {
        ok: true,
        job: updated,
        provider: {
          id: "generic-video",
          label: GENERIC_VIDEO_LABEL,
          mode: "live",
          selectedModelId: GENERIC_VIDEO_MODEL_ID,
          fallbackUsed: false,
          trust: "live",
        },
        metadata: {
          estimatedCredits,
        },
        jobId: updated.id,
        assetIds: updated.assetId ? [updated.assetId] : [],
        state: updated.status,
        createdAt: updated.createdAt,
        estimatedCredits,
        providerAvailable: true,
        providerName: GENERIC_VIDEO_LABEL,
        modelName: "Generic Text-to-Video",
      };
    }

    const accepted = parseAcceptedResponse(parsed);
    if (!accepted) {
      const error = providerFailedError(
        "Generic Video provider returned an invalid response. Expected { videoUrl } or { jobId, statusUrl }.",
      );
      failJob(job.id, error.message);
      throw error;
    }

    setJobStatus(job.id, "processing");
    // STU-P0-05: validate provider-supplied callback URLs before persisting
    // them; they are fetched later with credentials.
    assertSafeCallbackUrl(accepted.statusUrl);
    if (accepted.resultUrl) assertSafeCallbackUrl(accepted.resultUrl);
    setJobOutput(job.id, {
      genericVideo: {
        jobId: accepted.jobId,
        statusUrl: accepted.statusUrl,
        resultUrl: accepted.resultUrl,
      },
    });

    return {
      ok: true,
      job,
      provider: {
        id: "generic-video",
        label: GENERIC_VIDEO_LABEL,
        mode: "live",
        selectedModelId: GENERIC_VIDEO_MODEL_ID,
        fallbackUsed: false,
        trust: "live",
      },
      metadata: {
        estimatedCredits,
      },
      jobId: job.id,
      assetIds: [],
      state: "processing",
      createdAt: job.createdAt,
      estimatedCredits,
      providerAvailable: true,
      providerName: GENERIC_VIDEO_LABEL,
      modelName: "Generic Text-to-Video",
    };
  },

  async poll(jobId: string): Promise<MediaJob | null> {
    const job = getJob(jobId);
    if (!job || job.providerId !== "generic-video") return null;
    if (TERMINAL_MEDIA_JOB_STATUSES.includes(job.status)) return job;

    const apiKey = getApiKey();
    if (!apiKey) {
      return failJob(job.id, "Generic Video credentials are no longer configured on the server.");
    }

    const output = job.output as GenericVideoJobOutput | null;
    const meta = output?.genericVideo;
    if (!meta?.statusUrl) {
      return failJob(job.id, "Generic Video job is missing an explicit statusUrl for polling.");
    }

    try {
      // STU-P0-05: never fetch a provider-supplied URL with credentials until
      // it passes scheme/origin/host validation.
      assertSafeCallbackUrl(meta.statusUrl);
      if (meta.resultUrl) assertSafeCallbackUrl(meta.resultUrl);
      // An invalid callback URL is a permanent provider contract failure, not
      // a transient blip — fail the job instead of silently retrying forever.
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unsafe provider callback URL.";
      return failJob(job.id, message);
    }

    try {
      const statusResponse = await fetch(meta.statusUrl, {
        headers: buildHeaders(apiKey),
        redirect: "error",
      });
      if (!statusResponse.ok) {
        return job;
      }

      const parsed = await readResponseObject(statusResponse);
      const status = normalizeStatus(parsed.status);
      const completed = parseCompletedResponse(parsed);

      if (completed || status === "completed") {
        if (completed) {
          return finalizeCompletedJob(job, completed);
        }

        const resultUrl = asString(parsed.resultUrl) ?? meta.resultUrl;
        if (!resultUrl) {
          return failJob(job.id, "Generic Video completed without a videoUrl or explicit resultUrl.");
        }

        // STU-P0-05: the completed-status response may carry its own
        // resultUrl — validate it too before the credentialed fetch.
        try {
          assertSafeCallbackUrl(resultUrl);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unsafe provider result URL.";
          return failJob(job.id, message);
        }
        const resultResponse = await fetch(resultUrl, {
          headers: buildHeaders(apiKey),
          redirect: "error",
        });
        if (!resultResponse.ok) {
          return failJob(job.id, "Generic Video completed but the result payload could not be retrieved.");
        }

        const resultParsed = await readResponseObject(resultResponse);
        const resultBody = parseCompletedResponse(resultParsed);
        if (!resultBody) {
          return failJob(job.id, "Generic Video result payload did not include a completed videoUrl.");
        }

        return finalizeCompletedJob(job, resultBody);
      }

      if (status === "failed" || status === "error" || status === "canceled") {
        return failJob(job.id, asString(parsed.error) ?? "Generic Video reported a failed text-to-video generation.");
      }

      const progress = asNumber(parsed.progress);
      if (typeof progress === "number") {
        setJobProgress(job.id, progress);
      } else {
        setJobProgress(job.id, Math.min(90, (job.progress ?? 70) + 5));
      }

      return getJob(job.id);
    } catch (error) {
      const classified = classifyError(error);
      if (classified.code === "provider_failed") {
        return job;
      }
      return job;
    }
  },
};
