/**
 * STUDIO_16 — realtime UI types (client-safe: no server imports).
 * Voice agent session: start → permission → connecting → active ⇄
 * reconnecting → ended | error, with spend cap, transcript/tool feed, an
 * audible indicator and stop.
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

export type RealtimeUiState =
  | { state: "loading" }
  | { state: "setup"; message: string; dependency?: string | null }
  | { state: "empty"; message: string }
  | { state: "blocked"; message: string }
  | { state: "error"; message: string }
  | { state: "ready" };

export interface RealtimeSessionView {
  sessionId: string;
  status: string;
  epoch: number;
  agentName: string;
  transportMode: string;
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

export interface RealtimeMeteringView {
  connectedSeconds: number;
  projectedIcu: number;
  atCap: boolean;
  asOf: string;
}

export interface RealtimeEventView {
  eventId: string;
  epoch: number;
  sequence: number;
  type: string;
  text: string;
  appendedAt: string;
  role: "user" | "agent" | "system";
}

export interface RealtimeToolView {
  callId: string;
  task: string;
  toolName: string;
  toolScopeId: string;
  status: string;
  decisionCode: string | null;
  requestedAt: string;
}

export interface RealtimeCredentialView {
  credentialId: string;
  epoch: number;
  substrate: string;
  expiresAt: string;
}

export interface RealtimeSessionDetail {
  session: RealtimeSessionView;
  events: RealtimeEventView[];
  tools: RealtimeToolView[];
  metering: RealtimeMeteringView | null;
  agentSpeaking: boolean;
  uiSessionState: RealtimeUiSessionState;
}

export function formatIcu(icu: number): string {
  return `${(icu / 1000).toFixed(3)} credits`;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export const REALTIME_SESSION_STATE_LABELS: Readonly<Record<RealtimeUiSessionState, string>> = {
  start: "Ready to start",
  permission: "Microphone permission",
  permission_denied: "Microphone blocked",
  connecting: "Connecting",
  active: "Live",
  reconnecting: "Reconnecting",
  ended: "Ended",
  error: "Error",
};
