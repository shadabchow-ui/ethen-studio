/** Studio V5 media — OTIO/FCPXML interchange adapters (STUDIO_07, server-only). */
import "server-only";
import { mediaError } from "./types";

export interface InterchangeClip {
  assetId: string;
  version: number;
  /** Pinned sha256 of the exact bytes referenced. Required. */
  contentHash: string;
  /** Source in-point in integer ms. */
  sourceInMs: number;
  /** Clip duration in integer ms. Must be measured, never estimated. */
  durationMs: number;
  name: string;
  width: number | null;
  height: number | null;
}

export interface InterchangeTimeline {
  name: string;
  /** Rational frame rate as num/den (e.g. 30000/1001). */
  fpsNum: number;
  fpsDen: number;
  clips: readonly InterchangeClip[];
}

export interface InterchangeBuild {
  document: string;
  format: "otio" | "fcpxml";
  /** Explicit unsupported-feature warnings. A lossless roundtrip is never claimed. */
  warnings: readonly string[];
}

function assertTimeline(timeline: InterchangeTimeline, format: string): void {
  if (!timeline || typeof timeline.name !== "string" || timeline.name.length === 0) {
    throw mediaError("BAD_REQUEST", `${format}: timeline name is required.`, {});
  }
  if (!Number.isInteger(timeline.fpsNum) || !Number.isInteger(timeline.fpsDen) || timeline.fpsNum <= 0 || timeline.fpsDen <= 0) {
    throw mediaError("BAD_REQUEST", `${format}: fps must be a positive rational fpsNum/fpsDen.`, {});
  }
  if (!Array.isArray(timeline.clips) || timeline.clips.length === 0) {
    throw mediaError("BAD_REQUEST", `${format}: at least one clip is required.`, {});
  }
  for (let i = 0; i < timeline.clips.length; i += 1) {
    const clip = timeline.clips[i];
    if (!/^[0-9a-f]{64}$/i.test(clip.contentHash)) {
      throw mediaError("BAD_REQUEST", `${format}: clip content hash must pin exact bytes.`, { index: i });
    }
    if (!Number.isInteger(clip.sourceInMs) || clip.sourceInMs < 0) {
      throw mediaError("BAD_REQUEST", `${format}: clip sourceInMs must be integer ms.`, { index: i });
    }
    if (!Number.isInteger(clip.durationMs) || clip.durationMs <= 0) {
      throw mediaError("BAD_REQUEST", `${format}: clip duration must be measured integer ms.`, { index: i });
    }
    if (!Number.isInteger(clip.version) || clip.version <= 0) {
      throw mediaError("BAD_REQUEST", `${format}: clip must pin an exact asset version.`, { index: i });
    }
  }
}

/**
 * Build an OTIO (OpenTimelineIO JSON) document for the known V1 subset:
 * single video track, sequential file clips with measured durations.
 * Transitions, effects, nested timelines, and audio mixing are unsupported
 * and reported as warnings — never silently dropped.
 */
export function buildOtioDocument(
  timeline: InterchangeTimeline,
  opts?: { unsupportedFeatures?: readonly string[] },
): InterchangeBuild {
  assertTimeline(timeline, "OTIO");
  const fps = timeline.fpsNum / timeline.fpsDen;
  const warnings = [
    "OTIO export covers the V1 subset only: single video track, straight cuts, file clips.",
    ...(opts?.unsupportedFeatures ?? []).map((f) => `Unsupported feature omitted from OTIO: ${f}.`),
  ];
  let cursorFrames = 0;
  const children = timeline.clips.map((clip) => {
    const durationFrames = Math.round((clip.durationMs / 1000) * fps);
    const startFrames = Math.round((clip.sourceInMs / 1000) * fps);
    const node = {
      OTIO_SCHEMA: "Clip.1",
      name: clip.name,
      source_range: {
        OTIO_SCHEMA: "TimeRange.1",
        start_time: { OTIO_SCHEMA: "RationalTime.1", rate: fps, value: startFrames },
        duration: { OTIO_SCHEMA: "RationalTime.1", rate: fps, value: durationFrames },
      },
      media_reference: {
        OTIO_SCHEMA: "ExternalReference.1",
        target_url: `studio://asset/${clip.assetId}/v${clip.version}`,
        metadata: { studioContentHash: clip.contentHash },
      },
      timeline_offset_frames: cursorFrames,
    };
    cursorFrames += durationFrames;
    return node;
  });
  const document = {
    OTIO_SCHEMA: "Timeline.1",
    name: timeline.name,
    metadata: { studioFpsNum: timeline.fpsNum, studioFpsDen: timeline.fpsDen },
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      children: [
        {
          OTIO_SCHEMA: "Track.1",
          name: "V1",
          kind: "Video",
          children,
        },
      ],
    },
  };
  return { document: JSON.stringify(document), format: "otio", warnings };
}

/**
 * Parse the known OTIO subset back. Unknown nodes/effects/transitions yield
 * warnings; durations come only from measured RationalTime values.
 */
