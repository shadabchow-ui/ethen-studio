export type {
  ComputerUseRunStatus,
  ComputerUseMode,
  ComputerUseProvider,
  ComputerUseRun,
  ComputerUseStep,
  ComputerAction,
  ComputerActionType,
  ActionResult,
  VerificationResult,
  PolicyDecision,
  ComputerUseScreenshot,
  ComputerUseApproval,
  ComputerUseArtifact,
  ComputerUseObservation,
  ComputerUseReplayEvent,
  ComputerUseReplayEvent as ComputerUseTimelineEvent,
  ComputerUseReplayEvent as TimelineItem,
  ComputerUseReplayEvent as ReplayEvent,
  SensitiveActionCategory,
  PermissionScope,
  TaskBrief,
  SandboxSession,
  CostEstimate,
  TimelineEventType,
  EventActor,
  CredentialMode,
  FileSystemScope,
  NetworkMode,
  DataRetention,
  ObservationTrustLevel,
  ObservationAvailability,
  ObservationSource,
  ObservationElementExcerpt,
  SuspiciousContentResult,
  PolicyAccessMode,
  DomainPolicyMode,
  DesktopSessionMode,
  DesktopCapability,
  DesktopCapabilityStatus,
  DesktopCapabilityReport,
} from "./types";

export {
  TERMINAL_CU_RUN_STATUSES,
  ACTIVE_CU_RUN_STATUSES,
  POLICY_TEMPLATE_NAMES,
  SENSITIVE_ACTION_CATEGORIES,
  DESKTOP_ACTION_PREFIX,
  DESKTOP_CRITICAL_RISK_ACTIONS,
  isDesktopActionType,
} from "./types";

export {
  createComputerUseRun,
  getComputerUseRun,
  setComputerUseRunStatus,
  listComputerUseRuns,
  getComputerUseSteps,
  addComputerUseStep,
  getComputerUseScreenshots,
  addComputerUseScreenshot,
  getComputerUseApprovals,
  addComputerUseApproval,
  getComputerUseArtifacts,
  addComputerUseArtifact,
  getComputerUseObservations,
  addComputerUseObservation,
  getComputerUseEvents,
  addComputerUseEvent,
  resetComputerUseStore,
  getNowIso,

  createRun,
  getRun,
  listRuns,
  updateRunStatus,
  updateRunSandbox,
  addStep,
  updateStepStatus,
  getStepsForRun,
  addScreenshot,
  getScreenshotsForRun,
  requestApproval,
  resolveApproval,
  getApprovalsForRun,
  getPendingApprovals,
  getExpiredApprovals,
  computePayloadHash,
  addArtifact,
  getArtifactsForRun,
  getEventsForRun,
  resetStore,
  takeoverRun,
  returnFromTakeover,
  computeCanonicalActionIdentity,

  type CreateRunInput,
} from "./store";

export {
  seedMockRuns,
  isSeeded,
  resetSeed,
} from "./seed";

export {
  createDefaultPermissionScope,
  createLocalhostScope,
  createReadOnlyScope,
  createGuidedBrowserScope,
  isDomainAllowed,
  isLocalhostUrl,
  isPublicHttpUrl,
  isActionAllowed,
  isActionApprovalRequired,
  isActionBlocked,
  validatePermissionScope,
  summarizePermissionScope,
  isDesktopActionPermitted,
  blockAllDesktopActions,
} from "./permissions";

export type { PolicyTemplate } from "./policy-templates";
export {
  OBSERVE_ONLY_TEMPLATE,
  GUIDED_BROWSER_TEMPLATE,
  AUTONOMOUS_BROWSER_TEMPLATE,
  QA_BROWSER_TEMPLATE,
  POLICY_TEMPLATES,
  getPolicyTemplate,
  isPolicyTemplateName,
  resolvePermissionScope,
} from "./policy-templates";

export type { ComputerUseRiskLevel, SensitiveActionDetection } from "./risk";
export {
  getActionRiskLevel,
  isLowRiskAction,
  isMediumRiskAction,
  isHighRiskAction,
  isCriticalRiskAction,
  isDefaultBlockedAction,
  couldBeFormSubmit,
  couldBeDownload,
  couldBeUpload,
  couldBePayment,
  couldBeCredentialEntry,
  couldBeDestructive,
  couldBeAccountChange,
  couldBeExternalMessage,
  couldBeCaptchaOrMfa,
  detectSensitiveActionCategories,
  isDesktopAction,
  isKnownActionType,
} from "./risk";

export {
  createArtifact,
  getArtifacts,
  getArtifactSummary,
  getArtifactsByType,
  generateArtifactManifest,
  generateArtifactMarkdown,
} from "./artifacts";

