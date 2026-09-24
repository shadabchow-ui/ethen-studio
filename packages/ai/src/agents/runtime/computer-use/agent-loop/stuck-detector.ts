import type {
  ComputerUseStep,
  ComputerUseScreenshot,
  ComputerUseReplayEvent,
} from "../types";
import type {
  ObservationSignature,
  RecoveryState,
  StuckDetectionResult,
  StuckPattern,
  RecoveryStep,
} from "./types";
import { buildObservationSignature } from "./types";

// ── Configuration ────────────────────────────────────────────────────────

const MAX_STUCK_WINDOW = 20;
const SAME_ACTION_REPEAT_THRESHOLD = 3;
const SAME_SIGNATURE_REPEAT_THRESHOLD = 3;
const VERIFICATION_FAILURE_REPEAT_THRESHOLD = 3;
const ALTERNATING_CYCLE_LENGTH = 2;
const ALTERNATING_CYCLE_REPEATS = 2;
const MAX_UNKNOWN_OUTCOME_STREAK = 5;

// ── Signature comparison ─────────────────────────────────────────────────

function signaturesEqual(a: ObservationSignature, b: ObservationSignature): boolean {
  return (
    a.actionType === b.actionType &&
    a.actionPayload === b.actionPayload &&
    a.url === b.url &&
    a.screenshotHash === b.screenshotHash
  );
}

function actionKey(step: ComputerUseStep): string {
  const a = step.action;
  const parts: string[] = [a.type];
  if (a.url) parts.push(`url:${a.url}`);
  if (a.x !== undefined) parts.push(`x:${a.x}`);
  if (a.y !== undefined) parts.push(`y:${a.y}`);
  if (a.text) parts.push(`t:${a.text}`);
  if (a.targetLabel) parts.push(`l:${a.targetLabel}`);
  return parts.join("|");
}

// ── Observation signature from available repo metadata ───────────────────

function deriveSignaturesFromSteps(
  steps: ComputerUseStep[],
  screenshots: ComputerUseScreenshot[],
): ObservationSignature[] {
  const screenshotByStepId = new Map<string, ComputerUseScreenshot>();
  for (const ss of screenshots) {
    if (ss.stepId) screenshotByStepId.set(ss.stepId, ss);
  }

  return steps.map((step) => {
    const afterSs = step.afterScreenshotId
      ? screenshotByStepId.get(step.afterScreenshotId)
      : undefined;

    return buildObservationSignature({
      actionType: step.action.type,
      actionUrl: step.action.url ?? null,
      actionX: step.action.x ?? null,
      actionY: step.action.y ?? null,
      actionText: step.action.text ?? null,
      actionTargetLabel: step.action.targetLabel ?? null,
      currentUrl: step.result?.browserSessionMode ? undefined : null,
      /** screenshotHash is available from stored screenshots; if not, null is a safe fallback. */
      screenshotHash: afterSs?.hash ?? null,
      pageTitle: null,
      verificationPassed: step.result?.verification?.passed ?? null,
    });
  });
}

// ── Detection patterns ────────────────────────────────────────────────────

function detectRepeatedSameAction(
  recentKeys: string[],
): { pattern: StuckPattern; reason: string } | null {
  if (recentKeys.length < SAME_ACTION_REPEAT_THRESHOLD) return null;

  const last = recentKeys[recentKeys.length - 1];
  let sameCount = 0;
  for (let i = recentKeys.length - 1; i >= 0; i--) {
    if (recentKeys[i] === last) sameCount++;
    else break;
  }

  if (sameCount >= SAME_ACTION_REPEAT_THRESHOLD) {
    return {
      pattern: "same_action_type_target",
      reason: `Same action repeated ${sameCount} times consecutively: ${last}`,
    };
  }
  return null;
}

