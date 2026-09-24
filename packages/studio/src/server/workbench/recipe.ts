/** Studio V5 workbench — nondestructive edit recipe (STUDIO_14, server-only). */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { assertTicks } from "./timebase";
import { workbenchError } from "./types";
import type {
  CaptionCue,
  EditOp,
  SourceProbe,
  TimelineClip,
  TimelineRevision,
  TimelineTrack,
} from "./types";
import type { ProjectScope as Scope } from "../../contracts/scope";

export const TIMELINE_RECIPE_VERSION = 1;
export const MAX_TRACKS = 16;
export const MAX_CLIPS_PER_TRACK = 500;
export const GAIN_DB_MIN = -60;
export const GAIN_DB_MAX = 24;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Canonical JSON: sorted keys, no whitespace. Hash input for revisions. */
export function canonicalRecipeJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function hashRecipe(value: unknown): string {
  return createHash("sha256").update(canonicalRecipeJson(value)).digest("hex");
}

function probeKey(assetId: string, version: number): string {
  return `${assetId}:v${version}`;
}

function assertSourceRef(clip: TimelineClip): void {
  if (!Number.isInteger(clip.source.version) || clip.source.version <= 0) {
    throw workbenchError("BAD_REQUEST", "Clip must pin an exact asset version.", { clipId: clip.clipId });
  }
  if (!/^[0-9a-f]{64}$/i.test(clip.source.contentHash)) {
    throw workbenchError("BAD_REQUEST", "Clip must pin the exact source content hash.", { clipId: clip.clipId });
  }
}

/** Validate structural invariants of a track list (sorted, non-overlapping, bounded). */
export function assertTracksValid(tracks: TimelineTrack[]): void {
  if (tracks.length > MAX_TRACKS) {
    throw workbenchError("BAD_REQUEST", `Timeline supports at most ${MAX_TRACKS} tracks.`, {});
  }
  const seen = new Set<string>();
  for (const track of tracks) {
    if (track.clips.length > MAX_CLIPS_PER_TRACK) {
      throw workbenchError("BAD_REQUEST", "Track exceeds the clip limit.", { trackId: track.trackId });
    }
    let cursor = -1;
    for (const clip of track.clips) {
      if (seen.has(clip.clipId)) {
        throw workbenchError("BAD_REQUEST", "Duplicate clip id in timeline.", { clipId: clip.clipId });
      }
      seen.add(clip.clipId);
      assertSourceRef(clip);
      assertTicks(clip.sourceInTicks, "sourceInTicks");
      assertTicks(clip.timelineStartTicks, "timelineStartTicks");
      if (!Number.isInteger(clip.durationTicks) || clip.durationTicks <= 0) {
        throw workbenchError("BAD_REQUEST", "Clip duration must be measured integer ticks > 0.", {
          clipId: clip.clipId,
        });
      }
      if (clip.timelineStartTicks <= cursor) {
        throw workbenchError("BAD_REQUEST", "Clips must be sorted and non-overlapping.", {
          clipId: clip.clipId,
          trackId: track.trackId,
        });
      }
      cursor = clip.timelineStartTicks + clip.durationTicks - 1;
      if (clip.gainDb !== null && (typeof clip.gainDb !== "number" || clip.gainDb < GAIN_DB_MIN || clip.gainDb > GAIN_DB_MAX)) {
        throw workbenchError("BAD_REQUEST", `Gain must be within ${GAIN_DB_MIN}..${GAIN_DB_MAX} dB or null.`, {
          clipId: clip.clipId,
        });
      }
      if (clip.imageTransform?.crop) {
        const crop = clip.imageTransform.crop;
        for (const [name, v] of [["x", crop.x], ["y", crop.y], ["width", crop.width], ["height", crop.height]] as const) {
          if (!Number.isInteger(v) || v < 0) {
            throw workbenchError("BAD_REQUEST", `Crop ${name} must be an integer >= 0.`, { clipId: clip.clipId });
          }
        }
        if (crop.width === 0 || crop.height === 0) {
          throw workbenchError("BAD_REQUEST", "Crop must have nonzero size.", { clipId: clip.clipId });
        }
      }
      if (clip.imageTransform?.mask) {
        if (!/^[0-9a-f]{64}$/i.test(clip.imageTransform.mask.contentHash)) {
          throw workbenchError("BAD_REQUEST", "Mask must pin exact bytes.", { clipId: clip.clipId });
        }
      }
    }
  }
}

