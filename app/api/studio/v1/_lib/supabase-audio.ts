import "server-only";

/**
 * STUDIO_11 route-adapter audio access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed reads/writes over the j11 schema. Service-role bypasses
 * RLS, so every call binds explicit tenant/project scope.
 */
import { AudioError, type AudioProjectRecord, type AudioStageId, type SpeakerVoiceBinding } from "@ethen/studio-core/server/audio";
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import { AudioRouteError } from "./audio-errors";

export { AudioRouteError };

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function nullableNum(row: Row, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function iso(row: Row, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : new Date().toISOString();
}

function audioStatusFrom(code: string): AudioRouteError["status"] {
  if (code === "AUDIO_NOT_FOUND" || code === "AUDIO_TENANT_MISMATCH") return "NOT_FOUND";
  if (code === "AUDIO_STAGE_CONFLICT") return "CONFLICT";
  return "VALIDATION_ERROR";
}

export function toRouteError(error: unknown, fallback: string): AudioRouteError {
  if (error instanceof AudioRouteError) return error;
  if (error instanceof AudioError) return new AudioRouteError(audioStatusFrom(error.code), error.message);
  return new AudioRouteError("INTERNAL_ERROR", fallback);
}

export interface AudioProjectDetail extends AudioProjectRecord {
  stages: Array<{
    stage: AudioStageId;
    attempt: number;
    jobId: string | null;
    status: string;
    quoteId: string | null;
    estimatedIcu: number | null;
    settledIcu: number | null;
    transcriptRevision: number | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  speakerMap: SpeakerVoiceBinding[];
  transcriptRevisionRow: { revision: number; transcript: unknown; editedBy: string; createdAt: string } | null;
}

export async function createAudioProjectRecord(
  scope: ResolvedScope,
  input: { kind: string; sourceLanguage: string | null; targetLanguage: string | null },
): Promise<AudioProjectRecord> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_audio_projects")
    .insert({
      tenant_id: scope.tenantId,
      project_id: scope.projectId,
      kind: input.kind,
      source_language: input.sourceLanguage,
      target_language: input.targetLanguage,
      status: "draft",
    })
    .select("audio_project_id, kind, source_language, target_language, transcript_revision, status, legacy_voice_job_id, created_at, updated_at")
    .single();
  if (error || !data) {
    throw new AudioRouteError("VALIDATION_ERROR", `Audio project creation failed: ${error?.message ?? "unknown"}.`);
  }
  const row = data as Row;
  return {
    projectId: str(row, "audio_project_id"),
    scope: scope.scope,
    kind: str(row, "kind") as AudioProjectRecord["kind"],
    sourceLanguage: nullableStr(row, "source_language"),
    targetLanguage: nullableStr(row, "target_language"),
    transcriptRevision: Number(row.transcript_revision ?? 0),
    status: str(row, "status") as AudioProjectRecord["status"],
    legacyVoiceJobId: nullableStr(row, "legacy_voice_job_id"),
    createdAt: iso(row, "created_at"),
    updatedAt: iso(row, "updated_at"),
  };
}

export async function getAudioProjectDetail(scope: ResolvedScope, audioProjectId: string): Promise<AudioProjectDetail | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_audio_projects")
    .select("audio_project_id, tenant_id, project_id, kind, source_language, target_language, transcript_revision, status, legacy_voice_job_id, created_at, updated_at")
    .eq("audio_project_id", audioProjectId)
    .maybeSingle();
  if (error) throw new AudioRouteError("INTERNAL_ERROR", `Audio project read failed: ${error.message}.`);
  if (!data) return null;
  const row = data as Row;
  if (str(row, "tenant_id") !== scope.tenantId || str(row, "project_id") !== scope.projectId) return null;

  const [stagesRes, mapRes, revRes] = await Promise.all([
    client.from("studio_v5_audio_stages").select("*").eq("audio_project_id", audioProjectId),
    client.from("studio_v5_audio_speaker_map").select("*").eq("audio_project_id", audioProjectId),
    client
      .from("studio_v5_audio_transcript_revisions")
      .select("revision, transcript, edited_by, created_at")
      .eq("audio_project_id", audioProjectId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (stagesRes.error) throw new AudioRouteError("INTERNAL_ERROR", `Audio stage read failed: ${stagesRes.error.message}.`);
  if (mapRes.error) throw new AudioRouteError("INTERNAL_ERROR", `Speaker map read failed: ${mapRes.error.message}.`);

  return {
    projectId: str(row, "audio_project_id"),
    scope: scope.scope,
    kind: str(row, "kind") as AudioProjectRecord["kind"],
    sourceLanguage: nullableStr(row, "source_language"),
    targetLanguage: nullableStr(row, "target_language"),
    transcriptRevision: Number(row.transcript_revision ?? 0),
    status: str(row, "status") as AudioProjectRecord["status"],
    legacyVoiceJobId: nullableStr(row, "legacy_voice_job_id"),
    createdAt: iso(row, "created_at"),
    updatedAt: iso(row, "updated_at"),
    stages: ((stagesRes.data ?? []) as Row[]).map((stage) => ({
      stage: str(stage, "stage") as AudioStageId,
      attempt: Number(stage.attempt ?? 1),
      jobId: nullableStr(stage, "job_id"),
      status: str(stage, "status"),
      quoteId: nullableStr(stage, "quote_id"),
      estimatedIcu: nullableNum(stage, "estimated_icu"),
      settledIcu: nullableNum(stage, "settled_icu"),
      transcriptRevision: nullableNum(stage, "transcript_revision"),
      errorCode: nullableStr(stage, "error_code"),
      errorMessage: nullableStr(stage, "error_message"),
    })),
    speakerMap: ((mapRes.data ?? []) as Row[]).map((entry) => ({
      speakerId: str(entry, "speaker_id"),
      voiceIdentityId: str(entry, "voice_identity_id"),
      voiceVersion: Number(entry.voice_version ?? 1),
      consentStatus: str(entry, "consent_status") || "unknown",
    })),
    transcriptRevisionRow: revRes.data
      ? {
          revision: Number((revRes.data as Row).revision ?? 0),
          transcript: (revRes.data as Row).transcript,
          editedBy: str(revRes.data as Row, "edited_by"),
          createdAt: iso(revRes.data as Row, "created_at"),
        }
      : null,
  };
}

export async function saveSpeakerMapRows(
  scope: ResolvedScope,
  audioProjectId: string,
  entries: readonly SpeakerVoiceBinding[],
): Promise<void> {
  const head = await getAudioProjectDetail(scope, audioProjectId);
  if (!head) throw new AudioRouteError("NOT_FOUND", `Audio project ${audioProjectId} was not found.`);
  const client = requireServiceClient();
  const deleted = await client.from("studio_v5_audio_speaker_map").delete().eq("audio_project_id", audioProjectId);
  if (deleted.error) throw new AudioRouteError("INTERNAL_ERROR", `Speaker map replace failed: ${deleted.error.message}.`);
  if (entries.length === 0) return;
  const inserted = await client.from("studio_v5_audio_speaker_map").insert(
    entries.map((entry) => ({
      audio_project_id: audioProjectId,
      speaker_id: entry.speakerId,
      voice_identity_id: entry.voiceIdentityId,
      voice_version: entry.voiceVersion,
      consent_status: entry.consentStatus,
    })),
  );
  if (inserted.error) throw new AudioRouteError("VALIDATION_ERROR", `Speaker map save failed: ${inserted.error.message}.`);
}

/** Append a transcript revision and invalidate downstream stages. Returns the new revision. */
export async function appendTranscriptRevisionRow(
  scope: ResolvedScope,
  audioProjectId: string,
  transcript: unknown,
  editedBy: string,
  downstream: readonly AudioStageId[],
): Promise<number> {
  const head = await getAudioProjectDetail(scope, audioProjectId);
  if (!head) throw new AudioRouteError("NOT_FOUND", `Audio project ${audioProjectId} was not found.`);
  const client = requireServiceClient();
  const revision = head.transcriptRevision + 1;
  const inserted = await client.from("studio_v5_audio_transcript_revisions").insert({
    audio_project_id: audioProjectId,
    revision,
    transcript,
    edited_by: editedBy,
  });
  if (inserted.error) throw new AudioRouteError("VALIDATION_ERROR", `Transcript revision failed: ${inserted.error.message}.`);
  const bumped = await client
    .from("studio_v5_audio_projects")
    .update({ transcript_revision: revision, status: "running", updated_at: new Date().toISOString() })
    .eq("audio_project_id", audioProjectId);
  if (bumped.error) throw new AudioRouteError("INTERNAL_ERROR", `Transcript pointer update failed: ${bumped.error.message}.`);
  if (downstream.length > 0) {
    const invalidated = await client
      .from("studio_v5_audio_stages")
      .update({ status: "invalidated", updated_at: new Date().toISOString() })
      .eq("audio_project_id", audioProjectId)
      .in("stage", [...downstream]);
    if (invalidated.error) throw new AudioRouteError("INTERNAL_ERROR", `Stage invalidation failed: ${invalidated.error.message}.`);
  }
  return revision;
}

export interface StageSyncInput {
  stage: string;
  attempt: number;
  jobId: string | null;
  status: string;
  quoteId: string | null;
  estimatedIcu: number | null;
  settledIcu: number | null;
  transcriptRevision: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}

const STAGE_STATUSES = new Set(["pending", "quoted", "running", "succeeded", "failed", "invalidated"]);
const STAGE_IDS = new Set(["transcribe", "translate", "synthesize", "align", "mix"]);

/** Upsert one stage row (stage→canonical-job lineage). The job itself is admitted via /jobs. */
export async function upsertAudioStageRow(
  scope: ResolvedScope,
  audioProjectId: string,
  input: StageSyncInput,
): Promise<void> {
  const head = await getAudioProjectDetail(scope, audioProjectId);
  if (!head) throw new AudioRouteError("NOT_FOUND", `Audio project ${audioProjectId} was not found.`);
  if (!STAGE_IDS.has(input.stage)) throw new AudioRouteError("VALIDATION_ERROR", `Unknown audio stage ${input.stage}.`);
  if (!STAGE_STATUSES.has(input.status)) throw new AudioRouteError("VALIDATION_ERROR", `Unknown stage status ${input.status}.`);
  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    throw new AudioRouteError("VALIDATION_ERROR", "Stage attempt must be a positive integer.");
  }
  const client = requireServiceClient();
  const { error } = await client.from("studio_v5_audio_stages").upsert(
    {
      audio_project_id: audioProjectId,
      stage: input.stage,
      attempt: input.attempt,
      job_id: input.jobId,
      status: input.status,
      quote_id: input.quoteId,
      estimated_icu: input.estimatedIcu,
      settled_icu: input.settledIcu,
      transcript_revision: input.transcriptRevision,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "audio_project_id,stage" },
  );
  if (error) throw new AudioRouteError("INTERNAL_ERROR", `Stage sync failed: ${error.message}.`);
  const projectStatus = input.status === "failed" ? "failed" : input.status === "succeeded" ? head.status : "running";
  await client.from("studio_v5_audio_projects").update({ status: projectStatus, updated_at: new Date().toISOString() }).eq("audio_project_id", audioProjectId);
}

export async function readLegacyVoiceJobRow(legacyJobId: string): Promise<Row | null> {
  const client = requireServiceClient();
  const { data, error } = await client.from("voice_dubbing_jobs").select("*").eq("id", legacyJobId).maybeSingle();
  if (error) throw new AudioRouteError("INTERNAL_ERROR", `Legacy Voice read failed: ${error.message}.`);
  if (!data) return null;
  const mapped = await client
    .from("studio_v5_audio_legacy_map")
    .select("audio_project_id")
    .eq("legacy_table", "voice_dubbing_jobs")
    .eq("legacy_id", legacyJobId)
    .maybeSingle();
  return { ...(data as Row), canonical_audio_project_id: (mapped.data as Row | null)?.audio_project_id ?? null };
}
