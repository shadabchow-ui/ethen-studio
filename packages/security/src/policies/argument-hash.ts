import { computePayloadHash } from "./payload-hash";

const REDACTION_MARKER = "[REDACTED]";

export function canonicalizeArguments(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const sorted = sortKeys(args);
  return stripSensitiveValues(sorted) as Record<string, unknown>;
}

export function hashArguments(args: Record<string, unknown>): string {
  return computePayloadHash(canonicalizeArguments(args));
}

export function argumentsMatch(
  originalArgs: Record<string, unknown>,
  currentArgs: Record<string, unknown>,
): boolean {
  return hashArguments(originalArgs) === hashArguments(currentArgs);
}

function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return (obj as unknown[]).map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

function stripSensitiveValues(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    if (
      /^(sk-|ghp_|gho_|hf_|xai-|xapt-|org-|proj-|user_|key_)/i.test(obj) ||
      obj.length > 64 ||
      /\b(secret|token|key|password|credential|authorization)\b/i.test(obj)
    ) {
      return REDACTION_MARKER;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return (obj as unknown[]).map(stripSensitiveValues);
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const isSecretKey =
        /secret|token|key|password|credential|authorization|api[_-]?key/i.test(key);
      result[key] = isSecretKey ? REDACTION_MARKER : stripSensitiveValues(val);
    }
    return result;
  }
  return obj;
}
