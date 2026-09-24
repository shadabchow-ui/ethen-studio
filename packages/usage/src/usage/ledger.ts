/**
 * SP-10 — Unified Usage & Cost Ledger
 *
 * Single usage ledger shared across Gateway, Model, Code, Research, Studio,
 * Voice, Automation, and agent runs.
 *
 * Links execution receipts, provider receipts, usage, cost, latency, errors,
 * and tenant/project identity without storing secrets.
 */

export type UnifiedProductCategory =
  | "gateway"
  | "model"
  | "code"
  | "research"
  | "studio"
  | "voice"
  | "automation"
  | "agent"
  | "designer";

export type UnitType = "tokens" | "seconds" | "jobs" | "calls";

export interface UnifiedLedgerEntry {
  id: string;
  tenantId: string;
  projectId: string;
  productCategory: UnifiedProductCategory;
  productId: string;
  sessionId?: string | null;
  runId?: string | null;
  traceId?: string | null;
  executionReceiptId?: string | null;
  providerReceiptId?: string | null;
  providerId: string;
  modelId: string;
  eventType: string;
  inputTokens: number;
  outputTokens: number;
  unitsUsed: number;
  unitType: UnitType;
  estimatedCostUsd: number;
  latencyMs: number;
  status: "success" | "error" | "cancelled";
  errorCode?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface SpendByProduct {
  productId: string;
  productCategory: UnifiedProductCategory;
  requestCount: number;
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  unitsUsed: number;
}

export interface UnifiedLedgerSummary {
  totalSpendUsd: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  spendByProduct: SpendByProduct[];
  spendByProvider: Record<string, number>;
  spendByModel: Record<string, number>;
}

// In-memory backing ledger for unified runtime tracking
const unifiedLedgerStore: UnifiedLedgerEntry[] = [];

/**
 * Record an event into the single unified usage ledger.
 * Secrets are explicitly stripped from metadata.
 */
export function recordUnifiedLedgerEntry(
  input: Omit<UnifiedLedgerEntry, "id" | "createdAt"> & { id?: string; createdAt?: string },
): UnifiedLedgerEntry {
  const sanitizedMetadata = input.metadata ? { ...input.metadata } : {};
  // Redact any potential secret fields
  for (const key of Object.keys(sanitizedMetadata)) {
    if (/key|secret|token|pass|auth|credential/i.test(key)) {
      delete sanitizedMetadata[key];
    }
  }

  const entry: UnifiedLedgerEntry = {
    id: input.id ?? `ledg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: input.tenantId ?? "tenant-default",
    projectId: input.projectId ?? "proj-default",
    productCategory: input.productCategory,
    productId: input.productId,
    sessionId: input.sessionId ?? null,
    runId: input.runId ?? null,
    traceId: input.traceId ?? null,
    executionReceiptId: input.executionReceiptId ?? null,
    providerReceiptId: input.providerReceiptId ?? null,
    providerId: input.providerId,
    modelId: input.modelId,
    eventType: input.eventType,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    unitsUsed: input.unitsUsed ?? 0,
    unitType: input.unitType ?? "tokens",
    estimatedCostUsd: input.estimatedCostUsd ?? 0,
    latencyMs: input.latencyMs ?? 0,
    status: input.status ?? "success",
    errorCode: input.errorCode ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    metadata: sanitizedMetadata,
  };

  unifiedLedgerStore.push(entry);
  return entry;
}

/** Clear in-memory ledger store (for tests / reset). */
export function clearUnifiedLedgerStore(): void {
  unifiedLedgerStore.length = 0;
}

/** Get all raw ledger entries. */
export function getUnifiedLedgerEntries(filter?: {
  tenantId?: string;
  projectId?: string;
  productId?: string;
}): UnifiedLedgerEntry[] {
  return unifiedLedgerStore.filter((entry) => {
    if (filter?.tenantId && entry.tenantId !== filter.tenantId) return false;
    if (filter?.projectId && entry.projectId !== filter.projectId) return false;
    if (filter?.productId && entry.productId !== filter.productId) return false;
    return true;
  });
}

/** Get unified ledger summary with per-product spend attribution. */
export function getUnifiedLedgerSummary(filter?: {
  tenantId?: string;
  projectId?: string;
}): UnifiedLedgerSummary {
  const entries = getUnifiedLedgerEntries(filter);

  let totalSpendUsd = 0;
  let totalRequests = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const productMap = new Map<string, SpendByProduct>();
  const providerMap: Record<string, number> = {};
  const modelMap: Record<string, number> = {};

  for (const entry of entries) {
    totalSpendUsd += entry.estimatedCostUsd;
    totalRequests += 1;
    totalInputTokens += entry.inputTokens;
    totalOutputTokens += entry.outputTokens;

    // Per-product spend attribution
    const existing = productMap.get(entry.productId) ?? {
      productId: entry.productId,
      productCategory: entry.productCategory,
      requestCount: 0,
      totalCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      unitsUsed: 0,
    };
    existing.requestCount += 1;
    existing.totalCostUsd += entry.estimatedCostUsd;
    existing.inputTokens += entry.inputTokens;
    existing.outputTokens += entry.outputTokens;
    existing.unitsUsed += entry.unitsUsed;
    productMap.set(entry.productId, existing);

    // Per-provider spend
    providerMap[entry.providerId] = (providerMap[entry.providerId] ?? 0) + entry.estimatedCostUsd;

    // Per-model spend
    modelMap[entry.modelId] = (modelMap[entry.modelId] ?? 0) + entry.estimatedCostUsd;
  }

  return {
    totalSpendUsd,
    totalRequests,
    totalInputTokens,
    totalOutputTokens,
    spendByProduct: Array.from(productMap.values()).sort((a, b) => b.totalCostUsd - a.totalCostUsd),
    spendByProvider: providerMap,
    spendByModel: modelMap,
  };
}
