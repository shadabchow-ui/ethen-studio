import type {
  ComputerAction,
  ComputerUseReplayEvent,
  ComputerUseRun,
  ComputerUseStep,
  ComputerUseScreenshot,
  PermissionScope,
  BrowserSessionMode,
  ObservationAvailability,
  ObservationSource,
  ObservationElementExcerpt,
  ObservationElementRef,
  ObservationCoordinateMetadata,
  ObservationBlockerFlags,
  ObservationSensitiveFlags,
  ObservationElementCategories,
} from "../types";

export type AgentLoopState =
  | "idle"
  | "starting"
  | "observing"
  | "planning"
  | "proposed_action"
  | "policy_checking"
  | "executing"
  | "verifying"
  | "paused"
  | "approval_needed"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export const AGENT_LOOP_TERMINAL_STATES: Set<AgentLoopState> = new Set([
  "completed",
  "failed",
  "cancelled",
  "timed_out",
]);

export const AGENT_LOOP_ACTIVE_STATES: Set<AgentLoopState> = new Set([
  "starting",
  "observing",
  "planning",
  "proposed_action",
  "policy_checking",
  "executing",
  "verifying",
  "paused",
  "approval_needed",
]);

export interface AgentLoopBudget {
  maxSteps: number;
  maxDurationMs: number;
  maxRepeatedFailures: number;
  maxRepeatedSameAction: number;
}

export interface AgentLoopContext {
  goal: string;
  budget: AgentLoopBudget;
  permissionScope: PermissionScope;
  initialUrl?: string;
}

export interface AgentDecision {
  intent: "act" | "ask_user" | "request_approval" | "complete" | "fail" | "blocked";
  summary: string;
  nextAction?: ComputerAction;
  question?: string;
  reason?: string;
  confidence: "high" | "medium" | "low";
}

export interface LoopRunResult {
  runId: string;
  finalState: AgentLoopState;
  stepsProposed: number;
  decisions: AgentDecision[];
  events: ComputerUseReplayEvent[];
  durationMs: number;
  summary: string;
}

export function agentLoopStateToRunStatus(state: AgentLoopState): string {
  switch (state) {
    case "idle":
      return "idle";
    case "starting":
    case "observing":
    case "planning":
      return "starting";
    case "proposed_action":
    case "policy_checking":
    case "executing":
    case "verifying":
      return "running";
    case "paused":
      return "paused";
    case "approval_needed":
      return "approval_needed";
    case "completed":
      return "complete";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "timed_out":
      return "timed_out";
  }
}

// ── Recovery Ladder Types ───────────────────────────────────────────────

/** Steps in the bounded recovery ladder, in escalation order. */
export type RecoveryStep =
  | "observe_again"
  | "wait_for_stability"
  | "inspect_dom"
  | "try_alternate_action"
  | "retry_with_adjustment"
  | "replan"
  | "ask_user"
  | "fail_with_report";

export const RECOVERY_LADDER: readonly RecoveryStep[] = [
  "observe_again",
  "wait_for_stability",
  "inspect_dom",
  "try_alternate_action",
  "retry_with_adjustment",
  "replan",
  "ask_user",
  "fail_with_report",
];

/** Human-readable labels for recovery steps. */
export const RECOVERY_STEP_LABELS: Record<RecoveryStep, string> = {
  observe_again: "Re-observe page",
  wait_for_stability: "Wait for stability",
  inspect_dom: "Inspect DOM/accessibility",
  try_alternate_action: "Try alternate action",
  retry_with_adjustment: "Retry with adjustment",
  replan: "Re-plan step",
  ask_user: "Ask user for help",
  fail_with_report: "Fail with report",
};

/** Patterns detected by the stuck-loop detector. */
export type StuckPattern =
  | "same_action_type_target"
  | "same_url_title"
  | "same_observation_signature"
  | "repeated_verification_failure"
  | "alternating_states"
  | "max_retries_per_action"
  | "max_total_recovery";

/** Result from the stuck-loop detector. */
export interface StuckDetectionResult {
  isStuck: boolean;
  reason: string;
  pattern?: StuckPattern;
  recoverySuggested: RecoveryStep;
  details: Record<string, unknown>;
}

