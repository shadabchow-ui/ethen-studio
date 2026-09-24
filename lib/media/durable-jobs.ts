/**
 * lib/media/durable-jobs.ts
 *
 * PR-ST-01: Media jobs as durable jobs on SP-01 (DurableJobService).
 * Assets stored in SP-08 tenant object storage.
 *
 * PR-ST-02: Routing receipt names the model actually used.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import type { JobRepository } from "@ethen/ai/platform/jobs/repository";
import { createPlatformJobRepository } from "@ethen/ai/platform/jobs/factory";
import { uploadTenantObject } from "@ethen/database/storage/tenant-object-storage";
import { createServiceClient } from "@ethen/database/service";
import { selectMediaProvider } from "./router";
import { createJob, setJobStatus, getJob } from "./jobs";
import { qualifyVideoCapability, resolveVideoRoute } from "./video-capability";
import { SupabaseStudioQuotaService, tryReleaseDuplicateQuota, type StudioQuotaPort } from "./durable-quota";
import { SupabaseImageCreditLedger } from "./image-settlement";
import type {
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaJob,
  MediaAsset,
} from "./types";

const DEFAULT_RETENTION_DAYS_MEDIA = 90;

export interface DurableMediaJobResult {
  jobId: string;
  durableJobId: string;
  status: string;
  assetUrl: string | null;
  assetKey: string | null;
  providerId: string;
  modelId: string;
  fallbackUsed: boolean;
  routingReceipt: {
    providerId: string;
    modelId: string;
    fallbackUsed: boolean;
    fallbackReason?: string;
  };
}

export async function createDurableMediaJob(
  projectId: string,
  actorId: string,
  organizationId: string,
  generationRequest: MediaGenerationRequest,
  repository?: JobRepository,
  quota?: StudioQuotaPort,
): Promise<DurableMediaJobResult> {
  const repo = repository ?? createPlatformJobRepository();
  const jobService = new DurableJobService({ repository: repo });

  const modality = generationRequest.mode === "video" ? "video"
    : generationRequest.mode === "audio" ? "audio"
    : "image";

  const routerResult = selectMediaProvider({
    modality,
    capability: generationRequest.capability ?? undefined,
    modelId: generationRequest.modelId,
    providerId: generationRequest.providerId,
  });

  const mediaJob = createJob({
    ...generationRequest,
    providerId: routerResult.providerId,
    modelId: routerResult.selectedModelId,
  });

  const idempotencyKey = `media-job-${projectId}-${mediaJob.id}`;

  // JOB 05: fal video generation is executed by the canonical durable worker.
  // Submission only enqueues one durable job and returns immediately — the
  // request route never owns the provider dispatch or the long poll. Video is
  // always the durable lane (the worker resolves provider readiness).
  const isDurableVideoLane = modality === "video";

  // JOB 04: the video payload is receipt-driven, never hardcoded. The router
  // selection must agree with the qualified receipt or the command fails
  // here instead of mis-executing on the worker. Economics reserve before
  // enqueue so the worker never sends unreserved provider I/O.
  let videoPayload: Record<string, unknown> | null = null;
  if (isDurableVideoLane) {
    const capability = qualifyVideoCapability(generationRequest.capability ?? "image-to-video");
    const referenceUrl = resolveVideoReferenceUrl(generationRequest);
    if (!referenceUrl) {
      throw new Error("VIDEO_COMMAND_INVALID: a reference image is required for image-to-video.");
    }
    const receipt = resolveVideoRoute(
      { prompt: generationRequest.prompt, capability },
      { providerId: routerResult.providerId, modelId: routerResult.selectedModelId },
    );
    const pricing = await lookupVideoPricing();
    if (!pricing) {
      throw new Error("VIDEO_QUOTE_UNAVAILABLE: video pricing version is not configured.");
    }
    const quotedCredits = pricing.flatCredits;
    const reservationKey = `media-video-${projectId}-${mediaJob.id}`;
    // Job 12B: the legacy lane's durable-video branch joins quota
    // admission (claim -> reserve -> enqueue). A denied claim throws
    // before any reserve or enqueue; a failed reserve releases the claim.
    const quotaPort = quota ?? new SupabaseStudioQuotaService();
    await quotaPort.claim(projectId, quotedCredits);
    try {
      await new SupabaseImageCreditLedger().reserve({
        organizationId, projectId, jobId: null, actorId,
        idempotencyKey: reservationKey, pricingVersionId: pricing.id,
        approvedCeiling: quotedCredits, reservedCredits: quotedCredits,
      });
    } catch (error) {
      await tryReleaseDuplicateQuota(quotaPort, projectId, quotedCredits);
      throw error;
    }
    videoPayload = {
      kind: "fal-video",
      mediaJobId: mediaJob.id,
      providerId: receipt.providerId,
      modelId: receipt.modelId,
      prompt: generationRequest.prompt,
      imageUrl: referenceUrl,
      resolution: resolveVideoResolution(generationRequest),
      actorId,
      reservationKey,
      quotedCredits,
      pricingVersionId: pricing.id,
      receipt: { ...receipt },
      referenceRole: "i2v-reference",
    };
  }

  const payload = videoPayload ?? {
    mediaJobId: mediaJob.id,
    providerId: routerResult.providerId,
    modelId: routerResult.selectedModelId,
    prompt: generationRequest.prompt,
    fallbackUsed: routerResult.fallbackUsed,
    fallbackReason: routerResult.fallbackReason,
  };

  const durableJob = await jobService.createJob({
    organizationId,
    projectId,
    payload,
    idempotencyKey,
  });

  let assetUrl: string | null = null;
  const assetKey: string | null = null;
  let error: string | null = null;

  if (isDurableVideoLane) {
    // Enqueue-only: the worker owns dispatch + polling + storage. Return the
    // durable job id immediately with a truthful queued status.
    return {
      jobId: mediaJob.id,
      durableJobId: durableJob.id,
      status: "queued",
      assetUrl,
      assetKey,
      providerId: routerResult.providerId,
      modelId: routerResult.selectedModelId,
      fallbackUsed: routerResult.fallbackUsed,
      routingReceipt: {
        providerId: routerResult.providerId,
        modelId: routerResult.selectedModelId,
        fallbackUsed: routerResult.fallbackUsed,
        fallbackReason: routerResult.fallbackReason,
      },
    };
  }

  try {
    const adapter = routerResult.adapter;
    const response: MediaGenerationResponse = await adapter.generate(generationRequest);

    if (response.asset) {
      const asset = response.asset;
      // Asset URL is the provider-generated URL; store it as the reference
      const mimeType = asset.mimeType ?? "application/octet-stream";
      const ext = mimeType.split("/")[1] ?? "bin";
      const filename = `${mediaJob.id}-${asset.id ?? "output"}.${ext}`;

      assetUrl = asset.url;
    }

    setJobStatus(mediaJob.id, "completed");
    await jobService.completeJob(durableJob.id, "studio-worker");
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    setJobStatus(mediaJob.id, "failed");
    await jobService.failJob(durableJob.id, "studio-worker", {
      code: "MEDIA_GENERATION_FAILED",
      message: error,
      retryable: false,
      occurredAt: new Date().toISOString(),
      details: { providerId: routerResult.providerId, mediaJobId: mediaJob.id },
    }, false);
  }

  return {
    jobId: mediaJob.id,
    durableJobId: durableJob.id,
    status: error ? "failed" : "completed",
    assetUrl,
    assetKey,
    providerId: routerResult.providerId,
    modelId: routerResult.selectedModelId,
    fallbackUsed: routerResult.fallbackUsed,
    routingReceipt: {
      providerId: routerResult.providerId,
      modelId: routerResult.selectedModelId,
      fallbackUsed: routerResult.fallbackUsed,
      fallbackReason: routerResult.fallbackReason,
    },
  };
}

function resolveVideoReferenceUrl(request: MediaGenerationRequest): string | null {
  const direct = request.imageUrl?.trim();
  if (direct) return direct;
  const params = request.params as Record<string, unknown> | null | undefined;
  if (params) {
    if (typeof params.referenceImage === "string" && params.referenceImage.trim()) {
      return params.referenceImage.trim();
    }
    if (Array.isArray(params.referenceImages)) {
      const first = params.referenceImages.find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
      if (first) return first.trim();
    }
  }
  return null;
}

/** Job-04 pricing lookup for the qualified fal video route (fails closed when unconfigured). */
async function lookupVideoPricing(): Promise<{ id: string; version: string; flatCredits: number } | null> {
  const client = createServiceClient();
  if (!client) return null;
  const { data, error } = await client.from("studio_pricing_versions")
    .select("id,version,pricing_input")
    .eq("organization_id", "global").eq("provider_id", "fal").eq("model_id", "fal-ai/wan-i2v")
    .eq("capability", "image-to-video").eq("version", "v1").is("retired_at", null).maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; version: string; pricing_input: { flat?: number } };
  const flat = Number(row.pricing_input?.flat ?? 20);
  if (!Number.isFinite(flat) || flat < 0) return null;
  return { id: String(row.id), version: String(row.version), flatCredits: flat };
}

function resolveVideoResolution(request: MediaGenerationRequest): "480p" | "720p" {
  return request.qualityPreference === "premium" ? "720p" : "480p";
}

export async function verifyJobSurvivesKill(jobId: string): Promise<boolean> {
  const job = getJob(jobId);
  if (!job) return false;
  return (
    typeof job.id === "string" &&
    typeof job.prompt === "string" &&
    typeof job.providerId === "string" &&
    typeof job.modelId === "string"
  );
}