function detectRepeatedSameSignature(
  signatures: ObservationSignature[],
): { pattern: StuckPattern; reason: string } | null {
  if (signatures.length < SAME_SIGNATURE_REPEAT_THRESHOLD) return null;

  const last = signatures[signatures.length - 1];
  let sameCount = 0;
  for (let i = signatures.length - 1; i >= 0; i--) {
    if (signaturesEqual(signatures[i], last)) sameCount++;
    else break;
  }

  if (sameCount >= SAME_SIGNATURE_REPEAT_THRESHOLD) {
    return {
      pattern: "same_observation_signature",
      reason: `Same observation signature repeated ${sameCount} times (${last.actionType} @ ${last.url || "unknown URL"}, hash: ${last.screenshotHash ?? "none"})`,
    };
  }
  return null;
}

function detectRepeatedVerificationFailure(
  steps: ComputerUseStep[],
): { pattern: StuckPattern; reason: string } | null {
  const recentSteps = steps.slice(-MAX_STUCK_WINDOW);
  if (recentSteps.length < VERIFICATION_FAILURE_REPEAT_THRESHOLD) return null;

  let failStreak = 0;
  for (let i = recentSteps.length - 1; i >= 0; i--) {
    const v = recentSteps[i].result?.verification;
    if (v && !v.passed) failStreak++;
    else break;
  }

  if (failStreak >= VERIFICATION_FAILURE_REPEAT_THRESHOLD) {
    return {
      pattern: "repeated_verification_failure",
      reason: `Verification failed ${failStreak} times in a row without recovery progress`,
    };
  }
  return null;
}

function detectAlternatingStates(
  recentKeys: string[],
): { pattern: StuckPattern; reason: string } | null {
  if (recentKeys.length < ALTERNATING_CYCLE_LENGTH * ALTERNATING_CYCLE_REPEATS) return null;

  const a = recentKeys[recentKeys.length - 1];
  const bVal = recentKeys[recentKeys.length - 2];
  if (a === bVal) return null;

  const expected = ALTERNATING_CYCLE_LENGTH * ALTERNATING_CYCLE_REPEATS;
  let cycleCount = 1;
  for (let i = recentKeys.length - 2 - (ALTERNATING_CYCLE_LENGTH - 1); i >= 0; i -= ALTERNATING_CYCLE_LENGTH) {
    if (recentKeys[i] === bVal && recentKeys[i + 1] === a) {
      cycleCount++;
    } else {
      break;
    }
  }

  if (cycleCount >= ALTERNATING_CYCLE_REPEATS) {
    return {
      pattern: "alternating_states",
      reason: `Agent alternates between two action patterns: ${a} ↔ ${bVal} (${cycleCount} cycles)`,
    };
  }
  return null;
}

function detectUnknownOutcomeStreak(
  steps: ComputerUseStep[],
): { pattern: StuckPattern; reason: string } | null {
  const recent = steps.slice(-MAX_UNKNOWN_OUTCOME_STREAK);
  if (recent.length < MAX_UNKNOWN_OUTCOME_STREAK) return null;

  const allUnknown = recent.every(
    (s) => s.result?.verification === undefined || s.result?.verification?.passed === undefined,
  );

  if (allUnknown) {
    return {
      pattern: "same_observation_signature",
      reason: `Last ${MAX_UNKNOWN_OUTCOME_STREAK} steps have unknown/undetermined outcomes — agent has no feedback`,
    };
  }
  return null;
}

// ── Recovery suggestion ───────────────────────────────────────────────────

