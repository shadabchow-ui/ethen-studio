/** Studio V5 kernel — versioned API error envelope. */

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE_REVISION"
  | "QUOTE_EXPIRED"
  | "APPROVAL_REQUIRED"
  | "QUOTA_EXCEEDED"
  | "POLICY_DENIED"
  | "CONSENT_REQUIRED"
  | "ENDPOINT_UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
  details: Readonly<Record<string, unknown>>;
}

export function studioError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  retryable = false,
  details: Readonly<Record<string, unknown>> = {},
): ApiError {
  return { code, message, retryable, requestId, details };
}

export function serializeApiError(error: ApiError): string {
  return JSON.stringify(error);
}

export function parseApiError(value: string): ApiError {
  const parsed = JSON.parse(value) as ApiError;
  if (!parsed || typeof parsed.code !== "string" || typeof parsed.requestId !== "string") {
    throw new Error("invalid ApiError envelope");
  }
  return parsed;
}
