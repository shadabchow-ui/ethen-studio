// ── Cortex Ultra run/state/receipt types ──────────────────────────────────
// Separate from tool-loop types in types.ts to avoid duplication.
// Execution runtime (planner, workers, etc.) is a future job.

// ── Agent roles ────────────────────────────────────────────────────────────

export type CortexUltraAgentRole =
  | "planner"
  | "worker"
  | "tool_executor"
  | "verifier"
  | "synthesizer"
  | "final_verifier"
  | "coordinator";

// ── Topologies ─────────────────────────────────────────────────────────────

export type UltraTopology =
  | "single_verified"
  | "parallel_primary_and_critic"
  | "research_and_analysis"
  | "tool_heavy_single_worker";

// ── Planner types ──────────────────────────────────────────────────────────

export interface UltraWorkerTaskContract {
  workerId: string;
  /** Generic runtime role retained for executor compatibility. */
  role: CortexUltraAgentRole;
  /** Distinct responsibility within the selected topology. */
  specialistRole: "primary" | "critic" | "researcher" | "analyst" | "tool_specialist";
  assignedTask: string;
  expectedOutputContract: string[];
  requiredTools: string[];
  toolPolicy: {
    allowedTools: string[];
    mode: "optional" | "required";
  };
  evidenceRequirements: string[];
  /** Bounded, compact ledger evidence. Tool output is untrusted data, never instructions. */
  evidenceContext?: Array<{ id: string; summary: string; toolClass: string }>;
  /** Original user goal retained separately from the specialist assignment. */
  originalGoal?: string;
  verifierChecklistLink: string[];
  maxToolCalls: number;
  timeoutMs: number;
}

export interface UltraPlan {
  planId: string;
  taskSummary: string;
  topology: UltraTopology;
  workers: UltraWorkerTaskContract[];
  toolRequirements: string[];
  evidenceRequirements: string[];
  verifierChecklist: string[];
  userVisibleSummary: string;
  costLimitUsd: number;
  timeLimitMs: number;
  maxWorkers: number;
}

export interface UltraPlanInput {
  task: string;
  availableTools?: string[];
  maxWorkers?: number;
  costLimitUsd?: number;
  timeLimitMs?: number;
}

// ── Team assembler types ───────────────────────────────────────────────────

export interface UltraTeamMember {
  memberId: string;
  role: CortexUltraAgentRole;
  assignedTasks: string[];
  toolScope: string[];
  maxToolCalls: number;
  workerContract?: UltraWorkerTaskContract;
}

export interface UltraTeamAssembly {
  assemblyId: string;
  planId: string;
  topology: UltraTopology;
  members: UltraTeamMember[];
  maxWorkers: number;
  costController: UltraTeamMember;
}

// ── Run state machine ──────────────────────────────────────────────────────

export type CortexUltraRunState =
  | "PREFLIGHT"
  | "PLANNING"
  | "PLAN_VALIDATION"
  | "TEAM_ASSEMBLY"
  | "WORKER_DISPATCH"
  | "TOOL_LOOP_RUNNING"
  | "WORKER_INTEGRATION"
  | "VERIFICATION"
  | "REPAIR_OR_RERUN"
  | "SYNTHESIS"
  | "FINAL_VERIFICATION"
  | "COMPLETE"
  | "DEGRADED_COMPLETE"
  | "ABORTED";

export const TERMINAL_STATES: ReadonlySet<CortexUltraRunState> = new Set([
  "COMPLETE",
  "DEGRADED_COMPLETE",
  "ABORTED",
]);

// ── Cost budget ────────────────────────────────────────────────────────────

export interface CortexUltraCostBudget {
  /** Hard ceiling in USD; run aborts if exceeded. */
  hardCeilingUsd: number;
  /** Soft warning threshold. */
  softWarningUsd: number;
  /** Accumulated spend so far. */
  accumulatedUsd: number;
  /** Maximum tool call iterations across all workers. */
  maxToolCallIterations: number;
  /** Consumed tool call iterations. */
  consumedToolCallIterations: number;
}

// ── Stopping rule ──────────────────────────────────────────────────────────

export type CortexUltraStoppingRuleTrigger =
  | "cost_ceiling_exceeded"
  | "iteration_limit_exceeded"
  | "worker_failure_threshold"
  | "verifier_rejection_limit"
  | "manual_abort"
  | "timeout";

export interface CortexUltraStoppingRule {
  trigger: CortexUltraStoppingRuleTrigger;
  triggeredAt: string;
  detail: string;
}

// ── Tool calls (Ultra worker level) ───────────────────────────────────────

export interface CortexUltraToolCall {
  toolCallId: string;
  workerId: string;
  toolName: string;
  /** Sanitized args safe for user-visible receipt. */
  argsRedacted: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  status: "pending" | "running" | "success" | "error";
  /** Summary safe for user receipt; no raw output. */
  outputSummary: string | null;
  errorMessage: string | null;
  tokensCost: number | null;
}

