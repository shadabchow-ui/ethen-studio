/** Studio V5 economics — typed UI states (STUDIO_04). Server-only. */
import "server-only";
import type { ApiError } from "../../contracts/errors";
import type { LoadState } from "../../contracts/states";
import { icuToDollarsString } from "../../contracts/money";
import type { QuoteReceiptDisplay, SettlementReceipt, VersionedQuote } from "./types";
import { quoteDisplay, receiptDisplay } from "./receipts";
import type { Reservation } from "./types";

function blocked<T>(code: ApiError["code"], message: string, actionLabel: string | null): LoadState<T> {
  return {
    kind: "blocked",
    data: null,
    error: { code, message, retryable: false, requestId: "economics", details: {} },
    actionLabel,
  };
}

export function quoteLoadState(
  quote: VersionedQuote | null,
  nowIso?: string,
): LoadState<QuoteReceiptDisplay> {
  if (!quote) {
    return blocked("NOT_FOUND", "No estimate for this request yet.", "Request estimate");
  }
  const now = nowIso ?? new Date().toISOString();
  if (quote.expiresAt <= now) {
    return blocked("QUOTE_EXPIRED", `Estimate expired at ${quote.expiresAt}.`, "Request new estimate");
  }
  const display = quoteDisplay({
    idempotencyKey: quote.quoteId,
    estimatedIcu: quote.estimatedCostIcu,
    capIcu: quote.capIcu,
    expired: false,
  });
  return { kind: "ready", data: display as QuoteReceiptDisplay, error: null, actionLabel: null };
}

export function receiptLoadState(
  receipt: SettlementReceipt | null,
  children: readonly Reservation[],
): LoadState<QuoteReceiptDisplay> {
  if (!receipt) {
    return {
      kind: "loading",
      data: null,
      error: null,
      actionLabel: null,
    };
  }
  const display = receiptDisplay(receipt, children);
  if (receipt.reconcilingChildren.length > 0) {
    return {
      kind: "partial",
      data: display as QuoteReceiptDisplay,
      error: null,
      actionLabel: `${receipt.reconcilingChildren.length} item(s) still reconciling`,
    };
  }
  return { kind: "ready", data: display as QuoteReceiptDisplay, error: null, actionLabel: null };
}

export function admissionClosedState(): LoadState<QuoteReceiptDisplay> {
  return blocked(
    "ENDPOINT_UNAVAILABLE",
    "Paid admission is closed: no price configuration for this task.",
    "Use a synthetic task or contact support",
  );
}

/** Single formatting point for ICU → localized dollars. */
export function formatIcu(amount: Parameters<typeof icuToDollarsString>[0]): string {
  return `$${icuToDollarsString(amount)}`;
}
