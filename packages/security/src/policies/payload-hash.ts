import { createHash } from "node:crypto";

/**
 * Compute a deterministic SHA-256 hash for the exact approval payload.
 * Used to bind approval decisions to the proposed action content.
 * Any change to the payload produces a different hash, making the
 * old approval stale.
 */
export function computePayloadHash(
  payload: Record<string, unknown>,
  extraSalt?: string,
): string {
  const sorted = stableStringify(payload);
  const input = extraSalt ? `${extraSalt}:${sorted}` : sorted;
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Verify that the current execution payload matches the hash that was
 * approved. Returns false if the payload has changed, making the
 * approval stale.
 */
export function verifyPayloadHash(
  payload: Record<string, unknown>,
  expectedHash: string,
  extraSalt?: string,
): boolean {
  const actualHash = computePayloadHash(payload, extraSalt);
  return actualHash === expectedHash;
}

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return String(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${(obj as unknown[]).map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`,
  );
  return `{${pairs.join(",")}}`;
}
