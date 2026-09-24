/**
 * STUDIO_09 — request idempotency helpers.
 *
 * Same payload yields the same request hash; the idempotency key derives
 * from tool + hash so retries replay the same job while a changed payload
 * conflicts instead of silently forking. Canonical JSON (sorted keys)
 * keeps the hash stable regardless of key insertion order.
 */

export function canonicalizeJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalizeJson(entry)).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record).sort();
  const body = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`).join(",");
  return `{${body}}`;
}

/** FNV-1a 32-bit hex — deterministic sync fallback when SubtleCrypto is absent. */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Stable request hash for a create payload. Prefers SHA-256 via
 * SubtleCrypto; falls back to FNV-1a only where SubtleCrypto is
 * unavailable (non-secure contexts). The fallback is prefixed so the
 * two families never collide.
 */
export async function hashCreateRequest(payload: Readonly<Record<string, unknown>>): Promise<string> {
  const canonical = canonicalizeJson(payload);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return `sha256:${bytesToHex(digest)}`;
  }
  return `fnv1a:${fnv1aHex(canonical)}`;
}

/** Sync hash for non-async call sites (tests, key derivation checks). */
export function hashCreateRequestSync(payload: Readonly<Record<string, unknown>>): string {
  return `fnv1a:${fnv1aHex(canonicalizeJson(payload))}`;
}

/** Idempotency key: stable per tool + request hash. */
export function idempotencyKeyFor(toolId: string, requestHash: string): string {
  return `studio-v5-create:${toolId}:${requestHash}`;
}
