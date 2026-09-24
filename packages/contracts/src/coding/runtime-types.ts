// Coding Agent Console Run Lifecycle Types

export type RunStatus =
  | "draft"
  | "planning"
  | "awaiting_plan_approval"
  | "running"
  | "interrupted"
  | "blocked"
  | "failed"
  | "completed"
  | "cancelled";

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  draft: "Draft",
  planning: "Planning",
  awaiting_plan_approval: "Awaiting Approval",
  running: "Running",
  interrupted: "Interrupted",
  blocked: "Blocked",
  failed: "Failed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RUN_STATUS_COLORS: Record<RunStatus, string> = {
  draft: "var(--ethen-text-muted, #9a9892)",
  planning: "var(--ethen-accent-blue, #c8755a)",
  awaiting_plan_approval: "var(--ethen-accent-orange, #c8a56a)",
  running: "var(--ethen-accent-blue, #c8755a)",
  interrupted: "var(--ethen-accent-orange, #c8a56a)",
  blocked: "var(--ethen-accent-orange, #c8a56a)",
  failed: "var(--ethen-accent-red, #c2554a)",
  completed: "var(--ethen-accent-green, #8fa888)",
  cancelled: "var(--ethen-text-muted, #9a9892)",
};

export const ACTIVE_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  "draft", "planning", "awaiting_plan_approval", "running", "interrupted", "blocked",
]);

export const TERMINAL_CODING_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  "failed", "completed", "cancelled",
]);

export type CodingPermissionMode =
  | "chat_only"
  | "plan_only"
  | "ask_before_editing"
  | "workspace_write"
  | "full_access";

export const PERMISSION_MODE_LABELS: Record<CodingPermissionMode, string> = {
  chat_only: "Chat-only",
  plan_only: "Plan-only",
  ask_before_editing: "Ask first",
  workspace_write: "Workspace write",
  full_access: "Full access",
};

export const PERMISSION_MODE_DESCRIPTIONS: Record<CodingPermissionMode, string> = {
  chat_only: "No repo access. General Q&A only.",
  plan_only: "Read and search repo. No file writes or shell mutations.",
  ask_before_editing: "Read allowed. Edits and commands require approval.",
  workspace_write: "Read and write inside workspace. Risky commands ask first.",
  full_access: "Not implemented. Reserved for future unrestricted mode. All operations currently unsupported.",
};

export const PERMISSION_MODE_TIERS: Record<CodingPermissionMode, number> = {
  chat_only: 0, plan_only: 1, ask_before_editing: 2, workspace_write: 3, full_access: 4,
};

export type RunEventType =
  | "user_message"
  | "plan_created"
  | "approval_requested"
  | "approval_decided"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "file_read"
  | "file_write_started"
  | "file_write_succeeded"
  | "file_write_failed"
  | "verification_succeeded"
  | "verification_failed"
  | "command_started"
  | "command_completed"
  | "command_failed"
  | "validation_started"
  | "validation_completed"
  | "final_summary_generated"
  | "run_completed"
  | "run_failed"
  | "patch_proposed"
  | "patch_approved"
  | "patch_rejected"
  | "patch_apply_started"
  | "patch_apply_succeeded"
  | "patch_apply_failed"
  | "patch_checkpoint_created"
  | "patch_rollback_started"
  | "patch_rollback_succeeded"
  | "patch_rollback_failed"
  | "patch_verified"
  | "repair_started"
  | "repair_attempt_failed"
  | "repair_succeeded"
  | "repair_exhausted"
  | "completion_gate_blocked"
  | "user_follow_up_queued"
  | "user_follow_up_applied"
  | "follow_up_skipped"
  | "run_interrupted"
  | "run_resumed"
  | "plan_revised"
  | "iteration_start"
  | "iteration_end"
  | "iteration_stop_limit_reached"
  | "hook_lifecycle_event"
  | "subagent_output_created"
  | "run_started"
  | "run_state_changed"
  | "sandbox_provisioned"
  | "sandbox_cleaned_up";

export const RUN_EVENT_TYPE_LABELS: Record<RunEventType, string> = {
  user_message: "User Message",
  plan_created: "Plan Created",
  approval_requested: "Approval Requested",
  approval_decided: "Approval Decided",
  tool_started: "Tool Started",
  tool_completed: "Tool Completed",
  tool_failed: "Tool Failed",
  file_read: "File Read",
  file_write_started: "File Write Started",
  file_write_succeeded: "File Write Succeeded",
  file_write_failed: "File Write Failed",
  verification_succeeded: "Verification Succeeded",
  verification_failed: "Verification Failed",
  command_started: "Command Started",
  command_completed: "Command Completed",
  command_failed: "Command Failed",
  validation_started: "Validation Started",
  validation_completed: "Validation Completed",
  final_summary_generated: "Final Summary",
  run_completed: "Run Completed",
  run_failed: "Run Failed",
  patch_proposed: "Patch Proposed",
  patch_approved: "Patch Approved",
  patch_rejected: "Patch Rejected",
  patch_apply_started: "Patch Apply Started",
  patch_apply_succeeded: "Patch Apply Succeeded",
  patch_apply_failed: "Patch Apply Failed",
  patch_checkpoint_created: "Checkpoint Created",
  patch_rollback_started: "Rollback Started",
  patch_rollback_succeeded: "Rollback Succeeded",
  patch_rollback_failed: "Rollback Failed",
  patch_verified: "Patch Verified",
  repair_started: "Repair Started",
  repair_attempt_failed: "Repair Attempt Failed",
  repair_succeeded: "Repair Succeeded",
  repair_exhausted: "Repair Exhausted",
  completion_gate_blocked: "Completion Gate Blocked",
  user_follow_up_queued: "Follow-up Queued",
  user_follow_up_applied: "Follow-up Applied",
  follow_up_skipped: "Follow-up Skipped",
  run_interrupted: "Run Interrupted",
  run_resumed: "Run Resumed",
  plan_revised: "Plan Revised",
  iteration_start: "Iteration Start",
  iteration_end: "Iteration End",
  iteration_stop_limit_reached: "Iteration Limit Reached",
  hook_lifecycle_event: "Hook Lifecycle Event",
  subagent_output_created: "Subagent Output",
  run_started: "Run Started",
  run_state_changed: "Run State Changed",
  sandbox_provisioned: "Sandbox Provisioned",
  sandbox_cleaned_up: "Sandbox Cleaned Up",
};

export type RunEventActor = "user" | "agent" | "system" | "policy";

export interface RunEvent {
  id: string;
  runId: string;
  sequence: number;
  type: RunEventType;
  timestamp: string;
  actor: RunEventActor;
  summary: string;
  detail?: string;
  toolName?: string;
  filePath?: string;
  status?: "pending" | "running" | "succeeded" | "failed";
  durationMs?: number;
  expandableOutput?: boolean;
  commandRisk?: string;
  /** Schema version — starts at 1, bumped only on breaking envelope changes. */
  schemaVersion?: number;
  /** Controls UI display layer. Defaults to "user" when absent. */
  visibility?: "user" | "debug" | "audit";
}

export interface CodingPlan {
  goal: string;
  findings: string[];
  proposedChanges: string[];
  nonScope: string[];
  validation: string[];
  risks: string[];
}

export type PlanDecision = "approved" | "revision_requested" | "cancelled" | null;

export type ValidationStatus =
  | "not_run"
  | "pending_approval"
  | "running"
  | "passed"
  | "failed"
  | "skipped"
  | "blocked";

