import "server-only";

import { createHash } from "node:crypto";
import { extname } from "node:path";

export const MEDIA_UPLOAD_DURABILITY_LABEL = "private project object storage";
export const MEDIA_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const MEDIA_UPLOAD_RETENTION_DAYS = 30;

const POLICY: Record<string, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
};

export type StudioUploadMetadata = {
  sha256: string;
  mimeType: keyof typeof POLICY;
  extension: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

export class StudioUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioUploadValidationError";
  }
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) * 2 ** 24) + ((bytes[offset + 1] ?? 0) * 2 ** 16) + ((bytes[offset + 2] ?? 0) * 2 ** 8) + (bytes[offset + 3] ?? 0);
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (!length || offset + 2 + length > bytes.length) return null;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] };
    }
    offset += 2 + length;
  }
  return null;
}

function imageMetadata(bytes: Uint8Array, mimeType: string): Pick<StudioUploadMetadata, "width" | "height"> {
  if (mimeType === "image/png" && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && bytes.length >= 24) {
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
  }
  if (mimeType === "image/jpeg" && startsWith(bytes, [0xff, 0xd8, 0xff])) return jpegDimensions(bytes) ?? { width: null, height: null };
  if (mimeType === "image/webp" && startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { width: null, height: null };
  return { width: null, height: null };
}

function hasExpectedMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === "image/webp") return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  if (mimeType === "video/mp4") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
  if (mimeType === "video/webm") return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  return false;
}

export function isSupportedUploadMimeType(mimeType: string): mimeType is keyof typeof POLICY {
  return Object.prototype.hasOwnProperty.call(POLICY, mimeType);
}

export function validateStudioUpload(bytes: Uint8Array, mimeType: string, originalName: string): StudioUploadMetadata {
  if (!isSupportedUploadMimeType(mimeType)) throw new StudioUploadValidationError("Only JPEG, PNG, WebP, MP4, and WebM reference uploads are supported.");
  if (bytes.byteLength === 0) throw new StudioUploadValidationError("Uploaded file is empty.");
  if (bytes.byteLength > MEDIA_UPLOAD_MAX_BYTES) throw new StudioUploadValidationError("Uploaded file exceeds the 20MB Studio reference limit.");
  const extension = extname(originalName).toLowerCase();
  if (!POLICY[mimeType].includes(extension)) throw new StudioUploadValidationError("Filename extension does not match the declared media type.");
  if (!hasExpectedMagicBytes(bytes, mimeType)) throw new StudioUploadValidationError("File contents do not match the declared media type.");
  const dimensions = imageMetadata(bytes, mimeType);
  if (mimeType.startsWith("image/") && (!dimensions.width || !dimensions.height || dimensions.width > 16_384 || dimensions.height > 16_384)) {
    throw new StudioUploadValidationError("Image dimensions are invalid or exceed the Studio limit.");
  }
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mimeType,
    extension,
    ...dimensions,
    durationSeconds: null,
  };
}

export function safeUploadFilename(originalName: string, extension: string): string {
  const base = originalName.replace(/\\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${base || "studio-reference"}${extension}`;
}
