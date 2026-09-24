/**
 * Studio V2 Job 07 — FCPXML timeline handoff builder.
 * Pure XML over pinned video takes with known durations: resources reference
 * stable studio object keys (resolved by Studio, never expiring signed URLs)
 * and the sidecar manifest maps every reference to a content hash.
 * Only clips with measured durations are admitted — holds and estimates are
 * never invented, so image inputs and unknown-duration takes are rejected
 * with explicit reasons.
 */

export interface FcpxmlTimebase {
  fps: number;
}

export interface FcpxmlClipInput {
  assetId: string;
  objectKey: string;
  contentHash: string;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  name: string;
}

export interface FcpxmlInput {
  timelineName: string;
  timebase: FcpxmlTimebase;
  clips: FcpxmlClipInput[];
}

const SUPPORTED_FPS = new Set([24, 25, 30, 60]);

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function secondsToFcpTime(seconds: number, fps: number): string {
  const frames = Math.round(seconds * fps);
  return `${frames}/${fps}s`;
}

/** Build a deterministic FCPXML 1.10 document. Throws on unmeasurable inputs. */
export function buildFcpxmlDocument(input: FcpxmlInput): string {
  if (!SUPPORTED_FPS.has(input.timebase.fps)) {
    throw new Error(`EXPORT_FCPXML_INVALID: unsupported timebase fps ${input.timebase.fps}; supported: 24, 25, 30, 60.`);
  }
  if (input.clips.length === 0) throw new Error("EXPORT_FCPXML_INVALID: at least one clip is required.");
  const fps = input.timebase.fps;
  let cursor = 0;
  const resources: string[] = [];
  const spine: string[] = [];
  input.clips.forEach((clip, index) => {
    if (!clip.objectKey) throw new Error(`EXPORT_FCPXML_INVALID: clip ${index} has no owned object.`);
    if (!Number.isFinite(clip.durationSeconds) || clip.durationSeconds <= 0) {
      throw new Error(`EXPORT_FCPXML_INVALID: clip ${index} has no measured duration.`);
    }
    if (!/^[0-9a-f]{64}$/i.test(clip.contentHash ?? "")) {
      throw new Error(`EXPORT_FCPXML_INVALID: clip ${index} has no content hash.`);
    }
    const id = ` clip-${index + 1}`;
    const duration = secondsToFcpTime(clip.durationSeconds, fps);
    const offset = secondsToFcpTime(cursor, fps);
    resources.push(
      `    <asset id="a${index + 1}" name="${escapeXml(clip.name)}" uid="${escapeXml(clip.assetId)}" start="0s" duration="${duration}" hasVideo="1" format="r1" videoSources="1">\n` +
      `      <media-rep kind="original-media" src="studio-object:${escapeXml(clip.objectKey)}" />\n` +
      `    </asset>`,
    );
    spine.push(`        <asset-clip ref="a${index + 1}" offset="${offset}" name="${escapeXml(clip.name)}" duration="${duration}" tcFormat="NDF">${id.trim()}</asset-clip>`);
    cursor += clip.durationSeconds;
  });
  const total = secondsToFcpTime(cursor, fps);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<fcpxml version="1.10">\n` +
    `  <resources>\n` +
    `    <format id="r1" name="FFVideoFormat${fps}" frameDuration="1/${fps}s" fieldOrder="progressive" />\n` +
    `${resources.join("\n")}\n` +
    `  </resources>\n` +
    `  <library>\n` +
    `    <event name="${escapeXml(input.timelineName)}">\n` +
    `      <project name="${escapeXml(input.timelineName)}">\n` +
    `        <sequence format="r1" duration="${total}" tcStart="0s">\n` +
    `          <spine>\n` +
    `${spine.join("\n")}\n` +
    `          </spine>\n` +
    `        </sequence>\n` +
    `      </project>\n` +
    `    </event>\n` +
    `  </library>\n` +
    `</fcpxml>\n`
  );
}