export const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = {
  not_run: "Not Run",
  pending_approval: "Pending Approval",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  skipped: "Skipped",
  blocked: "Blocked",
};

export const VALIDATION_STATUS_COLORS: Record<ValidationStatus, string> = {
  not_run: "var(--ethen-text-muted, #9a9892)",
  pending_approval: "var(--ethen-accent-blue, #c8755a)",
  running: "var(--ethen-accent-blue, #c8755a)",
  passed: "var(--ethen-accent-green, #8fa888)",
  failed: "var(--ethen-accent-red, #c2554a)",
  skipped: "var(--ethen-accent-orange, #c8a56a)",
  blocked: "var(--ethen-text-muted, #9a9892)",
};

export interface ValidationResult {
  command: string;
  status: ValidationStatus;
  exitCode: number | null;
  durationMs: number | null;
  outputSummary: string | null;
  rawOutputRef: string | null;
  changedFiles: string[];
  note?: string;
}

export type RepairStatus =
  | "not_started"
  | "analyzing"
  | "proposing_patch"
  | "awaiting_approval"
  | "applying_patch"
  | "verifying"
  | "succeeded"
  | "failed"
  | "exhausted";

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  not_started: "Not Started",
  analyzing: "Analyzing Failures",
  proposing_patch: "Proposing Repair",
  awaiting_approval: "Awaiting Approval",
  applying_patch: "Applying Repair",
  verifying: "Verifying Repair",
  succeeded: "Repaired",
  failed: "Repair Failed",
  exhausted: "Repair Attempts Exhausted",
};

export interface RepairAttempt {
  attempt: number;
  failedValidation: string[];
  analysis: string;
  patchProposalIds: string[];
  patchApplyIds: string[];
  validationResultsAfter: ValidationResult[];
  status: "in_progress" | "applied" | "verification_failed" | "patch_failed" | "no_patch_possible";
  startedAt: string;
  completedAt?: string;
}

export interface RepairResult {
  totalAttempts: number;
  attempts: RepairAttempt[];
  finalStatus: "repaired" | "exhausted" | "not_applicable";
  repairedCommands: string[];
  unresolvedCommands: string[];
  note: string;
}

// ── Ethen Attempt — human-reviewable run proposal ──────────────────────────
//
// An EthenAttempt wraps a run's output as a human-reviewable proposal.
// Distinct from RepairAttempt (which tracks auto-repair loop steps).
// Attempt work is a proposal until explicitly applied by the user.
//
// This is a minimal additive layer. Attempts are derived from existing run
// state rather than stored as separate records. Actions that lack real
// runtime support (discard, recover) are surfaced as unavailable, not
// falsely enabled.

export type EthenAttemptStatus =
  | "draft"
  | "running"
  | "needs_review"
  | "approved"
  | "applied"
  | "held"
  | "discarded"
  | "failed"
  | "recovered";

export const ETHEN_ATTEMPT_STATUS_LABELS: Record<EthenAttemptStatus, string> = {
  draft: "Draft",
  running: "Running",
  needs_review: "Needs Review",
  approved: "Approved",
  applied: "Applied",
  held: "Held",
  discarded: "Discarded",
  failed: "Failed",
  recovered: "Recovered",
};

export const ETHEN_ATTEMPT_STATUS_COLORS: Record<EthenAttemptStatus, string> = {
  draft: "var(--ethen-text-muted, #9a9892)",
  running: "var(--ethen-accent-blue, #c8755a)",
  needs_review: "var(--ethen-accent-orange, #c8a56a)",
  approved: "var(--ethen-accent-green, #8fa888)",
  applied: "var(--ethen-accent-green, #8fa888)",
  held: "var(--ethen-accent-yellow, #d9b35f)",
  discarded: "var(--ethen-text-muted, #9a9892)",
  failed: "var(--ethen-accent-red, #c2554a)",
  recovered: "var(--ethen-accent-blue, #c8755a)",
};

/**
 * An EthenAttempt is derived from a CodingAgentRun. It is the user-facing
 * representation of a run's output as a human-reviewable proposal.
 *
 * No data fabrications: if a property is unavailable, it is not set.
 * Actions that lack real runtime support are surfaced as unavailable.
 */
export interface EthenAttempt {
  /** Unique attempt ID (derived from run ID). */
  id: string;
  /** The run this attempt wraps. */
  runId: string;
  /** Human-readable label. */
  label: string;
  /** Current status of this attempt. */
  status: EthenAttemptStatus;
  /** Files changed during the run (from run.changedFiles). */
  changedFiles: FileChange[];
  /** Diff hash from checkpoint data or final-diff artifact. */
  diffHash?: string;
  /** Path to the final diff artifact, if persisted. */
  finalDiffPath?: string;
  /** Path to an evidence report, if one was generated. */
  evidenceReportPath?: string;
  /** Validation results available for this attempt. */
  validation?: {
    totalCommands: number;
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
    notRun: number;
    summary: string;
  };
  /** Whether the attempt has a checkpoint that can be restored. */
  hasRestorableCheckpoint: boolean;
  /** When the attempt was created. */
  createdAt: string;
  /** When the attempt was last updated. */
  updatedAt: string;
}

// ── Completion Gate Check ──────────────────────────────────────────────────

export interface CompletionGateCheck {
  name: string;
  passed: boolean;
  reason: string;
}

export interface CompletionGateResult {
  allowed: boolean;
  checks: CompletionGateCheck[];
  blockedReasons: string[];
}

export type CompletionGateState =
  | "not_applicable"
  | "validating"
  | "all_passed"
  | "partial_failures"
  | "all_failed"
  | "not_run"
  | "unavailable";

export const COMPLETION_GATE_LABELS: Record<CompletionGateState, string> = {
  not_applicable: "No validation configured",
  validating: "Validation in progress",
  all_passed: "All checks passed",
  partial_failures: "Some checks failed",
  all_failed: "All checks failed",
  not_run: "Validation not run",
  unavailable: "Validation unavailable",
};

export const COMPLETION_GATE_COLORS: Record<CompletionGateState, string> = {
  not_applicable: "var(--ethen-text-muted, #9a9892)",
  validating: "var(--ethen-accent-blue, #c8755a)",
  all_passed: "var(--ethen-accent-green, #8fa888)",
  partial_failures: "var(--ethen-accent-orange, #c8a56a)",
  all_failed: "var(--ethen-accent-red, #c2554a)",
  not_run: "var(--ethen-accent-orange, #c8a56a)",
  unavailable: "var(--ethen-text-muted, #9a9892)",
};

export interface FileChange {
  path: string;
  kind: "added" | "modified" | "deleted";
  summary: string;
}

export interface FinalReviewSummary {
  taskTitle: string;
  taskSummary: string;
  changedFilesCount: number;
  changedFiles: FileChange[];
  approvals: {
    planApproved: boolean;
    editsApprovedCount: number;
    editsDeniedCount: number;
    commandsApprovedCount: number;
    commandsDeniedCount: number;
    summary: string;
  };
  validation: {
    totalCommands: number;
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
    notRun: number;
    summary: string;
  };
  knownRisks: string[];
  skippedChecks: Array<{ name: string; reason: string }>;
  nextActions: string[];
  generatedAt: string;
}

// ── Browser Preview / App QA (milestone 3.3) ──────────────────────────────

