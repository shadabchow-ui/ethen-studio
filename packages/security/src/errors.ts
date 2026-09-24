import { NextResponse } from "next/server";
import { GatewayError } from "./gateway-errors";
import type { ProviderHealth } from "@ethen/contracts/security/provider-health";
import { redactStructuredValue, redactSummary } from "./redact";
import { sensitiveResponseHeaders } from "./cookies";

export interface SafeErrorOptions {
  status: number;
  code: string;
  error: string;
  provider?: ProviderHealth;
  details?: Record<string, unknown>;
}

function clampStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 500;
}

export function jsonError(options: SafeErrorOptions) {
  const safeError = redactSummary(options.error, 500);
  return NextResponse.json(
    {
      ok: false,
      error: safeError,
      code: options.code,
      ...(options.provider ? { provider: redactStructuredValue(options.provider) } : {}),
      ...(options.details ? { details: redactStructuredValue(options.details) } : {}),
    },
    { status: clampStatus(options.status), headers: sensitiveResponseHeaders() },
  );
}

export function setupRequiredError(provider: ProviderHealth, code = "SETUP_REQUIRED") {
  return jsonError({
    status: 503,
    code,
    error: `${provider.label} setup is required before this route can run live requests.`,
    provider,
  });
}

export function unavailableProviderError(provider: ProviderHealth, code = "PROVIDER_UNAVAILABLE") {
  return jsonError({
    status: 503,
    code,
    error: `${provider.label} is unavailable for this route right now.`,
    provider,
  });
}

export function invalidRequestError(error: string, code = "INVALID_REQUEST", status = 400) {
  return jsonError({ status, code, error });
}

export function internalServerError() {
  return jsonError({
    status: 500,
    code: "INTERNAL_ERROR",
    error: "Unexpected server error.",
  });
}

export function normalizeGatewayError(error: unknown) {
  if (!(error instanceof GatewayError)) {
    return internalServerError();
  }

  switch (error.code) {
    case "messages_required":
      return invalidRequestError("At least one chat message is required.", error.code, 400);
    case "provider_key_missing":
    case "provider_env_missing":
      return jsonError({
        status: 503,
        code: "SETUP_REQUIRED",
        error: "A live AI provider is not configured for this route.",
      });
    case "provider_not_implemented":
      return jsonError({
        status: 503,
        code: "PROVIDER_UNAVAILABLE",
        error: "The selected live provider is not available in this repo yet.",
      });
    case "provider_unavailable":
    case "provider_error":
    case "provider_stream_error":
      return jsonError({
        status: error.status >= 500 ? 502 : error.status,
        code: "PROVIDER_UNAVAILABLE",
        error: "The upstream AI provider could not complete the request.",
      });
    default:
      return jsonError({
        status: error.status,
        code: error.code || "INTERNAL_ERROR",
        error: error.status >= 500
          ? "Unexpected server error."
          : redactSummary(error.message || "Unexpected error.", 300),
      });
  }
}
