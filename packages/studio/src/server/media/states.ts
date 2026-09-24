/** Studio V5 media — typed UI consumer states (STUDIO_07, server-only). */
import "server-only";
import type { AssetKind } from "../../contracts/assets";

/**
 * Real preview kinds served to UI consumers. Every kind names its backing
 * locator: signed previews expire; deliveries pin hashes; sources stay
 * project-scoped. Workbench UI (STUDIO_14) renders these — no page built here.
 */
export type MediaPreviewKind =
  | "image-original"
  | "image-thumbnail"
  | "video-original"
  | "video-proxy"
  | "video-thumbnail"
  | "audio-waveform"
  | "audio-original";

export interface MediaPreviewState {
  kind: MediaPreviewKind;
  assetId: string;
  version: number;
  /** Locator access kind per the studio-preview-delivery consumer contract. */
  access: "source" | "preview" | "review" | "delivery";
  url: string | null;
  expiresAt: string | null;
  contentHash: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

/** Downsampled waveform peaks for audio rows (values normalized 0..1). */
export interface WaveformData {
  assetId: string;
  version: number;
  peaksPerSecond: number;
  peaks: readonly number[];
  durationMs: number;
}

export function buildWaveformData(input: {
  assetId: string;
  version: number;
  peaksPerSecond: number;
  peaks: readonly number[];
  durationMs: number;
}): WaveformData {
  if (!Number.isInteger(input.durationMs) || input.durationMs <= 0) {
    throw new Error("Waveform duration must be positive integer ms.");
  }
  if (!Number.isInteger(input.peaksPerSecond) || input.peaksPerSecond <= 0) {
    throw new Error("Waveform peaks-per-second must be a positive integer.");
  }
  for (const peak of input.peaks) {
    if (typeof peak !== "number" || peak < 0 || peak > 1) {
      throw new Error("Waveform peaks must be numbers within 0..1.");
    }
  }
  const expected = Math.max(1, Math.round((input.durationMs / 1000) * input.peaksPerSecond));
  if (input.peaks.length !== expected) {
    throw new Error(`Waveform peaks length ${input.peaks.length} does not match ${expected} for the duration.`);
  }
  return { ...input };
}

/** Honest ingest progress: measured fractions only, else indeterminate. */
export interface MediaIngestProgress {
  processId: string;
  stage: "QUARANTINED" | "SCANNING" | "DECODING" | "NORMALIZING" | "CUSTODY" | "FAILED" | "UNAVAILABLE";
  /** 0..1 when measured, null when indeterminate. Never faked. */
  progress: number | null;
  detail: string;
  failureReason: string | null;
}

/** Format warning surfaced to creators (codec, color, duration, container). */
export interface MediaFormatWarning {
  code: "UNSUPPORTED_CODEC" | "DURATION_CAPPED" | "HDR_DOWNMAP" | "CONTAINER_REWRAP" | "INTERCHANGE_SUBSET";
  message: string;
  assetId: string;
}

export function previewKindFor(kind: AssetKind, derivative: "original" | "thumbnail" | "proxy" | "waveform"): MediaPreviewKind {
  if (kind === "image") return derivative === "thumbnail" ? "image-thumbnail" : "image-original";
  if (kind === "video") {
    if (derivative === "proxy") return "video-proxy";
    if (derivative === "thumbnail") return "video-thumbnail";
    return "video-original";
  }
  if (kind === "audio") return derivative === "waveform" ? "audio-waveform" : "audio-original";
  return "image-original";
}

/** Loading/empty/blocked/error envelope for media surfaces. */
export type MediaSurfaceState =
  | { state: "loading" }
  | { state: "empty"; action: string }
  | { state: "blocked"; reasonCode: string; remediation: string | null }
  | { state: "error"; message: string; retryable: boolean }
  | { state: "ready" };

export function mediaPreviewLabel(preview: Pick<MediaPreviewState, "kind">): string {
  switch (preview.kind) {
    case "image-original": return "Original image";
    case "image-thumbnail": return "Image thumbnail";
    case "video-original": return "Original video";
    case "video-proxy": return "Video proxy";
    case "video-thumbnail": return "Video thumbnail";
    case "audio-waveform": return "Audio waveform";
    case "audio-original": return "Original audio";
  }
}
