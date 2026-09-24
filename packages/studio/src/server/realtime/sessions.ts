/** Studio V5 realtime — session lifecycle service (STUDIO_16, server-only). */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { asIcu, ZERO_ICU, type IcuAmount } from "../../contracts/money";
import type { ProjectScope } from "../../contracts/scope";
import type { EconomicsPort, PolicyPort } from "../ports/operations";
import { connectedSeconds, settleForSeconds, stopSplit, topupReservation } from "./metering";
import {
  realtimeError,
  type RealtimeAgentSnapshot,
  type RealtimeEndReason,
  type RealtimeEpochRecord,
  type RealtimeEventType,
  type RealtimeIntervalRecord,
  type RealtimeRecordingRetention,
  type RealtimeSessionEvent,
  type RealtimeSessionLimits,
  type RealtimeSessionRecord,
  type RealtimeTransportCredential,
  type RealtimeTransportMode,
} from "./types";
import { mintTransportCredential, type RealtimeTransportRegistry } from "./transport";

/** Bounded fail-closed admission defaults (spend in integer ICU). */
export const DEFAULT_REALTIME_LIMITS: RealtimeSessionLimits = {
  maxDurationMs: 15 * 60 * 1000,
  inactivityTimeoutMs: 5 * 60 * 1000,
  maxConcurrentSessionsPerProject: 3,
  maxSpendIcuPerSession: asIcu(250),
  enrollmentRequired: true,
};

export function resolveRealtimeLimits(
  partial?: Partial<RealtimeSessionLimits>,
): RealtimeSessionLimits {
  const base = DEFAULT_REALTIME_LIMITS;
  return {
    maxDurationMs: Math.min(partial?.maxDurationMs ?? base.maxDurationMs, base.maxDurationMs),
    inactivityTimeoutMs: Math.min(
      partial?.inactivityTimeoutMs ?? base.inactivityTimeoutMs,
      base.inactivityTimeoutMs,
    ),
    maxConcurrentSessionsPerProject: Math.min(
      partial?.maxConcurrentSessionsPerProject ?? base.maxConcurrentSessionsPerProject,
      base.maxConcurrentSessionsPerProject,
    ),
    maxSpendIcuPerSession: asIcu(
      Math.min(
        (partial?.maxSpendIcuPerSession as number | undefined) ?? (base.maxSpendIcuPerSession as number),
        base.maxSpendIcuPerSession as number,
      ),
    ),
    enrollmentRequired: partial?.enrollmentRequired ?? base.enrollmentRequired,
  };
}

/** Realtime-owned persistence port (sessions/epochs/intervals/events/credentials). */
export interface RealtimeRepository {
  insertSession(session: RealtimeSessionRecord): Promise<void>;
  getSession(sessionId: string): Promise<RealtimeSessionRecord | null>;
  updateSession(session: RealtimeSessionRecord): Promise<void>;
  countActiveByProject(projectId: string): Promise<number>;
  insertEpoch(epoch: RealtimeEpochRecord): Promise<void>;
  insertInterval(interval: RealtimeIntervalRecord): Promise<void>;
  closeInterval(intervalId: string, endedAt: string): Promise<RealtimeIntervalRecord>;
  listIntervals(sessionId: string): Promise<RealtimeIntervalRecord[]>;
  openInterval(sessionId: string): Promise<RealtimeIntervalRecord | null>;
  insertEvent(event: RealtimeSessionEvent): Promise<void>;
  findEventByProviderId(sessionId: string, providerEventId: string): Promise<RealtimeSessionEvent | null>;
  nextSequence(sessionId: string): Promise<number>;
  listEvents(sessionId: string): Promise<RealtimeSessionEvent[]>;
  insertCredential(credential: RealtimeTransportCredential): Promise<void>;
  activeCredential(sessionId: string, epoch: number): Promise<RealtimeTransportCredential | null>;
  revokeCredentials(sessionId: string): Promise<void>;
}

