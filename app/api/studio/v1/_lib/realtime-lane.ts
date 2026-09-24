import "server-only";

/**
 * P04 — fixture-lane realtime repository (RC-3 realtime).
 *
 * Mirrors the `supabase-realtime.ts` shapes the routes consume, backed
 * by `localStores().realtime` (the kernel memory store, never a
 * rewrite). Routes branch onto these functions only when
 * `isStudioFixtureLane()` holds. Sessions admit without the j04 money
 * leg (reservation stays null); metering projections reuse the kernel
 * (`connectedSeconds`/`settleForSeconds` run in the routes over these
 * rows). Transport attach (token) and topups stay provider-side and
 * return SETUP_REQUIRED from the routes, never from this lane.
 */
import { createHash, randomUUID } from "node:crypto";
import { asIcu, ZERO_ICU, type IcuAmount } from "@ethen/studio-core/contracts";
import type { ProjectScope } from "@ethen/studio-core/contracts";
import {
  RealtimeError,
  type MemoryRealtimeStore,
  type RealtimeAgentSnapshot,
  type RealtimeEndReason,
  type RealtimeRecordingRetention,
  type RealtimeSessionEvent,
  type RealtimeSessionRecord,
  type RealtimeSessionStatus,
  type RealtimeToolCall,
  type RealtimeTransportMode,
} from "@ethen/studio-core/server/realtime";
import type {
  IntervalRow,
  RealtimeSessionRow,
  SessionEventRow,
  ToolCallRow,
} from "./supabase-realtime";

/** Minimal scope the lane needs (routes pass their ResolvedScope). */
export interface FixtureScope {
  scope: ProjectScope;
  projectId: string;
}

function scopeKey(scope: ProjectScope): string {
  return `${String(scope.tenantId)}:${String(scope.workspaceId)}:${String(scope.projectId)}`;
}

export interface FixtureRealtimeKeys {
  realtimeSessions: Map<string, string>;
  realtimeSessionKeys: Map<string, string>;
}

// ------------------------------------------------------------------ sessions

function toSessionRow(
  session: RealtimeSessionRecord,
  idempotencyKey: string,
): RealtimeSessionRow {
  return {
    sessionId: session.sessionId,
    status: session.status,
    epoch: session.epoch,
    agentSnapshot: { ...(session.agentSnapshot as unknown as Record<string, unknown>) },
    identityBindingId: session.identityBindingId,
    spendCapIcu: Number(session.spendCapIcu),
    ceilingIcu: Number(session.ceilingIcu),
    spentIcu: Number(session.spentIcu),
    rateIcuPerSecond: Number(session.rateIcuPerSecond),
    reservationId: session.reservationId,
    quoteId: session.quoteId,
    reservedIcu: Number(session.reservedIcu),
    topupCount: session.topupCount,
    toolScopeIds: [...session.toolScopeIds],
    revokedScopeIds: [...session.revokedScopeIds],
    consentGrantId: session.consentGrantId,
    recordingRetention: session.recordingRetention,
    endReason: session.endReason,
    errorCode: session.errorCode,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    endedAt: session.endedAt,
    idempotencyKey,
  };
}

export async function fixtureListSessions(
  store: MemoryRealtimeStore,
  keys: FixtureRealtimeKeys,
  scope: FixtureScope,
): Promise<RealtimeSessionRow[]> {
  return store
    .listSessionsByProject(scope.projectId)
    .map((session) => toSessionRow(session, keys.realtimeSessionKeys.get(session.sessionId) ?? ""));
}

export async function fixtureGetSession(
  store: MemoryRealtimeStore,
  keys: FixtureRealtimeKeys,
  scope: FixtureScope,
  sessionId: string,
): Promise<RealtimeSessionRow | null> {
  try {
    const session = store.getSessionInProject(sessionId, scope.projectId);
    return toSessionRow(session, keys.realtimeSessionKeys.get(sessionId) ?? "");
  } catch (error) {
    if (error instanceof RealtimeError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) return null;
    throw error;
  }
}

export interface FixtureInsertSessionInput {
  agentSnapshot: RealtimeAgentSnapshot;
  identityBindingId: string | null;
  spendCapIcu: number;
  ceilingIcu: number;
  rateIcuPerSecond: number;
  quoteId: string;
  toolScopeIds: string[];
  consentGrantId: string | null;
  recordingRetention: RealtimeRecordingRetention;
  idempotencyKey: string;
}

/**
 * Admit a session without the money leg (reservation stays null — the
 * fixture tier runs no economics). Duplicate idempotency keys conflict,
 * matching the Supabase unique path.
 */