function suggestRecovery(
  pattern: StuckPattern | null,
  recoveryState: RecoveryState,
  budgetExhausted: boolean,
  blockedByPolicy: boolean,
  approvalNeeded: boolean,
): { recoveryStep: RecoveryStep; shouldRecover: boolean } {
  // If budget is exhausted, fail immediately.
  if (budgetExhausted) {
    return { recoveryStep: "fail_with_report", shouldRecover: true };
  }

  // If blocked by policy, do not attempt recovery — escalate to ask_user or fail.
  if (blockedByPolicy) {
    return {
      recoveryStep: recoveryState.recoveryAttempts >= recoveryState.maxRecoveryAttempts
        ? "fail_with_report"
        : "ask_user",
      shouldRecover: true,
    };
  }

  // If approval needed, pause recovery and let loop handle approval flow.
  if (approvalNeeded) {
    return { recoveryStep: "ask_user", shouldRecover: false };
  }

  // Determine the next ladder step based on what's been tried.
  const tried = new Set(recoveryState.ladderHistory.map((h) => h.step));

  const ladderOrder: RecoveryStep[] = [
    "observe_again",
    "wait_for_stability",
    "inspect_dom",
    "try_alternate_action",
    "retry_with_adjustment",
    "replan",
    "ask_user",
    "fail_with_report",
  ];

  // If max retries per action exceeded, skip to replan.
  if (recoveryState.currentActionAttempts >= recoveryState.maxRetriesPerAction) {
    const nextStep: RecoveryStep = tried.has("replan") ? "ask_user" : "replan";
    return {
      recoveryStep: recoveryState.recoveryAttempts >= recoveryState.maxRecoveryAttempts
        ? "fail_with_report"
        : nextStep,
      shouldRecover: true,
    };
  }

  // Walk the ladder from the earliest untried step.
  for (const step of ladderOrder) {
    if (!tried.has(step)) {
      // Skip inspect_dom if DOM inspection wasn't available (repo currently lacks it).
      // The try_alternate_action will handle this in the recovery execution.
      return {
        recoveryStep: recoveryState.recoveryAttempts >= recoveryState.maxRecoveryAttempts
          ? "fail_with_report"
          : step,
        shouldRecover: true,
      };
    }
  }

  // All recovery steps exhausted.
  return { recoveryStep: "fail_with_report", shouldRecover: true };
}

// ── Main detection function ──────────────────────────────────────────────

export interface StuckDetectorInput {
  steps: ComputerUseStep[];
  screenshots: ComputerUseScreenshot[];
  events: ComputerUseReplayEvent[];
  recoveryState: RecoveryState;
  budgetExhausted: boolean;
  blockedByPolicy: boolean;
  approvalNeeded: boolean;
}

export function detectStuckLoop(input: StuckDetectorInput): StuckDetectionResult {
  const { steps, screenshots, recoveryState, budgetExhausted, blockedByPolicy, approvalNeeded } = input;

  const recentSteps = steps.slice(-MAX_STUCK_WINDOW);
  if (recentSteps.length === 0) {
    return {
      isStuck: false,
      reason: "No steps to analyze",
      recoverySuggested: "observe_again",
      details: {},
    };
  }

  const recentKeys = recentSteps.map(actionKey);
  const signatures = deriveSignaturesFromSteps(recentSteps, screenshots);

  // Check patterns in order from most specific to least.
  const checks: Array<() => { pattern: StuckPattern; reason: string } | null> = [
    () => detectRepeatedSameAction(recentKeys),
    () => detectRepeatedSameSignature(signatures),
    () => detectRepeatedVerificationFailure(recentSteps),
    () => detectAlternatingStates(recentKeys),
    () => detectUnknownOutcomeStreak(recentSteps),
  ];

  let detectedPattern: StuckPattern | null = null;
  let detectedReason = "";

  for (const check of checks) {
    const result = check();
    if (result) {
      detectedPattern = result.pattern;
      detectedReason = result.reason;
      break;
    }
  }

  // Check budget-pushed max recovery exhaustion
  if (!detectedPattern && recoveryState.recoveryAttempts >= recoveryState.maxRecoveryAttempts) {
    detectedPattern = "max_total_recovery";
    detectedReason = `Maximum recovery attempts (${recoveryState.maxRecoveryAttempts}) exhausted`;
  }

  if (!detectedPattern && recoveryState.currentActionAttempts >= recoveryState.maxRetriesPerAction) {
    detectedPattern = "max_retries_per_action";
    detectedReason = `Maximum retries per action (${recoveryState.maxRetriesPerAction}) exhausted`;
  }

  const { recoveryStep, shouldRecover } = suggestRecovery(
    detectedPattern,
    recoveryState,
    budgetExhausted,
    blockedByPolicy,
    approvalNeeded,
  );

  const isStuck = (detectedPattern !== null && shouldRecover) || budgetExhausted;

  return {
    isStuck,
    reason: detectedReason || (budgetExhausted ? "Budget exhausted" : "No stuck pattern detected"),
    pattern: detectedPattern ?? undefined,
    recoverySuggested: recoveryStep,
    details: {
      stepCount: steps.length,
      recentActionTypes: recentKeys.slice(-5),
      recoveryAttempts: recoveryState.recoveryAttempts,
      maxRecoveryAttempts: recoveryState.maxRecoveryAttempts,
      currentActionAttempts: recoveryState.currentActionAttempts,
      maxRetriesPerAction: recoveryState.maxRetriesPerAction,
      budgetExhausted,
      blockedByPolicy,
      approvalNeeded,
    },
  };
}

