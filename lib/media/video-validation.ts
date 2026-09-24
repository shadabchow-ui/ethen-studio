/**
 * Studio V2 Job 04 — video technical validation.
 * Parses ISO BMFF (mp4) boxes directly: ftyp brand, moov/mvhd duration,
 * tkhd dimensions. No ffmpeg in the runtime, so decodability beyond a
 * well-formed container is reported as unknown — never faked.
 * Full decode certification belongs to a later slice with media tooling.
 */

export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export interface VideoTechnicalReport {
  container: "mp4" | "unknown";
  brand: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  byteSize: number;
  /** Container-wellformed only; frame decode is not verified here. */
  decodeVerified: false;
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

interface Box { type: string; start: number; end: number; headerSize: number }

function readBox(view: DataView, bytes: Uint8Array, offset: number): Box | null {
  if (offset + 8 > bytes.byteLength) return null;
  let size = readU32(view, offset);
  const type = readAscii(bytes, offset + 4, 4);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > bytes.byteLength) return null;
    const high = readU32(view, offset + 8);
    const low = readU32(view, offset + 12);
    if (high > 0) return null;
    size = low;
    headerSize = 16;
  } else if (size === 0) {
    size = bytes.byteLength - offset;
  }
  if (size < headerSize || offset + size > bytes.byteLength) return null;
  return { type, start: offset, end: offset + size, headerSize };
}

function childBoxes(view: DataView, bytes: Uint8Array, box: Box): Box[] {
  const out: Box[] = [];
  let offset = box.start + box.headerSize;
  // mvhd/tkhd carry 4 version/flags bytes before their fields when nested scan needs them;
  // full-box bodies are handled by callers, so children start after the header here.
  // moov/trak/mdia/minf/dinf/stbl/edts carry no version header.
  while (offset + 8 <= box.end) {
    const child = readBox(view, bytes, offset);
    if (!child) break;
    out.push(child);
    offset = child.end;
  }
  return out;
}

/** Validate generated/downloaded video bytes. Throws VIDEO_VALIDATION_* on rejection. */
export function validateVideoBytes(bytes: Uint8Array, contentType: string): VideoTechnicalReport {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error("VIDEO_VALIDATION_INVALID: video bytes are empty.");
  }
  if (bytes.byteLength > VIDEO_MAX_BYTES) {
    throw new Error("VIDEO_VALIDATION_INVALID: video exceeds the 100MB Studio limit.");
  }
  if (!/^video\/(mp4|quicktime)$/i.test(contentType.trim())) {
    throw new Error(`VIDEO_VALIDATION_INVALID: unsupported video content type ${contentType}.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = readBox(view, bytes, 0);
  if (!top || top.type !== "ftyp") {
    throw new Error("VIDEO_VALIDATION_INVALID: missing ftyp box; not a well-formed mp4 container.");
  }
  const brand = readAscii(bytes, top.start + 8, 4);
  const report: VideoTechnicalReport = {
    container: "mp4", brand, durationSeconds: null, width: null, height: null,
    byteSize: bytes.byteLength, decodeVerified: false,
  };
  // Walk top-level boxes for moov, then mvhd duration + first video tkhd dims.
  let offset = 0;
  while (offset + 8 <= bytes.byteLength) {
    const box = readBox(view, bytes, offset);
    if (!box) break;
    if (box.type === "moov") {
      parseMoov(view, bytes, box, report);
      break;
    }
    offset = box.end;
    // Bound the scan: moov for generated clips sits near the head.
    if (offset > 8 * 1024 * 1024) break;
  }
  return report;
}

function parseMoov(view: DataView, bytes: Uint8Array, moov: Box, report: VideoTechnicalReport): void {
  for (const child of childBoxes(view, bytes, moov)) {
    if (child.type === "mvhd") parseMvhd(view, bytes, child, report);
    if (child.type === "trak" && (report.width === null || report.height === null)) parseTrak(view, bytes, child, report);
  }
}

function parseMvhd(view: DataView, bytes: Uint8Array, mvhd: Box, report: VideoTechnicalReport): void {
  const body = mvhd.start + mvhd.headerSize;
  if (body + 4 > mvhd.end) return;
  const version = bytes[body] ?? 0;
  try {
    if (version === 1) {
      if (body + 28 > mvhd.end) return;
      const timescale = readU32(view, body + 20);
      const duration = Number(view.getBigUint64(body + 24, false));
      if (timescale > 0) report.durationSeconds = duration / timescale;
    } else {
      if (body + 20 > mvhd.end) return;
      const timescale = readU32(view, body + 12);
      const duration = readU32(view, body + 16);
      if (timescale > 0) report.durationSeconds = duration / timescale;
    }
  } catch {
    // Partial mvhd: duration stays unknown rather than failing the clip.
  }
}

function parseTrak(view: DataView, bytes: Uint8Array, trak: Box, report: VideoTechnicalReport): void {
  for (const child of childBoxes(view, bytes, trak)) {
    if (child.type !== "tkhd") continue;
    const body = child.start + child.headerSize;
    if (body + 4 > child.end) return;
    const version = bytes[body] ?? 0;
    // tkhd fixed-point 16.16 width/height sit at the tail: v0 +76, v1 +88.
    const field = version === 1 ? body + 88 : body + 76;
    if (field + 8 > child.end) return;
    try {
      const width = readU32(view, field) / 65536;
      const height = readU32(view, field + 4) / 65536;
      if (width > 0 && width <= 16384 && height > 0 && height <= 16384) {
        report.width = Math.floor(width);
        report.height = Math.floor(height);
      }
    } catch {
      // Partial tkhd: dims stay unknown.
    }
    return;
  }
}
