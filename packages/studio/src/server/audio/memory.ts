/** Studio V5 audio — memory project store (STUDIO_11). Server-only. */
import "server-only";
import { randomUUID } from "node:crypto";
import type { ProjectScope } from "../../contracts/scope";
import { serializeScope } from "../../contracts/scope";
import { validateTranscript } from "../media/transcript";
import {
  audioError,
  isAudioJobKind,
  type AudioJobKind,
  type AudioProjectRecord,
  type AudioStageId,
  type AudioStageRecord,
  type AudioStageStatus,
  type AudioTranscriptRevision,
  type SpeakerVoiceBinding,
} from "./types";

function sameScope(a: ProjectScope, b: ProjectScope): boolean {
  return serializeScope(a) === serializeScope(b);
}

export interface CreateAudioProjectInput {
  scope: ProjectScope;
  kind: AudioJobKind;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  legacyVoiceJobId?: string | null;
  now?: string;
}

/** Test/local store. Production binds Supabase-backed adapters instead. */
export class MemoryAudioStore {
  private readonly projects = new Map<string, AudioProjectRecord>();
  private readonly stages = new Map<string, AudioStageRecord[]>();
  private readonly speakerMaps = new Map<string, SpeakerVoiceBinding[]>();
  private readonly revisions = new Map<string, AudioTranscriptRevision[]>();

  createProject(input: CreateAudioProjectInput): AudioProjectRecord {
    if (!isAudioJobKind(input.kind)) {
      throw audioError("AUDIO_VALIDATION", "Unknown audio job kind.", { kind: input.kind });
    }
    const now = input.now ?? new Date().toISOString();
    const record: AudioProjectRecord = {
      projectId: `audio_${randomUUID()}`,
      scope: input.scope,
      kind: input.kind,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      transcriptRevision: 0,
      status: "draft",
      legacyVoiceJobId: input.legacyVoiceJobId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(record.projectId, record);
    this.stages.set(record.projectId, []);
    this.speakerMaps.set(record.projectId, []);
    this.revisions.set(record.projectId, []);
    return record;
  }

  /** Scoped get: cross-tenant reads return null, never leak. */
  getProject(scope: ProjectScope, projectId: string): AudioProjectRecord | null {
    const record = this.projects.get(projectId) ?? null;
    if (!record) return null;
    if (!sameScope(record.scope, scope)) return null;
    return record;
  }

  private requireProject(scope: ProjectScope, projectId: string): AudioProjectRecord {
    const record = this.getProject(scope, projectId);
    if (!record) throw audioError("AUDIO_NOT_FOUND", `Audio project ${projectId} was not found.`);
    return record;
  }

  setProjectStatus(scope: ProjectScope, projectId: string, status: AudioProjectRecord["status"], now?: string): AudioProjectRecord {
    const record = this.requireProject(scope, projectId);
    const next: AudioProjectRecord = { ...record, status, updatedAt: now ?? new Date().toISOString() };
    this.projects.set(projectId, next);
    return next;
  }

  saveSpeakerMap(scope: ProjectScope, projectId: string, entries: readonly SpeakerVoiceBinding[]): SpeakerVoiceBinding[] {
    this.requireProject(scope, projectId);
    const rows = entries.map((entry) => ({ ...entry }));
    this.speakerMaps.set(projectId, rows);
    return rows;
  }

  getSpeakerMap(scope: ProjectScope, projectId: string): SpeakerVoiceBinding[] {
    this.requireProject(scope, projectId);
    return [...(this.speakerMaps.get(projectId) ?? [])];
  }

  appendTranscriptRevision(
    scope: ProjectScope,
    projectId: string,
    transcript: unknown,
    editedBy: string,
    now?: string,
  ): AudioTranscriptRevision {
    const record = this.requireProject(scope, projectId);
    const valid = validateTranscript(transcript);
    const revision: AudioTranscriptRevision = {
      projectId,
      revision: record.transcriptRevision + 1,
      transcript: valid,
      editedBy,
      createdAt: now ?? new Date().toISOString(),
    };
    this.revisions.set(projectId, [...(this.revisions.get(projectId) ?? []), revision]);
    this.projects.set(projectId, {
      ...record,
      transcriptRevision: revision.revision,
      updatedAt: revision.createdAt,
    });
    return revision;
  }

  latestTranscriptRevision(scope: ProjectScope, projectId: string): AudioTranscriptRevision | null {
    this.requireProject(scope, projectId);
    const rows = this.revisions.get(projectId) ?? [];
    return rows.length === 0 ? null : rows[rows.length - 1];
  }

  upsertStage(
    scope: ProjectScope,
    projectId: string,
    stage: AudioStageId,
    patch: Partial<Pick<AudioStageRecord, "jobId" | "status" | "quoteId" | "estimatedIcu" | "settledIcu" | "transcriptRevision" | "errorCode" | "errorMessage">> & { attempt?: number },
    now?: string,
  ): AudioStageRecord {
    this.requireProject(scope, projectId);
    const rows = this.stages.get(projectId) ?? [];
    const at = now ?? new Date().toISOString();
    const existing = rows.find((row) => row.stage === stage) ?? null;
    if (!existing) {
      const created: AudioStageRecord = {
        stageId: `astage_${randomUUID()}`,
        projectId,
        stage,
        attempt: patch.attempt ?? 1,
        jobId: patch.jobId ?? null,
        status: patch.status ?? "pending",
        quoteId: patch.quoteId ?? null,
        estimatedIcu: patch.estimatedIcu ?? null,
        settledIcu: patch.settledIcu ?? null,
        transcriptRevision: patch.transcriptRevision ?? null,
        errorCode: patch.errorCode ?? null,
        errorMessage: patch.errorMessage ?? null,
        createdAt: at,
        updatedAt: at,
      };
      this.stages.set(projectId, [...rows, created]);
      return created;
    }
    const next: AudioStageRecord = {
      ...existing,
      ...patch,
      attempt: patch.attempt ?? existing.attempt,
      updatedAt: at,
    };
    this.stages.set(projectId, rows.map((row) => (row.stage === stage ? next : row)));
    return next;
  }

  listStages(scope: ProjectScope, projectId: string): AudioStageRecord[] {
    this.requireProject(scope, projectId);
    return [...(this.stages.get(projectId) ?? [])];
  }

  getStage(scope: ProjectScope, projectId: string, stage: AudioStageId): AudioStageRecord | null {
    this.requireProject(scope, projectId);
    return (this.stages.get(projectId) ?? []).find((row) => row.stage === stage) ?? null;
  }

  /** Invalidate one stage and everything downstream of it (transcript edit / retry). */
  invalidateFrom(scope: ProjectScope, projectId: string, stages: readonly AudioStageId[], now?: string): AudioStageRecord[] {
    this.requireProject(scope, projectId);
    const at = now ?? new Date().toISOString();
    const rows = (this.stages.get(projectId) ?? []).map((row) =>
      stages.includes(row.stage) && row.status !== "invalidated"
        ? { ...row, status: "invalidated" as AudioStageStatus, updatedAt: at }
        : row,
    );
    this.stages.set(projectId, rows);
    return rows.filter((row) => stages.includes(row.stage));
  }
}
