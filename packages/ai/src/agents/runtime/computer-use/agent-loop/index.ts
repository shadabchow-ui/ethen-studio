export type {
  AgentLoopState,
  AgentLoopBudget,
  AgentLoopContext,
  AgentDecision,
  LoopRunResult,
  RecoveryStep,
  StuckPattern,
  StuckDetectionResult,
  RecoveryState,
  ObservationSignature,
  ModelIntent,
  ModelActionProposal,
  ObservationPacket,
  ActionSummary,
  BudgetState,
  PlanStep,
  UntrustedBlock,
  TrustLabel,
  TrustedBlock,
  TrustTaggedContent,
  ModelAdapter,
} from "./types";

export {
  AGENT_LOOP_TERMINAL_STATES,
  AGENT_LOOP_ACTIVE_STATES,
  agentLoopStateToRunStatus,
  RECOVERY_LADDER,
  RECOVERY_STEP_LABELS,
  createRecoveryState,
  buildObservationSignature,
} from "./types";

export type { BudgetStatus, BudgetTracker } from "./budgets";
export {
  createBudgetTracker,
  recordAction,
  recordFailure,
  countRepeatedSameAction,
  validateBudget,
  isBudgetExceeded,
} from "./budgets";

export type { MockPlannerInput } from "./mock-planner";
export { requestMockDecision, requestFallbackDecision } from "./mock-planner";

export type { AgentLoopController } from "./controller";
export {
  createLoopController,
  tickLoop,
  getLoopResult,
  runAutonomousLoop,
} from "./controller";

export type { BuildObservationPacketInput } from "./observation-packet";
export { buildObservationPacket } from "./observation-packet";

export type { NormalizeResult } from "./action-normalizer";
export { normalizeModelProposal, rejectProposal, validateDecisionSchema } from "./action-normalizer";

export { createNoOpModelAdapter, adapterSatisfiesContract } from "./model-adapter";

export type { VerificationContext } from "./verifier";
export { verifyComputerAction, resolutionEventType } from "./verifier";

export type { StuckDetectorInput } from "./stuck-detector";
export {
  detectStuckLoop,
  recordRecoveryAttempt,
  incrementActionAttempt,
  resetActionAttempt,
  detectBlocker,
} from "./stuck-detector";
export type { BlockerCategory, BlockerDetectionResult, BlockerDetectorInput } from "./stuck-detector";

export type { RecoveryContext, RecoveryExecutionResult } from "./recovery";
export { executeRecoveryStep } from "./recovery";

export type { RouterResult } from "../planner/model-router";
export { routePlannerDecision, getAvailablePlanningProviders } from "../planner/model-router";

export type { PlannerDecision, PlannerDecisionInput, PlannerProviderMode, PlannerProviderConfig, ComputerUsePlannerProvider } from "../planner/providers/types";
export { createProviderNotConfiguredDecision } from "../planner/providers/types";
