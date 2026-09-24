/**
 * SP-10 — Reconciliation report comparing unified usage ledger to provider invoices/statements.
 *
 * Verifies that metered model/provider totals in the unified ledger match provider statements within tolerance.
 */

import type { UnifiedLedgerEntry } from "./ledger";

export interface ProviderStatementLine {
  statementLineId: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  invoicedCostUsd: number;
}

export interface ProviderStatement {
  statementId: string;
  providerId: string;
  periodStart: string;
  periodEnd: string;
  lineItems: ProviderStatementLine[];
  totalInvoicedUsd: number;
}

export interface ReconciledModelLine {
  modelId: string;
  providerId: string;
  ledgerInputTokens: number;
  ledgerOutputTokens: number;
  ledgerCostUsd: number;
  invoicedCostUsd: number;
  varianceUsd: number;
  withinTolerance: boolean;
}

export interface LedgerReconciliationReport {
  reportId: string;
  providerId: string;
  generatedAt: string;
  toleranceUsd: number;
  totalLedgerCostUsd: number;
  totalInvoicedCostUsd: number;
  varianceUsd: number;
  withinTolerance: boolean;
  modelLines: ReconciledModelLine[];
  notes: string[];
}

/**
 * Reconcile unified ledger entries against a provider statement within a given USD tolerance.
 */
export function reconcileLedgerWithProviderStatement(
  ledgerEntries: UnifiedLedgerEntry[],
  statement: ProviderStatement,
  toleranceUsd = 0.05,
): LedgerReconciliationReport {
  const providerEntries = ledgerEntries.filter(
    (e) => e.providerId.toLowerCase() === statement.providerId.toLowerCase(),
  );

  // Group ledger entries by model
  const ledgerModelMap = new Map<
    string,
    { inputTokens: number; outputTokens: number; costUsd: number }
  >();
  for (const entry of providerEntries) {
    const existing = ledgerModelMap.get(entry.modelId) ?? {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    existing.inputTokens += entry.inputTokens;
    existing.outputTokens += entry.outputTokens;
    existing.costUsd += entry.estimatedCostUsd;
    ledgerModelMap.set(entry.modelId, existing);
  }

  const modelLines: ReconciledModelLine[] = [];
  let totalLedgerCostUsd = 0;

  for (const line of statement.lineItems) {
    const ledgerData = ledgerModelMap.get(line.modelId) ?? {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };

    totalLedgerCostUsd += ledgerData.costUsd;
    const varianceUsd = Math.abs(ledgerData.costUsd - line.invoicedCostUsd);
    const withinTolerance = varianceUsd <= toleranceUsd;

    modelLines.push({
      modelId: line.modelId,
      providerId: statement.providerId,
      ledgerInputTokens: ledgerData.inputTokens,
      ledgerOutputTokens: ledgerData.outputTokens,
      ledgerCostUsd: ledgerData.costUsd,
      invoicedCostUsd: line.invoicedCostUsd,
      varianceUsd,
      withinTolerance,
    });
  }

  const totalInvoicedCostUsd = statement.totalInvoicedUsd;
  const overallVarianceUsd = Math.abs(totalLedgerCostUsd - totalInvoicedCostUsd);
  const overallWithinTolerance =
    overallVarianceUsd <= toleranceUsd && modelLines.every((l) => l.withinTolerance);

  return {
    reportId: `rec-${statement.statementId}-${Date.now()}`,
    providerId: statement.providerId,
    generatedAt: new Date().toISOString(),
    toleranceUsd,
    totalLedgerCostUsd,
    totalInvoicedCostUsd,
    varianceUsd: overallVarianceUsd,
    withinTolerance: overallWithinTolerance,
    modelLines,
    notes: overallWithinTolerance
      ? [`Ledger totals reconcile to provider statement '${statement.statementId}' within $${toleranceUsd.toFixed(2)} tolerance.`]
      : [`Ledger totals variance $${overallVarianceUsd.toFixed(4)} exceeds tolerance $${toleranceUsd.toFixed(2)}.`],
  };
}
