/** Studio V5 workbench — deterministic timeline.render submission (STUDIO_14, server-only). */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { ticksToMs } from "./timebase";
import { canonicalRecipeJson, timelineDurationTicks } from "./recipe";
import { workbenchError } from "./types";
import type { RenderSpec, RenderSubmission, SourceProbe, TimelineRevision } from "./types";
import type { ProjectScope } from "../../contracts/scope";

export const TIMELINE_RENDER_TASK = "timeline.render" as const;
export const TIMELINE_RENDER_TASK_VERSION = "1.0.0";

const OUTPUT_WIDTHS = [640, 960, 1280, 1920, 3840];
const OUTPUT_HEIGHTS = [360, 540, 720, 1080, 2160];

export function assertRenderSpec(spec: RenderSpec): void {
  if (!/^[0-9a-f]{64}$/i.test(spec.revisionHash)) {
    throw workbenchError("BAD_REQUEST", "Render spec must pin the exact revision hash.", {});
  }
  if (!Number.isInteger(spec.revision) || spec.revision <= 0) {
    throw workbenchError("BAD_REQUEST", "Render spec revision must be a positive integer.", {});
  }
  if (spec.output.container !== "mp4" || spec.output.videoCodec !== "h264") {
    throw workbenchError("BAD_REQUEST", "V1 renders are mp4/h264 only (SDR/BT.709).", {});
  }
  if (!OUTPUT_WIDTHS.includes(spec.output.width) || !OUTPUT_HEIGHTS.includes(spec.output.height)) {
    throw workbenchError("BAD_REQUEST", "Render dimensions must be a supported V1 size.", {
      width: spec.output.width,
      height: spec.output.height,
    });
  }
  if (spec.output.audioCodec !== "aac" && spec.output.audioCodec !== "none") {
    throw workbenchError("BAD_REQUEST", "Render audio must be aac or none.", {});
  }
  if (!["none", "otio", "fcpxml"].includes(spec.interchange)) {
    throw workbenchError("BAD_REQUEST", "Unknown interchange format.", { interchange: spec.interchange });
  }
}

/**
 * Deterministic idempotency key for a revision + spec pair. Rerendering
 * the same immutable revision with the same spec replays the same render;
 * any recipe/spec difference yields a different key.
 */
export function renderIdempotencyKey(revisionHash: string, spec: RenderSpec["output"] & { interchange: RenderSpec["interchange"] }): string {
  const digest = createHash("sha256").update(canonicalRecipeJson({ revisionHash, spec })).digest("hex").slice(0, 32);
  return `timeline-render-${digest}`;
}

export interface RenderSubmissionInput {
  scope: ProjectScope;
  revision: TimelineRevision;
  output: RenderSpec["output"];
  interchange?: RenderSpec["interchange"];
  idempotencyKey?: string;
  now?: string;
}

/**
 * Build the deterministic timeline.render submission envelope. The j14
 * contract owns the envelope (task pin, idempotency key, request hash);
 * durable admission/execution stays with the shared runtime (j05) and
 * rendering/interchange with media (j07).
 */
export function buildRenderSubmission(input: RenderSubmissionInput): RenderSubmission {
  const duration = timelineDurationTicks(input.revision);
  if (duration <= 0) {
    throw workbenchError("BAD_REQUEST", "Cannot render an empty timeline.", { timelineId: input.revision.timelineId });
  }
  const interchange = input.interchange ?? "none";
  const spec: RenderSpec = {
    timelineId: input.revision.timelineId,
    revision: input.revision.revision,
    revisionHash: input.revision.hash,
    output: { ...input.output },
    interchange,
    idempotencyKey: input.idempotencyKey ?? null,
  };
  assertRenderSpec(spec);
  const idempotencyKey = spec.idempotencyKey ?? renderIdempotencyKey(spec.revisionHash, { ...spec.output, interchange });
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
    throw workbenchError("BAD_REQUEST", "Render idempotency key must be 8-128 chars.", {});
  }
  const requestHash = createHash("sha256")
    .update(
      canonicalRecipeJson({
        task: TIMELINE_RENDER_TASK,
        taskVersion: TIMELINE_RENDER_TASK_VERSION,
        timelineId: spec.timelineId,
        revisionHash: spec.revisionHash,
        output: spec.output,
        interchange: spec.interchange,
      }),
    )
    .digest("hex");
  return {
    renderId: randomUUID(),
    scope: input.scope,
    spec,
    idempotencyKey,
    requestHash,
    task: TIMELINE_RENDER_TASK,
    status: "QUEUED",
    createdAt: input.now ?? new Date().toISOString(),
  };
}

export interface RenderInterchangeClip {
  assetId: string;
  version: number;
  contentHash: string;
  sourceInMs: number;
  durationMs: number;
  name: string;
  width: number | null;
  height: number | null;
}

/**
 * Map a revision's first video track to the j07 InterchangeTimeline clip
 * shape (integer ms from integer ticks). Multi-track, gain, caption and
 * transform features beyond the V1 subset are reported as unsupported —
 * the Studio renderer owns the mapping; this function only prepares it.
 */
export function toInterchangeClips(
  revision: TimelineRevision,
  probes: ReadonlyMap<string, SourceProbe> | readonly SourceProbe[],
): { clips: RenderInterchangeClip[]; unsupportedFeatures: string[] } {
  const probeMap: ReadonlyMap<string, SourceProbe> = Array.isArray(probes)
    ? new Map((probes as readonly SourceProbe[]).map((p) => [`${p.assetId}:v${p.version}`, p] as const))
    : (probes as ReadonlyMap<string, SourceProbe>);
  const unsupported: string[] = [];
  const videoTracks = revision.tracks.filter((t) => t.kind === "video");
  if (videoTracks.length > 1) unsupported.push(`${videoTracks.length} video tracks (single-track V1 subset)`);
  if (revision.tracks.some((t) => t.kind === "audio")) unsupported.push("audio mix");
  if (revision.captionTracks.length > 0) unsupported.push("captions");
  const clips: RenderInterchangeClip[] = [];
  const first = videoTracks[0];
  if (!first || first.clips.length === 0) {
    throw workbenchError("BAD_REQUEST", "Interchange export needs at least one video clip.", {
      timelineId: revision.timelineId,
    });
  }
  first.clips.forEach((clip, index) => {
    const probe = probeMap.get(`${clip.source.assetId}:v${clip.source.version}`);
    if (!probe || probe.durationTicks === null) {
      throw workbenchError("BAD_REQUEST", "Interchange clips need measured source durations.", { clipId: clip.clipId });
    }
    if (clip.imageTransform) unsupported.push(`clip ${clip.clipId} image transform`);
    clips.push({
      assetId: clip.source.assetId,
      version: clip.source.version,
      contentHash: clip.source.contentHash,
      sourceInMs: ticksToMs(clip.sourceInTicks, revision.timebase),
      durationMs: ticksToMs(clip.durationTicks, revision.timebase),
      name: `clip-${index + 1}`,
      width: probe.width,
      height: probe.height,
    });
  });
  return { clips, unsupportedFeatures: [...new Set(unsupported)] };
}
