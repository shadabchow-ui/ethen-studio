/** Studio V5 Canvas compiler — canonical JSON + SHA-256 (STUDIO_12). */
import { createHash } from "node:crypto";

/**
 * Canonical JSON: object keys sorted recursively, arrays order-preserved,
 * undefined dropped (JSON semantics), no whitespace. Insensitive to JSON
 * object key order but sensitive to any semantically changed parameter.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number") {
    if (!Number.isFinite(value as number)) throw new Error("CANONICAL_INVALID: non-finite number.");
    return JSON.stringify(value);
  }
  if (t === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry ?? null)).join(",")}]`;
  if (t === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new Error("CANONICAL_INVALID: unsupported value type.");
}

/** SHA-256 hex digest of the canonical JSON form. */
export function canonicalSha256(value: unknown): { canonical: string; sha256: string } {
  const canonical = canonicalJson(value);
  return { canonical, sha256: createHash("sha256").update(canonical, "utf8").digest("hex") };
}
