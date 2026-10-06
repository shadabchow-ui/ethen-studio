/**
 * Shared settings data hooks — one read/write contract for Chat + Designer.
 * Both apps serve the same `/api/settings/*` paths, so these hooks (and the
 * section components built on them) are identical in both products.
 */
"use client";

import * as React from "react";

/**
 * RC3 — explicit fetch status. Loading, signed-out, setup-incomplete, and
 * error are distinct states; consumers branch on `status` instead of
 * inferring from `data`/`error`, so signed-out never renders
 * connection-error copy and errors never render as perpetual loading.
 */
export type AsyncDataStatus = "loading" | "ready" | "signed_out" | "setup" | "error";

export interface AsyncData<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  status: AsyncDataStatus;
  refresh: () => Promise<void>;
}

async function readJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { cache: "no-store", ...init });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function errorMessageOf(body: unknown, fallback: string): string {
  return body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
    ? ((body as { error: string }).error)
    : fallback;
}

/**
 * RC3 — pure HTTP-outcome classifier behind `useAsyncData` (unit-tested;
 * the hook itself needs a renderer). 401/403 → signed_out (the legacy
 * "signed_out" error string is preserved for backward compatibility);
 * 503 → setup; 2xx → ready; anything else → error.
 */
export function resolveAsyncDataOutcome(
  httpStatus: number,
  body: unknown,
): { status: AsyncDataStatus; error: string | null } {
  if (httpStatus === 401 || httpStatus === 403) {
    return { status: "signed_out", error: "signed_out" };
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    return { status: "ready", error: null };
  }
  if (httpStatus === 503) {
    const message = errorMessageOf(body, "Setup is incomplete.");
    return { status: "setup", error: message === "setup_required" ? "Setup is incomplete." : message };
  }
  return {
    status: "error",
    error: errorMessageOf(body, "Could not be loaded. Check your connection and try again."),
  };
}

export function useAsyncData<T>(url: string | null): AsyncData<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(url !== null);
  // A null url means "no request": settled with nothing to load.
  const [status, setStatus] = React.useState<AsyncDataStatus>(url !== null ? "loading" : "ready");

  const refresh = React.useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setStatus("loading");
    setError(null);
    try {
      const { status: httpStatus, body } = await readJson(url);
      const outcome = resolveAsyncDataOutcome(httpStatus, body);
      if (outcome.status === "ready") {
        setData(body as T);
      } else if (outcome.status === "signed_out") {
        setData(null);
      }
      // setup/error keep stale data (historical behavior); consumers
      // branch on `status` to decide what the stale data means.
      setError(outcome.error);
      setStatus(outcome.status);
    } catch {
      setError("Could not be loaded. Check your connection and try again.");
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }, [url]);

  React.useEffect(() => {
    if (!url) return;
    // Load from a task so the effect body itself never sets state.
    const handle = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(handle);
  }, [refresh, url]);

  return { data, error, loading, status, refresh };
}

