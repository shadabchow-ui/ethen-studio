import "server-only";

import { hasConfiguredServerEnv, getServerEnv } from "@ethen/config/env";
import { createJob, setJobResult } from "../jobs";
import { recordMediaUsage } from "../usage-recording";
import { addAsset } from "../assets";
import { classifyError, setupRequiredError } from "../errors";
import type {
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaJob,
  MediaJobResult,
  MediaProviderStatus,
} from "@ethen/contracts/media/types";
import type {
  MediaProviderAdapter,
  MediaProviderAvailability,
  MediaCostEstimate,
} from "./types";
import {
  OPENAI_CREATE_IMAGE_MODEL,
  OPENAI_CREATE_IMAGE_SIZES,
} from "../openai-create-image-contract";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
// STU-P0-01: single canonical model constant — the gpt-image line, not the
// retired dall-e-3. Source: https://platform.openai.com/docs/guides/image-generation
// (retrieved 2026-08-19) documents gpt-image-1 / gpt-image-1-mini / gpt-image-1.5 /
// gpt-image-2; dall-e-3 is no longer documented.
const DEFAULT_MODEL = OPENAI_CREATE_IMAGE_MODEL;
const DEFAULT_SIZE = "1024x1024";
function getApiKey(): string | undefined {
  return getServerEnv("OPENAI_API_KEY");
}

function isConfigured(): boolean {
  return hasConfiguredServerEnv("OPENAI_API_KEY");
}

// STU-P0-01: gpt-image-1 sizes are 1024x1024 / 1536x1024 / 1024x1536 (per the
// canonical contract + OpenAI docs). The retired DALL·E-3 sizes
// (1792x1024 / 1024x1792) are invalid for gpt-image-1 and would be rejected.
function resolutionFromAspectRatio(ratio?: string): string {
  switch (ratio) {
    case "16:9":
      return OPENAI_CREATE_IMAGE_SIZES[1]; // 1536x1024
    case "9:16":
      return OPENAI_CREATE_IMAGE_SIZES[2]; // 1024x1536
    case "1:1":
    default:
      return OPENAI_CREATE_IMAGE_SIZES[0]; // 1024x1024
  }
}

function qualityFromPreference(pref?: string, model?: string): string {
  if (model === "gpt-image-1") {
    if (pref === "premium" || pref === "high") return "high";
    if (pref === "starter") return "low";
    return "medium";
  }
  if (pref === "premium" || pref === "high") return "hd";
  return "standard";
}

function buildImageJob(
  request: MediaGenerationRequest,
  modelId: string,
  imageUrl: string,
  revisedPrompt?: string,
): { job: MediaJob; assetId: string } {
  const job = createJob({
    ...request,
    modelId: request.modelId ?? modelId,
    providerId: "openai",
  });
  const result: MediaJobResult = {
    modality: "image",
    assetUrl: imageUrl,
    previewUrl: imageUrl,
    metadata: {
      width: request.config?.width ?? 1024,
      height: request.config?.height ?? 1024,
      durationSeconds: null,
      fileSizeBytes: 0,
      mimeType: "image/png",
      format: "png",
      label: "OpenAI generated image",
      extra: null,
      prompt: revisedPrompt ?? request.prompt,
      style: request.style ?? undefined,
      negativePrompt: request.negativePrompt ?? undefined,
    },
    generatedAt: new Date().toISOString(),
    isMock: false,
  };
  setJobResult(job.id, result);

  void recordMediaUsage({
    eventType: "media.generate",
    jobId: job.id,
    projectId: job.projectId,
    modality: job.modality,
    mode: job.mode,
    providerId: job.providerId,
    modelId: job.modelId,
    toolId: job.toolId,
    estimatedCredits: job.estimatedCredits ?? 0,
    creditCost: job.estimatedCredits ?? 0,
    initiatedBy: job.initiatedBy,
  });

  const asset = addAsset({
    type: "image",
    modality: "image",
    kind: "image",
    url: imageUrl,
    thumbnailUrl: imageUrl,
    jobId: job.id,
    projectId: request.projectId ?? null,
    prompt: request.prompt,
    negativePrompt: request.negativePrompt ?? null,
    modelId: request.modelId ?? modelId,
    // STU-P0-01: label from the actual model value, not a hard-coded retired name.
    modelName: modelId === "gpt-image-1" ? "GPT Image 1" : modelId,
    providerId: "openai",
    providerName: "OpenAI",
    mimeType: "image/png",
    width: request.config?.width ?? 1024,
    height: request.config?.height ?? 1024,
    aspectRatio: request.config?.aspectRatio ?? "1:1",
    source: "provider_result",
    isMock: false,
  });

  job.assetId = asset.id;

  return { job, assetId: asset.id };
}

