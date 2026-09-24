/**
 * STUDIO_11 — audio tool bindings (explicit 09 handoff).
 *
 * 09 owns v5/create and left voice/transcribe as typed extension slots
 * (bound:false, completedBy STUDIO_11). This module binds those slots
 * WITHOUT editing 09-owned files: the audio route adapter overlays an
 * executable binding for voice/transcribe and adds dub/changer
 * definitions. 09 files stay untouched; the handoff is this module
 * plus the one-line adapter swap in the create [tool] page.
 */

import type { AudioStageId, AudioToolDefinition, AudioToolId } from "./types";
import { AUDIO_STAGE_ORDER, AUDIO_TOOL_IDS } from "./types";

export const AUDIO_TOOL_DEFINITIONS: Readonly<Record<AudioToolId, AudioToolDefinition>> = {
  voice: {
    id: "voice",
    title: "Create voice",
    route: "/studio/create/voice",
    actionLabel: "Generate",
    inputVariant: "script",
    description: "Script-to-speech with a separate voice identity and model. Runs as a durable job.",
  },
  transcribe: {
    id: "transcribe",
    title: "Transcribe audio",
    route: "/studio/create/transcribe",
    actionLabel: "Transcribe",
    inputVariant: "upload",
    description: "Upload audio to transcribe with timestamps and speakers. Runs as a durable job.",
  },
  dub: {
    id: "dub",
    title: "Dub audio",
    route: "/studio/create/dub",
    actionLabel: "Start dub",
    inputVariant: "upload",
    description: "Transcribe, translate, and re-voice audio with per-speaker voices. Staged and resumable.",
  },
  changer: {
    id: "changer",
    title: "Change voice",
    route: "/studio/create/changer",
    actionLabel: "Transform",
    inputVariant: "upload",
    description: "Transform uploaded audio to a target voice. Available only when a qualified capability exists.",
  },
};

export function isAudioToolId(value: string): value is AudioToolId {
  return (AUDIO_TOOL_IDS as readonly string[]).includes(value);
}

export function getAudioTool(id: string): AudioToolDefinition | null {
  if (!isAudioToolId(id)) return null;
  return AUDIO_TOOL_DEFINITIONS[id];
}

/** Planned stages for a tool, in execution order. */
export function stagesForTool(tool: AudioToolId): readonly AudioStageId[] {
  return AUDIO_STAGE_ORDER[tool];
}

/**
 * Changer/isolation availability: only qualified capabilities. An empty
 * candidate list (or no executable candidate) means the form renders
 * the blocked state — never a dead control or fake success.
 */
export function changerAvailable(candidates: readonly { executable: boolean }[]): boolean {
  return candidates.some((candidate) => candidate.executable);
}

/** Stages downstream of (and including) `from`, for retry/invalidation. */
export function dirtyDownstream(tool: AudioToolId, from: AudioStageId): readonly AudioStageId[] {
  const order = AUDIO_STAGE_ORDER[tool];
  const index = order.indexOf(from);
  return index < 0 ? [] : order.slice(index);
}