export async function postJson<T>(url: string, payload?: unknown): Promise<{ ok: boolean; data: T | null; error: string | null; status: number }> {
  try {
    const { status, body } = await readJson(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (status >= 200 && status < 300) return { ok: true, data: body as T, error: null, status };
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? ((body as { error: string }).error)
        : "Action failed. Try again.";
    return { ok: false, data: body as T, error: message, status };
  } catch {
    return { ok: false, data: null, error: "Action failed. Check your connection and try again.", status: 0 };
  }
}

/**
 * CHAT-07: the skills route implements GET/PATCH (no POST). Partial-update
 * semantics match postJson's result contract so callers stay honest about
 * 405s instead of silently snapping switches back.
 */
export async function patchJson<T>(url: string, payload?: unknown): Promise<{ ok: boolean; data: T | null; error: string | null; status: number }> {
  try {
    const { status, body } = await readJson(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (status >= 200 && status < 300) return { ok: true, data: body as T, error: null, status };
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? ((body as { error: string }).error)
        : "Action failed. Try again.";
    return { ok: false, data: body as T, error: message, status };
  } catch {
    return { ok: false, data: null, error: "Action failed. Check your connection and try again.", status: 0 };
  }
}

export async function deleteJson<T>(url: string): Promise<{ ok: boolean; data: T | null; error: string | null; status: number }> {
  try {
    const { status, body } = await readJson(url, { method: "DELETE" });
    if (status >= 200 && status < 300) return { ok: true, data: body as T, error: null, status };
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? ((body as { error: string }).error)
        : "Action failed. Try again.";
    return { ok: false, data: body as T, error: message, status };
  } catch {
    return { ok: false, data: null, error: "Action failed. Check your connection and try again.", status: 0 };
  }
}

// ── Typed contracts (shared by both apps) ────────────────────────────────────

export interface AccountInfo {
  signedIn: boolean;
  actorId: string | null;
  accountId?: string | null;
  ownerReview?: boolean;
  model?: string | null;
  provider?: string | null;
  /**
   * RC1 — Studio identity contract state. Mirrors `StudioIdentityState`
   * (`components/studio/auth/identity-state.ts`) structurally; this shared
   * package must not import Studio-owned modules. Absent on responses that
   * predate the contract — treat missing as legacy `signedIn`-only.
   */
  state?: "signed_out" | "identity_pending" | "identity_unavailable" | "signed_in";
  /** Short server code for the state (mapping state); never user data. */
  code?: string;
}

export interface SessionInfo {
  id: string;
  status: string;
  current: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastActiveAt: string | null;
}

export interface SessionsResponse {
  ok: boolean;
  signedIn?: boolean;
  scope?: string;
  scopeNote?: string;
  sessions?: SessionInfo[];
}

export interface BillingResponse {
  ok: boolean;
  available: boolean;
  reason?: string;
  billing?: {
    readiness?: string;
    subscription?: { state: string; planKey: string | null; renewsAt: string | null; cancelAtPeriodEnd: boolean } | null;
    credits?: { balance: number; ledger: unknown[] };
    usage?: { recentEvents: unknown[] };
    actions?: { checkoutAvailable: boolean; portalAvailable: boolean; checkoutOffers: unknown[] };
    notice?: string | null;
  };
}

export interface UsageResponse {
  ok: boolean;
  available: boolean;
  reason?: string;
  usage?: {
    creditBalance: number;
    creditLedger: unknown[];
    recentEvents: unknown[];
    byProduct: Record<string, number>;
    quotas?: { maxStorageBytes: number; maxRecords: number; maxLeases: number; maxRequests: number } | null;
    storage?: string;
  };
}

export interface ConnectorDef {
  id: string;
  displayName: string;
  description: string;
  category: string;
  status: string;
  statusDetail: string;
  requiresSetup: boolean;
  isMock: boolean;
  capabilities: { id: string; label: string }[];
}

export interface ConnectorConnection {
  id: string;
  provider_id: string;
  account_label: string;
  status: string;
  scopes_granted: string[];
  created_at: string;
  updated_at: string;
}

export interface ConnectorsResponse {
  ok: boolean;
  connectors: ConnectorDef[];
  connections: ConnectorConnection[];
}

export interface SkillPackInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  roles: string[];
  requiredTools: string[];
  approvals: unknown[];
}

export interface SkillsResponse {
  ok: boolean;
  skills: SkillPackInfo[];
  enablement: Record<string, { enabled: boolean; chat: boolean; designer: boolean; studio?: boolean }>;
}

export interface DeleteEligibility {
  ok: boolean;
  eligible: boolean;
  subscription: { state: string; planKey: string | null } | null;
  blockedReason: string | null;
  confirmation: string;
}

/**
 * Deterministic timestamp (UTC ISO, minute precision) — identical on server
 * and client so settings tables never cause hydration mismatches.
 */
export function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  } catch {
    return "—";
  }
}