/** State tracked across recovery attempts. */
export interface RecoveryState {
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  currentActionAttempts: number;
  maxRetriesPerAction: number;
  lastRecoveryStep: RecoveryStep | null;
  ladderHistory: Array<{ step: RecoveryStep; timestamp: string; reason: string }>;
  exhaustionReason: string | null;
}

export function createRecoveryState(
  maxRecoveryAttempts?: number,
  maxRetriesPerAction?: number,
): RecoveryState {
  return {
    recoveryAttempts: 0,
    maxRecoveryAttempts: maxRecoveryAttempts ?? 5,
    currentActionAttempts: 0,
    maxRetriesPerAction: maxRetriesPerAction ?? 3,
    lastRecoveryStep: null,
    ladderHistory: [],
    exhaustionReason: null,
  };
}

/** Lightweight observation signature from available metadata. */
export interface ObservationSignature {
  actionType: string;
  actionPayload: string;
  url: string;
  pageTitle: string | null;
  screenshotHash: string | null;
  verificationPassed: boolean | null;
}

export function buildObservationSignature(params: {
  actionType: string;
  actionUrl?: string | null;
  actionX?: number | null;
  actionY?: number | null;
  actionText?: string | null;
  actionTargetLabel?: string | null;
  currentUrl?: string | null;
  pageTitle?: string | null;
  screenshotHash?: string | null;
  verificationPassed?: boolean | null;
}): ObservationSignature {
  const payloadParts: string[] = [];
  if (params.actionUrl) payloadParts.push(`url:${params.actionUrl}`);
  if (params.actionX !== undefined && params.actionX !== null) payloadParts.push(`x:${params.actionX}`);
  if (params.actionY !== undefined && params.actionY !== null) payloadParts.push(`y:${params.actionY}`);
  if (params.actionText) payloadParts.push(`text:${params.actionText}`);
  if (params.actionTargetLabel) payloadParts.push(`label:${params.actionTargetLabel}`);

  return {
    actionType: params.actionType,
    actionPayload: payloadParts.join("|"),
    url: params.currentUrl ?? "",
    pageTitle: params.pageTitle ?? null,
    screenshotHash: params.screenshotHash ?? null,
    verificationPassed: params.verificationPassed ?? null,
  };
}

// ── Model Types ──────────────────────────────────────────────────────────

export type TrustLabel = "trusted" | "untrusted" | "scoped_trusted";

export interface TrustedBlock {
  label: "trusted";
  source: "user" | "system_policy" | "admin_policy";
  content: string;
}

export interface TrustTaggedContent {
  trusted: TrustedBlock[];
  untrusted: UntrustedBlock[];
  scopedTrusted: UntrustedBlock[];
}

export type ModelIntent =
  | "act"
  | "ask_user"
  | "request_approval"
  | "complete"
  | "fail";

export interface ModelActionProposal {
  intent: ModelIntent;
  summary: string;
  nextAction: ComputerAction | null;
  confidence: number;
  expectedOutcome: string | null;
  riskAssessment: {
    possibleSideEffect: boolean;
    sensitiveDataInvolved: boolean;
    requiresApproval: boolean;
  } | null;
}

// ── Observation Packet Types ─────────────────────────────────────────────

export interface ActionSummary {
  stepIndex: number;
  actionType: string;
  description: string;
  status: string;
  success: boolean;
  browserSessionMode?: string;
}

export interface BudgetState {
  stepsUsed: number;
  maxSteps: number;
  maxRuntimeMinutes: number;
  runtimeMinutesElapsed: number;
  maxCostUsd?: number;
  costUsdUsed?: number;
  overBudget: boolean;
  overBudgetReason?: string;
}

export interface PlanStep {
  stepNumber: number;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "blocked";
}

export interface UntrustedBlock {
  label: "untrusted";
  source: "page" | "screenshot" | "dom" | "tool" | "search" | "email" | "document";
  content: string;
}