export function recordRecoveryAttempt(
  recoveryState: RecoveryState,
  step: RecoveryStep,
  reason: string,
): RecoveryState {
  return {
    ...recoveryState,
    recoveryAttempts: recoveryState.recoveryAttempts + 1,
    lastRecoveryStep: step,
    ladderHistory: [
      ...recoveryState.ladderHistory,
      { step, timestamp: new Date().toISOString(), reason },
    ],
  };
}

export function incrementActionAttempt(recoveryState: RecoveryState): RecoveryState {
  return {
    ...recoveryState,
    currentActionAttempts: recoveryState.currentActionAttempts + 1,
  };
}

export function resetActionAttempt(recoveryState: RecoveryState): RecoveryState {
  return {
    ...recoveryState,
    currentActionAttempts: 0,
  };
}

// ── Blocker Detection ──────────────────────────────────────────────────────

/**
 * Known blocker categories the recovery engine can identify from available
 * observation data (extracted text, page title, recent events). All data is
 * untrusted page content — these are heuristics, not definitive.
 */
export type BlockerCategory =
  | "login_required"
  | "captcha_detected"
  | "credential_field_detected"
  | "modal_or_cookie_banner"
  | "policy_blocked"
  | "unknown_domain_blocked"
  | "payment_required";

export interface BlockerDetectionResult {
  blocked: boolean;
  category: BlockerCategory | null;
  reason: string;
  shouldPause: boolean;
  pauseReason: string | null;
}

const LOGIN_KEYWORDS = [
  "sign in", "signin", "log in", "login", "log on", "sign into",
  "create account", "register", "forgot password", "reset password",
];

const CAPTCHA_KEYWORDS = [
  "captcha", "verify you are human", "i am not a robot",
  "not a robot", "prove you are human", "recaptcha",
  "security check", "verify your identity",
];

const CREDENTIAL_KEYWORDS = [
  "password", "credit card", "card number", "cvv", "cvc",
  "expiration date", "billing address", "ssn", "social security",
  "bank account", "account number", "routing number",
];

const MODAL_KEYWORDS = [
  "cookie", "cookies", "accept all", "customize settings",
  "privacy policy", "terms of service", "gdpr",
  "subscribe", "newsletter", "welcome to",
  "popup", "overlay",
];

const PAYMENT_KEYWORDS = [
  "checkout", "payment", "pay now", "place order",
  "complete purchase", "confirm order", "order summary",
];

export interface BlockerDetectorInput {
  stepIndex: number;
  currentUrl: string | null;
  pageTitle: string | null;
  visibleText: string | null;
  events: ComputerUseReplayEvent[];
}