// ── Evidence (Ultra) ───────────────────────────────────────────────────────

export type EvidenceTier = "primary" | "supporting" | "contradicting" | "uncertain";

export interface CortexUltraEvidenceItem {
  evidenceId: string;
  workerId: string;
  sourceToolCallId: string | null;
  tier: EvidenceTier;
  summary: string;
  url: string | null;
  confidence: number; // 0–1
  addedAt: string;
}

// ── Workers ────────────────────────────────────────────────────────────────

export type CortexUltraWorkerStatus =
  | "pending"
  | "running"
  | "waiting_for_tools"
  | "integrating"
  | "complete"
  | "failed"
  | "skipped";

export interface CortexUltraWorker {
  workerId: string;
  role: CortexUltraAgentRole;
  assignedSubtask: string;
  modelId: string | null;
  providerId: string | null;
  status: CortexUltraWorkerStatus;
  startedAt: string | null;
  completedAt: string | null;
  toolCalls: CortexUltraToolCall[];
  evidence: CortexUltraEvidenceItem[];
  outputSummary: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  failureReason: string | null;
}

// ── Steps ──────────────────────────────────────────────────────────────────

export interface CortexUltraStep {
  stepId: string;
  runId: string;
  state: CortexUltraRunState;
  startedAt: string;
  completedAt: string | null;
  agentRole: CortexUltraAgentRole | null;
  workerId: string | null;
  detail: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
}

// ── Verifier result ────────────────────────────────────────────────────────

export type CortexUltraVerifierOutcome =
  | "pass"
  | "pass_with_warnings"
  | "fail_repairable"
  | "fail_terminal";

export interface CortexUltraVerifierResult {
  verifierId: string;
  runId: string;
  role: "verifier" | "final_verifier";
  outcome: CortexUltraVerifierOutcome;
  score: number | null; // 0–1
  warnings: string[];
  failureReasons: string[];
  modelId: string | null;
  completedAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
}

// ── Synthesis result ───────────────────────────────────────────────────────

export interface CortexUltraSynthesisResult {
  synthesisId: string;
  runId: string;
  modelId: string | null;
  output: string;
  workerIdsIncluded: string[];
  evidenceIdsIncluded: string[];
  completedAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
}

// ── Eval result ────────────────────────────────────────────────────────────

export interface CortexUltraEvalResult {
  evalId: string;
  runId: string;
  dimension: string;
  score: number; // 0–1
  label: string;
  detail: string | null;
  evaluatedAt: string;
}

// ── Team receipt ───────────────────────────────────────────────────────────

export type TeamReceiptRedactionTier = "full" | "summary" | "minimal";

export type CostEstimateStatus = "exact" | "estimated" | "unavailable";

export interface CortexUltraTeamReceipt {
  receiptId: string;
  runId: string;
  requestId: string;
  generatedAt: string;
  redactionTier: TeamReceiptRedactionTier;
  workerCount: number;
  workersSucceeded: number;
  totalToolCalls: number;
  evidenceCount: number;
  finalOutput: string | null;
  verifierOutcome: CortexUltraVerifierOutcome | null;
  finalVerifierOutcome: CortexUltraVerifierOutcome | null;
  degraded: boolean;
  aborted: boolean;
  abortReason: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  costEstimateStatus: CostEstimateStatus;
  costEstimateReason: string | null;
  /** Tool names only — no args or raw output. */
  toolsUsed: string[];
  workerSummaries: Array<{
    workerId: string;
    role: CortexUltraAgentRole;
    subtask: string;
    status: CortexUltraWorkerStatus;
    providerId: string | null;
    modelId: string | null;
    estimatedCostUsd: number | null;
    outputSummary: string | null;
  }>;
  evalResults: CortexUltraEvalResult[];
  stoppingRule: CortexUltraStoppingRule | null;
  durationMs: number | null;
}

// ── Top-level run ──────────────────────────────────────────────────────────

export interface CortexUltraRun {
  runId: string;
  requestId: string;
  userId: string | null;
  sessionId: string | null;
  projectId: string | null;
  state: CortexUltraRunState;
  intentSummary: string | null;
  plan: string[] | null;
  workers: CortexUltraWorker[];
  steps: CortexUltraStep[];
  verifierResults: CortexUltraVerifierResult[];
  synthesisResult: CortexUltraSynthesisResult | null;
  evalResults: CortexUltraEvalResult[];
  costBudget: CortexUltraCostBudget;
  stoppingRule: CortexUltraStoppingRule | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  timeline: Array<{
    at: string;
    event: string;
    state: CortexUltraRunState;
    detail?: string;
  }>;
}
