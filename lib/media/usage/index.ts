import type {
  PricingDimension,
  DimensionCostEntry,
  CreditEstimateResult,
  CreditEstimateDimensionBreakdown,
  CreditEstimateStatus,
  MediaUsageEvent,
  MediaUsageEventType,
} from "./types";
import type { MediaMode, MediaModality, MediaGenerationRequest } from "@ethen/contracts/media/types";

export type {
  PricingDimension,
  DimensionCostEntry,
  CreditEstimateResult,
  CreditEstimateDimensionBreakdown,
  CreditEstimateStatus,
  MediaUsageEvent,
  MediaUsageEventType,
};
export {
  PRICING_DIMENSION_LABELS,
  STORAGE_STATUS_NON_DURABLE,
  STORAGE_STATUS_BROWSER_LOCAL,
  STORAGE_STATUS_SUPABASE,
  STORAGE_STATUS_LOCAL_FS,
  STORAGE_STATUS_NOT_PROVIDED,
} from "./types";
export type { StorageDurability, StorageStatus } from "./types";

// ── Dimension cost registry ────────────────────────────────────────────────────

export const DIMENSION_COST_REGISTRY: DimensionCostEntry[] = [
  {
    dimension: "image_generation",
    modality: "image",
    creditsPerUnit: 5,
    unitLabel: "per image (1024×1024)",
    waivedInMock: true,
    waivedInSetupRequired: true,
  },
  {
    dimension: "image_editing",
    modality: "image",
    creditsPerUnit: 3,
    unitLabel: "per edit operation",
    waivedInMock: true,
    waivedInSetupRequired: true,
  },
  {
    dimension: "upscale",
    modality: "image",
    creditsPerUnit: 3,
    unitLabel: "per upscale (to 2048×2048)",
    waivedInMock: true,
    waivedInSetupRequired: true,
  },
  {
    dimension: "video_seconds",
    modality: "video",
    creditsPerUnit: 2,
    unitLabel: "per second (standard quality)",
    waivedInMock: true,
    waivedInSetupRequired: true,
    modeMultiplier: { motion: 0.5, game: 0.75 },
  },
  {
    dimension: "video_resolution",
    modality: "video",
    creditsPerUnit: 10,
    unitLabel: "per HD resolution bump",
    waivedInMock: true,
    waivedInSetupRequired: true,
  },
  {
    dimension: "audio_characters",
    modality: "audio",
    creditsPerUnit: 0.05,
    unitLabel: "per character (text-to-speech)",
    waivedInMock: true,
    waivedInSetupRequired: true,
  },
  {
    dimension: "voice_minutes",
    modality: "audio",
    creditsPerUnit: 3,
    unitLabel: "per minute (voice generation)",
    waivedInMock: true,
    waivedInSetupRequired: true,
  },
  {
    dimension: "provider_cost",
    modality: "image",
    creditsPerUnit: 0,
    unitLabel: "passthrough",
    waivedInMock: true,
    waivedInSetupRequired: true,
  },
  {
    dimension: "export_type",
    modality: "image",
    creditsPerUnit: 0,
    unitLabel: "per export",
    waivedInMock: true,
    waivedInSetupRequired: true,
  },
  {
    dimension: "storage_usage",
    modality: "image",
    creditsPerUnit: 0,
    unitLabel: "per MB stored",
    waivedInMock: true,
    waivedInSetupRequired: true,
  },
];

// ── Mode-to-dimension mapping ──────────────────────────────────────────────────

const MODE_DIMENSIONS: Record<MediaMode, PricingDimension[]> = {
  image: ["image_generation", "export_type", "storage_usage"],
  video: ["video_seconds", "video_resolution", "export_type", "storage_usage"],
  audio: ["audio_characters", "voice_minutes", "export_type", "storage_usage"],
  marketing: ["image_generation", "image_editing", "export_type", "storage_usage"],
  product: ["image_generation", "export_type", "storage_usage"],
  influencer: ["image_generation", "image_editing", "export_type", "storage_usage"],
  motion: ["video_seconds", "export_type", "storage_usage"],
  canvas: ["image_generation", "export_type", "storage_usage"],
  game: ["image_generation", "upscale", "export_type", "storage_usage"],
};

// ── Estimate helpers ───────────────────────────────────────────────────────────

function getDimensionCost(dimension: PricingDimension): DimensionCostEntry | undefined {
  return DIMENSION_COST_REGISTRY.find((d) => d.dimension === dimension);
}

