/**
 * Normalised error types for the Ollama Local Model runtime adapter.
 *
 * Single unified error class covering all 13 normalised states that
 * callers (IPC wrappers, UI, tests) can handle generically without
 * inspecting HTTP status codes or endpoint-specific wire formats.
 *
 * ── Mapping from existing (types.ts) codes ───────────────────────────────
 *   setup_required       → not_installed     (Ollama absent on localhost)
 *   not_running                           (Ollama present but unreachable)
 *   invalid_base_url                      (malformed URL)
 *   timeout                               (request took too long)
 *   unexpected_response                   (malformed / unexpected JSON)
 *   blocked_by_policy                     (localhost-only policy hit)
 *   invalid_model_name  → model_name_invalid
 *   (new)               → endpoint_unreachable (network / fetch error)
 *   (new)               → model_missing        (model not found on server)
 *   pull_failed                             (Ollama pull error)
 *   (new)               → delete_failed        (Ollama delete error)
 *   (new)               → chat_failed          (Ollama chat error)
 *   (new)               → cancelled            (AbortSignal / user cancel)
 */

import type { LocalModelErrorCode } from "@ethen/contracts/local-models/local-model-types";

/**
 * Map legacy code to the new unified set.
 * Used when re-throwing existing LocalModelsClientError / LocalModelPullError.
 */
const LEGACY_TO_UNIFIED: Record<string, LocalModelErrorCode> = {
  setup_required: "not_installed",
  not_running: "not_running",
  invalid_base_url: "invalid_base_url",
  timeout: "timeout",
  unexpected_response: "unexpected_response",
  blocked_by_policy: "blocked_by_policy",
  invalid_model_name: "model_name_invalid",
  pull_failed: "pull_failed",
};

export function mapLegacyErrorCode(code: string): LocalModelErrorCode {
  return LEGACY_TO_UNIFIED[code] ?? "unexpected_response";
}

// ── Adapter error class ──────────────────────────────────────────────────

export class LocalModelError extends Error {
  readonly code: LocalModelErrorCode;
  /** A human-readable detail safe to surface in the UI. */
  readonly safeDetail: string;
  /** Optional raw cause (e.g. the original fetch Error). */
  readonly cause: unknown;

  constructor(
    code: LocalModelErrorCode,
    message: string,
    opts?: { safeDetail?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "LocalModelError";
    this.code = code;
    this.safeDetail = opts?.safeDetail ?? message;
    this.cause = opts?.cause;
  }

  /** Returns true for errors that may succeed on retry (network blips, timeouts). */
  get isRetryable(): boolean {
    return (
      this.code === "endpoint_unreachable" ||
      this.code === "timeout" ||
      this.code === "not_running"
    );
  }

  /** Returns true for errors that indicate the request was cancelled. */
  get isCancellation(): boolean {
    return this.code === "cancelled";
  }
}

// ── Type guard ───────────────────────────────────────────────────────────

export function isLocalModelError(error: unknown): error is LocalModelError {
  return error instanceof LocalModelError;
}

// ── Convenience factory helpers ──────────────────────────────────────────

export function notInstalled(
  message?: string,
  opts?: { cause?: unknown },
): LocalModelError {
  return new LocalModelError(
    "not_installed",
    message ?? "Ollama is not installed or not reachable on the default localhost endpoint.",
    { safeDetail: "Ollama is not running on this computer.", cause: opts?.cause },
  );
}

export function notRunning(
  message?: string,
  opts?: { cause?: unknown },
): LocalModelError {
  return new LocalModelError(
    "not_running",
    message ?? "Ollama is installed but not running.",
    { safeDetail: "Ollama is not running.", cause: opts?.cause },
  );
}

export function endpointUnreachable(
  message?: string,
  opts?: { cause?: unknown },
): LocalModelError {
  return new LocalModelError(
    "endpoint_unreachable",
    message ?? "Could not reach the Ollama endpoint.",
    { safeDetail: "Could not reach Ollama.", cause: opts?.cause },
  );
}

export function invalidBaseUrl(
  message?: string,
  opts?: { cause?: unknown },
): LocalModelError {
  return new LocalModelError(
    "invalid_base_url",
    message ?? "The configured Ollama base URL is invalid.",
    { safeDetail: "Invalid Ollama URL.", cause: opts?.cause },
  );
}

export function timeoutError(
  message?: string,
  opts?: { cause?: unknown },
): LocalModelError {
  return new LocalModelError(
    "timeout",
    message ?? "Request to Ollama timed out.",
    { safeDetail: "Request timed out.", cause: opts?.cause },
  );
}

export function unexpectedResponse(
  message?: string,
  opts?: { cause?: unknown },
): LocalModelError {
  return new LocalModelError(
    "unexpected_response",
    message ?? "Ollama returned an unexpected response.",
    { safeDetail: "Unexpected response from Ollama.", cause: opts?.cause },
  );
}

export function modelMissing(
  model: string,
  message?: string,
): LocalModelError {
  return new LocalModelError(
    "model_missing",
    message ?? `Model "${model}" was not found on the Ollama server.`,
    { safeDetail: `Model "${model}" not found.` },
  );
}

export function modelNameInvalid(
  name: string,
  message?: string,
): LocalModelError {
  return new LocalModelError(
    "model_name_invalid",
    message ?? `"${name}" is not a valid Ollama model name.`,
    { safeDetail: `Invalid model name: "${name}".` },
  );
}

export function pullFailed(
  message?: string,
  opts?: { cause?: unknown },
): LocalModelError {
  return new LocalModelError(
    "pull_failed",
    message ?? "Failed to pull the model from the Ollama registry.",
    { safeDetail: "Model pull failed.", cause: opts?.cause },
  );
}

export function deleteFailed(
  message?: string,
  opts?: { cause?: unknown },
): LocalModelError {
  return new LocalModelError(
    "delete_failed",
    message ?? "Failed to delete the model from the Ollama server.",
    { safeDetail: "Model deletion failed.", cause: opts?.cause },
  );
}

export function chatFailed(
  message?: string,
  opts?: { cause?: unknown },
): LocalModelError {
  return new LocalModelError(
    "chat_failed",
    message ?? "Chat request to Ollama failed.",
    { safeDetail: "Chat request failed.", cause: opts?.cause },
  );
}

export function cancelled(
  message?: string,
): LocalModelError {
  return new LocalModelError(
    "cancelled",
    message ?? "The request was cancelled.",
    { safeDetail: "Cancelled." },
  );
}

export function blockedByPolicy(
  message?: string,
): LocalModelError {
  return new LocalModelError(
    "blocked_by_policy",
    message ?? "The request was blocked by the localhost-only security policy.",
    { safeDetail: "Blocked by security policy." },
  );
}