export function detectBlocker(input: BlockerDetectorInput): BlockerDetectionResult {
  const { stepIndex, currentUrl, pageTitle, visibleText, events } = input;

  const textSources = [pageTitle ?? "", visibleText ?? ""];
  const combinedText = textSources.join(" ").toLowerCase();

  // 1. Check events for policy blocks
  const recentEvents = events.slice(-5);
  const policyBlocked = recentEvents.find((e) => e.type === "policy.blocked");
  if (policyBlocked) {
    return {
      blocked: true,
      category: "policy_blocked",
      reason: `Policy blocked at step ${stepIndex}: ${(policyBlocked.metadata?.reason as string) ?? "unknown reason"}`,
      shouldPause: true,
      pauseReason: `Policy blocked action at ${currentUrl ?? "unknown URL"}. Manual review required.`,
    };
  }

  const unknownDomain = recentEvents.find(
    (e) => e.type === "policy.blocked" &&
      (e.metadata?.reason as string ?? "").includes("not in the allowed domains"),
  );
  if (unknownDomain) {
    return {
      blocked: true,
      category: "unknown_domain_blocked",
      reason: `Navigation to domain blocked at step ${stepIndex}`,
      shouldPause: true,
      pauseReason: `Attempted to navigate to an unknown domain at "${currentUrl}". Add the domain to the allowlist if this is expected.`,
    };
  }

  // 2. CAPTCHA check (highest priority — must stop)
  for (const kw of CAPTCHA_KEYWORDS) {
    if (combinedText.includes(kw)) {
      return {
        blocked: true,
        category: "captcha_detected",
        reason: `CAPTCHA detected at step ${stepIndex}: "${kw}"`,
        shouldPause: true,
        pauseReason: `CAPTCHA detected at "${currentUrl ?? pageTitle ?? "current page"}". The agent cannot solve CAPTCHAs. Take over to complete this step manually.`,
      };
    }
  }

  // 3. Login required (check before credential/payment keywords)
  for (const kw of LOGIN_KEYWORDS) {
    if (combinedText.includes(kw)) {
      return {
        blocked: true,
        category: "login_required",
        reason: `Login page detected at step ${stepIndex}: "${kw}"`,
        shouldPause: true,
        pauseReason: `Login is required at "${currentUrl ?? pageTitle ?? "current page"}". The agent cannot log in. Take over to authenticate, or configure credential vault if available.`,
      };
    }
  }

  // 3. Credential fields (most specific sensitive data — credit card, SSN, bank, etc.)
  for (const kw of CREDENTIAL_KEYWORDS) {
    if (combinedText.includes(kw)) {
      return {
        blocked: true,
        category: "credential_field_detected",
        reason: `Credential or sensitive field detected at step ${stepIndex}: "${kw}"`,
        shouldPause: true,
        pauseReason: `A credential/payment field was detected at "${currentUrl ?? pageTitle ?? "current page"}". The agent cannot enter credentials. Take over to enter credentials manually.`,
      };
    }
  }

  // 4. Payment flows
  for (const kw of PAYMENT_KEYWORDS) {
    if (combinedText.includes(kw)) {
      return {
        blocked: true,
        category: "payment_required",
        reason: `Payment flow detected at step ${stepIndex}: "${kw}"`,
        shouldPause: true,
        pauseReason: `A payment flow was detected at "${currentUrl ?? pageTitle ?? "current page"}". The agent cannot complete payments. Take over to complete purchase manually.`,
      };
    }
  }

  // 5. Modal / cookie banner (advisory — don't stop, just notify)
  for (const kw of MODAL_KEYWORDS) {
    if (combinedText.includes(kw)) {
      return {
        blocked: true,
        category: "modal_or_cookie_banner",
        reason: `Modal or banner detected at step ${stepIndex}: "${kw}"`,
        shouldPause: false,
        pauseReason: null,
      };
    }
  }

  return {
    blocked: false,
    category: null,
    reason: `No blockers detected at step ${stepIndex}`,
    shouldPause: false,
    pauseReason: null,
  };
}