function getDefaultUnits(dimension: PricingDimension, mode: MediaMode): number {
  switch (dimension) {
    case "image_generation":
      return 1;
    case "image_editing":
      return 1;
    case "upscale":
      return 1;
    case "video_seconds":
      return mode === "motion" ? 5 : 10;
    case "video_resolution":
      return mode === "video" ? 0 : 0;
    case "audio_characters":
      return 500;
    case "voice_minutes":
      return 1;
    case "provider_cost":
      return 0;
    case "export_type":
      return 0;
    case "storage_usage":
      return 0;
  }
}

/**
 * Build a credit estimate result for a given mode and trust state.
 * Returns honest estimates — mock/setup-required flows are 0 credits.
 */
export function estimateCreditsForMode(
  mode: MediaMode,
  trustState: "mock" | "setup-required" | "live" | "provider-unavailable",
  currentBalance: number | null = null,
): CreditEstimateResult {
  const isFreeFlow =
    trustState === "mock" ||
    trustState === "setup-required" ||
    trustState === "provider-unavailable";

  if (isFreeFlow) {
    return {
      status: trustState === "mock" ? "mock_free" : "setup_required_free",
      totalCredits: 0,
      breakdown: [],
      currentBalance,
      exceedsBalance: false,
      note:
        trustState === "mock"
          ? "Mock mode — no credits are consumed for preview generations."
          : "Setup required — no credits are consumed until a live provider is configured.",
      isFreeFlow: true,
    };
  }

  const dimensions = MODE_DIMENSIONS[mode] ?? [];
  const breakdown: CreditEstimateDimensionBreakdown[] = [];

  let total = 0;
  for (const dim of dimensions) {
    const entry = getDimensionCost(dim);
    if (!entry) continue;

    const units = getDefaultUnits(dim, mode);
    const multiplier = entry.modeMultiplier?.[mode] ?? 1;
    const creditsPerUnit = entry.creditsPerUnit * multiplier;
    const subtotal = Math.ceil(units * creditsPerUnit);

    if (subtotal > 0) {
      total += subtotal;
      breakdown.push({
        dimension: dim,
        label: PRICING_DIMENSION_LABELS[dim],
        units,
        creditsPerUnit,
        subtotal,
        note: entry.unitLabel,
      });
    }
  }

  const exceedsBalance = currentBalance !== null && total > currentBalance;
  const status: CreditEstimateStatus = exceedsBalance ? "limit_reached" : "estimated";

  return {
    status,
    totalCredits: total,
    breakdown,
    currentBalance,
    exceedsBalance,
    note: exceedsBalance
      ? `Estimated ${total} credits exceeds available balance of ${currentBalance}.`
      : `Estimated ${total} credits for this ${mode} mode generation.`,
    isFreeFlow: false,
  };
}

/**
 * Build a pre-run estimate from a generation request.
 * Uses request metadata (mode, quality, duration) to refine the estimate.
 */
export function estimateCreditsForRequest(
  request: MediaGenerationRequest,
  trustState: "mock" | "setup-required" | "live" | "provider-unavailable",
  currentBalance: number | null = null,
): CreditEstimateResult {
  const mode = request.mode ?? "image";
  const base = estimateCreditsForMode(mode, trustState, currentBalance);

  // Refine by quality preference (already accounted in mode estimate for now)
  if (request.qualityPreference === "premium" && !base.isFreeFlow) {
    const premiumNote = "Premium quality selected — credit usage may increase based on provider pricing.";
    return {
      ...base,
      note: `${base.note} ${premiumNote}`,
    };
  }

  return base;
}

/**
 * Build a usage event for a media generation result.
 * Honest: mock and setup-required flows record 0 credits.
 */
export function buildMediaUsageEvent(input: {
  eventType: MediaUsageEventType;
  jobId?: string | null;
  assetId?: string | null;
  projectId?: string | null;
  modality?: MediaModality | null;
  mode?: MediaMode | null;
  providerId?: string | null;
  modelId?: string | null;
  toolId?: string | null;
  estimate?: CreditEstimateResult | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}): MediaUsageEvent {
  const isFreeFlow =
    input.eventType === "media.generate.mock" ||
    input.eventType === "media.generate.setup_required";

  return {
    eventType: input.eventType,
    jobId: input.jobId ?? null,
    assetId: input.assetId ?? null,
    projectId: input.projectId ?? null,
    modality: input.modality ?? null,
    mode: input.mode ?? null,
    providerId: input.providerId ?? null,
    modelId: input.modelId ?? null,
    toolId: input.toolId ?? null,
    estimatedCredits: input.estimate?.totalCredits ?? null,
    creditCost: isFreeFlow ? 0 : (input.estimate?.totalCredits ?? 0),
    dimensions: input.estimate?.breakdown ?? [],
    error: input.error ?? null,
    metadata: {
      ...input.metadata,
      isMock: isFreeFlow,
      recordedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  };
}

// Re-export labels
import { PRICING_DIMENSION_LABELS } from "./types";
