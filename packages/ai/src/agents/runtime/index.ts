export { type AgentRun, type AgentRunStatus, type AgentAction, type AgentActionStatus, type AgentEvidence, type EvidenceType, type AgentRegistryEntry, type AgentValidationResult, type AgentValidationGate, type ConnectorDefinition, type ConnectorActionResult, type RunTriggerType, type BackgroundRunStatus, type BackgroundAgentsDashboard, type SubagentTreeNode, type RuntimeTransitionContext, type RuntimeTransitionError, type RuntimeTransitionLogEntry, TERMINAL_RUN_STATUSES, ACTIVE_RUN_STATUSES, agentRunStatusToBackgroundStatus, type FunctionalAgentRunStatus, type FunctionalAgentWorkflowStep, type FunctionalAgentEvidenceItem, type FunctionalAgentEvidenceType, type FunctionalAgentArtifact, type FunctionalAgentArtifactType, type FunctionalAgentProposedAction, type FunctionalAgentActionRiskLevel, type FunctionalAgentActionStatus, type FunctionalAgentApprovalBoundary, type FunctionalAgentDemoDataRef, type FunctionalAgentEvalCase, type FunctionalAgentSpec, FUNCTIONAL_TO_RUNTIME_MAPPING } from "./types";

export { getEntry, listEntries, listEntriesByStatus, listActiveEntries, registerEntry, isEntryRunnable } from "./registry";

export { getFunctionalAgentSpec, listFunctionalAgentSpecs, hasFunctionalAgentSpec, getFunctionalAgentSpecsByCategory, registerFunctionalAgentSpec } from "./functional-registry";

export { createDemoFunctionalRun, createDemoEvidenceItems, createDemoArtifact, createDemoProposedActions, getEvalFixtureForAgent, listEvalFixtureScenarios, resetDemoCounters } from "./demo-runs";

export { createAgentRun, recordAgentAction, requestAgentApproval, rejectAgentApproval, cancelAgentRun, failAgentRun, recordAgentEvidence, appendAgentAuditEntry, resolveAgentRunStatus, validateAgentRun, validateIdempotency, type AgentRunResult, type AgentActionResult, type AgentApprovalResult } from "./helpers";



export { createRun, getRun, getRunByIdempotencyKey, setRunStatus, setRunOutput, cancelRun, failRun, getRunsForAgent, getActiveRuns, getRunCount, getRunTransitionLog, getRootRuns, getChildRuns, getBackgroundAgentsDashboard, createAction, getAction, setActionStatus, setActionOutput, getActionsForRun, getPendingActionsForRun, recordEvidence, getEvidenceForRun, getEvidenceForAction, buildRunAuditEntry, resetRuntimeStore, type CreateRunInput, type CreateActionInput, type CreateEvidenceInput } from "./run-store";

export { canTransitionRunStatus, getAllowedRunTransitions, isTerminalRunStatus, type RuntimeTransitionDecision } from "./state-machine";
export { buildRecoveryContext, canEnterRecovery, createRecoveryDescriptor, type RuntimeRecoveryDescriptor } from "./recovery";

export { getPersistenceMode, resetPersistenceCache, PERSISTENCE_MODE_LABELS, PERSISTENCE_MODE_DESCRIPTIONS, type PersistenceMode } from "./service";

export { buildSubagentTree, buildAllSubagentTrees, buildAncestorSubagentTree, flattenSubagentTree, getDashboard, deriveRunTitle, deriveRoleLabel, type FlatTreeNode } from "./subagent-tree";

export { WAVE1_REGISTRY } from "./wave1-registry";
export { WAVE1_FUNCTIONAL_SPECS } from "./functional-specs";
export { WAVE3_FUNCTIONAL_SPECS } from "./wave3-functional-specs";

export { generateAllEvalFixtures, getEvalFixtureForSlug, type EvalFixture } from "./eval-fixtures";



