/** Studio V5 workbench — shared types and errors (STUDIO_14, server-only). */
import "server-only";
import type { ApiErrorCode } from "../../contracts/errors";
import { studioError } from "../../contracts/errors";
import type { ProjectScope } from "../../contracts/scope";

/** Typed workbench-layer failure carrying a kernel API error code. */
export class WorkbenchError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    retryable = false,
  ) {
    super(message);
    this.name = "WorkbenchError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toApiError(requestId: string) {
    return studioError(this.code, this.message, requestId, this.retryable, this.details);
  }
}

export function workbenchError(
  code: ApiErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  retryable = false,
): WorkbenchError {
  return new WorkbenchError(code, message, details, retryable);
}

/** HTTP status projection for WorkbenchError codes (route adapters). */
export const WORKBENCH_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_REVISION: 409,
  QUOTE_EXPIRED: 410,
  APPROVAL_REQUIRED: 403,
  QUOTA_EXCEEDED: 429,
  POLICY_DENIED: 403,
  CONSENT_REQUIRED: 403,
  ENDPOINT_UNAVAILABLE: 503,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/**
 * Integer timebase: every timeline position/duration is an integer tick
 * count at `timescale` ticks per second. Source time is preserved exactly;
 * frame conversions require an explicit rounding mode (see timebase.ts).
 */
export interface Timebase {
  /** Ticks per second. Positive integer (e.g. 1_000_000, 48000, 90000). */
  timescale: number;
}

/** Rational frame rate as num/den (e.g. 30000/1001). Positive integers. */
export interface FrameRate {
  num: number;
  den: number;
}

/** Explicit rounding for tick<->frame conversions. Never implicit. */
export type FrameRounding = "floor" | "ceil" | "nearest";

/** Pinned source reference. Every clip points at exact immutable bytes. */
export interface SourceRef {
  assetId: string;
  version: number;
  /** Pinned sha256 of the exact source bytes. Required. */
  contentHash: string;
}

/**
 * Nondestructive image transform references. The transform is a recipe
 * entry only: crop rect in source pixels plus an optional mask asset
 * reference. Source bytes are never mutated.
 */
export interface ImageTransformRef {
  /** Crop rect in integer source pixels, or null for full frame. */
  crop: { x: number; y: number; width: number; height: number } | null;
  /** Optional mask as a pinned asset reference, or null. */
  mask: SourceRef | null;
}

export type TrackKind = "video" | "audio" | "caption";

export interface TimelineClip {
  clipId: string;
  trackId: string;
  source: SourceRef;
  /** Source in-point in integer ticks. */
  sourceInTicks: number;
  /** Clip duration in integer ticks. Must be measured, never estimated. */
  durationTicks: number;
  /** Timeline placement in integer ticks. */
  timelineStartTicks: number;
  /** Gain in dB for audio clips; null = unity. */
  gainDb: number | null;
  /** Attached caption track id, or null. */
  captionTrackId: string | null;
  /** Nondestructive image transform refs (video/image clips only). */
  imageTransform: ImageTransformRef | null;
}

export interface TimelineTrack {
  trackId: string;
  kind: TrackKind;
  /** Clips sorted by timelineStartTicks, non-overlapping. */
  clips: TimelineClip[];
}

export interface CaptionCue {
  cueId: string;
  /** Cue in/out in integer ticks. */
  startTicks: number;
  endTicks: number;
  text: string;
  speakerId: string | null;
}

export interface CaptionTrack {
  captionTrackId: string;
  language: string;
  cues: CaptionCue[];
}

/**
 * TimelineRevision — the published STUDIO_14 shared contract.
 * Immutable: edits append a new revision via CAS on (timelineId, revision).
 */
export interface TimelineRevision {
  revisionId: string;
  timelineId: string;
  scope: ProjectScope;
  revision: number;
  parentRevision: number | null;
  title: string;
  timebase: Timebase;
  fps: FrameRate;
  tracks: TimelineTrack[];
  captionTracks: CaptionTrack[];
  /** sha256 over the canonical recipe JSON. */
  hash: string;
  createdAt: string;
  /** Editorial lock holder, or null when unlocked. */
  lockedBy: string | null;
}

/** Nondestructive edit operations. Each produces a child revision. */
export type EditOp =
  | { kind: "trim"; clipId: string; inDeltaTicks: number; outDeltaTicks: number }
  | { kind: "split"; clipId: string; atTimelineTicks: number; newClipId: string }
  | { kind: "move"; clipId: string; toTrackId: string; toStartTicks: number }
  | { kind: "gain"; clipId: string; gainDb: number | null }
  | { kind: "caption-attach"; clipId: string; captionTrackId: string | null }
  | { kind: "image-transform"; clipId: string; transform: ImageTransformRef | null }
  | { kind: "caption-cue"; captionTrackId: string; cue: CaptionCue | null; cueId: string };

/** Measured source facts required to validate an edit. Never estimated. */
export interface SourceProbe {
  assetId: string;
  version: number;
  /** Measured source duration in integer ticks at the timeline timebase, or null when unmeasured. */
  durationTicks: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
}

export type RenderStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

/**
 * RenderSpec — deterministic render request over one immutable revision.
 * V1 subset: SDR/BT.709, straight cuts, optional caption burn-in.
 */
export interface RenderSpec {
  timelineId: string;
  revision: number;
  revisionHash: string;
  output: {
    container: "mp4";
    videoCodec: "h264";
    width: number;
    height: number;
    audioCodec: "aac" | "none";
    captionBurnIn: boolean;
  };
  interchange: "none" | "otio" | "fcpxml";
  /** Caller idempotency key; defaults to the deterministic render key. */
  idempotencyKey: string | null;
}

export interface RenderSubmission {
  renderId: string;
  scope: ProjectScope;
  spec: RenderSpec;
  /** Deterministic key: same revision + spec replays the same render. */
  idempotencyKey: string;
  /** sha256 over the canonical submission payload. */
  requestHash: string;
  task: "timeline.render";
  status: RenderStatus;
  createdAt: string;
}

/** Editorial status ladder (forward-only; locked is terminal). */
export type EditorialStatus = "draft" | "staged" | "in_production" | "review" | "approved" | "locked";

export interface EditorialEntity {
  key: string;
  kind: string;
  refId: string | null;
  attributesHash: string | null;
}

export interface CinemaSequence {
  sequenceId: string;
  scope: ProjectScope;
  title: string;
  status: EditorialStatus;
  fps: FrameRate;
  revision: number;
}

export interface CinemaScene {
  sceneId: string;
  sequenceId: string;
  orderIndex: number;
  title: string;
  status: EditorialStatus;
  entities: EditorialEntity[];
  revision: number;
}

/**
 * Editorial shot. `shotId` is the EDITORIAL id; the canonical generation
 * job id lives only on the linked/selected take (`takeJobId`) and is
 * never renamed. This replaces the ambiguous legacy shot-job binding.
 */
export interface EditorialShot {
  shotId: string;
  sceneId: string;
  orderIndex: number;
  title: string;
  status: EditorialStatus;
  entities: EditorialEntity[];
  linkedTakeIds: string[];
  /** Selected editorial take id, or null. */
  selectedTakeId: string | null;
  /** Canonical JobId of the selected take's generation, or null. External id, never renamed. */
  selectedTakeJobId: string | null;
  revision: number;
}

export interface CinemaTake {
  takeId: string;
  scope: ProjectScope;
  /** Canonical generation JobId. One video job produces one shot; variants are explicit takes. */
  jobId: string;
  assetId: string;
  variantId: string | null;
  takeNumber: number;
  status: "accepted" | "rejected";
}