export type BrowserQaState =
  | "not_configured"
  | "unavailable"
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "skipped"
  | "unknown";

export const BROWSER_QA_STATE_LABELS: Record<BrowserQaState, string> = {
  not_configured: "Not configured",
  unavailable: "Unavailable",
  pending: "Pending",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  skipped: "Skipped",
  unknown: "Unknown",
};

export const BROWSER_QA_STATE_COLORS: Record<BrowserQaState, string> = {
  not_configured: "var(--ethen-text-muted, #9a9892)",
  unavailable: "var(--ethen-text-muted, #9a9892)",
  pending: "var(--ethen-accent-yellow, #d9b35f)",
  running: "var(--ethen-accent-blue, #c8755a)",
  passed: "var(--ethen-accent-green, #8fa888)",
  failed: "var(--ethen-accent-red, #c2554a)",
  skipped: "var(--ethen-accent-orange, #c8a56a)",
  unknown: "var(--ethen-text-muted, #9a9892)",
};

export interface RouteSmokeResult {
  routePath: string;
  status: "passed" | "failed" | "skipped" | "not_run" | "unavailable";
  httpStatus?: number;
  consoleErrorCount?: number;
  networkErrorCount?: number;
  summary: string;
  artifactRef?: string;
  timestamp?: string;
}

export interface AppQaEvidence {
  routeTested: string;
  resultSummary: string;
  validationCommand?: string;
  timestamp?: string;
  artifactRefs: string[];
  screenshotRef?: string;
}

/**
 * Screenshot artifact metadata — represents a screenshot taken during
 * browser QA without requiring an actual browser or Playwright runtime.
 * When the environment lacks browser automation, status is "unavailable".
 */
export interface ScreenshotArtifactMetadata {
  /** Unique artifact identifier. */
  id: string;
  /** Run this screenshot belongs to. */
  runId: string;
  /** Route or page the screenshot was taken on. */
  routePath: string;
  /** Caption or description of what this screenshot shows. */
  label: string;
  /**
   * Availability status. "captured" means a real screenshot was taken
   * and has a stored file at artifactPath. "unavailable" means the
   * environment lacks browser automation or the screenshot failed.
   */
  status: "captured" | "unavailable" | "failed";
  /**
   * File path on disk to the screenshot artifact. Only set when
   * status is "captured". Relative to the run's evidence directory.
   */
  artifactPath?: string;
  /** MIME type of the screenshot artifact. Typically "image/png". */
  mimeType?: string;
  /** Timestamp when the screenshot was taken. */
  capturedAt: string;
}

/**
 * Console/network error record — represents a single observed console
 * error or network failure during browser QA. Tied to the run evidence
 * timeline without requiring a real browser.
 */
export interface BrowserQaErrorRecord {
  /** Unique error identifier. */
  id: string;
  /** Run this error was observed in. */
  runId: string;
  /** Source of the error: "console" or "network". */
  source: "console" | "network";
  /** The error message or description. */
  message: string;
  /** Route or URL where the error was observed. */
  routePath: string;
  /** Severity level. */
  severity: "error" | "warning" | "info";
  /** HTTP status code for network errors. Undefined for console errors. */
  httpStatus?: number;
  /** URL of the failed request for network errors. */
  requestUrl?: string;
  /** Timestamp when the error was observed. */
  observedAt: string;
}

export interface CodingAgentRun {
  id: string;
  /** Canonical owner from coding_runs.user_id. Server-only authorization uses this field. */
  ownerUserId?: string;
  title: string;
  prompt: string;
  status: RunStatus;
  mode: CodingPermissionMode;
  executionTarget: ExecutionTarget;
  plan?: CodingPlan;
  planDecision?: PlanDecision;
  planFeedback?: string;
  events: RunEvent[];
  queuedMessages: QueuedMessage[];
  validationResults: ValidationResult[];
  changedFiles: FileChange[];
  finalReview: FinalReviewSummary | null;
  completionGateState: CompletionGateState;
  repairResult: RepairResult | null;
  patchCheckpoints: PatchCheckpoint[];
  sandbox: SandboxState | null;
  approvalRecords: ApprovalRecord[];
  approvalStorageMode: ApprovalStorageMode;
  usage: RunUsage;
  limits: UsageLimits;
  interruptedAt?: string;
  resumedAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Durable evidence chain, persisted at completion time. */
  evidenceChain?: CodingEvidenceChain;
  /** Durable Git/PR handoff artifact, persisted at completion time. */
  handoff?: GitHandoffArtifact | null;
  /** Durable security validation summary, persisted at completion time. */
  securityValidation?: CodingSecurityValidationSummary;
  /** If this run was forked from a prior run, the provenance of that fork. */
  forkedFrom?: ForkProvenance;
  /** Prompt policy version active when this run was created. Set at creation time. */
  promptPolicyVersion?: string;
  /** Browser preview URL if a dev server was started by the agent. */
  devServerUrl?: string;
  /** Route smoke check results collected during this run. */
  routeSmokeResults?: RouteSmokeResult[];
  /** Local background run state. Defaults to "foreground". */
  backgroundState?: RunBackgroundState;
  /** Resolved policy snapshot captured at run creation time. */
  resolvedPolicy?: import("./resolve-policy").ResolvedCodingRunPolicy;
  /** Raw settings snapshot used to resolve the policy. */
  settingsSnapshot?: import("./settings-schema").CodingSettingsSnapshot;
}

// ── Coding evidence chain types (mirrors coding-evidence.ts) ───────────────

export type CodingEvidenceNodeStatus = "passed" | "failed" | "skipped" | "unavailable";

export type CodingEvidenceNodeKind =
  | "plan_created"
  | "plan_decision"
  | "patch_proposed"
  | "patch_approved"
  | "patch_applied"
  | "changed_files_read_back"
  | "validation_attempted"
  | "validation_result"
  | "completion_gate_decision"
  | "ci_status"
  | "browser_qa"
  | "subagent_output";

export interface CodingEvidenceNode {
  id: string;
  kind: CodingEvidenceNodeKind;
  status: CodingEvidenceNodeStatus;
  label: string;
  detail: string;
  dependsOn: string[];
  sourceRefs: string[];
  timestamp: string | null;
}

export interface CodingEvidenceChain {
  runId: string;
  generatedAt: string;
  isNoOpRun: boolean;
  nodes: CodingEvidenceNode[];
  isFullyEvidenced: boolean;
  summary: string;
}

// ── Coding security validation summary (mirrors security-validation-bridge.ts)

export type CodingSecurityReviewStatus =
  | "passed"
  | "failed"
  | "warning"
  | "unavailable"
  | "not_run"
  | "manual_review_required";

export type CodingSecurityEvidenceSource =
  | "coding_validation"
  | "sentinel_review"
  | "none";

export interface CodingSecurityReviewCheck {
  name: string;
  status: CodingSecurityReviewStatus;
  detail: string;
  sourceRef: string | null;
}

export interface CodingSecurityValidationSummary {
  runId: string;
  generatedAt: string;
  status: CodingSecurityReviewStatus;
  label: string;
  detail: string;
  checks: CodingSecurityReviewCheck[];
  evidenceSources: CodingSecurityEvidenceSource[];
  limitations: string[];
  sentinelScanAvailable: boolean;
  sentinelChecks: CodingSecurityReviewCheck[];
}

// ── Queue / interrupt types ───────────────────────────────────────────────

export type QueuedMessageStatus = "queued" | "applied" | "skipped";

