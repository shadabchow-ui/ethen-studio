/** Studio V5 audio — staged journey behind the shared runtime (STUDIO_11). Server-only. */
import "server-only";
import { createHash } from "node:crypto";
import type { ProjectScope } from "../../contracts/scope";
import type { VersionPins } from "../../contracts/versions";
import type { MemoryEconomicsStore } from "../economics/memory";
import type { IdentityPort } from "../identity/types";
import { admitJob, type AdmissionResult } from "../runtime/admission";
import type { MemoryRuntimeStore } from "../runtime/memory";
import { dirtyDownstreamStages, type AudioStagePlan } from "./stage-plan";
import { findRevokedSpeakerEntry } from "./speaker-map";
import { MemoryAudioStore } from "./memory";
import { audioError, type AudioStageId, type AudioStageRecord } from "./types";

export interface AudioJourneyDeps {
  audio: MemoryAudioStore;
  runtime: MemoryRuntimeStore;
  economics: MemoryEconomicsStore;
  identities: IdentityPort;
  pins: VersionPins;
  endpointId: string;
  actorId: string;
}

export interface StartStageInput {
  scope: ProjectScope;
  audioProjectId: string;
  plan: AudioStagePlan;
  stage: AudioStageId;
  /** Quote issued through the j04 economics path for this stage. */
  quoteId: string;
  estimatedIcu: number;
  parameters: Readonly<Record<string, unknown>>;
}

function requestHashFor(input: StartStageInput, attempt: number, transcriptRevision: number): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        project: input.audioProjectId,
        stage: input.stage,
        attempt,
        transcriptRevision,
        parameters: input.parameters,
      }),
    )
    .digest("hex");
}

/**
 * Admit one audio stage as a shared RuntimeJob. There is no second
 * ledger or queue: every stage goes through atomic admission (quote →
 * quota → reservation → dispatch outbox) and the audio store only maps
 * stage → jobId lineage. Voice consent is re-checked at every dispatch
 * so a mid-run revocation halts with a staged failure.
 */
export async function startAudioStage(
  deps: AudioJourneyDeps,
  input: StartStageInput,
): Promise<{ admission: AdmissionResult; record: AudioStageRecord }> {
  const project = deps.audio.getProject(input.scope, input.audioProjectId);
  if (!project) throw audioError("AUDIO_NOT_FOUND", `Audio project ${input.audioProjectId} was not found.`);
  const planned = input.plan.stages.find((stage) => stage.stage === input.stage);
  if (!planned) {
    throw audioError("AUDIO_VALIDATION", `Stage ${input.stage} is not in this plan.`, { stage: input.stage });
  }
  const speakerEntries = deps.audio.getSpeakerMap(input.scope, input.audioProjectId);
  if (speakerEntries.length > 0) {
    const revoked = await findRevokedSpeakerEntry({ scope: input.scope, entries: speakerEntries, identities: deps.identities });
    if (revoked) {
      const record = deps.audio.upsertStage(input.scope, input.audioProjectId, input.stage, {
        status: "failed",
        errorCode: "AUDIO_CONSENT_BLOCKED",
        errorMessage: `Voice for ${revoked.speakerId} was revoked; the run stops here.`,
      });
      deps.audio.setProjectStatus(input.scope, input.audioProjectId, "failed");
      throw audioError("AUDIO_CONSENT_BLOCKED", `Voice for ${revoked.speakerId} is revoked; stage ${input.stage} refused.`, {
        speakerId: revoked.speakerId,
        stage: input.stage,
        stageStatus: record.status,
      });
    }
  }
  const existing = deps.audio.getStage(input.scope, input.audioProjectId, input.stage);
  const attempt = (existing?.attempt ?? 0) + 1;
  const idempotencyKey = `audio:${input.audioProjectId}:${input.stage}:${attempt}`;
  const admission = await admitJob(
    {
      scope: input.scope,
      task: planned.task,
      actorId: deps.actorId,
      idempotencyKey,
      requestHash: requestHashFor(input, attempt, project.transcriptRevision),
      quoteId: input.quoteId,
      pins: deps.pins,
      endpointId: deps.endpointId,
      parameters: {
        ...input.parameters,
        audioProjectId: input.audioProjectId,
        audioStage: input.stage,
        audioAttempt: attempt,
        transcriptRevision: project.transcriptRevision,
      },
    },
    { runtime: deps.runtime, economics: deps.economics },
  );
  deps.audio.setProjectStatus(input.scope, input.audioProjectId, "running");
  const record = deps.audio.upsertStage(input.scope, input.audioProjectId, input.stage, {
    attempt,
    jobId: admission.job.jobId,
    status: "running",
    quoteId: input.quoteId,
    estimatedIcu: input.estimatedIcu,
    transcriptRevision: project.transcriptRevision,
    errorCode: null,
    errorMessage: null,
  });
  return { admission, record };
}