export interface RealtimeServiceDeps {
  repository: RealtimeRepository;
  policy: PolicyPort;
  economics: EconomicsPort;
  transports: RealtimeTransportRegistry;
}

export interface AdmitSessionInput {
  scope: ProjectScope;
  actorId: string;
  /** Studio roles for the policy gate (generate needs creator/admin). */
  actorRoles: readonly string[];
  /** Spend approval evidence: the cap the actor authorized for this session. */
  spendApproval: { approved: boolean; approvalId: string | null; capIcu: number };
  agent: Omit<RealtimeAgentSnapshot, "capturedAt">;
  identityBindingId: string | null;
  transportMode: RealtimeTransportMode;
  spendCapIcu: IcuAmount;
  ceilingIcu: IcuAmount;
  rateIcuPerSecond: IcuAmount;
  toolScopeIds: readonly string[];
  consentGrantId: string | null;
  recordingRetention: RealtimeRecordingRetention;
  idempotencyKey: string;
  requestHash: string;
  limits?: Partial<RealtimeSessionLimits>;
  now?: string;
}

function stableJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashSessionContent(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function assertSameMode(pinned: RealtimeTransportMode, requested: RealtimeTransportMode): void {
  if (pinned !== requested) {
    throw realtimeError(
      "CONFLICT",
      `Transport mode is pinned to "${pinned}"; silent switch to "${requested}" is refused.`,
      { pinned, requested },
    );
  }
}

function terminal(session: RealtimeSessionRecord): boolean {
  return session.status === "ENDED" || session.status === "REVOKED" || session.status === "ERRORED";
}

/**
 * Admit a realtime session: policy gate → enrollment/concurrency gates →
 * quote + reserve BEFORE any transport connect. Returns the STARTING session;
 * the caller connects it through `connectSession`.
 */
export async function admitSession(
  deps: RealtimeServiceDeps,
  input: AdmitSessionInput,
): Promise<RealtimeSessionRecord> {
  const now = input.now ?? new Date().toISOString();
  const limits = resolveRealtimeLimits(input.limits);
  if (input.agent.transportMode !== input.transportMode) {
    throw realtimeError("BAD_REQUEST", "Agent snapshot transport mode must match the requested transport mode.");
  }
  if ((input.spendCapIcu as number) <= 0 || (input.ceilingIcu as number) < (input.spendCapIcu as number)) {
    throw realtimeError("BAD_REQUEST", "Spend cap must be positive and the ceiling must cover the cap.");
  }
  if ((input.spendCapIcu as number) > (limits.maxSpendIcuPerSession as number)) {
    throw realtimeError("BAD_REQUEST", "Spend cap exceeds the per-session maximum.", {
      maxSpendIcu: limits.maxSpendIcuPerSession,
    });
  }
  if (!input.idempotencyKey || !input.requestHash) {
    throw realtimeError("BAD_REQUEST", "idempotencyKey and requestHash are required for admission.");
  }
  if (input.recordingRetention !== "none" && !input.consentGrantId) {
    throw realtimeError("CONSENT_REQUIRED", "Recording requires an explicit consent grant; retention choice is explicit.");
  }

  // Same task policy as every other Studio execution: agent invocation.
  const decision = await deps.policy.decide(input.scope, "agent.invoke", "generate", {
    actorId: input.actorId,
    roles: [...input.actorRoles],
    spendApproval: {
      approved: input.spendApproval.approved,
      approvalId: input.spendApproval.approvalId,
      capIcu: input.spendApproval.capIcu,
    },
    agentId: input.agent.agentId,
    identityBindingId: input.identityBindingId,
    transportMode: input.transportMode,
    spendCapIcu: input.spendCapIcu as number,
    consentGrantId: input.consentGrantId,
    recordingRetention: input.recordingRetention,
  });
  if (!decision.allowed) {
    throw realtimeError("POLICY_DENIED", `Realtime admission denied: ${decision.reasonCode}`, {
      reasonCode: decision.reasonCode,
      remediation: decision.remediation,
    });
  }

  if (limits.enrollmentRequired && (!input.agent.agentId || input.agent.agentId.startsWith("demo-"))) {
    throw realtimeError("FORBIDDEN", "Realtime sessions require an enrolled, project-owned voice agent.", {
      code: "REALTIME_ENROLLMENT_REQUIRED",
    });
  }
  const active = await deps.repository.countActiveByProject(input.scope.projectId as string);
  if (active >= limits.maxConcurrentSessionsPerProject) {
    throw realtimeError("QUOTA_EXCEEDED", `Project has reached the maximum of ${limits.maxConcurrentSessionsPerProject} concurrent realtime sessions.`, {
      code: "REALTIME_CONCURRENCY_LIMIT",
    }, true);
  }

  const readiness = deps.transports.readiness({
    substrate: "livekit-managed",
    transportMode: input.transportMode,
    credentialsPresent: false,
  });
  void readiness;

  const rate = input.rateIcuPerSecond as number;
  const estimatedSeconds = rate > 0 ? Math.ceil((input.spendCapIcu as number) / rate) : 0;
  const quote = await deps.economics.quote({
    task: "agent.invoke",
    scope: input.scope,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    parameters: {
      transportMode: input.transportMode,
      spendCapIcu: input.spendCapIcu as number,
      meterQuantity: estimatedSeconds,
    },
    providerParams: {},
    referenceAssetIds: [],
    identityBindingId: input.identityBindingId,
    pins: {
      taskSchemaVersion: "1.0.0",
      endpointSchemaVersion: "1.0.0",
      priceVersion: input.agent.pricingVersion,
      adapterVersion: "1.0.0",
    },
    endpointId: null,
  });
  const reservationId = await deps.economics.reserve(quote.quoteId, input.scope);

  const session: RealtimeSessionRecord = {
    sessionId: randomUUID(),
    scope: input.scope,
    status: "STARTING",
    epoch: 1,
    agentSnapshot: { ...input.agent, capturedAt: now },
    identityBindingId: input.identityBindingId,
    spendCapIcu: input.spendCapIcu,
    ceilingIcu: input.ceilingIcu,
    spentIcu: ZERO_ICU,
    rateIcuPerSecond: input.rateIcuPerSecond,
    reservationId,
    quoteId: quote.quoteId,
    reservedIcu: quote.estimatedCostIcu,
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
  await deps.repository.insertSession(session);
  await deps.repository.insertEpoch({ sessionId: session.sessionId, epoch: 1, transportCredentialId: null, startedAt: now, endedAt: null });
  return session;
}

async function requireSession(deps: RealtimeServiceDeps, sessionId: string): Promise<RealtimeSessionRecord> {
  const session = await deps.repository.getSession(sessionId);
  if (!session) throw realtimeError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
  return session;
}

/**
 * Connect a STARTING session: attach the server-side provider leg, mint the
 * short-lived scoped client credential, open epoch 1 and the first interval.
 */
export async function connectSession(
  deps: RealtimeServiceDeps,
  input: { sessionId: string; transportMode: RealtimeTransportMode; now?: string },
): Promise<{ session: RealtimeSessionRecord; credential: RealtimeTransportCredential }> {
  const now = input.now ?? new Date().toISOString();
  const session = await requireSession(deps, input.sessionId);
  if (session.status !== "STARTING") {
    throw realtimeError("CONFLICT", `Session ${session.sessionId} is ${session.status}; only STARTING sessions connect.`);
  }
  assertSameMode(session.agentSnapshot.transportMode, input.transportMode);
  const adapter = deps.transports.adapterFor("livekit-managed") ?? deps.transports.adapterFor("synthetic");
  if (!adapter) {
    throw realtimeError("ENDPOINT_UNAVAILABLE", "No realtime transport adapter is registered; Voice Agents are unavailable.", {
      code: "REALTIME_TRANSPORT_UNAVAILABLE",
    });
  }
  if (!(await adapter.healthy())) {
    throw realtimeError("ENDPOINT_UNAVAILABLE", "Realtime transport is unhealthy; admission is closed.", {
      code: "REALTIME_TRANSPORT_UNAVAILABLE",
    }, true);
  }
  await adapter.attach({
    sessionId: session.sessionId,
    epoch: session.epoch,
    transportMode: session.agentSnapshot.transportMode,
    agentSnapshot: session.agentSnapshot,
  });
  const credential = mintTransportCredential({ session, substrate: adapter.substrate, existing: null, now });
  await deps.repository.insertCredential(credential);
  await deps.repository.insertInterval({
    intervalId: randomUUID(),
    sessionId: session.sessionId,
    epoch: session.epoch,
    startedAt: now,
    endedAt: null,
  });
  const next: RealtimeSessionRecord = { ...session, status: "ACTIVE", updatedAt: now };
  await deps.repository.updateSession(next);
  return { session: next, credential };
}

/** Provider disconnect: close the open interval and mark RECONNECTING. The gap is never billed. */
export async function reportDisconnect(
  deps: RealtimeServiceDeps,
  input: { sessionId: string; now?: string },
): Promise<RealtimeSessionRecord> {
  const now = input.now ?? new Date().toISOString();
  const session = await requireSession(deps, input.sessionId);
  if (terminal(session)) return session;
  if (session.status !== "ACTIVE") {
    throw realtimeError("CONFLICT", `Session ${session.sessionId} is ${session.status}; only ACTIVE sessions disconnect.`);
  }
  const open = await deps.repository.openInterval(session.sessionId);
  if (open) await deps.repository.closeInterval(open.intervalId, now);
  const next: RealtimeSessionRecord = { ...session, status: "RECONNECTING", updatedAt: now };
  await deps.repository.updateSession(next);
  return next;
}

/**
 * Reconnect: bump the epoch, attach a fresh provider leg, mint a fresh
 * credential and open a new interval. Reconnect gaps stay unbilled and the
 * old epoch can never be replayed.
 */
export async function reconnectSession(
  deps: RealtimeServiceDeps,
  input: { sessionId: string; transportMode: RealtimeTransportMode; now?: string },
): Promise<{ session: RealtimeSessionRecord; credential: RealtimeTransportCredential }> {
  const now = input.now ?? new Date().toISOString();
  const session = await requireSession(deps, input.sessionId);
  if (terminal(session)) {
    throw realtimeError("CONFLICT", `Session ${session.sessionId} is terminal; reconnect is refused.`);
  }
  if (session.status !== "RECONNECTING") {
    throw realtimeError("CONFLICT", `Session ${session.sessionId} is ${session.status}; only RECONNECTING sessions reconnect.`);
  }
  assertSameMode(session.agentSnapshot.transportMode, input.transportMode);
  const adapter = deps.transports.adapterFor("livekit-managed") ?? deps.transports.adapterFor("synthetic");
  if (!adapter) {
    throw realtimeError("ENDPOINT_UNAVAILABLE", "No realtime transport adapter is registered.", {
      code: "REALTIME_TRANSPORT_UNAVAILABLE",
    });
  }
  const epoch = session.epoch + 1;
  await adapter.attach({
    sessionId: session.sessionId,
    epoch,
    transportMode: session.agentSnapshot.transportMode,
    agentSnapshot: session.agentSnapshot,
  });
  const bumped: RealtimeSessionRecord = { ...session, epoch, updatedAt: now };
  const credential = mintTransportCredential({ session: bumped, substrate: adapter.substrate, existing: null, now });
  await deps.repository.insertCredential(credential);
  await deps.repository.insertEpoch({ sessionId: session.sessionId, epoch, transportCredentialId: credential.credentialId, startedAt: now, endedAt: null });
  await deps.repository.insertInterval({ intervalId: randomUUID(), sessionId: session.sessionId, epoch, startedAt: now, endedAt: null });
  const next: RealtimeSessionRecord = { ...bumped, status: "ACTIVE" };
  await deps.repository.updateSession(next);
  return { session: next, credential };
}

export interface AppendEventInput {
  sessionId: string;
  epoch: number;
  type: RealtimeEventType;
  text: string;
  providerEventId?: string | null;
  clientAt?: string;
  payload?: Readonly<Record<string, unknown>>;
  now?: string;
}

export interface AppendEventResult {
  event: RealtimeSessionEvent;
  deduped: boolean;
}

/**
 * Append a session event. Stale epochs are rejected (replay protection);
 * duplicate provider event ids are acknowledged without re-applying, so
 * retries can never double-meter.
 */
export async function appendSessionEvent(
  deps: RealtimeServiceDeps,
  input: AppendEventInput,
): Promise<AppendEventResult> {
  const now = input.now ?? new Date().toISOString();
  const session = await requireSession(deps, input.sessionId);
  if (input.epoch < session.epoch) {
    throw realtimeError("STALE_REVISION", `Stale epoch ${input.epoch}; session is at epoch ${session.epoch}.`, {
      code: "REALTIME_STALE_EPOCH",
      epoch: session.epoch,
    });
  }
  if (input.epoch > session.epoch) {
    throw realtimeError("CONFLICT", `Unknown future epoch ${input.epoch}; session is at epoch ${session.epoch}.`, {
      code: "REALTIME_UNKNOWN_EPOCH",
    });
  }
  if (input.providerEventId) {
    const duplicate = await deps.repository.findEventByProviderId(input.sessionId, input.providerEventId);
    if (duplicate) return { event: duplicate, deduped: true };
  }
  const sequence = await deps.repository.nextSequence(input.sessionId);
  const event: RealtimeSessionEvent = {
    eventId: randomUUID(),
    sessionId: input.sessionId,
    epoch: input.epoch,
    sequence,
    type: input.type,
    text: input.text,
    providerEventId: input.providerEventId ?? null,
    clientAt: input.clientAt ?? now,
    appendedAt: now,
    payload: input.payload ?? {},
    contentHash: hashSessionContent({ sessionId: input.sessionId, epoch: input.epoch, sequence, type: input.type, text: input.text }),
  };
  await deps.repository.insertEvent(event);
  return { event, deduped: false };
}

/** Per-session mutex so concurrent topup/stop calls serialize (atomicity). */
const sessionLocks = new Map<string, Promise<void>>();

async function withSessionLock<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  const prior = sessionLocks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  sessionLocks.set(sessionId, prior.then(() => current));
  await prior;
  try {
    return await work();
  } finally {
    release();
  }
}

/**
 * Atomic topup: raise the reservation toward the authorized ceiling. Races
 * serialize on the session lock; the ceiling is never exceeded.
 */
export async function topupSession(
  deps: RealtimeServiceDeps,
  input: { sessionId: string; requestedIcu: IcuAmount; idempotencyKey: string; now?: string },
): Promise<RealtimeSessionRecord> {
  return withSessionLock(input.sessionId, async () => {
    const now = input.now ?? new Date().toISOString();
    const session = await requireSession(deps, input.sessionId);
    if (terminal(session)) {
      throw realtimeError("CONFLICT", `Session ${session.sessionId} is terminal; topup is refused.`);
    }
    if (!input.idempotencyKey) throw realtimeError("BAD_REQUEST", "Topup requires an idempotencyKey.");
    const { newReservedIcu } = topupReservation(session.reservedIcu, session.ceilingIcu, input.requestedIcu);
    if (!session.quoteId) throw realtimeError("INTERNAL", `Session ${session.sessionId} has no quote; cannot top up.`);
    const reservationId = await deps.economics.reserve(session.quoteId, session.scope);
    const next: RealtimeSessionRecord = {
      ...session,
      reservationId,
      reservedIcu: newReservedIcu,
      topupCount: session.topupCount + 1,
      updatedAt: now,
    };
    await deps.repository.updateSession(next);
    return next;
  });
}

export interface StopSessionInput {
  sessionId: string;
  reason: RealtimeEndReason;
  now?: string;
}

/**
 * Atomic stop: close the open interval, meter connected seconds excluding
 * gaps, settle metered use and release the unused remainder exactly once.
 * Stopping before the cap is exhausted is the normal path, never an error.
 */
export async function stopSession(
  deps: RealtimeServiceDeps,
  input: StopSessionInput,
): Promise<RealtimeSessionRecord> {
  return withSessionLock(input.sessionId, async () => {
    const now = input.now ?? new Date().toISOString();
    const session = await requireSession(deps, input.sessionId);
    if (terminal(session)) return session;
    const open = await deps.repository.openInterval(session.sessionId);
    if (open) await deps.repository.closeInterval(open.intervalId, now);
    const intervals = await deps.repository.listIntervals(session.sessionId);
    const seconds = connectedSeconds(intervals, now);
    const { usedIcu } = settleForSeconds(seconds, session.rateIcuPerSecond, session.spendCapIcu);
    const { settleIcu } = stopSplit(session.reservedIcu, usedIcu);
    if (session.reservationId) {
      // j04 settle records the remainder release itself; settled rows are
      // terminal, so no separate release call follows.
      await deps.economics.settle(session.reservationId, session.scope, settleIcu);
    }
    const next: RealtimeSessionRecord = {
      ...session,
      status: input.reason === "revoked" ? "REVOKED" : "ENDED",
      spentIcu: settleIcu,
      endReason: input.reason,
      updatedAt: now,
      endedAt: now,
    };
    await deps.repository.updateSession(next);
    await deps.repository.revokeCredentials(session.sessionId);
    const adapter = deps.transports.adapterFor("livekit-managed") ?? deps.transports.adapterFor("synthetic");
    if (adapter) {
      await adapter.detach({ sessionId: session.sessionId, epoch: session.epoch, reason: input.reason }).catch(() => undefined);
    }
    return next;
  });
}

/** Revocation stops the session immediately and denies every pending tool. */
export async function revokeSession(
  deps: RealtimeServiceDeps,
  input: { sessionId: string; scopeId: string; now?: string },
): Promise<RealtimeSessionRecord> {
  const session = await requireSession(deps, input.sessionId);
  if (!terminal(session)) {
    const revoked: RealtimeSessionRecord = {
      ...session,
      revokedScopeIds: [...session.revokedScopeIds, input.scopeId],
      updatedAt: input.now ?? new Date().toISOString(),
    };
    await deps.repository.updateSession(revoked);
  }
  return stopSession(deps, { sessionId: input.sessionId, reason: "revoked", now: input.now });
}

/**
 * Crash recovery: a session left ACTIVE/RECONNECTING/STARTING by a dead
 * worker is closed at the crash timestamp, metered use settles, and the
 * unused hold is released. Idempotent — replaying is a no-op.
 */
export async function crashRecoverSession(
  deps: RealtimeServiceDeps,
  input: { sessionId: string; crashedAt: string },
): Promise<RealtimeSessionRecord> {
  return withSessionLock(input.sessionId, async () => {
    const session = await requireSession(deps, input.sessionId);
    if (terminal(session)) return session;
    const open = await deps.repository.openInterval(session.sessionId);
    if (open) await deps.repository.closeInterval(open.intervalId, input.crashedAt);
    const intervals = await deps.repository.listIntervals(session.sessionId);
    const seconds = connectedSeconds(intervals, input.crashedAt);
    const { usedIcu } = settleForSeconds(seconds, session.rateIcuPerSecond, session.spendCapIcu);
    const { settleIcu } = stopSplit(session.reservedIcu, usedIcu);
    if (session.reservationId) {
      // j04 settle records the remainder release itself (see stopSession).
      await deps.economics.settle(session.reservationId, session.scope, settleIcu);
    }
    const next: RealtimeSessionRecord = {
      ...session,
      status: "ERRORED",
      spentIcu: settleIcu,
      endReason: "crash_recovery",
      errorCode: "REALTIME_WORKER_CRASH",
      updatedAt: input.crashedAt,
      endedAt: input.crashedAt,
    };
    await deps.repository.updateSession(next);
    await deps.repository.revokeCredentials(session.sessionId);
    return next;
  });
}
