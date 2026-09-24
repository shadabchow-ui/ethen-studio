/**
 * STUDIO_09 — estimate and cap bar.
 *
 * Renders the pinned quote (localized amount, cap, meter) with honest
 * states: no estimate yet, stale after a model/parameter change,
 * reapproval when a fresh estimate exceeds the prior quote by >10%,
 * and admission-closed when no price row exists. Integer ICU only.
 */

"use client";

import { formatIcuDollars } from "./create-api-client";
import type { QuoteView } from "./create-api-client";

export function EstimateBar({
  quote,
  stale,
  reapprovalRequired,
  estimating,
  error,
  onRetry,
  balanceIcu = null,
}: {
  quote: QuoteView | null;
  stale: boolean;
  reapprovalRequired: boolean;
  estimating: boolean;
  error: { code: string; message: string } | null;
  onRetry: () => void;
  /** Measured balance ICU; null unless the balance read is ready. */
  balanceIcu?: number | null;
}) {
  if (estimating) {
    return (
      <p role="status" data-testid="create-estimate" className="text-[11px] leading-[1.45] text-[var(--text-secondary)]">
        Estimating cost…
      </p>
    );
  }
  if (error && (error.code === "PROVIDER_UNAVAILABLE" || /admission is closed/i.test(error.message))) {
    return (
      <div role="status" data-testid="create-estimate" className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-3 py-2">
        <p className="text-[12px] font-medium text-[var(--text-primary)]">Paid admission is closed for this task.</p>
        <p className="mt-0.5 text-[11px] leading-[1.45] text-[var(--text-secondary)]">
          No price configuration exists yet — generation stays disabled rather than guessing a price.
        </p>
      </div>
    );
  }
  if (!quote) {
    return (
      <p role="status" data-testid="create-estimate" className="text-[11px] leading-[1.45] text-[var(--text-tertiary)]">
        No estimate yet — it appears here before anything is charged.
      </p>
    );
  }
  return (
    <div role="status" data-testid="create-estimate" className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-3 py-2">
      <p className="text-[11px] leading-[1.45] text-[var(--text-secondary)]">
        Estimate{" "}
        <strong className="text-[var(--text-primary)]">{formatIcuDollars(quote.estimatedIcu)}</strong>
        {quote.capIcu !== null ? (
          <>
            {" "}· cap <strong className="text-[var(--text-primary)]">{formatIcuDollars(quote.capIcu)}</strong>
            {quote.hardCap ? " (hard)" : ""}
          </>
        ) : (
          " · no cap"
        )}{" "}
        · {quote.meterQuantity} {quote.meterUnit}
        {balanceIcu !== null ? (
          <>
            {" "}· <span className="text-[var(--text-primary)]">{formatIcuDollars(balanceIcu)}</span> remaining
          </>
        ) : null}
      </p>
      {stale ? (
        <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
          Out of date — the model or parameters changed. A fresh estimate is required before generating.
        </p>
      ) : null}
      {reapprovalRequired ? (
        <p role="alert" className="mt-0.5 text-[11px] text-[var(--text-primary)]">
          This estimate exceeds the prior quote by more than 10%. Review it, then generate again to approve.
        </p>
      ) : null}
      {error ? (
        <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
          {error.message}{" "}
          <button type="button" onClick={onRetry} className="underline">
            Retry estimate
          </button>
        </p>
      ) : null}
    </div>
  );
}