export type QueuedMessageTarget =
  | "revise_plan"
  | "continue"
  | "answer"
  | "repair"
  | "follow_up";

export interface QueuedMessage {
  id: string;
  runId: string;
  text: string;
  status: QueuedMessageStatus;
  target: QueuedMessageTarget;
  createdAt: string;
  appliedAt?: string;
  skippedAt?: string;
}

// ── Usage tracking types ──────────────────────────────────────────────────

export interface RunUsage {
  startedAt: number;
  toolCallsUsed: number;
  fileReadsUsed: number;
  patchFilesUsed: number;
  patchBytesUsed: number;
  patchProposalsUsed: number;
  validationCommandsUsed: number;
  repairAttemptsUsed: number;
  terminalCommandsUsed: number;
  providerWarnings: number;
  /** Total provider tokens used across all model calls. Null when no adapter returned usage data. */
  providerTokensUsed: number | null;
  /** Prompt tokens from provider, accumulated across all calls. Null when no adapter returned usage data. */
  providerPromptTokens: number | null;
  /** Completion tokens from provider, accumulated across all calls. Null when no adapter returned usage data. */
  providerCompletionTokens: number | null;
  /** Estimated cost in USD. Always null — no pricing table is configured, so cost is never fabricated. */
  providerEstimatedCostUsd: number | null;
}

export interface UsageLimits {
  maxRunDurationMs: number;
  maxToolCallsPerRun: number;
  maxFileReadsPerRun: number;
  maxPatchFilesPerRun: number;
  maxPatchBytesPerRun: number;
  maxPatchProposalsPerRun: number;
  maxValidationCommandsPerRun: number;
  maxRepairAttempts: number;
  maxTerminalOutputBytesPerCommand: number;
  maxTerminalCommandsPerRun: number;
  maxProviderWarnings: number;
  maxRunsPerDay: number;
  maxProviderTokensPerRun: number;
}

export type ToolPermissionDecision = "allow" | "deny" | "not_implemented";

export interface PlanModePolicy {
  toolId: string;
  decision: ToolPermissionDecision;
  reason: string;
}

// ── Execution Target Model ──────────────────────────────────────────────────────

export type ExecutionTarget =
  | "local_direct"
  | "local_sandbox"
  | "cloud_sandbox"
  | "remote_devbox";

export const EXECUTION_TARGET_LABELS: Record<ExecutionTarget, string> = {
  local_direct: "Direct checkout",
  local_sandbox: "Isolated worktree",
  cloud_sandbox: "Cloud sandbox",
  remote_devbox: "Remote devbox",
};

export const EXECUTION_TARGET_SHORT_LABELS: Record<ExecutionTarget, string> = {
  local_direct: "Direct",
  local_sandbox: "Worktree",
  cloud_sandbox: "Cloud",
  remote_devbox: "Devbox",
};

export const EXECUTION_TARGET_DESCRIPTIONS: Record<ExecutionTarget, string> = {
  local_direct:
    "Agent runs directly on your filesystem with no isolation. Fast but carries higher risk.",
  local_sandbox:
    "Agent runs in a local git worktree — a lightweight copy of the repo with filesystem separation. Not a container or microVM. No kernel-level isolation. Command execution is still guarded by allowlist policy.",
  cloud_sandbox:
    "Agent runs in an isolated cloud environment. Best for autonomous or background work.",
  remote_devbox:
    "Agent runs on a managed remote development box. Enterprise governed.",
};

export type ExecutionTargetStatus =
  | "available"
  | "configured"
  | "not_configured"
  | "unavailable"
  | "not_implemented"
  | "error";

export const EXECUTION_TARGET_STATUS_LABELS: Record<ExecutionTargetStatus, string> = {
  available: "Available",
  configured: "Configured",
  not_configured: "Not configured",
  unavailable: "Unavailable",
  not_implemented: "Not implemented",
  error: "Error",
};

export type ExecutionTargetTrustLevel =
  | "trusted"
  | "worktree"
  | "sandboxed"
  | "untrusted"
  | "not_implemented";

export const EXECUTION_TARGET_TRUST_LABELS: Record<ExecutionTargetTrustLevel, string> = {
  trusted: "Trusted",
  worktree: "Worktree",
  sandboxed: "True sandbox",
  untrusted: "Untrusted",
  not_implemented: "Not implemented",
};

export const EXECUTION_TARGET_TRUST_COLORS: Record<ExecutionTargetTrustLevel, string> = {
  trusted: "var(--ethen-accent-green, #8fa888)",
  worktree: "var(--ethen-accent-blue, #c8755a)",
  sandboxed: "var(--ethen-accent-blue, #c8755a)",
  untrusted: "var(--ethen-accent-orange, #c8a56a)",
  not_implemented: "var(--ethen-text-muted, #9a9892)",
};

export const EXECUTION_TARGET_RISK_LABELS: Record<ExecutionTarget, string> = {
  local_direct: "Higher risk — no isolation",
  local_sandbox: "Worktree — git-level isolation only, no container/VM",
  cloud_sandbox: "Safe — fully isolated",
  remote_devbox: "Enterprise — policy governed",
};

export const EXECUTION_TARGET_WARNINGS: Record<ExecutionTarget, string | null> = {
  local_direct:
    "Agent has direct filesystem access. Edits and commands are not sandboxed. Use for trusted repos only.",
  local_sandbox:
    "Local worktree provides filesystem separation but no kernel, network, or process isolation. Commands still require approval.",
  cloud_sandbox: null,
  remote_devbox: null,
};

export interface ExecutionTargetConfig {
  target: ExecutionTarget;
  status: ExecutionTargetStatus;
  trustLevel: ExecutionTargetTrustLevel;
  networkPolicy?: "allow_all" | "allow_list" | "package_registries_only" | "disabled";
  fileWritePolicy?: "allow_scoped" | "ask_before" | "disabled";
  commandPolicy?: "allow_scoped" | "ask_before" | "disabled";
  requiresSetup?: string[];
}

export function getExecutionTargetConfig(target: ExecutionTarget): ExecutionTargetConfig {
  switch (target) {
    case "local_direct":
      return {
        target,
        status: "available",
        trustLevel: "trusted",
        networkPolicy: "disabled",
        fileWritePolicy: "allow_scoped",
        commandPolicy: "allow_scoped",
        requiresSetup: [],
      };
    case "local_sandbox":
      return {
        target,
        status: "available",
        trustLevel: "worktree",
        networkPolicy: "disabled",
        fileWritePolicy: "allow_scoped",
        commandPolicy: "allow_scoped",
        requiresSetup: [],
      };
    case "cloud_sandbox":
      return {
        target,
        status: "not_implemented",
        trustLevel: "sandboxed",
        networkPolicy: undefined,
        fileWritePolicy: undefined,
        commandPolicy: undefined,
        requiresSetup: ["Cloud sandbox backend", "Provider configuration", "Credentials"],
      };
    case "remote_devbox":
      return {
        target,
        status: "not_implemented",
        trustLevel: "not_implemented",
        networkPolicy: undefined,
        fileWritePolicy: undefined,
        commandPolicy: undefined,
        requiresSetup: ["Remote devbox backend", "SSH configuration", "Enterprise policy"],
      };
  }
}

export const EXECUTION_TARGET_ORDER: ExecutionTarget[] = [
  "local_direct",
  "local_sandbox",
  "cloud_sandbox",
  "remote_devbox",
];

