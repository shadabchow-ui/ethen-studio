/**
 * Cortex route receipt shape.
 *
 * Moved out of `components/cortex/CortexReceiptSummary.tsx` so the cortex
 * runtime can decode a receipt without importing a React component out of
 * the root monolith. The component re-exports the name, so every existing
 * consumer keeps its import path.
 */

export type CortexVerifierStatus = "passed" | "warned" | "failed" | "skipped";

export type CortexFallbackStatus = "primary_success" | "fallback_success" | "degraded_success" | "failed";

export interface CortexTruthLabel {
  source?: "mock" | "production" | "degraded" | "error" | "unknown";
  mode?: string;
  verified?: CortexVerifierStatus | null;
  toolUsed?: boolean;
  searchUsed?: boolean;
  repoUsed?: boolean;
  fallbackUsed?: boolean;
  fallbackStatus?: CortexFallbackStatus | null;
  cost?: string | null;
  latency?: string | null;
  sourceGrounded?: boolean;
  citationChecked?: boolean;
  confidence?: "low" | "medium" | "high" | "unknown" | null;
}

export interface CortexRouteReceiptData {
  requestId?: string;
  runId?: string;
  conversationId?: string;
  timestamp?: string;

  source?: "mock" | "production" | "degraded" | "error" | "unknown";
  mode?: string;
  intent?: string;
  routeProfile?: string;
  routeClass?: "single_model" | "multi_model" | "tool_augmented" | "verified" | "agent_workflow";

  provider?: {
    selectedProvider?: string;
    selectedModel?: string;
    providerVisible?: boolean;
    modelVisible?: boolean;
    isByok?: boolean;
    regionClass?: string;
  };

  selection?: {
    reasonCodes?: string[];
    candidateCount?: number;
    selectedCandidateRank?: number;
    score?: number;
  };

  fallback?: {
    attempted?: boolean;
    used?: boolean;
    finalStatus?: CortexTruthLabel["fallbackStatus"];
    reason?: string;
  };

  tools?: {
    used?: boolean;
    classes?: string[];
    invocationCount?: number;
  };

  verifier?: {
    used?: boolean;
    verifierType?: string;
    score?: number;
    status?: CortexTruthLabel["verified"];
    warnings?: string[];
  };

  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
    costEstimateStatus?: "estimated" | "unknown" | "not_available";
    costEstimateReason?: string;
    latencyMs?: number;
    timeToFirstTokenMs?: number;
  };

  quality?: {
    confidence?: CortexTruthLabel["confidence"];
    sourceGrounded?: boolean;
    citationChecked?: boolean;
  };

  redactions?: Array<{
    field: string;
    reason: string;
  }>;
}