export async function completeAudioStage(
  deps: AudioJourneyDeps,
  args: { scope: ProjectScope; audioProjectId: string; plan: AudioStagePlan; stage: AudioStageId; settledIcu: number },
): Promise<AudioStageRecord> {
  const record = deps.audio.upsertStage(args.scope, args.audioProjectId, args.stage, {
    status: "succeeded",
    settledIcu: args.settledIcu,
  });
  const stages = deps.audio.listStages(args.scope, args.audioProjectId);
  const planned = new Set(args.plan.stages.map((stage) => stage.stage));
  const done = stages.filter((row) => planned.has(row.stage) && row.status === "succeeded").length;
  deps.audio.setProjectStatus(args.scope, args.audioProjectId, done === planned.size ? "succeeded" : "running");
  return record;
}

export async function failAudioStage(
  deps: AudioJourneyDeps,
  args: {
    scope: ProjectScope;
    audioProjectId: string;
    stage: AudioStageId;
    errorCode: string;
    errorMessage: string;
    settledIcu?: number;
  },
): Promise<AudioStageRecord> {
  const record = deps.audio.upsertStage(args.scope, args.audioProjectId, args.stage, {
    status: "failed",
    errorCode: args.errorCode,
    errorMessage: args.errorMessage,
    settledIcu: args.settledIcu ?? null,
  });
  deps.audio.setProjectStatus(args.scope, args.audioProjectId, "failed");
  return record;
}

/**
 * Retry one stage: bump the attempt, invalidate the stage and everything
 * downstream (their outputs were built from the failed/superseded
 * output), then re-admit. Earlier successful stages are kept — partial
 * retry never rebuilds the world.
 */
export async function retryAudioStage(
  deps: AudioJourneyDeps,
  input: StartStageInput,
): Promise<{ admission: AdmissionResult; record: AudioStageRecord; invalidated: readonly AudioStageId[] }> {
  const invalidated = dirtyDownstreamStages(input.plan, input.stage);
  deps.audio.invalidateFrom(input.scope, input.audioProjectId, invalidated);
  const { admission, record } = await startAudioStage(deps, input);
  return { admission, record, invalidated };
}

/**
 * Apply a transcript edit: append a revision, then invalidate every
 * compute stage downstream of transcription. Retry rebuilds from the
 * new revision; the edit itself never mutates settled cost.
 */
export function applyTranscriptEdit(
  deps: AudioJourneyDeps,
  args: {
    scope: ProjectScope;
    audioProjectId: string;
    plan: AudioStagePlan;
    transcript: unknown;
    editedBy: string;
  },
): { revision: number; invalidated: readonly AudioStageId[] } {
  const revision = deps.audio.appendTranscriptRevision(args.scope, args.audioProjectId, args.transcript, args.editedBy);
  const order = args.plan.stages.map((stage) => stage.stage);
  const anchor = order.indexOf("transcribe");
  const downstream = anchor < 0 ? order : order.slice(anchor + 1);
  deps.audio.invalidateFrom(args.scope, args.audioProjectId, downstream);
  deps.audio.setProjectStatus(args.scope, args.audioProjectId, "running");
  return { revision: revision.revision, invalidated: downstream };
}

export interface AudioProjectCost {
  stages: ReadonlyArray<{ stage: AudioStageId; estimatedIcu: number | null; settledIcu: number | null }>;
  totalEstimatedIcu: number;
  totalSettledIcu: number;
}

/** Per-stage child cost rollup for an audio project. */
export function audioProjectCost(deps: AudioJourneyDeps, scope: ProjectScope, audioProjectId: string): AudioProjectCost {
  const stages = deps.audio.listStages(scope, audioProjectId).map((row) => ({
    stage: row.stage,
    estimatedIcu: row.estimatedIcu,
    settledIcu: row.settledIcu,
  }));
  return {
    stages,
    totalEstimatedIcu: stages.reduce((sum, row) => sum + (row.estimatedIcu ?? 0), 0),
    totalSettledIcu: stages.reduce((sum, row) => sum + (row.settledIcu ?? 0), 0),
  };
}
