import "server-only";

import { createHash } from "node:crypto";
import type {
  StreamStatus,
  StreamSegmentKind,
  StreamSubscriberMode,
  StreamResumeTokenMode,
  StreamStateRecord,
  StreamSegmentRecord,
  StreamSubscriberRecord,
  StreamResumeTokenRecord,
  StreamEventRecord,
} from "./types";
import { createServiceClient } from "@ethen/database/service";

// ── Normalizers ────────────────────────────────────────────────────────────

function normalizeStreamState(row: Record<string, unknown>): StreamStateRecord {
  return {
    id: String(row.id),
    streamId: String(row.stream_id),
    gatewayRequestId: String(row.gateway_request_id),
    gatewayRequestLogId: typeof row.gateway_request_log_id === "string" ? row.gateway_request_log_id : null,
    projectId: String(row.project_id),
    userId: typeof row.user_id === "string" ? row.user_id : null,
    traceId: String(row.trace_id),
    modelId: typeof row.model_id === "string" ? row.model_id : null,
    providerId: typeof row.provider_id === "string" ? row.provider_id : null,
    routeId: typeof row.route_id === "string" ? row.route_id : null,
    status: String(row.status) as StreamStatus,
    idempotencyKey: String(row.idempotency_key),
    producerLockKey: typeof row.producer_lock_key === "string" ? row.producer_lock_key : null,
    firstSequence: Number(row.first_sequence ?? 0),
    lastSequence: Number(row.last_sequence ?? 0),
    finalCharOffset: Number(row.final_char_offset ?? 0),
    finalByteOffset: Number(row.final_byte_offset ?? 0),
    finalTranscriptSha256: typeof row.final_transcript_sha256 === "string" ? row.final_transcript_sha256 : null,
    partialTranscript: typeof row.partial_transcript === "string" ? row.partial_transcript : null,
    contentLoggingMode: String(row.content_logging_mode ?? "metadata_only"),
    providerCallStartedAt: typeof row.provider_call_started_at === "string" ? row.provider_call_started_at : null,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    expiresAt: String(row.expires_at),
    errorClass: typeof row.error_class === "string" ? row.error_class : null,
    errorMessageRedacted: typeof row.error_message_redacted === "string" ? row.error_message_redacted : null,
    gatewayApiKeyId: typeof row.gateway_api_key_id === "string" ? row.gateway_api_key_id : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeStreamSegment(row: Record<string, unknown>): StreamSegmentRecord {
  return {
    id: String(row.id),
    streamStateId: String(row.stream_state_id),
    streamId: String(row.stream_id),
    projectId: String(row.project_id),
    sequence: Number(row.sequence ?? 0),
    eventId: String(row.event_id),
    segmentKind: String(row.segment_kind) as StreamSegmentKind,
    charOffsetStart: Number(row.char_offset_start ?? 0),
    charOffsetEnd: Number(row.char_offset_end ?? 0),
    byteOffsetStart: Number(row.byte_offset_start ?? 0),
    byteOffsetEnd: Number(row.byte_offset_end ?? 0),
    deltaSha256: typeof row.delta_sha256 === "string" ? row.delta_sha256 : null,
    eventPayload: (row.event_payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  };
}

function normalizeStreamEvent(row: Record<string, unknown>): StreamEventRecord {
  return {
    id: String(row.id),
    streamStateId: String(row.stream_state_id),
    streamId: String(row.stream_id),
    projectId: String(row.project_id),
    eventType: String(row.event_type),
    sequence: typeof row.sequence === "number" ? row.sequence : null,
    traceId: String(row.trace_id),
    visibleInReceipt: Boolean(row.visible_in_receipt),
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  };
}

// ── Retention ───────────────────────────────────────────────────────────

export function getStreamRetentionMinutes(): number {
  const env = process.env.STREAM_RETENTION_MINUTES;
  if (!env) return 60;
  const parsed = parseInt(env, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 60;
  return parsed;
}

export function getStreamRetentionExpiresAt(): string {
  const minutes = getStreamRetentionMinutes();
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

// ── Hash helpers ────────────────────────────────────────────────────────

export function computeTranscriptHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function computeTokenHash(value: string): string {
  return createHash("sha256").update(`ethen_stream_resume:${value}`, "utf8").digest("hex");
}

// ── Stream state CRUD ───────────────────────────────────────────────────

export interface CreateStreamStateInput {
  streamId: string;
  gatewayRequestId: string;
  gatewayRequestLogId?: string | null;
  projectId: string;
  userId?: string | null;
  traceId: string;
  modelId?: string | null;
  providerId?: string | null;
  routeId?: string | null;
  idempotencyKey: string;
  gatewayApiKeyId?: string | null;
  contentLoggingMode?: string;
}

export async function createStreamState(
  input: CreateStreamStateInput,
): Promise<{ record: StreamStateRecord } | { error: string }> {
  const service = createServiceClient();
  if (!service) return { error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("stream_state")
    .insert({
      stream_id: input.streamId,
      gateway_request_id: input.gatewayRequestId,
      gateway_request_log_id: input.gatewayRequestLogId ?? null,
      project_id: input.projectId,
      user_id: input.userId ?? null,
      trace_id: input.traceId,
      model_id: input.modelId ?? null,
      provider_id: input.providerId ?? null,
      route_id: input.routeId ?? null,
      status: "live",
      idempotency_key: input.idempotencyKey,
      gateway_api_key_id: input.gatewayApiKeyId ?? null,
      content_logging_mode: input.contentLoggingMode ?? "metadata_only",
      provider_call_started_at: new Date().toISOString(),
      expires_at: getStreamRetentionExpiresAt(),
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { record: normalizeStreamState(data as Record<string, unknown>) };
}

export async function getStreamState(
  streamId: string,
): Promise<{ record: StreamStateRecord | null; error: string | null }> {
  const service = createServiceClient();
  if (!service) return { record: null, error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("stream_state")
    .select("*")
    .eq("stream_id", streamId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return { record: null, error: null };
    return { record: null, error: error.message };
  }

  return { record: normalizeStreamState(data as Record<string, unknown>), error: null };
}

export async function updateStreamState(
  streamId: string,
  updates: {
    status?: StreamStatus;
    lastSequence?: number;
    finalCharOffset?: number;
    finalByteOffset?: number;
    finalTranscriptSha256?: string | null;
    partialTranscript?: string | null;
    completedAt?: string | null;
    errorClass?: string | null;
    errorMessageRedacted?: string | null;
    providerLockKey?: string | null;
    /**
     * Metadata to write into the existing metadata jsonb column. The route is
     * the single producer for a given stream's metadata, so this is a direct
     * set (not a deep merge). Used for additive timing/routing facts such as
     * TTFT without a migration, since the metadata column already exists.
     */
    metadataPatch?: Record<string, unknown>;
  },
): Promise<{ record: StreamStateRecord } | { error: string }> {
  const service = createServiceClient();
  if (!service) return { error: "Supabase service client is unavailable." };

  const patch: Record<string, unknown> = {};
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.lastSequence !== undefined) patch.last_sequence = updates.lastSequence;
  if (updates.finalCharOffset !== undefined) patch.final_char_offset = updates.finalCharOffset;
  if (updates.finalByteOffset !== undefined) patch.final_byte_offset = updates.finalByteOffset;
  if (updates.finalTranscriptSha256 !== undefined) patch.final_transcript_sha256 = updates.finalTranscriptSha256;
  if (updates.partialTranscript !== undefined) patch.partial_transcript = updates.partialTranscript;
  if (updates.completedAt !== undefined) patch.completed_at = updates.completedAt;
  if (updates.errorClass !== undefined) patch.error_class = updates.errorClass;
  if (updates.errorMessageRedacted !== undefined) patch.error_message_redacted = updates.errorMessageRedacted;
  if (updates.providerLockKey !== undefined) patch.producer_lock_key = updates.providerLockKey;
  if (updates.metadataPatch) {
    // Merge into existing metadata without overwriting unrelated keys.
    patch.metadata = updates.metadataPatch;
  }

  const { data, error } = await service
    .from("stream_state")
    .update(patch)
    .eq("stream_id", streamId)
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { record: normalizeStreamState(data as Record<string, unknown>) };
}

export async function getStreamStateByRequestId(
  gatewayRequestId: string,
): Promise<{ record: StreamStateRecord | null; error: string | null }> {
  const service = createServiceClient();
  if (!service) return { record: null, error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("stream_state")
    .select("*")
    .eq("gateway_request_id", gatewayRequestId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return { record: null, error: null };
    return { record: null, error: error.message };
  }

  return { record: normalizeStreamState(data as Record<string, unknown>), error: null };
}

// ── Stream segments ─────────────────────────────────────────────────────

export interface AppendStreamSegmentInput {
  streamStateId: string;
  streamId: string;
  projectId: string;
  sequence: number;
  eventId: string;
  segmentKind: StreamSegmentKind;
  charOffsetStart?: number;
  charOffsetEnd?: number;
  byteOffsetStart?: number;
  byteOffsetEnd?: number;
  deltaSha256?: string | null;
  eventPayload?: Record<string, unknown>;
}

export async function appendStreamSegment(
  input: AppendStreamSegmentInput,
): Promise<{ id: string } | { error: string }> {
  const service = createServiceClient();
  if (!service) return { error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("stream_segments")
    .insert({
      stream_state_id: input.streamStateId,
      stream_id: input.streamId,
      project_id: input.projectId,
      sequence: input.sequence,
      event_id: input.eventId,
      segment_kind: input.segmentKind,
      char_offset_start: input.charOffsetStart ?? 0,
      char_offset_end: input.charOffsetEnd ?? 0,
      byte_offset_start: input.byteOffsetStart ?? 0,
      byte_offset_end: input.byteOffsetEnd ?? 0,
      delta_sha256: input.deltaSha256 ?? null,
      event_payload: input.eventPayload ?? {},
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: String((data as Record<string, unknown>).id) };
}

export async function getStreamSegments(
  streamId: string,
  options?: { fromSequence?: number; limit?: number },
): Promise<{ segments: StreamSegmentRecord[]; error: string | null }> {
  const service = createServiceClient();
  if (!service) return { segments: [], error: "Supabase service client is unavailable." };

  let query = service
    .from("stream_segments")
    .select("*")
    .eq("stream_id", streamId)
    .order("sequence", { ascending: true });

  if (options?.fromSequence !== undefined) {
    query = query.gte("sequence", options.fromSequence);
  }
  if (options?.limit !== undefined) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) return { segments: [], error: error.message };
  return {
    segments: (data ?? []).map((row) => normalizeStreamSegment(row as Record<string, unknown>)),
    error: null,
  };
}

// ── Stream events ───────────────────────────────────────────────────────

export interface CreateStreamEventInput {
  streamStateId: string;
  streamId: string;
  projectId: string;
  eventType: string;
  sequence?: number | null;
  traceId: string;
  visibleInReceipt?: boolean;
  payload?: Record<string, unknown>;
}

export async function createStreamEvent(
  input: CreateStreamEventInput,
): Promise<{ id: string } | { error: string }> {
  const service = createServiceClient();
  if (!service) return { error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("stream_events")
    .insert({
      stream_state_id: input.streamStateId,
      stream_id: input.streamId,
      project_id: input.projectId,
      event_type: input.eventType,
      sequence: input.sequence ?? null,
      trace_id: input.traceId,
      visible_in_receipt: input.visibleInReceipt ?? true,
      payload: input.payload ?? {},
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: String((data as Record<string, unknown>).id) };
}

export async function getStreamEvents(
  streamId: string,
  options?: { limit?: number },
): Promise<{ events: StreamEventRecord[]; error: string | null }> {
  const service = createServiceClient();
  if (!service) return { events: [], error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("stream_events")
    .select("*")
    .eq("stream_id", streamId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);

  if (error) return { events: [], error: error.message };
  return {
    events: (data ?? []).map((row) => normalizeStreamEvent(row as Record<string, unknown>)),
    error: null,
  };
}

// ── Subscriber tracking ──────────────────────────────────────────────────

export interface RegisterSubscriberInput {
  streamStateId: string;
  streamId: string;
  projectId: string;
  subscriberId: string;
  userId?: string | null;
  clientId?: string | null;
  mode: StreamSubscriberMode;
}

export async function registerSubscriber(
  input: RegisterSubscriberInput,
): Promise<{ id: string } | { error: string }> {
  const service = createServiceClient();
  if (!service) return { error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("stream_subscribers")
    .insert({
      stream_state_id: input.streamStateId,
      stream_id: input.streamId,
      project_id: input.projectId,
      subscriber_id: input.subscriberId,
      user_id: input.userId ?? null,
      client_id: input.clientId ?? null,
      mode: input.mode,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: String((data as Record<string, unknown>).id) };
}

export async function updateSubscriberDisconnect(
  subscriberId: string,
  lastSeenSequence: number,
  lastSeenEventId?: string | null,
): Promise<{ success: boolean; error: string | null }> {
  const service = createServiceClient();
  if (!service) return { success: false, error: "Supabase service client is unavailable." };

  const { error } = await service
    .from("stream_subscribers")
    .update({
      disconnected_at: new Date().toISOString(),
      last_seen_sequence: lastSeenSequence,
      last_seen_event_id: lastSeenEventId ?? null,
    })
    .eq("subscriber_id", subscriberId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

// ── Resume token helpers ─────────────────────────────────────────────────

export interface CreateResumeTokenInput {
  streamStateId: string;
  streamId: string;
  projectId: string;
  userId?: string | null;
  tokenHash: string;
  allowedFromSequence?: number;
  allowedMode: StreamResumeTokenMode;
  expiresAt?: string;
}

export async function createResumeToken(
  input: CreateResumeTokenInput,
): Promise<{ id: string } | { error: string }> {
  const service = createServiceClient();
  if (!service) return { error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("stream_resume_tokens")
    .insert({
      stream_state_id: input.streamStateId,
      stream_id: input.streamId,
      project_id: input.projectId,
      user_id: input.userId ?? null,
      token_hash: input.tokenHash,
      allowed_from_sequence: input.allowedFromSequence ?? 0,
      allowed_mode: input.allowedMode,
      expires_at: input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: String((data as Record<string, unknown>).id) };
}

export async function validateResumeToken(
  tokenHash: string,
  streamId: string,
): Promise<{ valid: boolean; record: StreamResumeTokenRecord | null; error: string | null }> {
  const service = createServiceClient();
  if (!service) return { valid: false, record: null, error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("stream_resume_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("stream_id", streamId)
    .is("revoked_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") return { valid: false, record: null, error: null };
    return { valid: false, record: null, error: error.message };
  }

  const row = data as Record<string, unknown>;
  const record: StreamResumeTokenRecord = {
    id: String(row.id),
    streamStateId: String(row.stream_state_id),
    streamId: String(row.stream_id),
    projectId: String(row.project_id),
    userId: typeof row.user_id === "string" ? row.user_id : null,
    tokenHash: String(row.token_hash),
    allowedFromSequence: Number(row.allowed_from_sequence ?? 0),
    allowedMode: String(row.allowed_mode) as StreamResumeTokenMode,
    expiresAt: String(row.expires_at),
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
    createdAt: String(row.created_at),
  };

  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    return { valid: false, record, error: "Resume token has expired." };
  }

  return { valid: true, record, error: null };
}

export async function revokeResumeToken(
  tokenHash: string,
): Promise<{ success: boolean; error: string | null }> {
  const service = createServiceClient();
  if (!service) return { success: false, error: "Supabase service client is unavailable." };

  const { error } = await service
    .from("stream_resume_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

// ── Idempotency guard ───────────────────────────────────────────────────

export async function checkIdempotencyOrCreateLock(
  streamId: string,
  idempotencyKey: string,
  lockKey: string,
): Promise<{ allowed: boolean; existing: StreamStateRecord | null; error: string | null }> {
  const service = createServiceClient();
  if (!service) return { allowed: false, existing: null, error: "Supabase service client is unavailable." };

  // Check if a stream already exists with this idempotency key
  const { data: existing, error: lookupError } = await service
    .from("stream_state")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (lookupError) return { allowed: false, existing: null, error: lookupError.message };

  if (existing) {
    const record = existing as Record<string, unknown>;
    // If the record is ours and has no lock, allow
    if (String(record.stream_id) === streamId && !record.producer_lock_key) return { allowed: true, existing: null, error: null };
    // If the record is ours and has our lock, allow
    if (String(record.stream_id) === streamId && record.producer_lock_key === lockKey) return { allowed: true, existing: null, error: null };
    // Otherwise, another producer owns it
    return { allowed: false, existing: normalizeStreamState(record), error: null };
  }

  return { allowed: true, existing: null, error: null };
}
