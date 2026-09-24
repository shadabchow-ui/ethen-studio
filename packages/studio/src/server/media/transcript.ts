/** Studio V5 media — canonical transcript contract (STUDIO_07, server-only). */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import { isTaskName } from "../../contracts/tasks";
import { mediaError } from "./types";

/** Transcript schema version. Only v1 exists; readers must reject anything else. */
export const CANONICAL_TRANSCRIPT_VERSION = 1 as const;

/** Tasks allowed to originate a canonical transcript. */
export const TRANSCRIPT_SOURCE_TASKS: ReadonlySet<string> = new Set([
  "speech.transcribe",
  "speech.align",
  "audio.transform",
  "text.translate",
]);

export interface TranscriptWord {
  start_ms: number;
  end_ms: number;
  text: string;
  /** Explicit word confidence, or null when the source did not report one. Never defaulted. */
  confidence: number | null;
}

export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  speaker_id: string;
  text: string;
  /** Explicit segment confidence, or null when the source did not report one. */
  confidence: number | null;
  /** Words nest inside their segment and must sit within its bounds. */
  words: readonly TranscriptWord[];
}

export interface TranscriptSpeaker {
  speaker_id: string;
  label: string | null;
}

export interface TranscriptSource {
  task: TaskName;
  /** Pinned source version (task schema or provider model pin). Never empty. */
  version: string;
  jobId: string | null;
}

/** Canonical STUDIO_07 Transcript: integer ms, speaker ids, nested words. */
export interface CanonicalTranscript {
  version: typeof CANONICAL_TRANSCRIPT_VERSION;
  /** BCP-47 language tag, e.g. "en", "en-US". */
  language: string;
  speakers: readonly TranscriptSpeaker[];
  segments: readonly TranscriptSegment[];
  source: TranscriptSource;
}

function isIntMs(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isConfidence(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && value >= 0 && value <= 1);
}

/**
 * Validate a canonical transcript. Rejects non-integer timestamps, inverted
 * or overlapping segments, words outside their segment, unknown speakers,
 * defaulted confidences, and unversioned sources. Pure; throws MediaError.
 */
export function validateTranscript(candidate: unknown): CanonicalTranscript {
  const fail = (message: string, details: Readonly<Record<string, unknown>> = {}): never => {
    throw mediaError("BAD_REQUEST", message, { ...details, contract: "CanonicalTranscript" });
  };
  if (!candidate || typeof candidate !== "object") fail("Transcript must be an object.");
  const t = candidate as Record<string, unknown>;
  if (t.version !== CANONICAL_TRANSCRIPT_VERSION) {
    fail(`Transcript version must be ${CANONICAL_TRANSCRIPT_VERSION}.`, { version: t.version });
  }
  if (typeof t.language !== "string" || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(t.language)) {
    fail("Transcript language must be a BCP-47 tag such as 'en' or 'en-US'.", { language: t.language });
  }
  if (!Array.isArray(t.speakers) || t.speakers.length === 0) {
    fail("Transcript must declare at least one speaker.", {});
  }
  const speakerIds = new Set<string>();
  for (const speaker of t.speakers as Array<Record<string, unknown>>) {
    const sid: unknown = speaker?.speaker_id;
    if (typeof sid !== "string" || sid.length === 0) {
      fail("Every speaker needs a non-empty speaker_id.", {});
    }
    const id = sid as string;
    if (speakerIds.has(id)) fail("Duplicate speaker_id.", { speaker_id: id });
    speakerIds.add(id);
    const label: unknown = speaker.label;
    if (label !== null && label !== undefined && typeof label !== "string") {
      fail("Speaker label must be a string or null.", { speaker_id: id });
    }
  }
  if (!Array.isArray(t.segments) || t.segments.length === 0) {
    fail("Transcript must contain at least one segment.", {});
  }
  let previousEnd = -1;
  const segments = t.segments as Array<Record<string, unknown>>;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] as Record<string, unknown>;
    if (!isIntMs(segment.start_ms) || !isIntMs(segment.end_ms)) {
      fail("Segment timestamps must be integer milliseconds.", { index: i });
    }
    const startMs = segment.start_ms as number;
    const endMs = segment.end_ms as number;
    if (startMs >= endMs) fail("Segment start_ms must be before end_ms.", { index: i });
    if (startMs < previousEnd) fail("Segments must be ordered and non-overlapping.", { index: i });
    previousEnd = endMs;
    if (typeof segment.speaker_id !== "string" || !speakerIds.has(segment.speaker_id)) {
      fail("Segment speaker_id must reference a declared speaker.", { index: i });
    }
    if (typeof segment.text !== "string" || segment.text.trim().length === 0) {
      fail("Segment text must be non-empty.", { index: i });
    }
    if (!isConfidence(segment.confidence)) fail("Segment confidence must be null or within 0..1.", { index: i });
    if (!Array.isArray(segment.words)) fail("Segment words must be an array (possibly empty).", { index: i });
    let wordPreviousEnd = startMs;
    for (let w = 0; w < (segment.words as unknown[]).length; w += 1) {
      const word = (segment.words as Array<Record<string, unknown>>)[w];
      if (!isIntMs(word.start_ms) || !isIntMs(word.end_ms)) {
        fail("Word timestamps must be integer milliseconds.", { index: i, word: w });
      }
      const wordStart = word.start_ms as number;
      const wordEnd = word.end_ms as number;
      if (wordStart >= wordEnd) fail("Word start_ms must be before end_ms.", { index: i, word: w });
      if (wordStart < startMs || wordEnd > endMs) {
        fail("Words must sit within their segment bounds.", { index: i, word: w });
      }
      if (wordStart < wordPreviousEnd) fail("Words must be ordered and non-overlapping.", { index: i, word: w });
      wordPreviousEnd = wordEnd;
      if (typeof word.text !== "string" || word.text.length === 0) {
        fail("Word text must be non-empty.", { index: i, word: w });
      }
      if (!isConfidence(word.confidence)) fail("Word confidence must be null or within 0..1.", { index: i, word: w });
    }
  }
  const source = (t.source ?? {}) as Record<string, unknown>;
  if (typeof source.task !== "string" || !isTaskName(source.task)) {
    fail("Transcript source task must be a known task name.", {});
  }
  if (!TRANSCRIPT_SOURCE_TASKS.has(source.task as string)) {
    fail("Transcript source task cannot originate transcripts.", { task: source.task });
  }
  if (typeof source.version !== "string" || source.version.length === 0) {
    fail("Transcript source version pin must be non-empty.", {});
  }
  if (source.jobId !== null && source.jobId !== undefined && typeof source.jobId !== "string") {
    fail("Transcript source jobId must be a string or null.", {});
  }
  return candidate as CanonicalTranscript;
}

/** Total spoken span in ms (last segment end). Validates first. */
export function transcriptDurationMs(transcript: CanonicalTranscript): number {
  const valid = validateTranscript(transcript);
  return valid.segments[valid.segments.length - 1].end_ms;
}
