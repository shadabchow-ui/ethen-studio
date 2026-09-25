/**
 * STUDIO_16 — realtime API client (client-safe fetch wrapper over the V1
 * realtime routes). Errors carry the route code/message; auth/setup states
 * stay distinct from empty/error.
 */

import type {
  RealtimeCredentialView,
  RealtimeEventView,
  RealtimeMeteringView,
  RealtimeSessionView,
  RealtimeToolView,
} from "./types";
import { translateStudioAuthFailure } from "@/components/studio/auth/studio-auth-action";

export class RealtimeApiError extends Error {
  readonly code: string;
  readonly dependency: string | null;

  constructor(code: string, message: string, dependency: string | null = null) {
    super(message);
    this.name = "RealtimeApiError";
    this.code = code;
    this.dependency = dependency;
  }
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: { dependency?: string } };
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!envelope.ok || envelope.data === undefined) {
    const code = envelope.error?.code ?? "INTERNAL_ERROR";
    // S4C: mutation 401s open the Clerk modal; reads fail to signed-out
    // states instead (never auto-modal on background fetches).
    const method = (init?.method ?? "GET").toString().toUpperCase();
    if (method !== "GET" && method !== "HEAD") translateStudioAuthFailure(response.status, code, "realtime");
    throw new RealtimeApiError(code, envelope.error?.message ?? "Realtime request failed.", envelope.error?.details?.dependency ?? null);
  }
  return envelope.data;
}

function roleFor(type: string, payload: Record<string, unknown>): "user" | "agent" | "system" {
  if (type.startsWith("user.") || (type === "transcript.final" && payload["role"] !== "agent")) return "user";
  if (type.startsWith("agent.") || payload["role"] === "agent") return "agent";
  return "system";
}

interface SessionWire {
  sessionId: string;
  status: string;
  epoch: number;
  agentSnapshot: Record<string, unknown>;
  spendCapIcu: number;
  ceilingIcu: number;
  spentIcu: number;
  reservedIcu: number;
  rateIcuPerSecond: number;
  toolScopeIds: string[];
  revokedScopeIds: string[];
  recordingRetention: string;
  endReason: string | null;
  errorCode: string | null;
  createdAt: string;
  endedAt: string | null;
}

function toSessionView(row: SessionWire): RealtimeSessionView {
  return {
    sessionId: row.sessionId,
    status: row.status,
    epoch: row.epoch,
    agentName: typeof row.agentSnapshot["name"] === "string" ? String(row.agentSnapshot["name"]) : "Voice Agent",
    transportMode: typeof row.agentSnapshot["transportMode"] === "string" ? String(row.agentSnapshot["transportMode"]) : "native",
    spendCapIcu: row.spendCapIcu,
    ceilingIcu: row.ceilingIcu,
    spentIcu: row.spentIcu,
    reservedIcu: row.reservedIcu,
    rateIcuPerSecond: row.rateIcuPerSecond,
    toolScopeIds: row.toolScopeIds,
    revokedScopeIds: row.revokedScopeIds,
    recordingRetention: row.recordingRetention,
    endReason: row.endReason,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
  };
}

interface EventWire {
  eventId: string;
  epoch: number;
  sequence: number;
  type: string;
  text: string;
  appendedAt: string;
  payload: Record<string, unknown>;
}

function toEventView(row: EventWire): RealtimeEventView {
  return {
    eventId: row.eventId,
    epoch: row.epoch,
    sequence: row.sequence,
    type: row.type,
    text: row.text,
    appendedAt: row.appendedAt,
    role: roleFor(row.type, row.payload ?? {}),
  };
}

export async function fetchSessions(projectId: string): Promise<RealtimeSessionView[]> {
  const data = await request<{ sessions: SessionWire[] }>(
    `/api/studio/v1/realtime/sessions?projectId=${encodeURIComponent(projectId)}`,
  );
  return data.sessions.map(toSessionView);
}

export interface SessionDetailWire {
  session: SessionWire;
  events: EventWire[];
  tools: {
    callId: string;
    task: string;
    toolName: string;
    toolScopeId: string;
    status: string;
    decisionCode: string | null;
    requestedAt: string;
  }[];
  metering: RealtimeMeteringView | null;
}