export const EXECUTION_TARGET_DEFAULT: ExecutionTarget = "local_direct";

// ── Sandbox state ─────────────────────────────────────────────────────────

export type SandboxStatus =
  | "not_configured"
  | "not_created"
  | "creating"
  | "ready"
  | "error"
  | "failed"
  | "cleaned_up"
  | "cleanup_pending"
  | "unavailable";

export const SANDBOX_STATUS_LABELS: Record<SandboxStatus, string> = {
  not_configured: "Not configured",
  not_created: "Not created",
  creating: "Creating...",
  ready: "Ready",
  error: "Error",
  failed: "Failed",
  cleaned_up: "Cleaned up",
  cleanup_pending: "Cleanup requires review",
  unavailable: "Unavailable",
};

export const SANDBOX_STATUS_COLORS: Record<SandboxStatus, string> = {
  not_configured: "var(--ethen-accent-orange, #c8a56a)",
  not_created: "var(--ethen-text-muted, #9a9892)",
  creating: "var(--ethen-accent-blue, #c8755a)",
  ready: "var(--ethen-accent-green, #8fa888)",
  error: "var(--ethen-accent-red, #c2554a)",
  failed: "var(--ethen-accent-red, #c2554a)",
  cleaned_up: "var(--ethen-text-muted, #9a9892)",
  cleanup_pending: "var(--ethen-accent-orange, #c8a56a)",
  unavailable: "var(--ethen-text-muted, #9a9892)",
};

export interface SandboxState {
  enabled: boolean;
  path: string | null;
  displayPath: string | null;
  status: SandboxStatus;
  createdAt: string | null;
  diffSummary: string | null;
  changedFilesCount: number;
  error: string | null;
}

export type ApprovalStorageMode = "memory" | "durable" | "unavailable";

export const APPROVAL_STORAGE_MODE_LABELS: Record<ApprovalStorageMode, string> = {
  memory: "Memory only",
  durable: "Durable (Supabase)",
  unavailable: "Storage unavailable",
};

export type FileEditApprovalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "cancelled";

export const FILE_EDIT_APPROVAL_STATUS_LABELS: Record<FileEditApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  expired: "Expired",
  cancelled: "Cancelled",
};

export type FileEditRiskLevel = "low" | "medium" | "high";

// ── File Locks & Conflict Detection ──────────────────────────────────────

export type FileLockReason =
  | "patch_proposed"
  | "patch_applied"
  | "validating"
  | "repairing";

export const FILE_LOCK_REASON_LABELS: Record<FileLockReason, string> = {
  patch_proposed: "Patch Proposed",
  patch_applied: "Patch Applied",
  validating: "Validating",
  repairing: "Repairing",
};

export interface FileLock {
  runId: string;
  filePath: string;
  reason: FileLockReason;
  createdAt: string;
  /** Lock expires at this timestamp. Undefined = held until run completes. */
  expiresAt?: string;
}

export type ConflictSeverity = "none" | "read_only_overlap" | "proposal_overlap" | "apply_blocked";

export const CONFLICT_SEVERITY_LABELS: Record<ConflictSeverity, string> = {
  none: "No Conflict",
  read_only_overlap: "Read-Only Overlap",
  proposal_overlap: "Proposal Overlap",
  apply_blocked: "Apply Blocked",
};

export interface FileConflict {
  filePath: string;
  severity: ConflictSeverity;
  /** Run IDs that conflict on this file */
  conflictingRunIds: string[];
  /** The lock reason, if held by another active run */
  lockedByReason?: FileLockReason;
  detail: string;
}

export interface ActiveRunConflictSummary {
  /** This run's ID */
  runId: string;
  /** Whether any conflict exists */
  hasConflict: boolean;
  /** Overall severity */
  severity: ConflictSeverity;
  /** Per-file conflicts */
  conflicts: FileConflict[];
  /** Safe to continue? */
  safeToContinue: boolean;
}

export interface FileEditApprovalRequest {
  id: string;
  runId: string;
  proposalId?: string;
  toolId: "file.write" | "file.edit";
  filePath: string;
  reason: string;
  riskLevel: FileEditRiskLevel;
  status: FileEditApprovalStatus;
  affectedFiles: string[];
  currentContentHash?: string;
  proposedContent?: string;
  editDescription: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
}

export interface FileEditVerificationResult {
  filePath: string;
  verified: boolean;
  expectedHash?: string;
  actualContent?: string;
  diff?: string;
  error?: string;
  verifiedAt: string;
}

export interface FileEditProposal {
  runId: string;
  title: string;
  reason: string;
  affectedFiles: string[];
  editDescription: string;
  riskLevel: FileEditRiskLevel;
  edits: Array<{
    toolId: "file.write" | "file.edit";
    filePath: string;
    content?: string;
    oldText?: string;
    newText?: string;
  }>;
}

export type WriteProposalStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "applied"
  | "failed";

export const WRITE_PROPOSAL_STATUS_LABELS: Record<WriteProposalStatus, string> = {
  proposed: "Proposed",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
  failed: "Failed",
};

export interface FileWriteEdit {
  filePath: string;
  content: string;
}

export interface WriteProposal {
  id: string;
  runId: string;
  title: string;
  reason: string;
  edits: FileWriteEdit[];
  affectedFiles: string[];
  editDescription: string;
  riskLevel: FileEditRiskLevel;
  status: WriteProposalStatus;
  beforeContentHashes: Record<string, string>;
  /** Hash of the exact edits plus repository preimage state presented for approval. */
  payloadHash?: string;
  /** Captured only when approval is granted; apply must match it exactly. */
  approvedPayloadHash?: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
  appliedAt?: string;
}

export interface WriteApplyResult {
  success: boolean;
  proposalId: string;
  filePath: string;
  applied: string[];
  failed: string[];
  diffs: Record<string, string>;
  errors: string[];
  verifiedBeforeHashes: boolean;
}

// ── Terminal Command Proposal and Approval ─────────────────────────────────

export type TerminalCommandStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "running"
  | "completed"
  | "failed"
  | "blocked";

export const TERMINAL_COMMAND_STATUS_LABELS: Record<TerminalCommandStatus, string> = {
  proposed: "Proposed",
  approved: "Approved",
  rejected: "Rejected",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
};

export type TerminalCommandRisk =
  | "safe_read_only"
  | "build_test"
  | "package_install"
  | "git_mutating"
  | "destructive"
  | "network"
  | "secret_cloud"
  | "unknown";

export const TERMINAL_COMMAND_RISK_LABELS: Record<TerminalCommandRisk, string> = {
  safe_read_only: "Safe read-only",
  build_test: "Build / test",
  package_install: "Package install",
  git_mutating: "Git mutating",
  destructive: "Destructive",
  network: "Network",
  secret_cloud: "Secrets / cloud",
  unknown: "Unknown risk",
};

export const TERMINAL_COMMAND_RISK_COLORS: Record<TerminalCommandRisk, string> = {
  safe_read_only: "var(--ethen-accent-green, #8fa888)",
  build_test: "var(--ethen-accent-blue, #c8755a)",
  package_install: "var(--ethen-accent-yellow, #d9b35f)",
  git_mutating: "var(--ethen-accent-orange, #c8a56a)",
  destructive: "var(--ethen-accent-red, #c2554a)",
  network: "var(--ethen-accent-orange, #c8a56a)",
  secret_cloud: "var(--ethen-accent-red, #c2554a)",
  unknown: "var(--ethen-accent-orange, #c8a56a)",
};

