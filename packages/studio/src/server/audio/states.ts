/** Studio V5 audio — typed UI state projections (STUDIO_11). Server-only. */
import "server-only";
import { AUDIO_STAGE_LABELS, type AudioErrorCode, type AudioStageId, type AudioStageStatus } from "./types";

export type AudioDataState = "loading" | "empty" | "blocked" | "error" | "ready";

export function audioStateForErrorCode(code: string): AudioDataState {
  switch (code) {
    case "AUDIO_CAPABILITY_UNQUALIFIED":
    case "AUDIO_CONSENT_BLOCKED":
      return "blocked";
    case "AUDIO_NOT_FOUND":
      return "empty";
    default:
      return "error";
  }
}

const BLOCKED_COPY: Readonly<Record<string, { title: string; description: string }>> = {
  AUDIO_CAPABILITY_UNQUALIFIED: {
    title: "No qualified voice capability",
    description: "No approved model currently serves this audio task. The form stays readable but cannot run.",
  },
  AUDIO_CONSENT_BLOCKED: {
    title: "Voice consent blocked",
    description: "A selected voice lost consent or was revoked. Pick another voice to continue.",
  },
};

export function blockedViewFor(code: AudioErrorCode): { title: string; description: string } {
  return (
    BLOCKED_COPY[code] ?? {
      title: "Audio unavailable",
      description: "This audio task cannot run right now.",
    }
  );
}

export function stageStatusLabel(status: AudioStageStatus): string {
  switch (status) {
    case "pending":
      return "Queued";
    case "quoted":
      return "Estimated";
    case "running":
      return "Running";
    case "succeeded":
      return "Done";
    case "failed":
      return "Failed";
    case "invalidated":
      return "Needs rerun";
  }
}

export function stageLabel(stage: AudioStageId): string {
  return AUDIO_STAGE_LABELS[stage];
}

/** Stage rows render in plan order with per-stage cost and retry affordance. */
export function isStageRetryable(status: AudioStageStatus): boolean {
  return status === "failed" || status === "invalidated";
}