export {
  generateReplayBundle,
  generateReplayJson,
  generateReplayMarkdown,
  validateReplayInvariants,
} from "./replay";

export type { PolicyEventType, PolicyEvaluation } from "./policy";
export {
  evaluateComputerUseAction,
  evaluateStepPolicy,
  shouldRequireApproval,
  isPolicyBlocked,
  isPolicyAllowed,
  isPauseStateAllowed,
  isStopStateAllowed,
  isTakeoverStateAllowed,
  getEffectivePolicyForStep,
  isFileUrl,
  isLocalNetworkUrl,
  isPrivateNetworkUrl,
  detectSuspiciousInstructions,
  isExfiltrationRisk,
  evaluateUrlSafety,
} from "./policy";

export {
  collectBugFindings,
  generateBugReport,
  generateBugReportMarkdown,
  generateBugReportArtifact,
  validateBugReportSchema,
  type BugFinding,
  type BugReport,
  type BugSeverity,
} from "./bug-report";

export type { BrowserSession, ExecuteActionInput, ExecuteActionResult } from "./actions";
export {
  executeComputerAction,
  createMockBrowserSession,
  normalizeAction,
  describeAction,
} from "./actions";

export type { BrowserSessionMode } from "./types";

export type { EnvironmentMode } from "./types";

// ── Local Desktop Companion Contract ─────────────────────────────────────

export type {
  LocalCompanionStatus,
  LocalCompanionStatusWithPlaceholder,
  LocalCompanionHandshake,
  LocalPermissionKey,
  LocalPermissionState,
  LocalPermissionStatus,
  LocalDesktopActionType,
  LocalDesktopRiskLevel,
} from "./local-desktop-companion";
export {
  migrateComputerUseRecords,
  rollbackComputerUseMigration,
  snapshotLegacyComputerUse,
} from "./migration";
export type {
  ComputerUseLegacyRecordKind,
  ComputerUseMigrationCheckpoint,
  ComputerUseMigrationRecord,
  ComputerUseMigrationResult,
  ComputerUseMigrationTarget,
} from "./migration";
export { recoverComputerUseRun } from "./durable-recovery";
export { storeComputerUseScreenshotEvidence } from "./screenshot-evidence";
export {
  authorizeComputerUseAction,
  requestComputerUseApproval,
} from "./approval-binding";
export { COMPUTER_USE_CAPABILITY_GATE } from "./capability-gate";

export {
  LOCAL_COMPANION_UNAVAILABLE_REASON,
  LOCAL_COMPANION_UNAVAILABLE_HANDSHAKE,
  LOCAL_DESKTOP_PERMISSION_KEYS,
  LOCAL_DESKTOP_ACTION_TYPES,
  HIGH_RISK_LOCAL_ACTIONS,
  MEDIUM_RISK_LOCAL_ACTIONS,
  LOW_RISK_LOCAL_ACTIONS,
  getLocalCompanionHandshake,
  getLocalPermissionStatuses,
  buildLocalPermissionSummary,
  getLocalDesktopActionRisk,
  createLocalDesktopSession,
  isLocalDesktopActionAvailable,
  attemptLocalDesktopAction,
} from "./local-desktop-companion";

// ── Agent Loop Recovery ──────────────────────────────────────────────────

export type {
  RecoveryStep,
  StuckPattern,
  StuckDetectionResult,
  RecoveryState,
  ObservationSignature,
} from "./agent-loop/types";

export {
  RECOVERY_LADDER,
  RECOVERY_STEP_LABELS,
  createRecoveryState,
  buildObservationSignature,
} from "./agent-loop/types";

export {
  detectStuckLoop,
  recordRecoveryAttempt,
  incrementActionAttempt,
  resetActionAttempt,
} from "./agent-loop/stuck-detector";

export type {
  StuckDetectorInput,
} from "./agent-loop/stuck-detector";

export {
  executeRecoveryStep,
} from "./agent-loop/recovery";

export type {
  RecoveryContext,
  RecoveryExecutionResult,
} from "./agent-loop/recovery";

export { verifyComputerAction, resolutionEventType } from "./agent-loop/verifier";

// ── Agent Loop Controller (DEPRECATED reference implementation — live path is deterministic-loop.ts) ──

export type { AgentLoopState, AgentLoopBudget, AgentLoopContext, AgentDecision, LoopRunResult } from "./agent-loop";
export { AGENT_LOOP_TERMINAL_STATES, AGENT_LOOP_ACTIVE_STATES, agentLoopStateToRunStatus } from "./agent-loop";

