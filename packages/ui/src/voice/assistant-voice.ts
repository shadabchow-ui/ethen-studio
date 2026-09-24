/**
 * lib/voice/assistant-voice.ts
 *
 * Types and constants scoped to the Ethen Assistant voice mode integration.
 * Reuses RealtimeSessionState from lib/voice/realtime/realtimeTypes.ts
 * for session lifecycle, plus voice display primitives.
 */

import type { RealtimeSessionState, RealtimeEvent } from "@ethen/contracts/voice/realtime-types";

export type AssistantVoiceState = RealtimeSessionState;

export type { RealtimeSessionState, RealtimeEvent };

/** Subset of RealtimeSessionState used for VoiceOrb mapping. */
export const VOICE_ORB_STATE_MAP: Record<
  AssistantVoiceState,
  { orbState: "idle" | "connecting" | "listening" | "speaking" | "muted"; label: string }
> = {
  idle: { orbState: "idle", label: "Voice inactive" },
  requesting_mic: { orbState: "connecting", label: "Requesting microphone…" },
  mic_denied: { orbState: "muted", label: "Microphone denied" },
  connecting: { orbState: "connecting", label: "Connecting to agent…" },
  connected: { orbState: "listening", label: "Connected — listening" },
  listening: { orbState: "listening", label: "Listening…" },
  thinking: { orbState: "connecting", label: "Agent thinking…" },
  speaking: { orbState: "speaking", label: "Agent speaking…" },
  interrupted: { orbState: "idle", label: "Interrupted" },
  ended: { orbState: "idle", label: "Session ended" },
  failed: { orbState: "muted", label: "Connection failed" },
};

/** Description for setup-required / missing-provider states shown in Assistant. */
export const VOICE_SETUP_REQUIRED_COPY = {
  heading: "Voice not configured",
  body: "Voice mode requires an OpenAI API key. Add OPENAI_API_KEY to your server environment to enable realtime voice conversations.",
  actionLabel: "View setup docs",
  code: "SETUP_REQUIRED",
} as const;
