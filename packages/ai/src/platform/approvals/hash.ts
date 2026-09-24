import { createHash } from "node:crypto";

function stableJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashExactActionBytes(actionBytes: Uint8Array): string {
  return createHash("sha256").update(actionBytes).digest("hex");
}

export function hashCanonicalBinding(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}
