// Shared types for the deterministic, no-live-key Cortex eval harness.

export type CortexEvalCategory =
  | "intent-routing"
  | "mode-resolution"
  | "route-selection"
  | "receipt-truth"
  | "verifier-policy"
  | "fallback-behavior"
  | "cost-latency"
  | "research-grounding"
  | "capability-gating"
  | "provider-outage";

export interface CortexEvalCheck {
  category: CortexEvalCategory;
  name: string;
  passed: boolean;
  detail?: string;
}

export interface CortexEvalCategorySummary {
  category: CortexEvalCategory;
  total: number;
  passed: number;
  failed: number;
}

export interface CortexEvalMetrics {
  routeAccuracy: number | null;
  verifierAccuracy: number | null;
  receiptTruthRate: number | null;
  fallbackSuccessRate: number | null;
  costLatencyTierPassRate: number | null;
}

export interface CortexEvalSummary {
  checks: CortexEvalCheck[];
  totalCases: number;
  totalPassed: number;
  totalFailed: number;
  byCategory: CortexEvalCategorySummary[];
  metrics: CortexEvalMetrics;
}
