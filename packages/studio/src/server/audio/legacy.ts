/** Studio V5 audio — legacy Voice reads and transcript conversion (STUDIO_11). Server-only. */
import "server-only";
import { CANONICAL_TRANSCRIPT_VERSION, validateTranscript, type CanonicalTranscript } from "../media/transcript";
import { audioError } from "./types";

export interface LegacyVoiceJobView {
  /** Original legacy job id, preserved verbatim for adapter reads. */
  legacyJobId: string;
  kind: "dubbing" | "speech" | "transcription";
  status: string;
  currentStep: string | null;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  progress: number | null;
  /** Canonical V5 job id when the run was re-admitted; null while legacy-owned. */
  canonicalJobId: string | null;
  note: string;
}

/**
 * Adapter read over a legacy Voice job row. Existing runs are never
 * switched or rewritten — the adapter projects them read-only and
 * preserves their ids. STUDIO_20 alone retires legacy routes after drain.
 */
export function projectLegacyVoiceJob(row: Record<string, unknown>): LegacyVoiceJobView {
  const legacyJobId = row.id ?? row.job_id ?? row.jobId;
  if (typeof legacyJobId !== "string" || !legacyJobId.trim()) {
    throw audioError("AUDIO_VALIDATION", "Legacy Voice job row has no id.", {});
  }
  const kindRaw = typeof row.kind === "string" ? row.kind : "dubbing";
  const kind: LegacyVoiceJobView["kind"] =
    kindRaw === "speech" || kindRaw === "transcription" ? kindRaw : "dubbing";
  const progress = typeof row.progress === "number" ? row.progress : null;
  return {
    legacyJobId,
    kind,
    status: typeof row.status === "string" ? row.status : "unknown",
    currentStep: typeof row.current_step === "string" ? row.current_step : null,
    sourceLanguage: typeof row.source_language === "string" ? row.source_language : null,
    targetLanguage: typeof row.target_language === "string" ? row.target_language : null,
    progress: progress !== null && progress >= 0 && progress <= 100 ? progress : null,
    canonicalJobId: typeof row.canonical_job_id === "string" ? row.canonical_job_id : null,
    note: "Legacy Voice run, projected read-only. New Studio work admits through the shared runtime.",
  };
}

export interface TranscriptConversion {
  transcript: CanonicalTranscript;
  /** Explicit per-field diagnostics; never silent coercion. */
  diagnostics: readonly string[];
}

/**
 * Map a legacy Voice transcript (plain text, optional language, optional
 * per-speaker lines) to the canonical j07 transcript. Every assumption
 * is recorded in diagnostics; unparseable input throws instead of
 * producing a fabricated timestamped transcript.
 */
export function convertLegacyTranscript(candidate: unknown): TranscriptConversion {
  const diagnostics: string[] = [];
  if (!candidate || typeof candidate !== "object") {
    throw audioError("AUDIO_TRANSCRIPT_INVALID", "Legacy transcript must be an object.", {});
  }
  const row = candidate as Record<string, unknown>;
  const language = typeof row.language === "string" && row.language ? row.language : "en";
  if (!row.language) diagnostics.push("language missing; defaulted to 'en' with explicit diagnostic.");
  if (typeof language !== "string" || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(language)) {
    throw audioError("AUDIO_TRANSCRIPT_INVALID", "Legacy transcript language is not a BCP-47 tag.", { language });
  }

  const lines = Array.isArray(row.lines) ? row.lines : null;
  const text = typeof row.text === "string" ? row.text : "";
  if ((!lines || lines.length === 0) && !text.trim()) {
    throw audioError("AUDIO_TRANSCRIPT_INVALID", "Legacy transcript has no text or lines to convert.", {});
  }

  const segments =
    lines && lines.length > 0
      ? (lines as Array<Record<string, unknown>>).map((line, index) => {
          const lineText = typeof line.text === "string" ? line.text : "";
          if (!lineText.trim()) {
            throw audioError("AUDIO_TRANSCRIPT_INVALID", `Legacy transcript line ${index} has no text.`, { index });
          }
          diagnostics.push(`line ${index}: no timestamps in legacy source; assigned sequential placeholder span.`);
          return {
            start_ms: index * 1000,
            end_ms: (index + 1) * 1000,
            speaker_id: typeof line.speaker === "string" && line.speaker ? line.speaker : "SPEAKER_00",
            text: lineText,
            confidence: null as number | null,
            words: [],
          };
        })
      : [
          {
            start_ms: 0,
            end_ms: Math.max(1000, text.trim().split(/\s+/).length * 400),
            speaker_id: "SPEAKER_00",
            text: text.trim(),
            confidence: null as number | null,
            words: [],
          },
        ];
  if (!lines) diagnostics.push("plain-text legacy transcript; single segment with estimated span from word count.");

  const speakerIds = [...new Set(segments.map((segment) => segment.speaker_id))];
  const transcript = validateTranscript({
    version: CANONICAL_TRANSCRIPT_VERSION,
    language,
    speakers: speakerIds.map((speaker_id) => ({ speaker_id, label: null })),
    segments,
    source: { task: "speech.transcribe", version: "legacy-voice-v1", jobId: null },
  });
  diagnostics.push(`converted ${segments.length} segment(s) across ${speakerIds.length} speaker(s).`);
  return { transcript, diagnostics };
}
