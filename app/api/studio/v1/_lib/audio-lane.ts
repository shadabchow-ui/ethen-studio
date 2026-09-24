import "server-only";

/**
 * P04 — fixture-lane audio repository (RC-3 audio).
 *
 * Mirrors the `supabase-audio.ts` shapes the routes consume, backed by
 * `localStores().audio` (the kernel memory store, never a rewrite).
 * Routes branch onto these functions only when `isStudioFixtureLane()`
 * holds. Stage rows are lineage only (jobs admit through the shared
 * /jobs fixture lane); transcript edits validate through the kernel
 * and invalidate downstream stages, like Supabase.
 */
import {
  type AudioJobKind,
  type AudioProjectRecord,
  type AudioStageId,
  type AudioStageStatus,
  type MemoryAudioStore,
} from "@ethen/studio-core/server/audio";
import type { ProjectScope } from "@ethen/studio-core/contracts";
import { AudioRouteError } from "./audio-errors";
import type { AudioProjectDetail, StageSyncInput } from "./supabase-audio";

/** Minimal scope the lane needs (routes pass their ResolvedScope). */
export interface FixtureScope {
  scope: ProjectScope;
}

const STAGE_IDS = new Set(["transcribe", "translate", "synthesize", "align", "mix"]);
const STAGE_STATUSES = new Set(["pending", "quoted", "running", "succeeded", "failed", "invalidated"]);

// ------------------------------------------------------------------ projects

export function fixtureCreateAudioProject(
  store: MemoryAudioStore,
  scope: FixtureScope,
  input: { kind: AudioJobKind; sourceLanguage: string | null; targetLanguage: string | null },
): AudioProjectRecord {
  return store.createProject({ scope: scope.scope, kind: input.kind, sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage });
}

export function fixtureGetAudioProjectDetail(
  store: MemoryAudioStore,
  scope: FixtureScope,
  audioProjectId: string,
): AudioProjectDetail | null {
  const record = store.getProject(scope.scope, audioProjectId);
  if (!record) return null;
  const latest = store.latestTranscriptRevision(scope.scope, audioProjectId);
  return {
    ...record,
    stages: store.listStages(scope.scope, audioProjectId).map((stage) => ({
      stage: stage.stage,
      attempt: stage.attempt,
      jobId: stage.jobId,
      status: stage.status,
      quoteId: stage.quoteId,
      estimatedIcu: stage.estimatedIcu,
      settledIcu: stage.settledIcu,
      transcriptRevision: stage.transcriptRevision,
      errorCode: stage.errorCode,
      errorMessage: stage.errorMessage,
    })),
    speakerMap: store.getSpeakerMap(scope.scope, audioProjectId),
    transcriptRevisionRow: latest
      ? { revision: latest.revision, transcript: latest.transcript, editedBy: latest.editedBy, createdAt: latest.createdAt }
      : null,
  };
}

// -------------------------------------------------------------------- stages

/** Stage lineage sync with the same validation + project-status rule as Supabase. */
export function fixtureUpsertAudioStage(
  store: MemoryAudioStore,
  scope: FixtureScope,
  audioProjectId: string,
  input: StageSyncInput,
): void {
  const head = store.getProject(scope.scope, audioProjectId);
  if (!head) throw new AudioRouteError("NOT_FOUND", `Audio project ${audioProjectId} was not found.`);
  if (!STAGE_IDS.has(input.stage)) throw new AudioRouteError("VALIDATION_ERROR", `Unknown audio stage ${input.stage}.`);
  if (!STAGE_STATUSES.has(input.status)) throw new AudioRouteError("VALIDATION_ERROR", `Unknown stage status ${input.status}.`);
  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    throw new AudioRouteError("VALIDATION_ERROR", "Stage attempt must be a positive integer.");
  }
  store.upsertStage(scope.scope, audioProjectId, input.stage as AudioStageId, {
    attempt: input.attempt,
    jobId: input.jobId,
    status: input.status as AudioStageStatus,
    quoteId: input.quoteId,
    estimatedIcu: input.estimatedIcu,
    settledIcu: input.settledIcu,
    transcriptRevision: input.transcriptRevision,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
  });
  const projectStatus = input.status === "failed" ? "failed" : input.status === "succeeded" ? head.status : "running";
  store.setProjectStatus(scope.scope, audioProjectId, projectStatus);
}

// --------------------------------------------------------------- transcripts

/** Append a kernel-validated transcript revision and invalidate downstream. Returns the new revision. */
export function fixtureAppendTranscriptRevision(
  store: MemoryAudioStore,
  scope: FixtureScope,
  audioProjectId: string,
  transcript: unknown,
  editedBy: string,
  downstream: readonly AudioStageId[],
): number {
  const head = store.getProject(scope.scope, audioProjectId);
  if (!head) throw new AudioRouteError("NOT_FOUND", `Audio project ${audioProjectId} was not found.`);
  const revision = store.appendTranscriptRevision(scope.scope, audioProjectId, transcript, editedBy);
  store.setProjectStatus(scope.scope, audioProjectId, "running");
  if (downstream.length > 0) store.invalidateFrom(scope.scope, audioProjectId, downstream);
  return revision.revision;
}
