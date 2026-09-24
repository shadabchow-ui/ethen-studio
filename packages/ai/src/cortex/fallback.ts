import { GatewayError } from "@ethen/models/gateway/errors";
import type { FallbackPolicy } from "./types";

export type FailureClass =
  | "timeout"
  | "rate_limited"
  | "provider_unavailable"
  | "auth_missing"
  | "invalid_request"
  | "unknown";

const RATE_LIMIT_CODES = new Set([429]);
const TIMEOUT_CODES = new Set([408]);

export function classifyFailure(error: unknown): FailureClass {
  if (error instanceof GatewayError) {
    if (error.code === "provider_key_missing") return "auth_missing";
    if (error.code === "provider_unavailable") return "provider_unavailable";
    if (error.code === "provider_timeout" || error.status === 504) return "timeout";
    if (RATE_LIMIT_CODES.has(error.status)) return "rate_limited";
    if (TIMEOUT_CODES.has(error.status)) return "timeout";
    if (error.status >= 400 && error.status < 500 && error.status !== 429) {
      return "invalid_request";
    }
    return "unknown";
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("timeout") || message.includes("timed out")) return "timeout";
    if (message.includes("rate limit")) return "rate_limited";
  }

  return "unknown";
}

/** Failure classes worth retrying — transient conditions that may clear on a fresh attempt. */
export function isRetryableFailure(failureClass: FailureClass): boolean {
  return (
    failureClass === "timeout" ||
    failureClass === "rate_limited" ||
    failureClass === "provider_unavailable" ||
    failureClass === "unknown"
  );
}

const DEFAULT_SAME_PROVIDER_RETRIES = 0;
const DEFAULT_CROSS_PROVIDER_FALLBACKS = 1;

/** Resolve same-provider retry count, falling back to the legacy single-attempt behavior. */
export function resolveSameProviderRetries(fallbackPolicy?: FallbackPolicy | null): number {
  if (!fallbackPolicy || !fallbackPolicy.enabled) return DEFAULT_SAME_PROVIDER_RETRIES;
  return fallbackPolicy.sameProviderRetries ?? DEFAULT_SAME_PROVIDER_RETRIES;
}

/** Resolve how many cross-provider fallbacks to attempt, falling back to legacy single-fallback behavior. */
export function resolveCrossProviderFallbacks(fallbackPolicy?: FallbackPolicy | null): number {
  if (!fallbackPolicy || !fallbackPolicy.enabled) return DEFAULT_CROSS_PROVIDER_FALLBACKS;
  return fallbackPolicy.crossProviderFallbacks ?? DEFAULT_CROSS_PROVIDER_FALLBACKS;
}
