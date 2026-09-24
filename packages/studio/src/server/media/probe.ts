/** Studio V5 media — probe validation: codecs, limits, format warnings (STUDIO_07). */
import "server-only";
import type { AssetKind } from "../../contracts/assets";
import { mediaError } from "./types";
import type { MediaProbe } from "./types";

/** Executable V1 codec/container surface. Anything else is an explicit rejection, never a guess. */
export const SUPPORTED_VIDEO_CODECS = new Set(["h264", "hevc", "vp9", "av1"]);
export const SUPPORTED_VIDEO_CONTAINERS = new Set(["mp4", "webm", "mov"]);
export const SUPPORTED_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis", "flac", "pcm"]);
export const SUPPORTED_AUDIO_CONTAINERS = new Set(["mp3", "wav", "flac", "ogg", "opus", "m4a", "mp4", "webm"]);
export const SUPPORTED_IMAGE_CODECS = new Set(["jpeg", "png", "webp"]);

/** Byte caps per media kind. */
export const MEDIA_MAX_BYTES: Readonly<Record<AssetKind, number>> = {
  image: 50 * 1024 * 1024,
  video: 2 * 1024 * 1024 * 1024,
  audio: 500 * 1024 * 1024,
  transcript: 10 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  package: 2 * 1024 * 1024 * 1024,
};

/** Duration caps (ms). Null = no duration leg for that kind. */
export const MEDIA_MAX_DURATION_MS: Readonly<Record<AssetKind, number | null>> = {
  image: null,
  video: 30 * 60 * 1000,
  audio: 6 * 60 * 60 * 1000,
  transcript: null,
  document: null,
  package: null,
};

export const MEDIA_MAX_IMAGE_DIMENSION = 16_384;

export interface ProbeValidation {
  probe: MediaProbe;
  /** Warnings are informational only; the probe itself was accepted. */
  warnings: readonly string[];
}

/**
 * Validate a decoder-reported probe against the V1 executable surface.
 * Rejects unknown codecs/containers, oversized bytes, over-duration media,
 * and impossible dimensions. HDR/wide-gamut inputs are accepted with an
 * explicit SDR-downmap warning (V1 renders SDR/BT.709 only).
 */
export function validateProbe(kind: AssetKind, probe: MediaProbe): ProbeValidation {
  const warnings: string[] = [...probe.warnings];
  const maxBytes = MEDIA_MAX_BYTES[kind];
  if (!Number.isInteger(probe.byteSize) || probe.byteSize <= 0) {
    throw mediaError("BAD_REQUEST", "Probe byte size must be a positive integer.", {});
  }
  if (probe.byteSize > maxBytes) {
    throw mediaError("BAD_REQUEST", `${kind} bytes exceed the ingest limit.`, {
      byteSize: probe.byteSize,
      maxBytes,
      reason: "OVERSIZED",
    });
  }
  if (!/^[0-9a-f]{64}$/i.test(probe.sha256)) {
    throw mediaError("BAD_REQUEST", "Probe sha256 must be a 64-hex digest.", {});
  }
  const codec = (probe.codec ?? "").toLowerCase();
  const container = (probe.container ?? "").toLowerCase();
  if (kind === "video") {
    if (!SUPPORTED_VIDEO_CODECS.has(codec)) {
      throw mediaError("BAD_REQUEST", `Video codec '${probe.codec}' is not supported in V1.`, {
        codec: probe.codec,
        reason: "INVALID_CODEC",
      });
    }
    if (container && !SUPPORTED_VIDEO_CONTAINERS.has(container)) {
      throw mediaError("BAD_REQUEST", `Video container '${probe.container}' is not supported in V1.`, {
        container: probe.container,
        reason: "INVALID_CODEC",
      });
    }
  }
  if (kind === "audio") {
    if (codec && !SUPPORTED_AUDIO_CODECS.has(codec)) {
      throw mediaError("BAD_REQUEST", `Audio codec '${probe.codec}' is not supported in V1.`, {
        codec: probe.codec,
        reason: "INVALID_CODEC",
      });
    }
    if (container && !SUPPORTED_AUDIO_CONTAINERS.has(container)) {
      throw mediaError("BAD_REQUEST", `Audio container '${probe.container}' is not supported in V1.`, {
        container: probe.container,
        reason: "INVALID_CODEC",
      });
    }
  }
  if (kind === "image") {
    if (!SUPPORTED_IMAGE_CODECS.has(codec)) {
      throw mediaError("BAD_REQUEST", `Image codec '${probe.codec}' is not supported in V1.`, {
        codec: probe.codec,
        reason: "INVALID_CODEC",
      });
    }
    const { width, height } = probe;
    if (!width || !height || width <= 0 || height <= 0) {
      throw mediaError("BAD_REQUEST", "Image dimensions are missing or invalid.", {});
    }
    if (width > MEDIA_MAX_IMAGE_DIMENSION || height > MEDIA_MAX_IMAGE_DIMENSION) {
      throw mediaError("BAD_REQUEST", "Image dimensions exceed the Studio limit.", {
        width,
        height,
        limit: MEDIA_MAX_IMAGE_DIMENSION,
        reason: "OVERSIZED",
      });
    }
  }
  const maxDuration = MEDIA_MAX_DURATION_MS[kind];
  if (maxDuration !== null && probe.durationMs !== null) {
    if (!Number.isInteger(probe.durationMs) || probe.durationMs <= 0) {
      throw mediaError("BAD_REQUEST", "Probe duration must be a positive integer millisecond count.", {});
    }
    if (probe.durationMs > maxDuration) {
      throw mediaError("BAD_REQUEST", `${kind} duration exceeds the ingest limit.`, {
        durationMs: probe.durationMs,
        maxDurationMs: maxDuration,
        reason: "OVERSIZED",
      });
    }
  }
  return { probe: { ...probe, warnings: [...warnings] }, warnings };
}