export type TerminalCommandBlockReason =
  | "plan_mode"
  | "chat_only"
  | "read_only_unsafe"
  | "empty_command"
  | "path_traversal"
  | "outside_repo_cwd"
  | "destructive_blocked"
  | "network_blocked"
  | "package_install_blocked"
  | "missing_approval"
  | "not_in_allowlist"
  | "injection_detected"
  | "unknown";

export const TERMINAL_BLOCK_REASONS: Record<TerminalCommandBlockReason, string> = {
  plan_mode: "Terminal execution is blocked in Plan Mode. Approve the plan to enable commands.",
  chat_only: "Terminal execution is blocked in Chat-only mode.",
  read_only_unsafe: "Only safe read-only commands are allowed in this mode.",
  empty_command: "Empty commands are rejected.",
  path_traversal: "Command cwd contains path traversal. Commands must stay within the repo root.",
  outside_repo_cwd: "Command cwd is outside the connected repository root.",
  destructive_blocked: "Destructive commands (rm -rf, chmod 777, shutdown, etc.) are blocked. This command cannot execute.",
  network_blocked: "Network commands (curl, wget, ssh, etc.) are blocked. This command cannot execute.",
  package_install_blocked: "Package install commands (npm install, pip install, etc.) are blocked. This command cannot execute.",
  missing_approval: "Command requires approval before execution.",
  not_in_allowlist: "Command is not in the shell.run allowlist (pnpm lint|typecheck|build|test, git diff|status).",
  injection_detected: "Command contains shell injection patterns (&&, ||, ;, |, $(), backticks, redirection) and is blocked. Only single, plain validation commands are allowed.",
  unknown: "Command execution blocked for an unknown reason.",
};

export interface TerminalCommandProposal {
  id: string;
  runId: string;
  command: string;
  cwd: string;
  risk: TerminalCommandRisk;
  reason: string;
  status: TerminalCommandStatus;
  proposedAt: string;
  decidedAt?: string;
  startedAt?: string;
  completedAt?: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  outputSummary: string | null;
  durationMs: number | null;
  blockedReason?: TerminalCommandBlockReason;
  truncatedOutput: boolean;
  redacted?: boolean;
}

