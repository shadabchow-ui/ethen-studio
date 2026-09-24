/**
 * STUDIO_11 — audio UI contracts. Browser-safe: types only.
 *
 * Binds the 09 voice/transcribe extension slots and adds dub/changer
 * upload-transform tools. Execution goes through the shared runtime
 * (/jobs admission); the audio API only tracks project/stage lineage.
 */

import type { CreateInputVariant } from "../types";

/** Audio tools: the two bound 09 slots plus dub and changer forms. */
export type AudioToolId = "voice" | "transcribe" | "dub" | "changer";

export const AUDIO_TOOL_IDS: readonly AudioToolId[] = ["voice", "transcribe", "dub", "changer"];

export type AudioStageId = "transcribe" | "translate" | "synthesize" | "align" | "mix";

export const AUDIO_STAGE_ORDER: Readonly<Record<AudioToolId, readonly AudioStageId[]>> = {
  voice: ["synthesize"],
  transcribe: ["transcribe"],
  changer: ["transcribe", "mix"],
  dub: ["transcribe", "translate", "synthesize", "align", "mix"],
};

export const AUDIO_STAGE_TASK: Readonly<Record<AudioStageId, string>> = {
  transcribe: "speech.transcribe",
  translate: "text.translate",
  synthesize: "speech.synthesize",
  align: "speech.align",
  mix: "audio.transform",
};

export interface AudioToolDefinition {
  id: AudioToolId;
  title: string;
  route: string;
  actionLabel: "Generate" | "Transcribe" | "Start dub" | "Transform";
  inputVariant: CreateInputVariant;
  description: string;
}

export interface AudioStageView {
  stage: AudioStageId;
  label: string;
  task: string;
  status: string;
  statusLabel: string;
  jobId: string | null;
  estimatedIcu: number | null;
  settledIcu: number | null;
  retryable: boolean;
  errorMessage: string | null;
}

export interface AudioSpeakerView {
  speakerId: string;
  label: string | null;
  voiceIdentityId: string | null;
}

export interface AudioTranscriptSegmentView {
  index: number;
  startMs: number;
  endMs: number;
  speakerId: string;
  text: string;
  confidence: number | null;
}

export interface AudioProjectView {
  audioProjectId: string;
  kind: AudioToolId;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  transcriptRevision: number;
  status: string;
  stages: readonly AudioStageView[];
  speakers: readonly AudioSpeakerView[];
  transcript: {
    revision: number;
    language: string;
    segments: readonly AudioTranscriptSegmentView[];
  } | null;
  legacyVoiceJobId: string | null;
}

export type AudioPhase = "idle" | "creating" | "estimating" | "admitting" | "running" | "done" | "failed";
