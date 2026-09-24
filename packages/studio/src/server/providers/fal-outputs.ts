/**
 * Studio V5 providers — fal output normalization (STUDIO M4). Pure.
 *
 * Maps queue result payloads onto provider output descriptors by canonical
 * task. Endpoint variance lives in the documented shape list, not in
 * per-model code: images[]/image for image tasks, video for video tasks,
 * audio for speech/audio/music tasks, mesh/model_mesh for mesh tasks, with
 * an `output` unwrap for nested results. URLs must be https except under
 * an explicit fixture allowance (loopback test servers only). Empty or
 * unshaped results throw — never an empty success.
 */
import type { TaskName } from "../../contracts/tasks";
import type { ProviderOutputDescriptor } from "../ports/provider-adapter";

export type FalOutputFamily = "image" | "video" | "audio" | "mesh";

export function outputFamilyForTask(task: TaskName): FalOutputFamily | null {
  switch (task) {
    case "image.generate":
    case "image.edit":
      return "image";
    case "video.generate":
    case "video.edit":
      return "video";
    case "speech.synthesize":
    case "speech.transcribe":
    case "audio.generate":
    case "music.generate":
      return "audio";
    case "mesh.generate":
      return "mesh";
    default:
      return null;
  }
}

const EXTENSION_MEDIA: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
};

const FAMILY_DEFAULT_MEDIA: Readonly<Record<FalOutputFamily, string>> = {
  image: "image/png",
  video: "video/mp4",
  audio: "audio/mpeg",
  mesh: "model/gltf-binary",
};

function mediaForUrl(url: string, family: FalOutputFamily, declared: unknown): string {
  if (typeof declared === "string" && declared.includes("/")) return declared;
  const path = url.split("?")[0] ?? "";
  const dot = path.lastIndexOf(".");
  if (dot >= 0) {
    const ext = path.slice(dot).toLowerCase();
    const mapped = EXTENSION_MEDIA[ext];
    if (mapped) return mapped;
  }
  return FAMILY_DEFAULT_MEDIA[family];
}

function assertOutputUrl(url: unknown, allowInsecure: boolean): string {
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("STUDIO_FAL_OUTPUT_INVALID: provider output has no URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("STUDIO_FAL_OUTPUT_INVALID: provider output URL is not a URL.");
  }
  if (parsed.protocol === "https:") return url;
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  if (allowInsecure && parsed.protocol === "http:" && loopback) return url;
  throw new Error("STUDIO_FAL_OUTPUT_INVALID: provider output URL must be https.");
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function descriptorFor(
  entry: unknown,
  family: FalOutputFamily,
  allowInsecure: boolean,
): ProviderOutputDescriptor {
  const row = (entry ?? {}) as Record<string, unknown>;
  const providerUrl = assertOutputUrl(row.url, allowInsecure);
  const byteSize = integerOrNull(row.file_size ?? row.bytes ?? row.size);
  const expiresAt = typeof row.expires_at === "string" ? row.expires_at : null;
  return {
    providerUrl,
    mediaType: mediaForUrl(providerUrl, family, row.content_type ?? row.mime_type),
    byteSize,
    expiresAt,
  };
}

function unwrapResult(result: unknown): Record<string, unknown> {
  const row = (result ?? {}) as Record<string, unknown>;
  const nested = row.output;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...row, ...(nested as Record<string, unknown>) };
  }
  return row;
}

/**
 * Normalize a queue result payload for a canonical task. Throws
 * STUDIO_FAL_OUTPUT_INVALID when the payload carries no outputs in the
 * task's documented shapes.
 */
export function normalizeFalOutputs(
  task: TaskName,
  result: unknown,
  options?: { allowInsecure?: boolean },
): readonly ProviderOutputDescriptor[] {
  const family = outputFamilyForTask(task);
  if (!family) {
    throw new Error(`STUDIO_FAL_OUTPUT_INVALID: task ${task} has no fal output mapping.`);
  }
  const allowInsecure = options?.allowInsecure === true;
  const row = unwrapResult(result);
  const entries: unknown[] = [];
  if (family === "image") {
    if (Array.isArray(row.images)) entries.push(...row.images);
    if (row.image && typeof row.image === "object") entries.push(row.image);
  } else if (family === "video") {
    if (row.video && typeof row.video === "object") entries.push(row.video);
    if (Array.isArray(row.videos)) entries.push(...row.videos);
  } else if (family === "audio") {
    if (row.audio && typeof row.audio === "object") entries.push(row.audio);
    if (Array.isArray(row.audios)) entries.push(...row.audios);
  } else {
    if (row.mesh && typeof row.mesh === "object") entries.push(row.mesh);
    if (row.model_mesh && typeof row.model_mesh === "object") entries.push(row.model_mesh);
  }
  if (entries.length === 0) {
    throw new Error(`STUDIO_FAL_OUTPUT_INVALID: queue result carries no ${family} outputs.`);
  }
  return entries.map((entry) => descriptorFor(entry, family, allowInsecure));
}
