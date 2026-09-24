// ── Cortex Ultra public API ────────────────────────────────────────────────

// Tool-loop types (from Job 4)
export type {
  CortexToolRequest,
  CortexToolPolicyOutcome,
  CortexToolPolicyDecision,
  CortexToolExecutionResult,
  CortexToolObservation,
  CortexEvidenceItem,
  CortexToolLoopOptions,
} from "./types";

// Ultra run/state/receipt types
export type {
  CortexUltraAgentRole,
  CortexUltraRunState,
  CortexUltraCostBudget,
  CortexUltraStoppingRuleTrigger,
  CortexUltraStoppingRule,
  CortexUltraToolCall,
  EvidenceTier,
  CortexUltraEvidenceItem,
  CortexUltraWorkerStatus,
  CortexUltraWorker,
  CortexUltraStep,
  CortexUltraVerifierOutcome,
  CortexUltraVerifierResult,
  CortexUltraSynthesisResult,
  CortexUltraEvalResult,
  TeamReceiptRedactionTier,
  CortexUltraTeamReceipt,
  CortexUltraRun,
} from "./ultra-types";
export { TERMINAL_STATES } from "./ultra-types";

// Execution state helpers
export {
  isTransitionAllowed,
  assertTransitionAllowed,
  createUltraRun,
  appendTimelineEvent,
  transitionState,
  checkCostCeiling,
  addCost,
  markDegradedComplete,
  markAborted,
} from "./execution-state";
export type { CreateUltraRunOptions, CostCeilingCheckResult } from "./execution-state";

// Team receipt
export { buildTeamReceipt, reconstructReceiptFromRun } from "./team-receipt";

// Evidence ledger
export { EvidenceLedger, addEvidence, getAllEvidence, clearEvidence } from "./evidence-ledger";
export type { EvidenceLedgerSummary } from "./evidence-ledger";

// Read-only tool adapter
export {
  executeReadOnlyTool,
  isReadOnly,
  isWriteTool,
  isGrounded,
  READ_ONLY_TOOL_CLASSES,
  WRITE_TOOL_CLASSES,
} from "./read-only-tool-adapter";
export type { ReadOnlyToolResult } from "./read-only-tool-adapter";

// No-progress loop guard
export {
  createNoProgressFingerprint,
  createNoProgressTracker,
  recordNoProgressObservation,
  shouldAbortForNoProgress,
} from "./no-progress";
export type {
  NoProgressFingerprintInput,
  NoProgressTrackerState,
} from "./no-progress";

// Ultra planner
export { planUltraTask } from "./ultra-planner";
export type { UltraPlan, UltraPlanInput, UltraWorkerTaskContract, UltraTopology } from "./ultra-types";

// Team assembler
export { assembleTeam } from "./team-assembler";
export type { UltraTeamAssembly, UltraTeamMember } from "./ultra-types";

// Worker runtime
export { runWorker } from "./worker-runtime";
export type { WorkerStatus, WorkerExecutor, WorkerExecutorOutput, WorkerRunResult } from "./worker-runtime";

// Parallel executor
export { runParallelWorkers } from "./parallel-executor";
export type { ParallelExecutorResult } from "./parallel-executor";

// Verifier runtime
export { runUltraVerifier } from "./verifier-runtime";

// Synthesizer runtime
export { runUltraSynthesizer } from "./synthesizer-runtime";
export type { CortexUltraSynthesizerOutput } from "./types";

// Chat orchestrator
export { runUltraChat } from "./run-ultra-chat";
export type { RunUltraChatInput, RunUltraChatResult } from "./run-ultra-chat";

// Live worker executor
export { createLiveWorkerExecutor } from "./live-worker-executor";
export type { LiveWorkerExecutorOptions } from "./live-worker-executor";
