import "server-only";

import type {
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaJob,
  MediaJobState,
  MediaModality,
  MediaProviderStatus,
} from "@ethen/contracts/media/types";
import type { MediaProviderAdapter, MediaProviderAvailability, MediaCostEstimate } from "./types";

const MOCK_MODELS: Record<MediaModality, string> = {
  image: "mock-image-default",
  video: "mock-video-default",
  audio: "mock-voiceover-default",
};

function generateMockJobId(): string {
  return `mock-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateMockResultUrl(modality: MediaModality): string {
  return `/api/media/mock-result/${modality}-${Date.now()}`;
}

function resolveModality(request: MediaGenerationRequest): MediaModality {
  return request.modality ?? "image";
}

const CREDIT_BASE: Record<string, number> = {
  image: 5,
  video: 20,
  audio: 3,
};

function estimateCredits(request: MediaGenerationRequest): number {
  const modality = resolveModality(request);
  const multiplier = request.qualityPreference === "premium" ? 2 : request.qualityPreference === "starter" ? 0.5 : 1;
  return Math.ceil((CREDIT_BASE[modality] ?? 5) * multiplier);
}

export const mockMediaProvider: MediaProviderAdapter = {
  providerId: "mock",
  label: "Mock media provider",

  getAvailability(): MediaProviderAvailability {
    return { available: true };
  },

  getStatus(): MediaProviderStatus {
    return {
      id: "mock",
      label: "Mock media provider",
      modality: "multi",
      mode: "mock",
      available: true,
      configured: true,
      setupRequired: false,
      lastCheckedAt: new Date().toISOString(),
      trust: "mock",
    };
  },

  getCostEstimate(request: MediaGenerationRequest): MediaCostEstimate {
    const modality = resolveModality(request);
    const modelId = request.modelId ?? MOCK_MODELS[modality] ?? "mock";
    const credits = estimateCredits(request);
    return {
      providerId: "mock",
      modelId,
      minCredits: credits,
      maxCredits: credits * 2,
      status: "estimated",
      note: "Mock cost estimate — trial mode.",
    };
  },

  async generate(request: MediaGenerationRequest): Promise<MediaGenerationResponse> {
    const modality = resolveModality(request);
    const modelId = request.modelId ?? MOCK_MODELS[modality] ?? "mock";
    const jobId = generateMockJobId();
    const now = new Date().toISOString();
    const credits = estimateCredits(request);
    const mode = (request.mode ?? modality) as MediaJob["mode"];

    const job: MediaJob = {
      id: jobId,
      sessionId: request.sessionId ?? null,
      status: "completed",
      state: "completed",
      mode,
      modality,
      capability: request.capability ?? "text-to-image",
      modelId,
      modelName: `Mock ${modality} model`,
      providerId: "mock",
      providerName: "Mock media provider",
      prompt: request.prompt,
      negativePrompt: request.negativePrompt ?? null,
      params: request.params ?? null,
      config: request.config ?? null,
      projectId: request.projectId ?? null,
      resultUrl: generateMockResultUrl(modality),
      assetId: null,
      result: null,
      error: null,
      progress: 100,
      fallbackUsed: false,
      estimatedCredits: credits,
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      completedAt: now,
      expiresAt: null,
      originalJobId: null,
      initiatedBy: request.initiatedBy ?? null,
    };

    return {
      ok: true,
      job,
      provider: {
        id: "mock",
        label: "Mock media provider",
        mode: "mock",
        selectedModelId: modelId,
        fallbackUsed: false,
        trust: "mock",
      },
      metadata: {
        estimatedCredits: credits,
      },
    };
  },
};