export function parseOtioDocument(json: string): { timeline: InterchangeTimeline; warnings: readonly string[] } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw mediaError("BAD_REQUEST", "OTIO: document is not valid JSON.", {});
  }
  if (parsed.OTIO_SCHEMA !== "Timeline.1") {
    throw mediaError("BAD_REQUEST", "OTIO: only Timeline.1 documents are supported.", {});
  }
  const metadata = (parsed.metadata ?? {}) as Record<string, unknown>;
  const fpsNum = metadata.studioFpsNum;
  const fpsDen = metadata.studioFpsDen;
  if (!Number.isInteger(fpsNum) || !Number.isInteger(fpsDen)) {
    throw mediaError("BAD_REQUEST", "OTIO: Studio fps metadata is required for exact frame mapping.", {});
  }
  const fps = (fpsNum as number) / (fpsDen as number);
  const warnings: string[] = [];
  const tracks = parsed.tracks as Record<string, unknown> | undefined;
  const stack = (tracks?.children ?? []) as Array<Record<string, unknown>>;
  if (stack.length !== 1) warnings.push(`OTIO import: ${stack.length} tracks found; only the first video track is read.`);
  const first = stack[0] as Record<string, unknown> | undefined;
  const children = (first?.children ?? []) as Array<Record<string, unknown>>;
  const clips: InterchangeClip[] = [];
  for (const child of children) {
    if (child.OTIO_SCHEMA !== "Clip.1") {
      warnings.push(`OTIO import: unsupported node '${String(child.OTIO_SCHEMA)}' skipped (no lossless roundtrip).`);
      continue;
    }
    const range = child.source_range as Record<string, unknown> | undefined;
    const start = range?.start_time as Record<string, unknown> | undefined;
    const duration = range?.duration as Record<string, unknown> | undefined;
    if (typeof start?.value !== "number" || typeof duration?.value !== "number" || (duration.value as number) <= 0) {
      throw mediaError("BAD_REQUEST", "OTIO: clip has no measured duration; holds are never invented.", {});
    }
    const ref = child.media_reference as Record<string, unknown> | undefined;
    const target = typeof ref?.target_url === "string" ? (ref.target_url as string) : "";
    const match = /^studio:\/\/asset\/([^/]+)\/v(\d+)$/.exec(target);
    if (!match) throw mediaError("BAD_REQUEST", "OTIO: clip reference is not a pinned Studio asset.", { target });
    const meta = (ref?.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.studioContentHash !== "string" || !/^[0-9a-f]{64}$/i.test(meta.studioContentHash as string)) {
      throw mediaError("BAD_REQUEST", "OTIO: clip is missing its pinned content hash.", {});
    }
    clips.push({
      assetId: match[1],
      version: Number(match[2]),
      contentHash: meta.studioContentHash as string,
      sourceInMs: Math.round(((start.value as number) / fps) * 1000),
      durationMs: Math.round(((duration.value as number) / fps) * 1000),
      name: typeof child.name === "string" ? (child.name as string) : "clip",
      width: null,
      height: null,
    });
  }
  if (clips.length === 0) throw mediaError("BAD_REQUEST", "OTIO: no supported clips found.", {});
  const timeline: InterchangeTimeline = {
    name: typeof parsed.name === "string" ? (parsed.name as string) : "timeline",
    fpsNum: fpsNum as number,
    fpsDen: fpsDen as number,
    clips,
  };
  return { timeline, warnings };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function msToFcpTime(ms: number, fps: number): string {
  return `${Math.round((ms / 1000) * fps)}/${fps}s`;
}

/**
 * Build a deterministic FCPXML 1.10 document. Resource references are stable
 * Studio object locators resolved by Studio, never expiring signed URLs.
 * Only measured-duration clips are admitted.
 */
export function buildFcpxmlDocument(
  timeline: InterchangeTimeline,
  resources: Readonly<Record<string, { objectKey: string }>>,
  opts?: { unsupportedFeatures?: readonly string[] },
): InterchangeBuild {
  assertTimeline(timeline, "FCPXML");
  const fps = timeline.fpsNum / timeline.fpsDen;
  const warnings = [
    "FCPXML export covers the V1 subset only: single storyline, straight cuts, file clips.",
    ...(opts?.unsupportedFeatures ?? []).map((f) => `Unsupported feature omitted from FCPXML: ${f}.`),
  ];
  const assetEls: string[] = [];
  const clipEls: string[] = [];
  let cursorMs = 0;
  timeline.clips.forEach((clip, index) => {
    const resource = resources[`${clip.assetId}:v${clip.version}`];
    if (!resource) {
      throw mediaError("BAD_REQUEST", "FCPXML: every clip needs a resolved Studio object locator.", {
        assetId: clip.assetId,
        version: clip.version,
      });
    }
    const id = `r${index + 1}`;
    assetEls.push(
      `    <asset id="${id}" name="${escapeXml(clip.name)}" src="studio://${escapeXml(resource.objectKey)}" duration="${msToFcpTime(clip.durationMs, fps)}" hasVideo="1">` +
        `<metadata><md key="studio.contentHash" value="${escapeXml(clip.contentHash)}"/>` +
        `<md key="studio.asset" value="${escapeXml(clip.assetId)} v${clip.version}"/></metadata></asset>`,
    );
    clipEls.push(
      `          <clip name="${escapeXml(clip.name)}" offset="${msToFcpTime(cursorMs, fps)}" duration="${msToFcpTime(clip.durationMs, fps)}" start="${msToFcpTime(clip.sourceInMs, fps)}">` +
        `<video ref="${id}"/></clip>`,
    );
    cursorMs += clip.durationMs;
  });
  const total = msToFcpTime(cursorMs, fps);
  const document =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<fcpxml version="1.10">\n` +
    `  <resources>\n    <format id="f1" name="FFVideoFormat${timeline.fpsNum}/${timeline.fpsDen}" frameDuration="${timeline.fpsDen}/${timeline.fpsNum}s"/>\n` +
    `${assetEls.join("\n")}\n  </resources>\n` +
    `  <library><event name="${escapeXml(timeline.name)}"><project name="${escapeXml(timeline.name)}">` +
    `<sequence format="f1" duration="${total}"><spine>${clipEls.join("")}</spine></sequence>` +
    `</project></event></library>\n</fcpxml>\n`;
  return { document, format: "fcpxml", warnings };
}
