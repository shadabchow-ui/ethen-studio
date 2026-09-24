import type { ProviderError, ProviderErrorCode } from "./types";

// ── Provider error factories ─────────────────────────────────────────────

export function providerUnavailableError(message?: string): ProviderError {
  return {
    code: "provider_unavailable",
    message: message ?? "The selected provider is currently unavailable.",
    retryable: true,
    statusCode: 503,
  };
}

export function rateLimitedError(message?: string): ProviderError {
  return {
    code: "rate_limited",
    message: message ?? "Too many requests. Please wait and try again.",
    retryable: true,
    statusCode: 429,
  };
}

export function invalidRequestError(message?: string): ProviderError {
  return {
    code: "invalid_request",
    message: message ?? "The request parameters are invalid.",
    retryable: false,
    statusCode: 400,
  };
}

export function moderationBlockedError(message?: string): ProviderError {
  return {
    code: "moderation_blocked",
    message: message ?? "Content was blocked by moderation checks.",
    retryable: false,
    statusCode: 422,
  };
}

export function insufficientCreditsError(message?: string): ProviderError {
  return {
    code: "insufficient_credits",
    message: message ?? "Not enough credits to complete this generation.",
    retryable: false,
    statusCode: 402,
  };
}

export function timeoutError(message?: string): ProviderError {
  return {
    code: "timeout",
    message: message ?? "The generation request timed out.",
    retryable: true,
    statusCode: 504,
  };
}

export function setupRequiredError(message?: string): ProviderError {
  return {
    code: "setup_required",
    message: message ?? "This provider requires environment configuration before use.",
    retryable: false,
    statusCode: 503,
  };
}

export function providerFailedError(message?: string): ProviderError {
  return {
    code: "provider_failed",
    message: message ?? "The provider failed to complete the request.",
    retryable: true,
    statusCode: 502,
  };
}

export function unknownError(message?: string): ProviderError {
  return {
    code: "unknown",
    message: message ?? "An unexpected error occurred during generation.",
    retryable: false,
    statusCode: 500,
  };
}

// ── Error classification helpers ─────────────────────────────────────────

const RETRYABLE_CODES: Set<ProviderErrorCode> = new Set([
  "provider_unavailable",
  "rate_limited",
  "timeout",
  "provider_failed",
]);

export function isRetryableError(error: ProviderError): boolean {
  return RETRYABLE_CODES.has(error.code);
}

export function httpStatusToProviderError(status: number, message?: string): ProviderError {
  switch (status) {
    case 400:
      return invalidRequestError(message);
    case 402:
      return insufficientCreditsError(message);
    case 422:
      return moderationBlockedError(message);
    case 429:
      return rateLimitedError(message);
    case 502:
      return providerFailedError(message);
    case 503:
      return providerUnavailableError(message);
    case 504:
      return timeoutError(message);
    default:
      if (status >= 500) return providerUnavailableError(message);
      return unknownError(message);
  }
}

export function classifyError(error: unknown): ProviderError {
  if (isProviderError(error)) return error;
  if (error instanceof Error) {
    // Job 12B: durable quota/concurrency denials are rate limits (429),
    // never provider failures.
    if (/STUDIO_QUOTA_/.test(error.message)) return rateLimitedError(error.message);
    const message = error.message.toLowerCase();
    if (message.includes("rate") || message.includes("429")) return rateLimitedError(error.message);
    if (message.includes("timeout") || message.includes("504")) return timeoutError(error.message);
    if (message.includes("api key") || message.includes("unauthorized") || message.includes("401")) return setupRequiredError(error.message);
    return providerFailedError(error.message);
  }
  return unknownError();
}

function isProviderError(error: unknown): error is ProviderError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "statusCode" in error &&
    "retryable" in error
  );
}
