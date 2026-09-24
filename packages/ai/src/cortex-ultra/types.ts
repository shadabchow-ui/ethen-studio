// ── Cortex Ultra Tool Loop Types ──────────────────────────────────────────────
// MVP: read-only tool loop foundation for Cortex and future Ultra workers.
// The LLM proposes tool intent; runtime owns validation, policy, execution,
// compaction, and evidence registration.

import type { ToolClass, VerifierStatus } from "../cortex/types";

// A tool intent proposed by the model (not yet validated or executed).
export interface CortexToolRequest {
  requestId: string;
  toolName: string;
  toolClass: ToolClass;
  args: Record<string, unknown>;
  proposedAt: string; // ISO timestamp
}

// Runtime policy decision — LLM is never the policy engine.
export type CortexToolPolicyOutcome = "allow" | "deny" | "requires_approval";

export interface CortexToolPolicyDecision {
  requestId: string;
  outcome: CortexToolPolicyOutcome;
  reason: string;
  decidedAt: string;
}

// Result of a runtime-executed tool invocation.
export interface CortexToolExecutionResult {
  requestId: string;
  toolName: string;
  success: boolean;
  rawOutput?: unknown; // kept internal; never injected raw into model context
  error?: string;
  executedAt: string;
  durationMs: number;
}

// Compact, structured observation returned to the model (not raw output).
export interface CortexToolObservation {
  requestId: string;
  toolName: string;
  outcome: CortexToolPolicyOutcome | "executed" | "failed";
  summary: string; // ≤ 500 chars; compacted from raw output
  empty: boolean;
}

// Evidence item created from a successful tool result.
export interface CortexEvidenceItem {
  id: string;
  requestId: string;
  toolName: string;
  toolClass: ToolClass;
  finding: string;
  sourceUrl?: string;
  confidence: "low" | "medium" | "high";
  createdAt: string;
}

// Options for running the tool loop.
export interface CortexToolLoopOptions {
  maxTools?: number; // default 5
  budgetTokens?: number; // soft budget; halts loop when exceeded
  allowedToolClasses?: ToolClass[]; // allowlist; empty = none allowed
  dryRun?: boolean; // validate only, no execution
  budgetState?: import("./cost-controller").UltraRunBudget;
}

// ── Cortex Ultra verifier + synthesis types ─────────────────────────────────

export type CortexUltraClaimType =
  | "factual"
  | "tool_result"
  | "analysis"
  | "recommendation"
  | "limitation";

export interface CortexUltraWorkerClaim {
  claimId: string;
  summary: string;
  type: CortexUltraClaimType;
  evidenceIds?: string[];
  canonicalKey?: string;
}

export interface CortexUltraWorkerResult {
  workerId: string;
  summary: string;
  outputText: string;
  claims: CortexUltraWorkerClaim[];
  providerId?: string | null;
  modelId?: string | null;
  failureReason?: string | null;
  /** Grounded provider input tokens when available from gateway response. */
  inputTokens?: number | null;
  /** Grounded provider output tokens when available from gateway response. */
  outputTokens?: number | null;
  /** Estimated USD cost; null when no provider pricing data is configured. */
  estimatedCostUsd?: number | null;
}

export type CortexUltraClaimVerdict =
  | "accepted"
  | "rejected"
  | "contested"
  | "unsupported"
  | "malformed";

export interface CortexUltraClaimAssessment {
  claimId: string;
  workerId: string;
  verdict: CortexUltraClaimVerdict;
  reasons: string[];
  evidenceIds: string[];
  canonicalKey?: string;
}

export interface CortexUltraVerifierRepair {
  claimId?: string;
  workerId?: string;
  action:
    | "reshape_worker_output"
    | "add_evidence"
    | "resolve_contested_claim"
    | "remove_unsupported_claim"
    | "request_human_review";
  detail: string;
}

export type CortexUltraVerifierVerdict =
  | "pass"
  | "pass_with_warnings"
  | "fail"
  | "needs_human_review";

export interface CortexUltraVerifierJudgeInput {
  task: string;
  workerResults: CortexUltraWorkerResult[];
  provisionalVerdict: CortexUltraVerifierVerdict;
  claimAssessments: CortexUltraClaimAssessment[];
}

export interface CortexUltraVerifierJudgeOutput {
  verdict?: CortexUltraVerifierVerdict;
  status?: VerifierStatus;
  warnings?: string[];
  repairs?: CortexUltraVerifierRepair[];
  claimOverrides?: Array<{
    claimId: string;
    workerId: string;
    verdict: CortexUltraClaimVerdict;
    reasons?: string[];
  }>;
}

export type CortexUltraVerifierJudge = (
  input: CortexUltraVerifierJudgeInput
) => Promise<CortexUltraVerifierJudgeOutput | null> | CortexUltraVerifierJudgeOutput | null;

export interface CortexUltraVerifierReport {
  task: string;
  status: VerifierStatus;
  verdict: CortexUltraVerifierVerdict;
  acceptedClaims: CortexUltraClaimAssessment[];
  rejectedClaims: CortexUltraClaimAssessment[];
  contestedClaims: CortexUltraClaimAssessment[];
  malformedWorkers: Array<{ workerId: string; reasons: string[] }>;
  warnings: string[];
  requiredRepairs: CortexUltraVerifierRepair[];
  judgeUsed: boolean;
}

export interface CortexUltraVerifierOptions {
  evidenceIndex: Record<string, CortexEvidenceItem>;
  judge?: CortexUltraVerifierJudge;
}

export interface CortexUltraSynthesizerInput {
  task: string;
  workerResults: CortexUltraWorkerResult[];
  verifierReports: CortexUltraVerifierReport[];
  evidenceIndex: Record<string, CortexEvidenceItem>;
  outputFormat?: "markdown" | "structured";
}

export interface CortexUltraFinalVerificationResult {
  status: VerifierStatus;
  warnings?: string[];
}

export type CortexUltraFinalVerificationHelper = (
  output: string
) => Promise<CortexUltraFinalVerificationResult | null> | CortexUltraFinalVerificationResult | null;

export interface CortexUltraSynthesizerOutput {
  status: "complete" | "degraded";
  output: string;
  evidenceUsed: string[];
  limitations: string[];
  excludedClaims: Array<{
    claimId: string;
    workerId: string;
    reason: string;
  }>;
  finalVerificationStatus: VerifierStatus;
  finalVerificationWarnings: string[];
}