export interface ObservationPacket {
  runId: string;
  stepIndex: number;
  userGoal: string | null;
  activePlan: PlanStep[] | null;
  currentUrl: string | null;
  pageTitle: string | null;
  browserSessionMode: BrowserSessionMode | null;
  latestScreenshot: {
    id: string;
    capturedAt: string;
    width: number;
    height: number;
    label: string | null;
  } | null;
  /** Accessibility snapshot text when available. Null when unavailable. */
  accessibilitySnapshot: string | null;
  /** True when a real accessibility snapshot has been produced. */
  accessibilityAvailable: boolean;
  /** Accessibility refs (role + name + bounds) when available. Null when unavailable. */
  accessibilityRefs: Array<{
    ref: string;
    role: string;
    name: string;
    bounds?: { x: number; y: number; width: number; height: number };
  }> | null;
  /** Warning from the session about observation quality (e.g. blank/loading screenshot). */
  observationWarning: string | null;
  /** Where the observation data actually came from: live Playwright, explicit simulation, or unavailable. */
  dataProvenance: BrowserSessionMode | null;
  /** Explanations for why certain observation layers are not available in this packet. */
  blockerHints: string[] | null;
  /** Per-layer availability flags for the current observation. */
  availability: ObservationAvailability | null;
  /** Provider/source identity and capability report for this observation. */
  observationSource: ObservationSource | null;
  /** Overall confidence in this observation's completeness. */
  observationConfidence: "high" | "medium" | "low" | null;
  domSummary: unknown;
  visibleText: unknown;
  lastActions: ActionSummary[];
  pendingApproval: {
    stepId: string;
    actionType: string;
    reason: string;
    riskLevel: string;
  } | null;
  policyScope: {
    allowedDomains: string[];
    blockedDomains: string[];
    allowedActions: string[];
    approvalRequiredActions: string[];
    blockedActions: string[];
    credentialMode: string;
    fileSystemScope: string;
    networkMode: string;
  };
  remainingBudget: BudgetState;
  trustLabels: {
    userInstruction: "trusted";
    pageContent: "untrusted";
    domContent: "untrusted";
    screenshotContent: "untrusted";
    toolOutput: "untrusted";
    modelOutput: "untrusted";
  };
  extractedText: string | null;
  extractedLinks: Array<{ href: string; text: string }> | null;
  extractedHeadings: Array<{ level: number; text: string }> | null;
  extractedTable: string[][] | null;
  domElements: Array<{ tag: string; text?: string }> | null;
  /** Bounded bounding box summaries for observed interactive elements. Always null until a provider returns coordinate data. */
  elementBoundingBoxes: ObservationElementExcerpt[] | null;
  /** Full interactive element ref map with bounding boxes for the current observation snapshot. Null when unavailable. Each ref includes snapshotId for staleness detection. */
  elementRefs: ObservationElementRef[] | null;
  /** Coordinate metadata for mapping screenshot/model coordinates to actual viewport coordinates. Null when unavailable. */
  coordinateMetadata: ObservationCoordinateMetadata | null;

  /** Blocker flags for known blocking patterns (login, MFA, CAPTCHA, etc.). Null when detection data is unavailable. */
  blockerFlags: ObservationBlockerFlags | null;
  /** Sensitive content flags (password fields, payment fields, PII). Null when detection data is unavailable. */
  sensitiveFlags: ObservationSensitiveFlags | null;
  /** Categorized interactive elements (forms, links, buttons, headings, tables). */
  elementCategories: ObservationElementCategories | null;
  /** Console error message summaries when capture is available. Null when unavailable. */
  consoleErrorSummary: string[] | null;
  /** Network request failure summaries when capture is available. Null when unavailable. */
  networkFailureSummary: string[] | null;
}

// ── Model Adapter Interface ──────────────────────────────────────────────

export interface ModelAdapter {
  providerId: string;
  proposeNextAction(packet: ObservationPacket): Promise<ModelActionProposal>;
  verifyAction(
    action: ComputerAction,
    observation: ObservationPacket,
  ): Promise<{
    verified: boolean;
    confidence: "high" | "medium" | "low";
    reasoning: string;
  }>;
  summarizeRun(packets: ObservationPacket[]): Promise<{
    summary: string;
    outcome: "success" | "partial" | "failed" | "blocked";
    keyFindings: string[];
  }>;
}
