/** Studio V5 realtime — typed UI states for consumers (STUDIO_16, server-only). */
import "server-only";
import { studioError } from "../../contracts/errors";
import type { LoadState } from "../../contracts/states";
import type {
  RealtimeSessionEvent,
  RealtimeSessionRecord,
  RealtimeToolCall,
  RealtimeTransportCredential,
} from "./types";

/**
 * Browser session UI states: start → permission → connecting → active ⇄
 * reconnecting → ended | error. Permission is requested only on user action;
 * denial is its own explicit state, never a silent empty view.
 */
export type RealtimeUiSessionState =
  | "start"
  | "permission"
  | "permission_denied"
  | "connecting"
  | "active"
  | "reconnecting"
  | "ended"
  | "error";

export const REALTIME_UI_SESSION_STATES: readonly RealtimeUiSessionState[] = [
  "start",
  "permission",
  "permission_denied",
  "connecting",
  "active",
  "reconnecting",
  "ended",
  "error",
];

export function uiStateForSession(
  session: RealtimeSessionRecord | null,
  permission: "unknown" | "granted" | "denied",
): RealtimeUiSessionState {
  if (!session) return permission === "denied" ? "permission_denied" : "start";
  switch (session.status) {
    case "STARTING":
      return permission === "denied" ? "permission_denied" : permission === "granted" ? "connecting" : "permission";
    case "ACTIVE":
      return "active";
    case "RECONNECTING":
      return "reconnecting";
    case "ENDED":
    case "REVOKED":
      return "ended";
    case "ERRORED":
      return "error";
  }
}

/** Audible indicator: true while the agent is speaking (last voice event wins). */
export function agentSpeaking(events: readonly RealtimeSessionEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const type = events[i].type;
    if (type === "agent.speaking_started") return true;
    if (type === "agent.speaking_stopped" || type === "agent.interrupted" || type === "session.ended") return false;
  }
  return false;
}

/** Transcript lines: final segments in order; partials only when nothing final yet. */
export function transcriptLines(events: readonly RealtimeSessionEvent[]): { role: "user" | "agent"; text: string; at: string }[] {
  const finals = events.filter((e) => e.type === "transcript.final");
  if (finals.length > 0) {
    return finals.map((e) => ({
      role: (e.payload["role"] as string) === "agent" ? "agent" : "user",
      text: e.text,
      at: e.appendedAt,
    }));
  }
  return events
    .filter((e) => e.type === "transcript.partial")
    .map((e) => ({ role: "user" as const, text: e.text, at: e.appendedAt }));
}

export function sessionListState(sessions: RealtimeSessionRecord[]): LoadState<RealtimeSessionRecord[]> {
  return {
    kind: sessions.length === 0 ? "empty" : "ready",
    data: sessions,
    error: null,
    actionLabel: null,
  };
}

export function sessionDetailState(session: RealtimeSessionRecord | null): LoadState<RealtimeSessionRecord | null> {
  return { kind: session ? "ready" : "empty", data: session, error: null, actionLabel: null };
}

export function realtimeEventState(events: RealtimeSessionEvent[]): LoadState<RealtimeSessionEvent[]> {
  return { kind: events.length === 0 ? "empty" : "ready", data: events, error: null, actionLabel: null };
}

export function realtimeToolState(calls: RealtimeToolCall[]): LoadState<RealtimeToolCall[]> {
  return { kind: calls.length === 0 ? "empty" : "ready", data: calls, error: null, actionLabel: null };
}

export function realtimeCredentialState(
  credential: RealtimeTransportCredential | null,
): LoadState<RealtimeTransportCredential | null> {
  return { kind: credential ? "ready" : "empty", data: credential, error: null, actionLabel: null };
}

export function realtimeLoadingState<T>(): LoadState<T> {
  return { kind: "loading", data: null, error: null, actionLabel: null };
}

export function realtimeErrorState<T>(requestId: string, message: string): LoadState<T> {
  return { kind: "error", data: null, error: studioError("INTERNAL", message, requestId, false), actionLabel: "Retry" };
}

export function realtimeSetupState<T>(message: string): LoadState<T> {
  return {
    kind: "setup_required",
    data: null,
    error: studioError("BAD_REQUEST", message, "setup", false),
    actionLabel: "Set up",
  };
}

export function realtimeBlockedState<T>(message: string): LoadState<T> {
  return {
    kind: "blocked",
    data: null,
    error: studioError("ENDPOINT_UNAVAILABLE", message, "realtime-blocked", false),
    actionLabel: null,
  };
}
