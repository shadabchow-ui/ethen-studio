import "server-only";

import { estimateCostForModel, type CostEstimate } from "./pricing";

export interface ProviderInvoiceLine {
  providerInvoiceLineId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  invoicedCostUsd: number;
}

export interface ReconciliationLine {
  providerInvoiceLineId: string;
  modelId: string;
  estimate: CostEstimate;
  invoicedCostUsd: number;
  varianceUsd: number | null;
  toleranceUsd: number;
  withinTolerance: boolean;
}

export interface ReconciliationReport {
  currency: "USD";
  toleranceUsd: number;
  computedCostUsd: number | null;
  invoicedCostUsd: number;
  varianceUsd: number | null;
  withinTolerance: boolean;
  lines: ReconciliationLine[];
}

export async function reconcileProviderInvoice(
  lines: readonly ProviderInvoiceLine[],
  toleranceUsd: number,
  now = new Date(),
): Promise<ReconciliationReport> {
  if (!Number.isFinite(toleranceUsd) || toleranceUsd < 0) {
    throw new Error("Reconciliation tolerance must be a non-negative number.");
  }
  const reconciled = await Promise.all(lines.map(async (line) => {
    const estimate = await estimateCostForModel(
      line.modelId,
      line.inputTokens,
      line.outputTokens,
      now,
    );
    const varianceUsd =
      estimate.totalCost == null
        ? null
        : estimate.totalCost - line.invoicedCostUsd;
    return {
      providerInvoiceLineId: line.providerInvoiceLineId,
      modelId: line.modelId,
      estimate,
      invoicedCostUsd: line.invoicedCostUsd,
      varianceUsd,
      toleranceUsd,
      withinTolerance:
        varianceUsd != null && Math.abs(varianceUsd) <= toleranceUsd,
    };
  }));
  const invoicedCostUsd = reconciled.reduce(
    (sum, line) => sum + line.invoicedCostUsd,
    0,
  );
  const computedCostUsd = reconciled.every(
    (line) => line.estimate.totalCost != null,
  )
    ? reconciled.reduce(
        (sum, line) => sum + (line.estimate.totalCost ?? 0),
        0,
      )
    : null;
  const varianceUsd =
    computedCostUsd == null ? null : computedCostUsd - invoicedCostUsd;
  return {
    currency: "USD",
    toleranceUsd,
    computedCostUsd,
    invoicedCostUsd,
    varianceUsd,
    withinTolerance:
      reconciled.every((line) => line.withinTolerance) &&
      varianceUsd != null &&
      Math.abs(varianceUsd) <= toleranceUsd,
    lines: reconciled,
  };
}
