/**
 * lib/attachments/validation.ts
 *
 * JOB 7 — Chat/Console attachment admission policy (pure, framework-free).
 *
 * Allowlist: PNG/JPEG/WebP images (vision-capable model delivery) plus
 * plain-text and Markdown (inlined as model context). Everything else fails
 * closed. Single 5 MiB cap, extension/MIME agreement, and magic-byte match.
 */

import { createHash } from "node:crypto";
import { extname } from "node:path";

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_RETENTION_DAYS = 30;
/** Text attachments are truncated to this many characters for model delivery. */
export const ATTACHMENT_MODEL_TEXT_LIMIT = 20_000;

const POLICY = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
  "text/markdown": [".md", ".markdown"],
} as const;

export type AttachmentMimeType = keyof typeof POLICY;

export interface AttachmentMetadata {
  sha256: string;
  mimeType: AttachmentMimeType;
  extension: string;
}

export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentValidationError";
  }
}

export function isSupportedAttachmentMimeType(mimeType: string): mimeType is AttachmentMimeType {
  return Object.prototype.hasOwnProperty.call(POLICY, mimeType);
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function hasExpectedMagicBytes(bytes: Uint8Array, mimeType: AttachmentMimeType): boolean {
  if (mimeType === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/webp") {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  }
  // text/plain and text/markdown: strict UTF-8 with no NUL bytes.
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return !decoded.includes("\0");
  } catch {
    return false;
  }
}

export function validateAttachmentUpload(
  bytes: Uint8Array,
  declaredMimeType: string,
  originalName: string,
): AttachmentMetadata {
  const mimeType = declaredMimeType.split(";", 1)[0].trim().toLowerCase();
  if (!isSupportedAttachmentMimeType(mimeType)) {
    throw new AttachmentValidationError(
      "Only PNG, JPEG, WebP images and plain-text or Markdown documents can be attached.",
    );
  }
  if (bytes.byteLength === 0) throw new AttachmentValidationError("Attached file is empty.");
  if (bytes.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new AttachmentValidationError("Attached file exceeds the 5MB attachment limit.");
  }
  const extension = extname(originalName).toLowerCase();
  if (!POLICY[mimeType].includes(extension as never)) {
    throw new AttachmentValidationError("Filename extension does not match the declared file type.");
  }
  if (!hasExpectedMagicBytes(bytes, mimeType)) {
    throw new AttachmentValidationError("File contents do not match the declared file type.");
  }
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mimeType,
    extension,
  };
}

export function safeAttachmentFilename(originalName: string, extension: string): string {
  const base = originalName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "attachment"}${extension}`;
}

export function isImageAttachmentMimeType(mimeType: string): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp";
}