export const openaiImageProvider: MediaProviderAdapter = {
  providerId: "openai",
  label: "OpenAI",

  getAvailability(): MediaProviderAvailability {
    if (!isConfigured()) {
      return {
        available: false,
        missingEnv: ["OPENAI_API_KEY"],
        reason: "OPENAI_API_KEY is not configured.",
      };
    }
    return { available: true };
  },

  getStatus(): MediaProviderStatus {
    const configured = isConfigured();
    return {
      id: "openai",
      label: "OpenAI",
      modality: "image",
      mode: configured ? "live" : "setup-required",
      available: configured,
      configured,
      setupRequired: !configured,
      setupRequiredReason: configured
        ? undefined
        : "OPENAI_API_KEY is not configured.",
      lastCheckedAt: new Date().toISOString(),
      trust: configured ? "live" : "setup_required",
      capabilities: ["text-to-image"],
    };
  },

  getCostEstimate(request: MediaGenerationRequest): MediaCostEstimate {
    const quality = request.qualityPreference === "premium" ? "hd" : "standard";
    const baseCredits = quality === "hd" ? 10 : 6;
    return {
      providerId: "openai",
      modelId: request.modelId ?? DEFAULT_MODEL,
      minCredits: baseCredits,
      maxCredits: baseCredits * 2,
      status: "estimated",
      note: "Estimated OpenAI image generation cost.",
    };
  },

  async generate(
    request: MediaGenerationRequest,
  ): Promise<MediaGenerationResponse> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw setupRequiredError(
        "OpenAI API key is not configured. Set OPENAI_API_KEY in your environment.",
      );
    }

    const model = request.modelId ?? DEFAULT_MODEL;
    const size =
      request.config?.aspectRatio
        ? resolutionFromAspectRatio(request.config.aspectRatio)
        : DEFAULT_SIZE;
    const quality = qualityFromPreference(request.qualityPreference, model);
    const variants = Math.min(
      (request.params && "variants" in request.params
        ? (request.params as { variants?: number }).variants
        : undefined) ?? 1,
      10,
    );
    const n = Math.min(Math.max(variants, 1), 10);

    const body: Record<string, unknown> = {
      model,
      prompt: request.prompt,
      n,
      size,
      quality,
    };

    // STU-P0-01: dall-e-3 is retired — gpt-image-1 has no `style` parameter.
    // The style branch is gated on the retired id and therefore never fires.

    let response: Response;
    try {
      response = await fetch(OPENAI_IMAGES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const error = classifyError(err);
      throw error;
    }

    if (!response.ok) {
      let errBody = "";
      try {
        errBody = await response.text();
      } catch {
        // ignore read errors
      }

      if (response.status === 401 || response.status === 403) {
        throw setupRequiredError(
          "OpenAI API key is invalid or unauthorized.",
        );
      }

      throw classifyError(
        new Error(
          `OpenAI Images API returned HTTP ${response.status}: ${errBody.slice(0, 200)}`,
        ),
      );
    }

    const data = (await response.json()) as {
      data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    };

    const imageData = data.data?.[0];
    const imageUrl = imageData?.url ?? (imageData?.b64_json ? `data:image/png;base64,${imageData.b64_json}` : undefined);
    if (!imageUrl) {
      throw classifyError(
        new Error("OpenAI Images API returned no image data."),
      );
    }

    const { job, assetId } = buildImageJob(request, model, imageUrl, imageData?.revised_prompt);
    const estimatedCredits = quality === "hd" || quality === "high" ? 10 : 6;

    return {
      ok: true,
      job,
      provider: {
        id: "openai",
        label: "OpenAI",
        mode: "live",
        selectedModelId: model,
        fallbackUsed: false,
        trust: "live",
      },
      metadata: {
        estimatedCredits,
      },
      jobId: job.id,
      assetIds: [assetId],
      state: job.state,
      urls: [imageUrl],
      createdAt: job.createdAt,
      estimatedCredits,
      providerAvailable: true,
      providerName: "OpenAI",
      modelName: model,
    };
  },
};