/** Validate caption cues (ordered, in-bounds, non-empty text). */
export function assertCaptionCuesValid(cues: CaptionCue[], timelineDurationTicks: number): void {
  let cursor = -1;
  for (const cue of cues) {
    assertTicks(cue.startTicks, "cue.startTicks");
    assertTicks(cue.endTicks, "cue.endTicks");
    if (cue.endTicks <= cue.startTicks) {
      throw workbenchError("BAD_REQUEST", "Caption cue must end after it starts.", { cueId: cue.cueId });
    }
    if (cue.startTicks < cursor) {
      throw workbenchError("BAD_REQUEST", "Caption cues must be ordered and non-overlapping.", { cueId: cue.cueId });
    }
    if (cue.endTicks > timelineDurationTicks) {
      throw workbenchError("BAD_REQUEST", "Caption cue extends past the timeline end.", { cueId: cue.cueId });
    }
    if (!cue.text.trim()) {
      throw workbenchError("BAD_REQUEST", "Caption cue text must be nonempty.", { cueId: cue.cueId });
    }
    cursor = cue.endTicks;
  }
}

export function timelineDurationTicks(revision: Pick<TimelineRevision, "tracks">): number {
  let end = 0;
  for (const track of revision.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.timelineStartTicks + clip.durationTicks);
    }
  }
  return end;
}

export interface CreateTimelineInput {
  timelineId?: string;
  scope: Scope;
  title: string;
  timebase: TimelineRevision["timebase"];
  fps: TimelineRevision["fps"];
  tracks?: TimelineTrack[];
  now?: string;
}

export function createTimelineRevision(input: CreateTimelineInput): TimelineRevision {
  if (!input.title.trim()) throw workbenchError("BAD_REQUEST", "Timeline title is required.", {});
  const timelineId = input.timelineId ?? randomUUID();
  if (!isUuid(timelineId)) throw workbenchError("BAD_REQUEST", "timelineId must be a UUID.", {});
  const tracks = input.tracks ?? [];
  assertTracksValid(tracks);
  const createdAt = input.now ?? new Date().toISOString();
  const recipe = { v: TIMELINE_RECIPE_VERSION, timelineId, revision: 1, tracks, captionTracks: [] };
  return {
    revisionId: randomUUID(),
    timelineId,
    scope: input.scope,
    revision: 1,
    parentRevision: null,
    title: input.title.trim(),
    timebase: input.timebase,
    fps: input.fps,
    tracks,
    captionTracks: [],
    hash: hashRecipe(recipe),
    createdAt,
    lockedBy: null,
  };
}

function cloneTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({ ...clip, source: { ...clip.source } })),
  }));
}

function findClip(tracks: TimelineTrack[], clipId: string): { track: TimelineTrack; clip: TimelineClip } {
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.clipId === clipId);
    if (clip) return { track, clip };
  }
  throw workbenchError("NOT_FOUND", "Clip is not on this timeline.", { clipId });
}

function sortTrack(track: TimelineTrack): void {
  track.clips.sort((a, b) => a.timelineStartTicks - b.timelineStartTicks);
}

/**
 * Apply one edit op to a revision, producing an immutable child revision.
 * Sources are never mutated: every op only rewrites recipe references,
 * and trims are validated against measured source bounds.
 */
