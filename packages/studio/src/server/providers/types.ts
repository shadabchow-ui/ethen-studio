/** Studio V5 providers — shared server types (STUDIO_06). Server-only. */
import "server-only";

export type ProviderErrorCode =
  | "SETUP_REQUIRED"
  | "UNSUPPORTED_TASK"
  | "INVALID_PARAMETERS"
  | "TRANSPORT"
  | "AUTH"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "PROVIDER_FAILED"
  | "DISPATCH_UNCERTAIN"
  | "PRICE_UNKNOWN"
  | "UNSUPPORTED_OPERATION";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  constructor(code: ProviderErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type FetchImpl = typeof fetch;

export const PROVIDER_ERROR_STATUS: Readonly<Record<ProviderErrorCode, number>> = {
  SETUP_REQUIRED: 503,
  UNSUPPORTED_TASK: 422,
  INVALID_PARAMETERS: 422,
  TRANSPORT: 502,
  AUTH: 503,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  PROVIDER_FAILED: 502,
  DISPATCH_UNCERTAIN: 503,
  PRICE_UNKNOWN: 409,
  UNSUPPORTED_OPERATION: 501,
};

/** Only transport/auth failures feed the health breaker. */
export function isBreakerFailure(code: ProviderErrorCode): boolean {
  return code === "TRANSPORT" || code === "AUTH";
}

/** Redact credentials and bound provider error text (≤200 chars, as legacy). */
export function redactProviderText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/Key\s+[A-Za-z0-9._-]+/g, "Key [redacted]")
    .replace(/(key|token|secret|authorization)[=:]\s*[^\s&,;}"']+/gi, "$1=[redacted]")
    .slice(0, 200);
}
