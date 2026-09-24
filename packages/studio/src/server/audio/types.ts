/** Studio V5 audio — domain types and errors (STUDIO_11). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import type { ProjectScope } from "../../contracts/scope";

/** Batch audio job kinds owned by STUDIO_11. No Chat voice, no live phone. */
export const AUDIO_JOB_KINDS = ["tts", "transcribe", "dub", "changer"] as const;
export type AudioJobKind = (typeof AUDIO_JOB_KINDS)[number];

export function isAudioJobKind(value: string): value is AudioJobKind {
  return (AUDIO_JOB_KINDS as readonly string[]).includes(value);
}

/**
 * Dubbing composition stages (recovered step order from the legacy Voice
 * dub pipeline: upload → transcribe → translate → generate → export).
 * V5 executes behind the shared runtime: transcribe → translate → speaker
 * synthesis → align → mix. Upload/export stay j07 media custody; each
 * compute stage below maps to exactly one shared RuntimeJob.
 */
export const AUDIO_STAGE_IDS = ["transcribe", "translate", "synthesize", "align", "mix"] as const;
export type AudioStageId = (typeof AUDIO_STAGE_IDS)[number];

export const AUDIO_STAGE_LABELS: Readonly<Record<AudioStageId, string>> = {
  transcribe: "Transcribe",
  translate: "Translate",
  synthesize: "Speaker synthesis",
  align: "Align",
  mix: "Mix",
};

/** Canonical task per single-stage kind and per dub stage. */
export const AUDIO_STAGE_TASKS: Readonly<Record<AudioStageId, TaskName>> = {
  transcribe: "speech.transcribe",
  translate: "text.translate",
  synthesize: "speech.synthesize",
  align: "speech.align",
  mix: "audio.transform",
};

export const AUDIO_KIND_TASK: Readonly<Record<AudioJobKind, TaskName>> = {
  tts: "speech.synthesize",
  transcribe: "speech.transcribe",
  dub: "speech.transcribe",
  changer: "audio.transform",
};

export type AudioStageStatus =
  | "pending"
  | "quoted"
  | "running"
  | "succeeded"
  | "failed"
  | "invalidated";

export const AUDIO_TERMINAL_STAGE: ReadonlySet<AudioStageStatus> = new Set([
  "succeeded",
  "failed",
]);

/** One speaker → VoiceIdentity binding inside an audio project. */
export interface SpeakerVoiceBinding {
  speakerId: string;
  voiceIdentityId: string;
  voiceVersion: number;
  /** Resolved at map time; re-checked at every stage dispatch. */
  consentStatus: string;
}

export interface AudioProjectRecord {
  projectId: string;
  scope: ProjectScope;
  kind: AudioJobKind;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  transcriptRevision: number;
  status: "draft" | "running" | "succeeded" | "failed";
  legacyVoiceJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AudioStageRecord {
  stageId: string;
  projectId: string;
  stage: AudioStageId;
  attempt: number;
  jobId: string | null;
  status: AudioStageStatus;
  quoteId: string | null;
  estimatedIcu: number | null;
  settledIcu: number | null;
  /** Transcript revision this stage output was built from; null when N/A. */
  transcriptRevision: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AudioTranscriptRevision {
  projectId: string;
  revision: number;
  transcript: unknown;
  editedBy: string;
  createdAt: string;
}

export type AudioErrorCode =
  | "AUDIO_VALIDATION"
  | "AUDIO_NOT_FOUND"
  | "AUDIO_TENANT_MISMATCH"
  | "AUDIO_SPEAKER_UNMAPPED"
  | "AUDIO_SPEAKER_MISMATCH"
  | "AUDIO_LOCALE_UNSUPPORTED"
  | "AUDIO_CONSENT_BLOCKED"
  | "AUDIO_CAPABILITY_UNQUALIFIED"
  | "AUDIO_STAGE_CONFLICT"
  | "AUDIO_TRANSCRIPT_INVALID";

export class AudioError extends Error {
  readonly code: AudioErrorCode;
  readonly detail: Readonly<Record<string, unknown>>;
  constructor(code: AudioErrorCode, message: string, detail: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "AudioError";
    this.code = code;
    this.detail = detail;
  }
}

export function audioError(
  code: AudioErrorCode,
  message: string,
  detail: Readonly<Record<string, unknown>> = {},
): AudioError {
  return new AudioError(code, message, detail);
}

/** Explicit per-stage cost estimate surfaced before admission. */
export interface AudioStageEstimate {
  stage: AudioStageId;
  task: TaskName;
  meterUnit: string;
  meterQuantity: number;
  estimatedIcu: number;
  capIcu: number | null;
}

export interface AudioJobEstimate {
  kind: AudioJobKind;
  stages: readonly AudioStageEstimate[];
  totalEstimatedIcu: number;
  currencyNote: string;
}
