/**
 * STUDIO_09 — create framework shared contracts.
 *
 * Published once for all V5 create consumers (11 binds the audio extension
 * slots; 14 opens results in the workbench). Browser-safe: types only.
 * Voice/transcribe execution slots stay typed-but-unbound until STUDIO_11.
 */

/** The eight canonical simple-create tools (authority §15; M5 adds edit + 3d). */
export type CreateToolId = "image" | "edit" | "video" | "voice" | "music" | "sfx" | "transcribe" | "3d";

export const CREATE_TOOL_IDS: readonly CreateToolId[] = ["image", "edit", "video", "voice", "music", "sfx", "transcribe", "3d"];

/** Composer input variant per tool. */
export type CreateInputVariant = "prompt" | "script" | "upload";

export type CreateActionLabel = "Generate" | "Transcribe";

/**
 * Execution binding per tool. Image/video/music/SFX bind the qualified
 * task registry and real jobs now; voice/transcribe are typed extension
 * slots that STUDIO_11 completes. Unbound slots render as clearly
 * unavailable — never as dead controls or fake success.
 */
export type CreateExecutionBinding =
  | { kind: "task"; task: string }
  | { kind: "extension-slot"; slot: "voice.synthesis" | "voice.transcription"; bound: false; completedBy: "STUDIO_11" };

export interface CreateToolDefinition {
  id: CreateToolId;
  title: string;
  route: `/studio/create/${CreateToolId}`;
  actionLabel: CreateActionLabel;
  inputVariant: CreateInputVariant;
  /** Secondary variants the frame also accepts (e.g. image edit upload). */
  secondaryVariants: readonly CreateInputVariant[];
  binding: CreateExecutionBinding;
  /** Reference kinds offered when the endpoint capability supports them. */
  referenceKinds: readonly string[];
  description: string;
}

/**
 * Separate voice-slot interface. Voice settings are identity references
 * (a VoiceIdentity id), never inline provider blobs or model ids.
 */
export interface CreateVoiceSlotState {
  /** VoiceIdentity reference id, or null when none is selected. */
  voiceIdentityId: string | null;
  /** Slot binding state; false until STUDIO_11 binds batch voice. */
  bound: boolean;
}

/** Model slot: Auto routing or an explicit pinned endpoint. */
export interface CreateModelSlotState {
  selection: "auto" | string;
  endpointLabel: string | null;
  /** Human-readable reason the selection is disabled, if any. */
  disabledReason: string | null;
}

/**
 * Reference binding with V2 preserve/change/target semantics:
 * target names what the reference applies to, intent says whether the
 * output must preserve it or change it per the instruction.
 */
export type ReferenceIntent = "preserve" | "change";

export interface CreateReferenceBinding {
  /** Authorized project asset id — never an arbitrary remote URL. */
  referenceAssetId: string;
  referenceKind: string;
  intent: ReferenceIntent;
  /** Target the reference applies to (e.g. "subject", "background"). */
  target: string;
  /** Change instruction; required when intent is "change". */
  instruction: string | null;
}

/** Minimal job/result projection the frame renders and history stores. */
export interface CreateJobResultView {
  jobId: string;
  /** Create tool id, or an audio tool id (dub/changer) sharing the history model. */
  toolId: string;
  status: string;
  statusLabel: string;
  endpointId: string | null;
  quoteId: string | null;
  promptText: string;
  previewUrl: string | null;
  costLabel: string | null;
  retryable: boolean;
  createdAt: string;
  updatedAt: string;
}