export type { BudgetStatus, BudgetTracker } from "./agent-loop";
export {
  createBudgetTracker,
  recordAction,
  recordFailure,
  countRepeatedSameAction,
  validateBudget,
  isBudgetExceeded,
} from "./agent-loop";

export type { MockPlannerInput } from "./agent-loop";
export { requestMockDecision, requestFallbackDecision } from "./agent-loop";

// DEPRECATED — reference typed state machine, not the live loop path.
// The live authoritative loop is deterministic-loop.ts.
export type { AgentLoopController } from "./agent-loop";
export {
  createLoopController,
  tickLoop,
  getLoopResult,
  runAutonomousLoop,
} from "./agent-loop";

export type {
  TextExtractionResult,
  LinkExtractionResult,
  HeadingExtractionResult,
  TableExtractionResult,
} from "./types";

export type {
  TrustLabel,
  TrustedBlock,
  UntrustedBlock,
  TrustTaggedContent,
  PlanStep,
  ActionSummary,
  BudgetState,
  ObservationPacket,
  ModelIntent,
  ModelActionProposal,
  ModelAdapter,
} from "./agent-loop";

export {
  buildObservationPacket,
  type BuildObservationPacketInput,
} from "./agent-loop";

export {
  createNoOpModelAdapter,
  adapterSatisfiesContract,
} from "./agent-loop";

export {
  normalizeModelProposal,
  rejectProposal,
  validateDecisionSchema,
  type NormalizeResult,
} from "./agent-loop";

export type { DeterministicLoopResult } from "./deterministic-loop";
export {
  runDeterministicLoop,
} from "./deterministic-loop";

export type { AuditBundle, AuditRunSummary, AuditPolicyScope, AuditTimelineEntry, AuditActionEntry, AuditScreenshotEntry, AuditApprovalEntry, AuditArtifactEntry, AuditUsageSummary, AuditStatusEntry, AuditIntegrityMetadata } from "./audit";
export {
  generateAuditBundle,
  generateAuditMarkdown,
  validateAuditBundleShape,
} from "./audit";

export type {
  ComputerUseStorageAdapter,
  ComputerUseStorageKind,
  ComputerUseRunStore,
  ComputerUseStepStore,
  ComputerUseScreenshotStore,
  ComputerUseApprovalStore,
  ComputerUseArtifactStore,
  ComputerUseObservationStore,
  ComputerUseEventStore,
  CreateRunStoreInput,
} from "./storage";

export {
  SCREENSHOT_STORAGE_LIMITATION,
  createInMemoryComputerUseAdapter,
  getComputerUseStorageAdapter,
  setComputerUseStorageAdapter,
  resetComputerUseStorageAdapter,
} from "./storage";

export type {
  ComputerUseRuntimeService,
  ComputerUseRunSummary,
  StorageKind,
  ComputerUseRunDataSource,
} from "./service";
export {
  createComputerUseRuntimeService,
  getComputerUseRuntimeService,
  getEvidenceStorageDescription,
} from "./service";

export type { CostField, UsageSummary } from "./usage";
export {
  deriveUsageSummary,
  deriveUsageSummaryForRun,
} from "./usage";

// ── Desktop Sandbox Adapter (future virtual desktop runtime seam) ──────

export type {
  DesktopSession,
  DesktopSessionLifecycle,
} from "./desktop-sandbox-adapter";

export {
  createUnavailableDesktopSession,
  isDesktopSandboxAvailable,
  getDesktopSandboxProviderStatus,
  DESKTOP_SANDBOX_UNAVAILABLE_REASON,
} from "./desktop-sandbox-adapter";

// ── Storage Supabase Adapter ───────────────────────────────────────────────

export {
  createSupabaseComputerUseAdapter,
  getSupabaseAdapterReadiness,
  type SupabaseAdapterReadiness,
} from "./storage-supabase";

// ── Reliability Harness ────────────────────────────────────────────────────

export type {
  ReliabilityMetrics,
  ReliabilityScenario,
  ReliabilityScenarioStep,
  ReliabilityEvalResult,
} from "./reliability";

export {
  computeReliabilityMetrics,
  runReliabilityScenario,
  runReliabilityEvals,
  printReliabilityEvalResults,
} from "./reliability";

// ── Observation Builder ──────────────────────────────────────────────────

export type { BuildObservationInput } from "./observation-builder";
export { buildObservation } from "./observation-builder";
export type { ComputerUseQaFixture, ComputerUseQaFixtureKind } from "./qa-fixtures";
export { COMPUTER_USE_QA_FIXTURES } from "./qa-fixtures";