export async function fixtureInsertSession(
  store: MemoryRealtimeStore,
  keys: FixtureRealtimeKeys,
  scope: FixtureScope,
  input: FixtureInsertSessionInput,
): Promise<RealtimeSessionRow> {
  const seen = keys.realtimeSessions.get(`${scopeKey(scope.scope)}:${input.idempotencyKey}`);
  if (seen) {
    throw new RealtimeError("CONFLICT", "A session with this idempotency key already exists.");
  }
  const now = new Date().toISOString();
  const session: RealtimeSessionRecord = {
    sessionId: randomUUID(),
    scope: scope.scope,
    status: "STARTING",
    epoch: 1,
    agentSnapshot: input.agentSnapshot,
    identityBindingId: input.identityBindingId,
    spendCapIcu: asIcu(input.spendCapIcu),
    ceilingIcu: asIcu(input.ceilingIcu),
    spentIcu: ZERO_ICU,
    rateIcuPerSecond: asIcu(input.rateIcuPerSecond),
    reservationId: null,
    quoteId: input.quoteId,
    reservedIcu: asIcu(input.spendCapIcu),
    topupCount: 0,
    toolScopeIds: [...input.toolScopeIds],
    revokedScopeIds: [],
    consentGrantId: input.consentGrantId,
    recordingRetention: input.recordingRetention,
    endReason: null,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
    endedAt: null,
  };
  await store.insertSession(session);
  await store.insertEpoch({ sessionId: session.sessionId, epoch: 1, transportCredentialId: null, startedAt: now, endedAt: null });
  keys.realtimeSessions.set(`${scopeKey(scope.scope)}:${input.idempotencyKey}`, session.sessionId);
  keys.realtimeSessionKeys.set(session.sessionId, input.idempotencyKey);
  return toSessionRow(session, input.idempotencyKey);
}

export async function fixtureUpdateSessionStatus(
  store: MemoryRealtimeStore,
  keys: FixtureRealtimeKeys,
  scope: FixtureScope,
  sessionId: string,
  patch: { status?: string; epoch?: number; endReason?: string | null; errorCode?: string | null; endedAt?: string | null },
): Promise<RealtimeSessionRow> {
  const current = store.getSessionInProject(sessionId, scope.projectId);
  const next: RealtimeSessionRecord = {
    ...current,
    status: (patch.status ?? current.status) as RealtimeSessionStatus,
    epoch: patch.epoch ?? current.epoch,
    endReason: (patch.endReason !== undefined ? patch.endReason : current.endReason) as RealtimeEndReason | null,
    errorCode: patch.errorCode !== undefined ? patch.errorCode : current.errorCode,
    endedAt: patch.endedAt !== undefined ? patch.endedAt : current.endedAt,
    updatedAt: new Date().toISOString(),
  };
  await store.updateSession(next);
  return toSessionRow(next, keys.realtimeSessionKeys.get(sessionId) ?? "");
}

export async function fixtureCountActiveSessions(store: MemoryRealtimeStore, scope: FixtureScope): Promise<number> {
  return store.countActiveByProject(scope.projectId);
}

export async function fixtureInsertEpoch(store: MemoryRealtimeStore, sessionId: string, epoch: number): Promise<void> {
  await store.insertEpoch({ sessionId, epoch, transportCredentialId: null, startedAt: new Date().toISOString(), endedAt: null });
}

// ----------------------------------------------------------------- intervals

function toIntervalRow(interval: { intervalId: string; sessionId: string; epoch: number; startedAt: string; endedAt: string | null }): IntervalRow {
  return {
    intervalId: interval.intervalId,
    sessionId: interval.sessionId,
    epoch: interval.epoch,
    startedAt: interval.startedAt,
    endedAt: interval.endedAt,
  };
}

export async function fixtureListIntervals(
  store: MemoryRealtimeStore,
  scope: FixtureScope,
  sessionId: string,
): Promise<IntervalRow[]> {
  store.getSessionInProject(sessionId, scope.projectId);
  return (await store.listIntervals(sessionId)).map(toIntervalRow);
}

export async function fixtureCloseOpenIntervals(
  store: MemoryRealtimeStore,
  scope: FixtureScope,
  sessionId: string,
  endedAt: string,
): Promise<void> {
  store.getSessionInProject(sessionId, scope.projectId);
  for (const interval of await store.listIntervals(sessionId)) {
    if (!interval.endedAt) await store.closeInterval(interval.intervalId, endedAt);
  }
}

/** Local stop guard: close intervals, mark ENDED, record metered spend. */
export async function fixtureStopSession(
  store: MemoryRealtimeStore,
  scope: FixtureScope,
  sessionId: string,
  endedAt: string,
  usedIcu: number,
): Promise<{ status: string; spentIcu: number }> {
  const current = store.getSessionInProject(sessionId, scope.projectId);
  await fixtureCloseOpenIntervals(store, scope, sessionId, endedAt);
  await store.updateSession({
    ...current,
    status: "ENDED",
    endReason: "stopped",
    endedAt,
    spentIcu: asIcu(usedIcu) as IcuAmount,
    updatedAt: endedAt,
  });
  return { status: "ENDED", spentIcu: usedIcu };
}

