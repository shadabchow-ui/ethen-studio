import type { MediaModality, MediaMode, MediaPricingEstimate } from "./types";
import type { CreditEstimateResult } from "./usage";
import { estimateCreditsForMode, estimateCreditsForRequest } from "./usage";
export type { CreditEstimateResult } from "./usage";

// ── Pricing estimate types (honest, no real provider pricing) ────────────

export interface PricingEstimate {
  action: string;
  label: string;
  estimatedCredits: number;
  modality: MediaModality;
  isEstimate: true;
  note: string;
  setupRequired?: boolean;
}

// ── Base credit estimates by action ──────────────────────────────────────

const IMAGE_BASE = 5;
const IMAGE_HD_BASE = 10;
const IMAGE_CHARACTER_BASE = 15;
const VIDEO_BASE = 20;
const VIDEO_HD_BASE = 40;
const AUDIO_BASE = 3;
const AUDIO_CHARACTER_BASE = 12;

export const ACTION_ESTIMATES: PricingEstimate[] = [
  {
    action: "generate-image",
    label: "Image generation",
    estimatedCredits: IMAGE_BASE,
    modality: "image",
    isEstimate: true,
    note: "Standard quality, 1024×1024. Higher quality or resolution increases cost.",
  },
  {
    action: "generate-image-hd",
    label: "HD image generation",
    estimatedCredits: IMAGE_HD_BASE,
    modality: "image",
    isEstimate: true,
    note: "HD quality, 2048×2048. Estimated based on increased compute requirements.",
  },
  {
    action: "edit-image",
    label: "Image edit",
    estimatedCredits: Math.ceil(IMAGE_BASE * 0.6),
    modality: "image",
    isEstimate: true,
    note: "Edit/inpaint/relight operations. Cost varies by operation complexity.",
  },
  {
    action: "upscale-image",
    label: "Image upscale",
    estimatedCredits: Math.ceil(IMAGE_BASE * 0.5),
    modality: "image",
    isEstimate: true,
    note: "Upscaling to higher resolution. Cost varies by target resolution.",
  },
  {
    action: "character-consistent",
    label: "Character-consistent image",
    estimatedCredits: IMAGE_CHARACTER_BASE,
    modality: "image",
    isEstimate: true,
    note: "Requires fine-tuning or reference upload. Higher cost reflects additional compute.",
  },
  {
    action: "generate-video",
    label: "Video generation (per second)",
    estimatedCredits: VIDEO_BASE,
    modality: "video",
    isEstimate: true,
    note: "Standard quality, up to 10s. Longer duration and higher quality increase cost proportionally.",
  },
  {
    action: "generate-video-hd",
    label: "HD video generation (per second)",
    estimatedCredits: VIDEO_HD_BASE,
    modality: "video",
    isEstimate: true,
    note: "HD quality, up to 30s. Extended duration increases cost.",
  },
  {
    action: "image-to-video",
    label: "Image to video",
    estimatedCredits: Math.ceil(VIDEO_BASE * 0.8),
    modality: "video",
    isEstimate: true,
    note: "Animating a reference image into video. Cost depends on duration and motion complexity.",
  },
  {
    action: "edit-video",
    label: "Video edit",
    estimatedCredits: Math.ceil(VIDEO_BASE * 0.5),
    modality: "video",
    isEstimate: true,
    note: "Video editing operations. Cost varies by operation complexity.",
  },
  {
    action: "generate-voiceover",
    label: "Voiceover generation (per character)",
    estimatedCredits: AUDIO_BASE,
    modality: "audio",
    isEstimate: true,
    note: "Text-to-speech, up to 60s. Longer audio increases cost.",
  },
  {
    action: "voice-clone",
    label: "Voice clone / character voice",
    estimatedCredits: AUDIO_CHARACTER_BASE,
    modality: "audio",
    isEstimate: true,
    note: "Requires voice sample upload and training. Higher cost reflects additional compute.",
  },
  {
    action: "translate-speech",
    label: "Speech translation",
    estimatedCredits: Math.ceil(AUDIO_BASE * 2.5),
    modality: "audio",
    isEstimate: true,
    note: "Translation with voice retention. Cost varies by duration and language pair.",
  },
  {
    action: "export",
    label: "Export asset",
    estimatedCredits: 0,
    modality: "image",
    isEstimate: true,
    note: "Export is free. No additional credits required for downloading generated media.",
  },
];