export interface TerminalRunResult {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

// ── Patch Proposal and Apply ─────────────────────────────────────────────

export type PatchProposalStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "applied"
  | "failed";

export const PATCH_PROPOSAL_STATUS_LABELS: Record<PatchProposalStatus, string> = {
  proposed: "Proposed",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
  failed: "Failed",
};

export interface PatchProposalInput {
  runId: string;
  title: string;
  reason: string;
  edits: FileWriteEdit[];
  editDescription?: string;
  riskLevel?: FileEditRiskLevel;
}

export interface PatchProposalResult {
  proposalId: string;
  runId: string;
  title: string;
  status: "proposed";
  affectedFiles: string[];
  beforeContentHashes: Record<string, string>;
  editDescription: string;
  riskLevel: FileEditRiskLevel;
  requiresApproval: boolean;
  policyChecks: PatchPolicyCheck[];
  createdAt: string;
}

export interface PatchPolicyCheck {
  filePath: string;
  check: string;
  passed: boolean;
  reason?: string;
}

export interface PatchApplyInput {
  runId: string;
  proposalId: string;
  approvalId?: string;
  approvalToken?: string;
  atomic?: boolean;
}

export interface PatchApplyResult {
  patchId: string;
  status: "applied" | "failed" | "partial";
  appliedFiles: string[];
  failedFiles: string[];
  diffs: Record<string, string>;
  checkpointId: string;
  rollbackAvailable: boolean;
  verification: PatchVerificationResult;
  errors: string[];
  beforeContentHashes: Record<string, string>;
  afterContentHashes: Record<string, string>;
}

export interface PatchCheckpoint {
  id: string;
  runId: string;
  proposalId: string;
  patchId: string;
  files: PatchCheckpointFile[];
  createdAt: string;
}

export interface PatchCheckpointFile {
  filePath: string;
  originalContent: string;
  originalHash: string;
  newContent: string;
  newHash: string;
}

export interface PatchVerificationResult {
  verified: boolean;
  checks: PatchFileVerification[];
  summary: string;
}

export interface PatchFileVerification {
  filePath: string;
  verified: boolean;
  expectedHash: string;
  actualHash: string;
  contentMatches: boolean;
  error?: string;
}

// ── Durable domain types ──────────────────────────────────────────────────

export interface CodingProject {
  id: string;
  name: string;
  repoPath: string;
  repoHash?: string;
  createdAt: string;
  updatedAt: string;
}

export type ToolCallStatus = "started" | "completed" | "failed" | "blocked";

export interface CodingToolCall {
  id: string;
  runId: string;
  toolId: string;
  status: ToolCallStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export type ApprovalKind = "plan" | "file_edit" | "terminal_command" | "patch";

export type ApprovalDecision = "pending" | "approved" | "denied" | "expired";

export interface CodingApproval {
  id: string;
  runId: string;
  kind: ApprovalKind;
  title: string;
  description: string;
  decision: ApprovalDecision;
  decidedBy?: string;
  createdAt: string;
  decidedAt?: string;
  metadata?: Record<string, unknown>;
}

export type PatchStatus = "proposed" | "approved" | "applied" | "rejected" | "failed";

export interface CodingPatch {
  id: string;
  runId: string;
  title: string;
  reason: string;
  status: PatchStatus;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CodingPatchFile {
  id: string;
  patchId: string;
  filePath: string;
  action: "create" | "modify" | "delete";
  beforeContent?: string;
  afterContent?: string;
  diff?: string;
}

export type ArtifactKind = "plan" | "report" | "summary" | "diff" | "log" | "other";

export interface CodingArtifact {
  id: string;
  runId: string;
  kind: ArtifactKind;
  title: string;
  content: string;
  format: "text" | "markdown" | "json" | "html";
  createdAt: string;
}

// ── Durable summary types referenced from other modules ────────────────────

/** Git/PR handoff artifact — persisted as jsonb at completion time. */
export interface GitHandoffArtifact {
  runId: string;
  generatedAt: string;
  suggestedBranchName: string;
  suggestedCommitMessage: string;
  suggestedPrTitle: string;
  suggestedPrBody: string;
  changedFiles: FileChange[];
  validationSummary: {
    totalCommands: number;
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
    summary: string;
  };
  evidenceSummary: {
    totalNodes: number;
    passed: number;
    failed: number;
    skipped: number;
    unavailable: number;
    isFullyEvidenced: boolean;
    summary: string;
  };
  completionGate: {
    state: CompletionGateState;
    checks: CompletionGateCheck[];
    allowed: boolean;
  };
  reviewerChecklist: string[];
  remainingRisks: string[];
  manualFollowUps: string[];
  impactSummary: string;
}

/** Evidence chain — re-export of CodingEvidenceChain for replay.ts compatibility. */
export type EvidenceChain = CodingEvidenceChain;

/** Fork provenance — links a forked run back to its source. */
export interface ForkProvenance {
  sourceRunId: string;
  sourceRunTitle: string;
  sourceRunGoal?: string;
  forkedAt: string;
  forkedBy?: string;
  forkedFromStatus: RunStatus;
  forkedNote?: string;
  provenanceNote: string;
  excludedUnsafeArtifacts: string[];
  includedContext: string[];
}

export const DEFAULT_FORK_PROVENANCE_NOTE =
  "Forked from a prior coding run. No patches, commands, or Git actions have been reapplied.";

export type AuditAction =
  | "run.created"
  | "run.status_changed"
  | "plan.approved"
  | "plan.denied"
  | "plan.revision_requested"
  | "file.edit_approved"
  | "file.edit_denied"
  | "terminal.approved"
  | "terminal.denied"
  | "patch.approved"
  | "patch.denied"
  | "patch.apply_started"
  | "patch.apply_succeeded"
  | "patch.apply_failed"
  | "validation.run"
  | "validation.passed"
  | "validation.failed";

export interface CodingAuditLog {
  id: string;
  runId: string;
  action: AuditAction;
  actor: string;
  actorKind: RunEventActor;
  detail?: string;
  createdAt: string;
}

// ── GitHub Branch + Commit Proposal (milestone 3.1a) ──────────────────────
// PROPOSAL ONLY — no real branch, commit, push, or PR is created.
// All fields are clearly labeled as proposals (not live Git objects).

export type ProposalStatus = "proposal_only";

export interface BranchProposal {
  status: ProposalStatus;
  generatedAt: string;
  sanitizedBranchName: string;
  suggestedBaseBranch: string | null;
  baseCommit: string | null;
  baseCommitAvailable: boolean;
  collisionWarning: string | null;
  readinessNotes: string[];
  runId: string;
  runTitle: string;
}

export interface CommitProposal {
  status: ProposalStatus;
  generatedAt: string;
  commitTitle: string;
  commitBody: string;
  branchName: string;
  changedFilesCount: number;
  changedFiles: string[];
  validationPassed: number;
  validationFailed: number;
  validationSkipped: number;
  completionGateAllowed: boolean | null;
  completionGateState: string;
  evidenceFullyEvidenced: boolean;
  risks: string[];
  limitations: string[];
  readinessNotes: string[];
  runId: string;
  runTitle: string;
}

export interface ReadinessGate {
  ready: boolean;
  reasons: string[];
  hasChangedFiles: boolean;
  hasValidationResults: boolean;
  completionGatePassed: boolean | null;
  evidenceSatisfied: boolean;
  statusLabel: string;
  proposalLabel: string;
}

// ── PR Open / Update Loop (milestone 3.1c) ─────────────────────────────
// Defines PR lifecycle state, body generation data, readiness gates, dry-run
// behavior, and explicit not-configured/proposal-only states.
// PROPOSAL ONLY — no real PR is opened or updated.
// Live PR execution is disabled/not configured unless existing safe runtime
// proves otherwise.

export type PrLifecycleState =
  | "not_configured"
  | "proposal_only"
  | "branch_commit_not_ready"
  | "pr_ready"
  | "approval_required"
  | "approved"
  | "dry_run_ready"
  | "blocked"
  | "failed"
  | "opened"
  | "updated";

export const PR_LIFECYCLE_STATE_LABELS: Record<PrLifecycleState, string> = {
  not_configured: "Not configured",
  proposal_only: "Proposal only",
  branch_commit_not_ready: "Branch/commit not ready",
  pr_ready: "PR ready",
  approval_required: "Approval required",
  approved: "Approved",
  dry_run_ready: "Dry run ready",
  blocked: "Blocked",
  failed: "Failed",
  opened: "Opened",
  updated: "Updated",
};

export const PR_LIFECYCLE_STATE_COLORS: Record<PrLifecycleState, string> = {
  not_configured: "var(--ethen-text-muted, #9a9892)",
  proposal_only: "var(--ethen-accent-blue, #c8755a)",
  branch_commit_not_ready: "var(--ethen-accent-orange, #c8a56a)",
  pr_ready: "var(--ethen-accent-blue, #c8755a)",
  approval_required: "var(--ethen-accent-orange, #c8a56a)",
  approved: "var(--ethen-accent-green, #8fa888)",
  dry_run_ready: "var(--ethen-accent-blue, #c8755a)",
  blocked: "var(--ethen-accent-red, #c2554a)",
  failed: "var(--ethen-accent-red, #c2554a)",
  opened: "var(--ethen-accent-green, #8fa888)",
  updated: "var(--ethen-accent-green, #8fa888)",
};

export interface PrBodyData {
  title: string;
  summary: string;
  changedFiles: Array<{ path: string; kind: string; summary: string }>;
  validationResults: Array<{ command: string; status: string; exitCode: number | null }>;
  evidenceSummary: string;
  risks: string[];
  limitations: string[];
  checklist: string[];
  generatedByNote: string;
  generatedAt: string;
}

export interface PrReadinessGate {
  ready: boolean;
  reasons: string[];
  branchCommitReady: boolean;
  changedFilesExist: boolean;
  validationKnown: boolean;
  completionGateKnown: boolean;
  remoteWriteReady: boolean;
  githubConfigured: boolean;
  statusLabel: string;
}

export interface PrDryRun {
  wouldOpen: boolean;
  wouldUpdate: boolean;
  title: string;
  body: string;
  targetBranch: string;
  sourceBranch: string;
  changedFiles: number;
  validationSummary: string;
  completionGatePassed: boolean;
  approvalRequired: boolean;
  liveExecutionDisabled: boolean;
  liveExecutionReason: string;
  noApiCall: boolean;
  noMutation: boolean;
}

export interface PrProposal {
  runId: string;
  lifecycle: PrLifecycleState;
  stateLabel: string;
  body: PrBodyData;
  readinessGate: PrReadinessGate;
  dryRun: PrDryRun | null;
  approvalRequired: boolean;
  approvalStatus: "not_requested" | "pending" | "approved" | "denied" | "stale";
  limitations: string[];
  generatedAt: string;
}

// ── Approval Object Model V2 ────────────────────────────────────────────────
// Common runtime approval record type. Adapters map existing plan/write/terminal
// approval sources into this unified model so approval display and lifecycle
// become consistent and auditable without rewriting existing stores.

export type ApprovalCategory = "plan" | "write" | "terminal" | "github_remote" | "github_pr" | "mcp" | "subagent";

export const APPROVAL_CATEGORY_LABELS: Record<ApprovalCategory, string> = {
  plan: "Plan",
  write: "Write",
  terminal: "Terminal",
  github_remote: "GitHub Remote",
  github_pr: "GitHub PR",
  mcp: "MCP",
  subagent: "Subagent",
};

export type ApprovalRecordStatus =
  | "pending"
  | "approved"
  | "denied"
  | "consumed"
  | "stale";

export const APPROVAL_RECORD_STATUS_LABELS: Record<ApprovalRecordStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  consumed: "Consumed",
  stale: "Stale",
};

export interface ApprovalRecord {
  id: string;
  runId: string;
  category: ApprovalCategory;
  requestedAction: string;
  scope: string;
  riskLabel: string | null;
  status: ApprovalRecordStatus;
  createdAt: string;
  decidedAt: string | null;
  consumedAt: string | null;
  artifactRef: string | null;
  proposalRef: string | null;
  commandRef: string | null;
  evidenceRefs: string[];
}

// ── CI Watcher: Read-Only Status (milestone 3.2a) ───────────────────────────
// Read-only CI status model. No GitHub writes, no workflow dispatch, no rerun,
// no PR mutation. When no live CI integration exists, status is "not_configured".

export type CiProvider = "github_actions" | "not_configured" | "manual";

export type CiConclusion =
  | "not_configured"
  | "unknown"
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "unavailable";

export const CI_STATUS_LABELS: Record<CiConclusion, string> = {
  not_configured: "Not configured",
  unknown: "Unknown",
  pending: "Pending",
  running: "Running",
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
  timed_out: "Timed out",
  unavailable: "Unavailable",
};

export const CI_STATUS_COLORS: Record<CiConclusion, string> = {
  not_configured: "var(--ethen-text-muted, #9a9892)",
  unknown: "var(--ethen-text-muted, #9a9892)",
  pending: "var(--ethen-accent-yellow, #d9b35f)",
  running: "var(--ethen-accent-blue, #c8755a)",
  success: "var(--ethen-accent-green, #8fa888)",
  failed: "var(--ethen-accent-red, #c2554a)",
  cancelled: "var(--ethen-text-muted, #9a9892)",
  skipped: "var(--ethen-accent-orange, #c8a56a)",
  timed_out: "var(--ethen-accent-red, #c2554a)",
  unavailable: "var(--ethen-text-muted, #9a9892)",
};

export interface CiCheck {
  id: string;
  provider: CiProvider;
  workflowName: string;
  jobName: string | null;
  stepName: string | null;
  ref: string | null;
  branch: string | null;
  commitSha: string | null;
  status: CiConclusion;
  conclusion: CiConclusion | null;
  startedAt: string | null;
  completedAt: string | null;
  url: string | null;
  summary: string;
}

export interface CiStatus {
  provider: CiProvider;
  conclusion: CiConclusion;
  totalChecks: number;
  checks: CiCheck[];
  workflowFilesDiscovered: string[];
  hasWorkflowFiles: boolean;
  hasLiveIntegration: boolean;
  notConfiguredReason: string | null;
  generatedAt: string;
}

// ── CI Watcher: Failure Classification (milestone 3.2b) ────────────────────
// Classifies CI/local validation failures into deterministic categories
// based on parser output, exit codes, command names, and error patterns.
// Read-only — no repair, no re-run, no mutation.

export type FailureCategory =
  | "typecheck"
  | "lint"
  | "test"
  | "build"
  | "dependency"
  | "configuration"
  | "permission"
  | "timeout"
  | "flaky"
  | "infrastructure"
  | "unrelated"
  | "unknown";

export const FAILURE_CATEGORY_LABELS: Record<FailureCategory, string> = {
  typecheck: "Type error",
  lint: "Lint error",
  test: "Test failure",
  build: "Build error",
  dependency: "Dependency issue",
  configuration: "Configuration error",
  permission: "Permission denied",
  timeout: "Timeout",
  flaky: "Flaky test",
  infrastructure: "Infrastructure",
  unrelated: "Unrelated",
  unknown: "Unknown",
};

export const FAILURE_CATEGORY_COLORS: Record<FailureCategory, string> = {
  typecheck: "var(--ethen-accent-blue, #c8755a)",
  lint: "var(--ethen-accent-yellow, #d9b35f)",
  test: "var(--ethen-accent-red, #c2554a)",
  build: "var(--ethen-accent-orange, #c8a56a)",
  dependency: "var(--ethen-accent-orange, #c8a56a)",
  configuration: "var(--ethen-accent-yellow, #d9b35f)",
  permission: "var(--ethen-accent-red, #c2554a)",
  timeout: "var(--ethen-accent-red, #c2554a)",
  flaky: "var(--ethen-accent-orange, #c8a56a)",
  infrastructure: "var(--ethen-accent-red, #c2554a)",
  unrelated: "var(--ethen-text-muted, #9a9892)",
  unknown: "var(--ethen-text-muted, #9a9892)",
};

export type ClassificationConfidence = "high" | "medium" | "low";

export interface FailureEvidenceSnippet {
  line: number;
  text: string;
  source: "parser_diagnostic" | "raw_output" | "summary";
}

export interface FailureClassification {
  category: FailureCategory;
  confidence: ClassificationConfidence;
  title: string;
  detail: string;
  evidenceSnippets: FailureEvidenceSnippet[];
  impactedCommand: string;
  impactedFiles: string[];
  recommendedAction: string;
  source: "parser_output" | "exit_code_only" | "command_name" | "unknown";
  notes: string | null;
  logRedacted: boolean;
}

export interface CiClassificationSummary {
  runId: string;
  generatedAt: string;
  totalChecks: number;
  failedChecks: number;
  classifications: FailureClassification[];
  unknownCount: number;
  notProvidedCount: number;
  summary: string;
}

// ── Local Background Runs (milestone 4.3a) ──────────────────────────────────
// Local-only background run state model. No cloud, devbox, worker, or daemon.
// Background execution is unavailable unless real local infrastructure exists.

export type RunBackgroundState =
  | "foreground"
  | "queued"
  | "paused"
  | "background_ready"
  | "background_running"
  | "background_blocked"
  | "background_completed"
  | "background_failed"
  | "unavailable";

export const RUN_BACKGROUND_STATE_LABELS: Record<RunBackgroundState, string> = {
  foreground: "Foreground",
  queued: "Queued",
  paused: "Paused",
  background_ready: "Background ready",
  background_running: "Background running",
  background_blocked: "Background blocked",
  background_completed: "Background completed",
  background_failed: "Background failed",
  unavailable: "Unavailable",
};

export const RUN_BACKGROUND_STATE_COLORS: Record<RunBackgroundState, string> = {
  foreground: "var(--ethen-accent-blue, #c8755a)",
  queued: "var(--ethen-accent-yellow, #d9b35f)",
  paused: "var(--ethen-accent-orange, #c8a56a)",
  background_ready: "var(--ethen-accent-green, #8fa888)",
  background_running: "var(--ethen-accent-blue, #c8755a)",
  background_blocked: "var(--ethen-accent-red, #c2554a)",
  background_completed: "var(--ethen-accent-green, #8fa888)",
  background_failed: "var(--ethen-accent-red, #c2554a)",
  unavailable: "var(--ethen-text-muted, #9a9892)",
};

// ── Devbox Execution (milestone 4.3b) ───────────────────────────────────────
// Honest devbox capability model. No SSH, remote command execution, file sync,
// secrets upload, cloud provisioning, billing, or provider SDKs.

export type DevboxStatus =
  | "not_configured"
  | "not_provided"
  | "disabled"
  | "checking"
  | "ready"
  | "blocked"
  | "failed"
  | "unavailable";

export const DEVBOX_STATUS_LABELS: Record<DevboxStatus, string> = {
  not_configured: "Not configured",
  not_provided: "Not provided",
  disabled: "Disabled",
  checking: "Checking",
  ready: "Ready",
  blocked: "Blocked",
  failed: "Failed",
  unavailable: "Unavailable",
};

export const DEVBOX_STATUS_COLORS: Record<DevboxStatus, string> = {
  not_configured: "var(--ethen-text-muted, #9a9892)",
  not_provided: "var(--ethen-text-muted, #9a9892)",
  disabled: "var(--ethen-text-muted, #9a9892)",
  checking: "var(--ethen-accent-blue, #c8755a)",
  ready: "var(--ethen-accent-green, #8fa888)",
  blocked: "var(--ethen-accent-red, #c2554a)",
  failed: "var(--ethen-accent-red, #c2554a)",
  unavailable: "var(--ethen-text-muted, #9a9892)",
};