// -------------------------------------------------------------------- events

function toEventRow(event: RealtimeSessionEvent): SessionEventRow {
  return {
    eventId: event.eventId,
    sessionId: event.sessionId,
    epoch: event.epoch,
    sequence: event.sequence,
    type: event.type,
    text: event.text,
    providerEventId: event.providerEventId,
    clientAt: event.clientAt,
    appendedAt: event.appendedAt,
    payload: { ...(event.payload as Record<string, unknown>) },
  };
}

export async function fixtureListEvents(
  store: MemoryRealtimeStore,
  scope: FixtureScope,
  sessionId: string,
): Promise<SessionEventRow[]> {
  store.getSessionInProject(sessionId, scope.projectId);
  return (await store.listEvents(sessionId)).map(toEventRow);
}

export async function fixtureFindEventByProviderId(
  store: MemoryRealtimeStore,
  scope: FixtureScope,
  sessionId: string,
  providerEventId: string,
): Promise<SessionEventRow | null> {
  store.getSessionInProject(sessionId, scope.projectId);
  const found = await store.findEventByProviderId(sessionId, providerEventId);
  return found ? toEventRow(found) : null;
}

export async function fixtureInsertEvent(
  store: MemoryRealtimeStore,
  scope: FixtureScope,
  input: {
    sessionId: string;
    epoch: number;
    type: RealtimeSessionEvent["type"];
    text: string;
    providerEventId: string | null;
    clientAt: string;
    payload: Record<string, unknown>;
  },
): Promise<{ event: SessionEventRow; deduped: boolean }> {
  store.getSessionInProject(input.sessionId, scope.projectId);
  if (input.providerEventId) {
    const duplicate = await store.findEventByProviderId(input.sessionId, input.providerEventId);
    if (duplicate) return { event: toEventRow(duplicate), deduped: true };
  }
  const sequence = await store.nextSequence(input.sessionId);
  const contentHash = createHash("sha256")
    .update(
      JSON.stringify({ sessionId: input.sessionId, epoch: input.epoch, sequence, type: input.type, text: input.text }),
      "utf8",
    )
    .digest("hex");
  const event: RealtimeSessionEvent = {
    eventId: randomUUID(),
    sessionId: input.sessionId,
    epoch: input.epoch,
    sequence,
    type: input.type,
    text: input.text,
    providerEventId: input.providerEventId,
    clientAt: input.clientAt,
    appendedAt: new Date().toISOString(),
    payload: { ...input.payload },
    contentHash,
  };
  await store.insertEvent(event);
  return { event: toEventRow(event), deduped: false };
}

// --------------------------------------------------------------------- tools

function toToolRow(call: RealtimeToolCall): ToolCallRow {
  return {
    callId: call.callId,
    sessionId: call.sessionId,
    epoch: call.epoch,
    task: String(call.task),
    toolName: call.toolName,
    toolScopeId: call.toolScopeId,
    args: { ...(call.args as Record<string, unknown>) },
    status: call.status,
    approvalId: call.approvalId,
    decisionCode: call.decisionCode,
    requestedAt: call.requestedAt,
    decidedAt: call.decidedAt,
  };
}

export async function fixtureListToolCalls(
  store: MemoryRealtimeStore,
  scope: FixtureScope,
  sessionId: string,
): Promise<ToolCallRow[]> {
  store.getSessionInProject(sessionId, scope.projectId);
  return (await store.listToolCalls(sessionId)).map(toToolRow);
}

export async function fixtureInsertToolCall(
  store: MemoryRealtimeStore,
  scope: FixtureScope,
  input: {
    sessionId: string;
    epoch: number;
    task: RealtimeToolCall["task"];
    toolName: string;
    toolScopeId: string;
    args: Record<string, unknown>;
    status: RealtimeToolCall["status"];
    approvalId: string | null;
    decisionCode: string | null;
  },
): Promise<ToolCallRow> {
  store.getSessionInProject(input.sessionId, scope.projectId);
  const now = new Date().toISOString();
  const call: RealtimeToolCall = {
    callId: randomUUID(),
    sessionId: input.sessionId,
    epoch: input.epoch,
    task: input.task,
    toolName: input.toolName,
    toolScopeId: input.toolScopeId,
    args: { ...input.args },
    argsHash: createHash("sha256").update(JSON.stringify(input.args), "utf8").digest("hex"),
    status: input.status,
    approvalId: input.approvalId,
    decisionCode: input.decisionCode,
    resultRedacted: null,
    requestedAt: now,
    decidedAt: input.status === "awaiting_approval" ? null : now,
  };
  await store.insertToolCall(call);
  return toToolRow(call);
}

export type { RealtimeTransportMode };