export { generateReplayBundle, generateReplayJson, generateReplayMarkdown, validateReplayInvariants, type ReplayBundle, type ReplayScreenshotEntry } from "./computer-use/replay";
export { createArtifact, getArtifacts, getArtifactSummary, getArtifactsByType, generateArtifactManifest, generateArtifactMarkdown, type ArtifactSummary } from "./computer-use/artifacts";
export { generateBugReport, generateBugReportMarkdown, validateBugReportSchema, collectBugFindings, type BugReport, type BugFinding, type BugSeverity } from "./computer-use/bug-report";
export { createComputerUseRun, getComputerUseRun, setComputerUseRunStatus, listComputerUseRuns, addComputerUseStep, getComputerUseSteps, addComputerUseScreenshot, getComputerUseScreenshots, addComputerUseApproval, getComputerUseApprovals, addComputerUseArtifact, getComputerUseArtifacts, addComputerUseObservation, getComputerUseObservations, addComputerUseEvent, getComputerUseEvents, resetComputerUseStore, getNowIso } from "./computer-use/store";
export type { ComputerUseRunStatus, ComputerUseMode, ComputerUseProvider, CredentialMode, FileSystemScope, NetworkMode, DataRetention, PermissionScope, TaskBrief, SandboxSession, CostEstimate, ComputerUseRun, TimelineEventType, EventActor, ComputerUseScreenshot, ComputerActionType, ComputerAction, ActionResult, VerificationResult, PolicyDecision, ComputerUseStep, ComputerUseApproval, ComputerUseArtifact, ComputerUseObservation, ComputerUseReplayEvent, TERMINAL_CU_RUN_STATUSES, ACTIVE_CU_RUN_STATUSES, EnvironmentMode } from "./computer-use/types";

export type {
  LocalCompanionStatus,
  LocalCompanionHandshake,
  LocalPermissionKey,
  LocalPermissionStatus,
  LocalDesktopActionType,
  LocalDesktopRiskLevel,
} from "./computer-use/local-desktop-companion";

export {
  LOCAL_COMPANION_UNAVAILABLE_REASON,
  LOCAL_DESKTOP_PERMISSION_KEYS,
  LOCAL_DESKTOP_ACTION_TYPES,
  HIGH_RISK_LOCAL_ACTIONS,
  MEDIUM_RISK_LOCAL_ACTIONS,
  LOW_RISK_LOCAL_ACTIONS,
  getLocalCompanionHandshake,
  getLocalPermissionStatuses,
  buildLocalPermissionSummary,
  getLocalDesktopActionRisk,
  isLocalDesktopActionAvailable,
  attemptLocalDesktopAction,
} from "./computer-use/local-desktop-companion";

export {
  type QaResultStatus,
  type QaCheckStatus,
  type QaFindingSeverity,
  type QaCheck,
  type QaFinding,
  type QaScreenshotRef,
  type QaObservation,
  type QaResult,
  type QaRunConfig,
} from "./computer-use/qa-types";

export { executeComputerAction, createMockBrowserSession, normalizeAction, describeAction, type BrowserSession, type ExecuteActionInput, type ExecuteActionResult } from "./computer-use/actions";
export { runQa, type QaAgentContext, type QaTimelineEvent } from "./computer-use/qa-agent";
export { buildQaReport, type QaReportDocument } from "./computer-use/qa-report";

export type {
  AgentLoopState,
  AgentLoopBudget,
  AgentLoopContext,
  AgentDecision,
  LoopRunResult,
} from "./computer-use/agent-loop";
export {
  AGENT_LOOP_TERMINAL_STATES,
  AGENT_LOOP_ACTIVE_STATES,
  agentLoopStateToRunStatus,
  createBudgetTracker,
  recordAction,
  recordFailure,
  validateBudget,
  isBudgetExceeded,
  requestMockDecision,
  createLoopController,
  tickLoop,
  getLoopResult,
  runAutonomousLoop,
} from "./computer-use/agent-loop";
