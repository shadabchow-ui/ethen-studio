/**
 * STUDIO_11 — audio API response parsers. Browser-safe, behavior-free.
 * Mirrors the 09 create-api-client style: parse-or-error, never throw.
 */

import type { CreateApiError } from "../create-api-client";
import { AUDIO_STAGE_TASK, type AudioProjectView, type AudioStageId, type AudioStageView } from "./types";
import { isAudioToolId } from "./audio-tool-bindings";

const STAGE_LABELS: Readonly<Record<AudioStageId, string>> = {
  transcribe: "Transcribe",
  translate: "Translate",
  synthesize: "Speaker synthesis",
  align: "Align",
  mix: "Mix",
};

const STAGE_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: "Queued",
  quoted: "Estimated",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  invalidated: "Needs rerun",
};

function err(body: unknown, fallback: string): CreateApiError {
  const row = (body ?? {}) as Record<string, unknown>;
  const nested = (row.error ?? {}) as Record<string, unknown>;
  const code = typeof nested.code === "string" ? nested.code : typeof row.code === "string" ? row.code : "UNKNOWN";
  const message =
    typeof nested.message === "string" ? nested.message : typeof row.message === "string" ? row.message : fallback;
  return { code, message, retryable: code !== "VALIDATION_ERROR" && code !== "SLOT_UNBOUND" };
}

function isStageId(value: unknown): value is AudioStageId {
  return value === "transcribe" || value === "translate" || value === "synthesize" || value === "align" || value === "mix";
}

function parseStage(row: Record<string, unknown>): AudioStageView | null {
  if (!isStageId(row.stage)) return null;
  const status = typeof row.status === "string" ? row.status : "pending";
  return {
    stage: row.stage,
    label: STAGE_LABELS[row.stage],
    task: AUDIO_STAGE_TASK[row.stage],
    status,
    statusLabel: STAGE_STATUS_LABELS[status] ?? status,
    jobId: typeof row.jobId === "string" ? row.jobId : null,
    estimatedIcu: typeof row.estimatedIcu === "number" ? row.estimatedIcu : null,
    settledIcu: typeof row.settledIcu === "number" ? row.settledIcu : null,
    retryable: status === "failed" || status === "invalidated",
    errorMessage: typeof row.errorMessage === "string" ? row.errorMessage : null,
  };
}

export function parseAudioProject(body: unknown): { project: AudioProjectView | null; error: CreateApiError | null } {
  const row = (body ?? {}) as Record<string, unknown>;
  const data = ((row.data ?? row) as Record<string, unknown>);
  if (typeof data.audioProjectId !== "string" || !isAudioToolId(String(data.kind ?? ""))) {
    return { project: null, error: err(body, "Audio project read failed.") };
  }
  const stages = Array.isArray(data.stages)
    ? (data.stages as unknown[]).flatMap((entry) =>
        entry && typeof entry === "object" ? [parseStage(entry as Record<string, unknown>)] : [],
      )
    : [];
  if (stages.some((stage) => stage === null)) {
    return { project: null, error: err(body, "Audio project has an unknown stage.") };
  }
  const speakerMap = Array.isArray(data.speakerMap) ? (data.speakerMap as Record<string, unknown>[]) : [];
  const transcriptRow = (data.transcript ?? null) as Record<string, unknown> | null;
  let transcript: AudioProjectView["transcript"] = null;
  if (transcriptRow && typeof transcriptRow.transcript === "object" && transcriptRow.transcript) {
    const candidate = transcriptRow.transcript as Record<string, unknown>;
    const segments = Array.isArray(candidate.segments) ? candidate.segments : [];
    transcript = {
      revision: typeof transcriptRow.revision === "number" ? transcriptRow.revision : 0,
      language: typeof candidate.language === "string" ? candidate.language : "en",
      segments: segments.flatMap((segment, index) => {
        const entry = (segment ?? {}) as Record<string, unknown>;
        if (typeof entry.text !== "string") return [];
        return [
          {
            index,
            startMs: typeof entry.start_ms === "number" ? entry.start_ms : 0,
            endMs: typeof entry.end_ms === "number" ? entry.end_ms : 0,
            speakerId: typeof entry.speaker_id === "string" ? entry.speaker_id : "SPEAKER_00",
            text: entry.text,
            confidence: typeof entry.confidence === "number" ? entry.confidence : null,
          },
        ];
      }),
    };
  }
  return {
    project: {
      audioProjectId: data.audioProjectId as string,
      kind: String(data.kind) as AudioProjectView["kind"],
      sourceLanguage: typeof data.sourceLanguage === "string" ? data.sourceLanguage : null,
      targetLanguage: typeof data.targetLanguage === "string" ? data.targetLanguage : null,
      transcriptRevision: typeof data.transcriptRevision === "number" ? data.transcriptRevision : 0,
      status: typeof data.status === "string" ? data.status : "draft",
      stages: stages as AudioStageView[],
      speakers: speakerMap.flatMap((entry) =>
        typeof entry.speakerId === "string"
          ? [
              {
                speakerId: entry.speakerId,
                label: null,
                voiceIdentityId: typeof entry.voiceIdentityId === "string" ? entry.voiceIdentityId : null,
              },
            ]
          : [],
      ),
      transcript,
      legacyVoiceJobId: typeof data.legacyVoiceJobId === "string" ? data.legacyVoiceJobId : null,
    },
    error: null,
  };
}

export function parseTranscriptEdit(body: unknown): {
  revision: number | null;
  invalidated: readonly string[];
  error: CreateApiError | null;
} {
  const row = (body ?? {}) as Record<string, unknown>;
  const data = ((row.data ?? row) as Record<string, unknown>);
  if (typeof data.revision !== "number") {
    return { revision: null, invalidated: [], error: err(body, "Transcript edit failed.") };
  }
  const invalidated = Array.isArray(data.invalidated)
    ? (data.invalidated as unknown[]).filter((entry): entry is string => typeof entry === "string")
    : [];
  return { revision: data.revision, invalidated, error: null };
}

export interface LegacyVoiceJobView {
  legacyJobId: string;
  kind: string;
  status: string;
  currentStep: string | null;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  progress: number | null;
  canonicalJobId: string | null;
  note: string;
}

export function parseLegacyVoiceJob(body: unknown): { job: LegacyVoiceJobView | null; error: CreateApiError | null } {
  const row = (body ?? {}) as Record<string, unknown>;
  const data = ((row.data ?? row) as Record<string, unknown>);
  if (typeof data.legacyJobId !== "string") {
    return { job: null, error: err(body, "Legacy Voice job read failed.") };
  }
  return {
    job: {
      legacyJobId: data.legacyJobId,
      kind: typeof data.kind === "string" ? data.kind : "dubbing",
      status: typeof data.status === "string" ? data.status : "unknown",
      currentStep: typeof data.currentStep === "string" ? data.currentStep : null,
      sourceLanguage: typeof data.sourceLanguage === "string" ? data.sourceLanguage : null,
      targetLanguage: typeof data.targetLanguage === "string" ? data.targetLanguage : null,
      progress: typeof data.progress === "number" ? data.progress : null,
      canonicalJobId: typeof data.canonicalJobId === "string" ? data.canonicalJobId : null,
      note: typeof data.note === "string" ? data.note : "",
    },
    error: null,
  };
}
