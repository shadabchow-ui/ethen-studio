import "server-only";

/**
 * STUDIO_16 route-adapter realtime access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed session/epoch/interval/event/tool/credential access over the
 * j16 schema. Service-role bypasses RLS, so every call binds explicit project
 * scope. Money moves only through j04 functions; this lib owns admission
 * state, metering inputs and the atomic realtime-side guards.
 */
import { createHash } from "node:crypto";
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import { RealtimeError } from "@ethen/studio-core/server/realtime";

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function int(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function strArray(row: Row, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function json(row: Row, key: string): Record<string, unknown> {
  const value = row[key];
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export interface RealtimeSessionRow {
  sessionId: string;
  status: string;
  epoch: number;
  agentSnapshot: Record<string, unknown>;
  identityBindingId: string | null;
  spendCapIcu: number;
  ceilingIcu: number;
  spentIcu: number;
  rateIcuPerSecond: number;
  reservationId: string | null;
  quoteId: string | null;
  reservedIcu: number;
  topupCount: number;
  toolScopeIds: string[];
  revokedScopeIds: string[];
  consentGrantId: string | null;
  recordingRetention: string;
  endReason: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  idempotencyKey: string;
}

function toSessionRow(row: Row): RealtimeSessionRow {
  return {
    sessionId: str(row, "session_id"),
    status: str(row, "status"),
    epoch: int(row, "epoch"),
    agentSnapshot: json(row, "agent_snapshot"),
    identityBindingId: nullableStr(row, "identity_binding_id"),
    spendCapIcu: int(row, "spend_cap_icu"),
    ceilingIcu: int(row, "ceiling_icu"),
    spentIcu: int(row, "spent_icu"),
    rateIcuPerSecond: int(row, "rate_icu_per_second"),
    reservationId: nullableStr(row, "reservation_id"),
    quoteId: nullableStr(row, "quote_id"),
    reservedIcu: int(row, "reserved_icu"),
    topupCount: int(row, "topup_count"),
    toolScopeIds: strArray(row, "tool_scope_ids"),
    revokedScopeIds: strArray(row, "revoked_scope_ids"),
    consentGrantId: nullableStr(row, "consent_grant_id"),
    recordingRetention: str(row, "recording_retention") || "none",
    endReason: nullableStr(row, "end_reason"),
    errorCode: nullableStr(row, "error_code"),
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
    endedAt: nullableStr(row, "ended_at"),
    idempotencyKey: str(row, "idempotency_key"),
  };
}

export async function listSessions(scope: ResolvedScope): Promise<RealtimeSessionRow[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_realtime_sessions")
    .select("*")
    .eq("project_id", scope.projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new RealtimeError("INTERNAL", `Session list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toSessionRow);
}

export async function getSession(scope: ResolvedScope, sessionId: string): Promise<RealtimeSessionRow | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_realtime_sessions")
    .select("*")
    .eq("project_id", scope.projectId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new RealtimeError("INTERNAL", `Session read is unavailable: ${error.message}`);
  return data ? toSessionRow(data as Row) : null;
}

export interface InsertSessionInput {
  scope: ResolvedScope;
  actorId: string;
  agentSnapshot: Record<string, unknown>;
  identityBindingId: string | null;
  spendCapIcu: number;
  ceilingIcu: number;
  rateIcuPerSecond: number;
  reservationId: string;
  quoteId: string;
  reservedIcu: number;
  toolScopeIds: string[];
  consentGrantId: string | null;
  recordingRetention: string;
  idempotencyKey: string;
}

export async function insertSession(input: InsertSessionInput): Promise<RealtimeSessionRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_realtime_sessions")
    .insert({
      project_id: input.scope.projectId,
      actor_id: input.actorId,
      status: "STARTING",
      epoch: 1,
      agent_snapshot: input.agentSnapshot,
      identity_binding_id: input.identityBindingId,
      spend_cap_icu: input.spendCapIcu,
      ceiling_icu: input.ceilingIcu,
      spent_icu: 0,
      rate_icu_per_second: input.rateIcuPerSecond,
      reservation_id: input.reservationId,
      quote_id: input.quoteId,
      reserved_icu: input.reservedIcu,
      topup_count: 0,
      tool_scope_ids: input.toolScopeIds,
      revoked_scope_ids: [],
      consent_grant_id: input.consentGrantId,
      recording_retention: input.recordingRetention,
      idempotency_key: input.idempotencyKey,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new RealtimeError("CONFLICT", "A session with this idempotency key already exists.");
    }
    throw new RealtimeError("INTERNAL", `Session create failed: ${error.message}`);
  }
  return toSessionRow(data as Row);
}

export async function updateSessionStatus(
  scope: ResolvedScope,
  sessionId: string,
  patch: { status?: string; epoch?: number; endReason?: string | null; errorCode?: string | null; endedAt?: string | null; revokedScopeIds?: string[] },
): Promise<RealtimeSessionRow> {
  const client = requireServiceClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) update["status"] = patch.status;
  if (patch.epoch !== undefined) update["epoch"] = patch.epoch;
  if (patch.endReason !== undefined) update["end_reason"] = patch.endReason;
  if (patch.errorCode !== undefined) update["error_code"] = patch.errorCode;
  if (patch.endedAt !== undefined) update["ended_at"] = patch.endedAt;
  if (patch.revokedScopeIds) update["revoked_scope_ids"] = patch.revokedScopeIds;
  const { data, error } = await client
    .from("studio_v5_realtime_sessions")
    .update(update)
    .eq("project_id", scope.projectId)
    .eq("session_id", sessionId)
    .select("*")
    .single();
  if (error) throw new RealtimeError("INTERNAL", `Session update failed: ${error.message}`);
  return toSessionRow(data as Row);
}

export async function countActiveSessions(scope: ResolvedScope): Promise<number> {
  const client = requireServiceClient();
  const { count, error } = await client
    .from("studio_v5_realtime_sessions")
    .select("*", { count: "exact", head: true })
    .eq("project_id", scope.projectId)
    .in("status", ["STARTING", "ACTIVE", "RECONNECTING"]);
  if (error) throw new RealtimeError("INTERNAL", `Session count is unavailable: ${error.message}`);
  return count ?? 0;
}

export async function insertEpoch(scope: ResolvedScope, sessionId: string, epoch: number, credentialId: string | null): Promise<void> {
  const client = requireServiceClient();
  const session = await getSession(scope, sessionId);
  if (!session) throw new RealtimeError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
  const { error } = await client
    .from("studio_v5_realtime_epochs")
    .insert({ session_id: sessionId, epoch, credential_id: credentialId });
  if (error) throw new RealtimeError("INTERNAL", `Epoch insert failed: ${error.message}`);
}

export interface IntervalRow {
  intervalId: string;
  sessionId: string;
  epoch: number;
  startedAt: string;
  endedAt: string | null;
}

function toIntervalRow(row: Row): IntervalRow {
  return {
    intervalId: str(row, "interval_id"),
    sessionId: str(row, "session_id"),
    epoch: int(row, "epoch"),
    startedAt: str(row, "started_at"),
    endedAt: nullableStr(row, "ended_at"),
  };
}

export async function listIntervals(scope: ResolvedScope, sessionId: string): Promise<IntervalRow[]> {
  const client = requireServiceClient();
  const session = await getSession(scope, sessionId);
  if (!session) throw new RealtimeError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
  const { data, error } = await client
    .from("studio_v5_realtime_intervals")
    .select("*")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: true });
  if (error) throw new RealtimeError("INTERNAL", `Interval list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toIntervalRow);
}

export async function openInterval(scope: ResolvedScope, sessionId: string, epoch: number): Promise<IntervalRow> {
  const client = requireServiceClient();
  const session = await getSession(scope, sessionId);
  if (!session) throw new RealtimeError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
  const { data, error } = await client
    .from("studio_v5_realtime_intervals")
    .insert({ session_id: sessionId, epoch })
    .select("*")
    .single();
  if (error) throw new RealtimeError("INTERNAL", `Interval open failed: ${error.message}`);
  return toIntervalRow(data as Row);
}

export async function closeOpenIntervals(scope: ResolvedScope, sessionId: string, endedAt: string): Promise<void> {
  const client = requireServiceClient();
  const session = await getSession(scope, sessionId);
  if (!session) throw new RealtimeError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
  const { error } = await client
    .from("studio_v5_realtime_intervals")
    .update({ ended_at: endedAt })
    .eq("session_id", sessionId)
    .is("ended_at", null);
  if (error) throw new RealtimeError("INTERNAL", `Interval close failed: ${error.message}`);
}

export interface SessionEventRow {
  eventId: string;
  sessionId: string;
  epoch: number;
  sequence: number;
  type: string;
  text: string;
  providerEventId: string | null;
  clientAt: string;
  appendedAt: string;
  payload: Record<string, unknown>;
}

function toEventRow(row: Row): SessionEventRow {
  return {
    eventId: str(row, "event_id"),
    sessionId: str(row, "session_id"),
    epoch: int(row, "epoch"),
    sequence: int(row, "sequence"),
    type: str(row, "type"),
    text: str(row, "text"),
    providerEventId: nullableStr(row, "provider_event_id"),
    clientAt: str(row, "client_at"),
    appendedAt: str(row, "appended_at"),
    payload: json(row, "payload"),
  };
}

export async function listEvents(scope: ResolvedScope, sessionId: string): Promise<SessionEventRow[]> {
  const client = requireServiceClient();
  const session = await getSession(scope, sessionId);
  if (!session) throw new RealtimeError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
  const { data, error } = await client
    .from("studio_v5_realtime_events")
    .select("event_id,session_id,epoch,sequence,type,text,provider_event_id,client_at,appended_at,payload")
    .eq("session_id", sessionId)
    .order("sequence", { ascending: true })
    .limit(500);
  if (error) throw new RealtimeError("INTERNAL", `Event list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toEventRow);
}

export async function findEventByProviderId(
  scope: ResolvedScope,
  sessionId: string,
  providerEventId: string,
): Promise<SessionEventRow | null> {
  const client = requireServiceClient();
  const session = await getSession(scope, sessionId);
  if (!session) throw new RealtimeError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
  const { data, error } = await client
    .from("studio_v5_realtime_events")
    .select("event_id,session_id,epoch,sequence,type,text,provider_event_id,client_at,appended_at,payload")
    .eq("session_id", sessionId)
    .eq("provider_event_id", providerEventId)
    .maybeSingle();
  if (error) throw new RealtimeError("INTERNAL", `Event read is unavailable: ${error.message}`);
  return data ? toEventRow(data as Row) : null;
}

export async function insertEvent(input: {
  scope: ResolvedScope;
  sessionId: string;
  epoch: number;
  type: string;
  text: string;
  providerEventId: string | null;
  clientAt: string;
  payload: Record<string, unknown>;
}): Promise<{ event: SessionEventRow; deduped: boolean }> {
  const client = requireServiceClient();
  const session = await getSession(input.scope, input.sessionId);
  if (!session) throw new RealtimeError("NOT_FOUND", `Realtime session ${input.sessionId} was not found.`);
  if (input.providerEventId) {
    const duplicate = await findEventByProviderId(input.scope, input.sessionId, input.providerEventId);
    if (duplicate) return { event: duplicate, deduped: true };
  }
  const existing = await listEvents(input.scope, input.sessionId);
  const sequence = existing.length + 1;
  const contentHash = createHash("sha256")
    .update(JSON.stringify({ sessionId: input.sessionId, epoch: input.epoch, sequence, type: input.type, text: input.text }), "utf8")
    .digest("hex");
  const { data, error } = await client
    .from("studio_v5_realtime_events")
    .insert({
      session_id: input.sessionId,
      epoch: input.epoch,
      sequence,
      type: input.type,
      text: input.text,
      provider_event_id: input.providerEventId,
      client_at: input.clientAt,
      payload: input.payload,
      content_hash: contentHash,
    })
    .select("event_id,session_id,epoch,sequence,type,text,provider_event_id,client_at,appended_at,payload")
    .single();
  if (error) {
    if (error.code === "23505" && input.providerEventId) {
      const duplicate = await findEventByProviderId(input.scope, input.sessionId, input.providerEventId);
      if (duplicate) return { event: duplicate, deduped: true };
    }
    throw new RealtimeError("INTERNAL", `Event append failed: ${error.message}`);
  }
  return { event: toEventRow(data as Row), deduped: false };
}

export interface ToolCallRow {
  callId: string;
  sessionId: string;
  epoch: number;
  task: string;
  toolName: string;
  toolScopeId: string;
  args: Record<string, unknown>;
  status: string;
  approvalId: string | null;
  decisionCode: string | null;
  requestedAt: string;
  decidedAt: string | null;
}

function toToolRow(row: Row): ToolCallRow {
  return {
    callId: str(row, "call_id"),
    sessionId: str(row, "session_id"),
    epoch: int(row, "epoch"),
    task: str(row, "task"),
    toolName: str(row, "tool_name"),
    toolScopeId: str(row, "tool_scope_id"),
    args: json(row, "args"),
    status: str(row, "status"),
    approvalId: nullableStr(row, "approval_id"),
    decisionCode: nullableStr(row, "decision_code"),
    requestedAt: str(row, "requested_at"),
    decidedAt: nullableStr(row, "decided_at"),
  };
}

export async function listToolCalls(scope: ResolvedScope, sessionId: string): Promise<ToolCallRow[]> {
  const client = requireServiceClient();
  const session = await getSession(scope, sessionId);
  if (!session) throw new RealtimeError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
  const { data, error } = await client
    .from("studio_v5_realtime_tool_calls")
    .select("*")
    .eq("session_id", sessionId)
    .order("requested_at", { ascending: true });
  if (error) throw new RealtimeError("INTERNAL", `Tool list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toToolRow);
}

export async function insertToolCall(input: {
  scope: ResolvedScope;
  sessionId: string;
  epoch: number;
  task: string;
  toolName: string;
  toolScopeId: string;
  args: Record<string, unknown>;
  status: string;
  approvalId: string | null;
  decisionCode: string | null;
}): Promise<ToolCallRow> {
  const client = requireServiceClient();
  const session = await getSession(input.scope, input.sessionId);
  if (!session) throw new RealtimeError("NOT_FOUND", `Realtime session ${input.sessionId} was not found.`);
  const argsHash = createHash("sha256").update(JSON.stringify(input.args), "utf8").digest("hex");
  const { data, error } = await client
    .from("studio_v5_realtime_tool_calls")
    .insert({
      session_id: input.sessionId,
      epoch: input.epoch,
      task: input.task,
      tool_name: input.toolName,
      tool_scope_id: input.toolScopeId,
      args: input.args,
      args_hash: argsHash,
      status: input.status,
      approval_id: input.approvalId,
      decision_code: input.decisionCode,
      decided_at: input.status === "awaiting_approval" ? null : new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new RealtimeError("INTERNAL", `Tool call insert failed: ${error.message}`);
  return toToolRow(data as Row);
}

export async function storeCredential(input: {
  scope: ResolvedScope;
  sessionId: string;
  epoch: number;
  substrate: string;
  token: string;
  expiresAt: string;
}): Promise<{ credentialId: string }> {
  const client = requireServiceClient();
  const session = await getSession(input.scope, input.sessionId);
  if (!session) throw new RealtimeError("NOT_FOUND", `Realtime session ${input.sessionId} was not found.`);
  const tokenSha256 = createHash("sha256").update(input.token, "utf8").digest("hex");
  const { data, error } = await client
    .from("studio_v5_realtime_credentials")
    .insert({
      session_id: input.sessionId,
      epoch: input.epoch,
      substrate: input.substrate,
      token_prefix: input.token.slice(0, 12),
      token_sha256: tokenSha256,
      expires_at: input.expiresAt,
    })
    .select("credential_id")
    .single();
  if (error) throw new RealtimeError("INTERNAL", `Credential store failed: ${error.message}`);
  return { credentialId: str(data as Row, "credential_id") };
}

/** Atomic realtime-side topup guard (j16 SQL; economics reserve stays with j04). */
export async function rpcTopup(
  sessionId: string,
  requestedIcu: number,
): Promise<{ reservedIcu: number; topupCount: number; atCeiling: boolean }> {
  const client = requireServiceClient();
  const { data, error } = await client.rpc("studio_v5_realtime_topup", {
    p_session_id: sessionId,
    p_requested_icu: requestedIcu,
  });
  if (error) throw new RealtimeError("CONFLICT", `Topup refused: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as Row;
  return { reservedIcu: int(row, "reserved_icu"), topupCount: int(row, "topup_count"), atCeiling: Boolean(row["at_ceiling"]) };
}

/** Atomic realtime-side stop guard (j16 SQL; economics settle/release via j04). */
export async function rpcStop(
  sessionId: string,
  endReason: string,
  endedAt: string,
  usedIcu: number,
): Promise<{ status: string; spentIcu: number }> {
  const client = requireServiceClient();
  const { data, error } = await client.rpc("studio_v5_realtime_stop", {
    p_session_id: sessionId,
    p_end_reason: endReason,
    p_ended_at: endedAt,
    p_used_icu: usedIcu,
  });
  if (error) throw new RealtimeError("INTERNAL", `Stop failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as Row;
  return { status: str(row, "status"), spentIcu: int(row, "spent_icu") };
}