// ── Mode-to-credit-range mapping (used by MediaWorkspace) ────────────────

export const CREDIT_ESTIMATES: Record<MediaMode, PricingEstimate> = {
  image: {
    action: "mode-image",
    label: "Image mode",
    estimatedCredits: IMAGE_BASE,
    modality: "image",
    isEstimate: true,
    note: "~ estimated 1–8 credits per generation depending on quality and variants",
  },
  video: {
    action: "mode-video",
    label: "Video mode",
    estimatedCredits: VIDEO_BASE,
    modality: "video",
    isEstimate: true,
    note: "~ estimated 5–40 credits per generation depending on duration and quality",
  },
  audio: {
    action: "mode-audio",
    label: "Audio mode",
    estimatedCredits: AUDIO_BASE,
    modality: "audio",
    isEstimate: true,
    note: "~ estimated 1–10 credits per generation depending on duration",
  },
  marketing: {
    action: "mode-marketing",
    label: "Marketing mode",
    estimatedCredits: Math.ceil(IMAGE_BASE * 3),
    modality: "image",
    isEstimate: true,
    note: "~ estimated 3–15 credits per campaign asset set",
  },
  product: {
    action: "mode-product",
    label: "Product mode",
    estimatedCredits: Math.ceil(IMAGE_BASE * 1.5),
    modality: "image",
    isEstimate: true,
    note: "~ estimated 2–8 credits per product rendering",
  },
  influencer: {
    action: "mode-influencer",
    label: "Influencer mode",
    estimatedCredits: Math.ceil(IMAGE_BASE * 2),
    modality: "image",
    isEstimate: true,
    note: "~ estimated 2–10 credits per content slate",
  },
  motion: {
    action: "mode-motion",
    label: "Motion mode",
    estimatedCredits: Math.ceil(VIDEO_BASE * 0.5),
    modality: "video",
    isEstimate: true,
    note: "~ estimated 5–20 credits per animation",
  },
  canvas: {
    action: "mode-canvas",
    label: "Canvas mode",
    estimatedCredits: Math.ceil(IMAGE_BASE * 0.5),
    modality: "image",
    isEstimate: true,
    note: "~ estimated 2–5 credits per board",
  },
  game: {
    action: "mode-game",
    label: "Game asset mode",
    estimatedCredits: IMAGE_BASE,
    modality: "image",
    isEstimate: true,
    note: "~ estimated 3–15 credits per asset pack depending on complexity and frame count",
  },
};

// ── Helper functions ─────────────────────────────────────────────────────

export function getActionEstimate(action: string): PricingEstimate | undefined {
  return ACTION_ESTIMATES.find((e) => e.action === action);
}

export function getModeEstimate(mode: MediaMode): PricingEstimate {
  return CREDIT_ESTIMATES[mode];
}

export function formatCreditEstimate(estimate: PricingEstimate): string {
  const parts: string[] = [];
  parts.push(`${estimate.label}`);
  parts.push(`~${estimate.estimatedCredits} credits (estimate)`);
  if (estimate.setupRequired) {
    parts.push("Setup required — provider pricing not available");
  }
  if (estimate.note) {
    parts.push(estimate.note);
  }
  return parts.join(" · ");
}

export function isSetupRequiredEstimate(estimate: PricingEstimate): boolean {
  return estimate.setupRequired === true || estimate.note.includes("Setup required");
}

// ── Dimension-based estimate wrappers (delegates to usage/registry) ───────

export function getModeDimensionEstimate(
  mode: MediaMode,
  trustState: "mock" | "setup-required" | "live" | "provider-unavailable",
  currentBalance?: number | null,
): CreditEstimateResult {
  return estimateCreditsForMode(mode, trustState, currentBalance ?? null);
}

export function getRequestDimensionEstimate(
  request: { mode?: MediaMode | null; qualityPreference?: "starter" | "balanced" | "premium" },
  trustState: "mock" | "setup-required" | "live" | "provider-unavailable",
  currentBalance?: number | null,
): CreditEstimateResult {
  return estimateCreditsForRequest(
    {
      prompt: "",
      mode: request.mode ?? "image",
      qualityPreference: request.qualityPreference,
    },
    trustState,
    currentBalance ?? null,
  );
}