export function applyEditOp(
  parent: TimelineRevision,
  op: EditOp,
  probes: ReadonlyMap<string, SourceProbe> | readonly SourceProbe[],
  opts?: { now?: string; actor?: string },
): TimelineRevision {
  if (parent.lockedBy && opts?.actor !== parent.lockedBy) {
    throw workbenchError("CONFLICT", "Timeline is locked by another editor.", { lockedBy: parent.lockedBy });
  }
  const probeMap: ReadonlyMap<string, SourceProbe> = Array.isArray(probes)
    ? new Map((probes as readonly SourceProbe[]).map((p) => [probeKey(p.assetId, p.version), p] as const))
    : (probes as ReadonlyMap<string, SourceProbe>);
  const tracks = cloneTracks(parent.tracks);
  const captionTracks = parent.captionTracks.map((t) => ({ ...t, cues: t.cues.map((c) => ({ ...c })) }));

  switch (op.kind) {
    case "trim": {
      const { track, clip } = findClip(tracks, op.clipId);
      void track;
      const probe = probeMap.get(probeKey(clip.source.assetId, clip.source.version));
      if (!probe || probe.durationTicks === null) {
        throw workbenchError("BAD_REQUEST", "Trim requires a measured source duration; unmeasured sources stay locked.", {
          clipId: op.clipId,
        });
      }
      const newIn = clip.sourceInTicks + op.inDeltaTicks;
      const newDuration = clip.durationTicks - op.inDeltaTicks + op.outDeltaTicks;
      if (newIn < 0 || newDuration <= 0 || newIn + newDuration > probe.durationTicks) {
        throw workbenchError("BAD_REQUEST", "Trim exceeds measured source bounds.", {
          clipId: op.clipId,
          sourceDurationTicks: probe.durationTicks,
        });
      }
      clip.sourceInTicks = newIn;
      clip.durationTicks = newDuration;
      clip.timelineStartTicks += op.inDeltaTicks;
      break;
    }
    case "split": {
      const { track, clip } = findClip(tracks, op.clipId);
      const offset = op.atTimelineTicks - clip.timelineStartTicks;
      if (!Number.isInteger(op.atTimelineTicks) || offset <= 0 || offset >= clip.durationTicks) {
        throw workbenchError("BAD_REQUEST", "Split point must be strictly inside the clip.", { clipId: op.clipId });
      }
      if (tracks.some((t) => t.clips.some((c) => c.clipId === op.newClipId))) {
        throw workbenchError("CONFLICT", "Split clip id already exists.", { newClipId: op.newClipId });
      }
      const right: TimelineClip = {
        ...clip,
        clipId: op.newClipId,
        source: { ...clip.source },
        sourceInTicks: clip.sourceInTicks + offset,
        durationTicks: clip.durationTicks - offset,
        timelineStartTicks: op.atTimelineTicks,
      };
      clip.durationTicks = offset;
      track.clips.push(right);
      sortTrack(track);
      break;
    }
    case "move": {
      const { track, clip } = findClip(tracks, op.clipId);
      const target = tracks.find((t) => t.trackId === op.toTrackId);
      if (!target) throw workbenchError("NOT_FOUND", "Target track is not on this timeline.", { toTrackId: op.toTrackId });
      if (target.kind === "caption") {
        throw workbenchError("BAD_REQUEST", "Clips cannot move onto a caption track.", { toTrackId: op.toTrackId });
      }
      assertTicks(op.toStartTicks, "toStartTicks");
      track.clips = track.clips.filter((c) => c.clipId !== op.clipId);
      clip.trackId = target.trackId;
      clip.timelineStartTicks = op.toStartTicks;
      target.clips.push(clip);
      sortTrack(target);
      break;
    }
    case "gain": {
      const { track, clip } = findClip(tracks, op.clipId);
      if (track.kind !== "audio") {
        throw workbenchError("BAD_REQUEST", "Gain applies to audio-track clips only.", { clipId: op.clipId });
      }
      if (op.gainDb !== null && (typeof op.gainDb !== "number" || op.gainDb < GAIN_DB_MIN || op.gainDb > GAIN_DB_MAX)) {
        throw workbenchError("BAD_REQUEST", `Gain must be within ${GAIN_DB_MIN}..${GAIN_DB_MAX} dB or null.`, {
          clipId: op.clipId,
        });
      }
      clip.gainDb = op.gainDb;
      break;
    }
    case "caption-attach": {
      const { clip } = findClip(tracks, op.clipId);
      if (op.captionTrackId !== null && !captionTracks.some((t) => t.captionTrackId === op.captionTrackId)) {
        throw workbenchError("NOT_FOUND", "Caption track is not on this timeline.", {
          captionTrackId: op.captionTrackId,
        });
      }
      clip.captionTrackId = op.captionTrackId;
      break;
    }
    case "image-transform": {
      const { track, clip } = findClip(tracks, op.clipId);
      if (track.kind !== "video") {
        throw workbenchError("BAD_REQUEST", "Image transforms apply to video-track clips only.", { clipId: op.clipId });
      }
      clip.imageTransform = op.transform
        ? { crop: op.transform.crop ? { ...op.transform.crop } : null, mask: op.transform.mask ? { ...op.transform.mask } : null }
        : null;
      break;
    }
    case "caption-cue": {
      const caption = captionTracks.find((t) => t.captionTrackId === op.captionTrackId);
      if (!caption) throw workbenchError("NOT_FOUND", "Caption track is not on this timeline.", { captionTrackId: op.captionTrackId });
      if (op.cue === null) {
        caption.cues = caption.cues.filter((c) => c.cueId !== op.cueId);
      } else {
        if (op.cue.cueId !== op.cueId) {
          throw workbenchError("BAD_REQUEST", "Caption cue id mismatch.", { cueId: op.cueId });
        }
        caption.cues = [...caption.cues.filter((c) => c.cueId !== op.cueId), { ...op.cue }];
        caption.cues.sort((a, b) => a.startTicks - b.startTicks);
      }
      break;
    }
    default: {
      const never: never = op;
      throw workbenchError("BAD_REQUEST", "Unknown edit op.", { op: (never as EditOp).kind });
    }
  }

  assertTracksValid(tracks);
  const duration = timelineDurationTicks({ tracks });
  for (const caption of captionTracks) assertCaptionCuesValid(caption.cues, duration);

  const revision = parent.revision + 1;
  const recipe = {
    v: TIMELINE_RECIPE_VERSION,
    timelineId: parent.timelineId,
    revision,
    parentHash: parent.hash,
    tracks,
    captionTracks,
  };
  return {
    revisionId: randomUUID(),
    timelineId: parent.timelineId,
    scope: parent.scope,
    revision,
    parentRevision: parent.revision,
    title: parent.title,
    timebase: parent.timebase,
    fps: parent.fps,
    tracks,
    captionTracks,
    hash: hashRecipe(recipe),
    createdAt: opts?.now ?? new Date().toISOString(),
    lockedBy: parent.lockedBy,
  };
}