export async function fetchSessionDetail(
  projectId: string,
  sessionId: string,
): Promise<{ session: RealtimeSessionView; events: RealtimeEventView[]; tools: RealtimeToolView[]; metering: RealtimeMeteringView | null }> {
  const data = await request<SessionDetailWire>(
    `/api/studio/v1/realtime/sessions/${encodeURIComponent(sessionId)}?projectId=${encodeURIComponent(projectId)}`,
  );
  return {
    session: toSessionView(data.session),
    events: data.events.map(toEventView),
    tools: data.tools.map((t) => ({ ...t })),
    metering: data.metering,
  };
}

export interface CreateSessionInput {
  projectId: string;
  quoteId: string;
  transportMode: "pipeline" | "native";
  agentId: string;
  agentVersion?: string;
  agentName?: string;
  model?: string;
  voiceBindingId?: string;
  spendCapIcu: number;
  ceilingIcu: number;
  rateIcuPerSecond: number;
  toolScopeIds: string[];
  consentGrantId: string | null;
  recordingRetention: "none" | "session" | "project_default";
  idempotencyKey: string;
}

export async function createSession(input: CreateSessionInput): Promise<RealtimeSessionView> {
  const data = await request<{ session: SessionWire }>("/api/studio/v1/realtime/sessions", {
    method: "POST",
    body: JSON.stringify({
      projectId: input.projectId,
      quoteId: input.quoteId,
      transportMode: input.transportMode,
      agent: {
        agentId: input.agentId,
        agentVersion: input.agentVersion ?? "1",
        name: input.agentName ?? "Voice Agent",
        model: input.model ?? "unknown",
        voiceBindingId: input.voiceBindingId ?? "",
      },
      spendCapIcu: input.spendCapIcu,
      ceilingIcu: input.ceilingIcu,
      rateIcuPerSecond: input.rateIcuPerSecond,
      toolScopeIds: input.toolScopeIds,
      consentGrantId: input.consentGrantId,
      recordingRetention: input.recordingRetention,
      idempotencyKey: input.idempotencyKey,
    }),
  });
  return toSessionView(data.session);
}

export async function transportAction(input: {
  projectId: string;
  sessionId: string;
  action: "connect" | "disconnect" | "reconnect";
  transportMode?: "pipeline" | "native";
}): Promise<{ session: RealtimeSessionView; credential: RealtimeCredentialView | null }> {
  const data = await request<{ session: SessionWire; credential: (RealtimeCredentialView & { token: string }) | null }>(
    `/api/studio/v1/realtime/sessions/${encodeURIComponent(input.sessionId)}/token`,
    {
      method: "POST",
      body: JSON.stringify({
        projectId: input.projectId,
        action: input.action,
        transportMode: input.transportMode,
      }),
    },
  );
  return {
    session: toSessionView(data.session),
    credential: data.credential
      ? {
          credentialId: data.credential.credentialId,
          epoch: data.credential.epoch,
          substrate: data.credential.substrate,
          expiresAt: data.credential.expiresAt,
        }
      : null,
  };
}

export async function stopSession(
  projectId: string,
  sessionId: string,
): Promise<{ session: RealtimeSessionView | null; metering: { connectedSeconds: number; settledIcu: number; releasedIcu: number } | null }> {
  const data = await request<{
    session: SessionWire | null;
    metering: { connectedSeconds: number; settledIcu: number; releasedIcu: number } | null;
  }>(`/api/studio/v1/realtime/sessions/${encodeURIComponent(sessionId)}?projectId=${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
  return { session: data.session ? toSessionView(data.session) : null, metering: data.metering };
}

export async function topupSession(input: {
  projectId: string;
  sessionId: string;
  requestedIcu: number;
  idempotencyKey: string;
}): Promise<{ session: RealtimeSessionView | null; topup: { reservedIcu: number; topupCount: number; atCeiling: boolean } }> {
  const data = await request<{ session: SessionWire | null; topup: { reservedIcu: number; topupCount: number; atCeiling: boolean } }>(
    `/api/studio/v1/realtime/sessions/${encodeURIComponent(input.sessionId)}/topup`,
    {
      method: "POST",
      body: JSON.stringify({ projectId: input.projectId, requestedIcu: input.requestedIcu, idempotencyKey: input.idempotencyKey }),
    },
  );
  return { session: data.session ? toSessionView(data.session) : null, topup: data.topup };
}

export function realtimeFailureMessage(failure: unknown): string {
  if (failure instanceof RealtimeApiError) return failure.message;
  if (failure instanceof Error) return failure.message;
  return "Realtime request failed.";
}
