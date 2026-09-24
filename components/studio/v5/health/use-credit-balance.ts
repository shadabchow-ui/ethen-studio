/**
 * M6A D3 — credit balance read, client view (no server imports).
 *
 * Reads GET /api/studio/v1/economics/balance once per mount and projects
 * the state discriminant: `ready` carries measured integer ICU,
 * `setup_required` and `error` carry a message instead of a number.
 * Unmeasured is always "Unknown" — the UI never invents a 0 balance.
 */
import * as React from "react";

export type CreditBalanceState = "loading" | "ready" | "setup_required" | "error";

export interface CreditBalanceView {
  state: CreditBalanceState;
  balanceIcu: number | null;
  reservedIcu: number | null;
  message: string | null;
}

interface BalanceResponse {
  ok?: unknown;
  data?: { state?: unknown; balanceIcu?: unknown; reservedIcu?: unknown; message?: unknown } | null;
}

function asNonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function parseBalanceResponse(body: unknown): CreditBalanceView {
  const data = (body as BalanceResponse | null)?.data ?? null;
  const state = data?.state;
  if (state === "ready") {
    const balanceIcu = asNonNegativeInt(data?.balanceIcu);
    const reservedIcu = asNonNegativeInt(data?.reservedIcu);
    if (balanceIcu === null || reservedIcu === null) {
      return { state: "error", balanceIcu: null, reservedIcu: null, message: "Balance read was malformed." };
    }
    return { state, balanceIcu, reservedIcu, message: null };
  }
  if (state === "setup_required" || state === "error") {
    const message = typeof data?.message === "string" && data.message ? data.message : null;
    return { state, balanceIcu: null, reservedIcu: null, message };
  }
  return { state: "error", balanceIcu: null, reservedIcu: null, message: "Balance read failed." };
}

const NO_PROJECT: CreditBalanceView = {
  state: "setup_required",
  balanceIcu: null,
  reservedIcu: null,
  message: "Select a project to see credit balance.",
};

const LOADING: CreditBalanceView = { state: "loading", balanceIcu: null, reservedIcu: null, message: null };

export function useCreditBalance(projectId: string | null): CreditBalanceView {
  const [view, setView] = React.useState<CreditBalanceView>(LOADING);
  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/studio/v1/economics/balance?projectId=${encodeURIComponent(projectId)}`, {
          cache: "no-store",
        });
        const parsed = parseBalanceResponse(await response.json());
        if (!cancelled) setView(parsed);
      } catch {
        if (!cancelled) {
          setView({ state: "error", balanceIcu: null, reservedIcu: null, message: "Balance read failed." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  if (!projectId) return NO_PROJECT;
  return view;
}
