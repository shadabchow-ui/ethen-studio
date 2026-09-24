/**
 * Ollama model name validation.
 *
 * Validates model names before they reach any Ollama endpoint.
 * Blocks path-traversal, shell injection, and protocol-confusion patterns
 * while allowing valid Ollama model tags like:
 *   - "qwen2.5-coder:7b"
 *   - "llama3.2:3b-instruct-q4_K_M"
 *   - "hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF"
 *
 * Used by the adapter before every operation that takes a model name
 * parameter (show, pull, delete, chat).
 */

import { modelNameInvalid } from "./local-model-errors";

// Ollama model tag regex:
//   - Name: alphanumeric start, 0-127 chars of [a-zA-Z0-9._/-]
//   - Tag (optional): colon, alphanumeric start, 0-63 chars of [a-zA-Z0-9._-]
const SAFE_MODEL_NAME_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}(:[a-zA-Z0-9][a-zA-Z0-9._-]{0,63})?$/;

export function assertModelName(model: string): string {
  if (typeof model !== "string") {
    throw modelNameInvalid(
      String(model),
      "Model name is required.",
    );
  }

  const trimmed = model.trim();

  if (
    !trimmed ||
    trimmed.length > 192 ||
    trimmed !== model ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    /[\u0000-\u001f\u007f\s]/.test(trimmed) ||
    trimmed.includes("?") ||
    trimmed.includes("#") ||
    trimmed.includes("@") ||
    trimmed.includes("://") ||
    !SAFE_MODEL_NAME_PATTERN.test(trimmed)
  ) {
    throw modelNameInvalid(
      model,
      `"${trimmed.slice(0, 80)}" is not a valid Ollama model name.`,
    );
  }

  return trimmed;
}

/** Returns true when the string looks like a valid model name (no throw). */
export function isValidModelName(model: string): boolean {
  try {
    assertModelName(model);
    return true;
  } catch {
    return false;
  }
}
