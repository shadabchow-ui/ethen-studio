import "server-only";

import { getTokens, isVaultConfigured } from "../vault";
import { getMicrosoftGraphBaseUrl } from "./env";
import type { MicrosoftError, MicrosoftResult } from "./types";

const NOT_CONFIGURED_ERROR: MicrosoftError = {
  code: "NOT_CONFIGURED",
  message: "Microsoft 365 connector is not configured. Token vault is unavailable.",
  status: 503,
};

const MISSING_TOKEN_ERROR: MicrosoftError = {
  code: "MISSING_TOKEN",
  message: "No valid Microsoft 365 access token found for this connection.",
  status: 401,
};

/**
 * Fail-closed Microsoft Graph API client.
 *
 * Uses the token vault (currently always unconfigured) to retrieve tokens,
 * and falls through to NOT_CONFIGURED when no token is available.
 * All responses are minimized before reaching callers.
 */
export async function microsoftGraphGet<T>(
  connectionId: string,
  path: string,
  queryParams?: Record<string, string>
): Promise<MicrosoftResult<T>> {
  return graphRequest<T>("GET", connectionId, path, queryParams, undefined);
}

export async function microsoftGraphPost<T>(
  connectionId: string,
  path: string,
  body: unknown,
  queryParams?: Record<string, string>
): Promise<MicrosoftResult<T>> {
  if (!canPerformWrite(connectionId)) {
    return {
      ok: false,
      error: {
        code: "APPROVAL_REQUIRED",
        message: "Write operations require explicit user approval.",
        status: 403,
      },
    };
  }
  return graphRequest<T>("POST", connectionId, path, queryParams, body);
}

export async function microsoftGraphPatch<T>(
  connectionId: string,
  path: string,
  body: unknown,
  queryParams?: Record<string, string>
): Promise<MicrosoftResult<T>> {
  if (!canPerformWrite(connectionId)) {
    return {
      ok: false,
      error: {
        code: "APPROVAL_REQUIRED",
        message: "Write operations require explicit user approval.",
        status: 403,
      },
    };
  }
  return graphRequest<T>("PATCH", connectionId, path, queryParams, body);
}

/**
 * Whether writes are allowed — delegates to the approval system.
 * In this fail-closed stub, writes are always blocked until the token vault
 * and approval layer are fully operational.
 */
function canPerformWrite(connectionId: string): boolean {
  void connectionId;
  return false;
}

async function graphRequest<T>(
  method: string,
  connectionId: string,
  path: string,
  queryParams?: Record<string, string>,
  body?: unknown
): Promise<MicrosoftResult<T>> {
  if (!isVaultConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const tokens = await getTokens(connectionId);
  if (!tokens?.accessToken) {
    return { ok: false, error: MISSING_TOKEN_ERROR };
  }

  const baseUrl = getMicrosoftGraphBaseUrl();
  const url = new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `${tokens.tokenType} ${tokens.accessToken}`,
      Accept: "application/json",
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429) {
      return {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Microsoft Graph API rate limit exceeded. Retry after the Retry-After window.",
          status: 429,
          details: { retryAfter: response.headers.get("Retry-After") },
        },
      };
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return {
        ok: false,
        error: {
          code: response.status === 403 ? "INSUFFICIENT_SCOPES" : "GRAPH_ERROR",
          message: `Microsoft Graph returned ${response.status}: ${response.statusText}`,
          status: response.status,
          details: { graphStatus: response.status, graphError: errorBody.slice(0, 500) },
        },
      };
    }

    const data = await response.json();
    return { ok: true, data: minimizePayload<T>(data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown graph request error";
    return {
      ok: false,
      error: {
        code: "PROVIDER_ERROR",
        message,
        status: 502,
      },
    };
  }
}

/**
 * Minimize the raw Microsoft Graph payload before it reaches any caller.
 * Strips @odata metadata and known-sensitive fields.
 */
function minimizePayload<T>(raw: unknown): T {
  if (!raw || typeof raw !== "object") return raw as T;
  const result = { ...(raw as Record<string, unknown>) };
  const strip = ["@odata.context", "@odata.nextLink", "@odata.deltaLink", "@odata.type", "@odata.id", "@odata.editLink", "@odata.etag", "@odata.count", "@removed"];
  for (const key of strip) {
    delete result[key];
  }
  const sensitiveFields = ["passwordProfile", "passwordPolicies", "refreshTokensValidFromDateTime", "signInSessionsValidFromDateTime"];
  for (const key of sensitiveFields) {
    if (key in result) {
      result[key] = "[redacted]";
    }
  }
  return result as T;
}
