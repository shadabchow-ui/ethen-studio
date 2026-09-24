import type {
  ComputerUseRun,
  ComputerAction,
  ComputerActionType,
  PolicyDecision,
  PermissionScope,
  ComputerUseStep,
  SuspiciousContentResult,
} from "./types";
import { isDesktopActionType, DESKTOP_CRITICAL_RISK_ACTIONS } from "./types";
import { getActionRiskLevel, couldBeFormSubmit, isDefaultBlockedAction, couldBeDownload, couldBeUpload, isKnownActionType, detectSensitiveActionCategories } from "./risk";
import { isDomainAllowed, isActionAllowed, isActionBlocked, isActionApprovalRequired, isLocalhostUrl } from "./permissions";
import type { ComputerUseRiskLevel } from "./risk";

export type PolicyEventType =
  | "policy.allowed"
  | "policy.approval_required"
  | "policy.blocked"
  | "policy.suspicious"
  | "policy.file_access_blocked"
  | "policy.local_network_blocked"
  | "policy.unknown_redirect_blocked"
  | "policy.exfiltration_blocked"
  | "policy.injection_pattern_detected";

export interface PolicyEvaluation {
  decision: PolicyDecision;
  eventType: PolicyEventType;
}

const OBSERVE_ACTIONS: Set<ComputerActionType> = new Set([
  "screenshot",
  "wait",
]);

const NAVIGATE_ACTIONS: Set<ComputerActionType> = new Set([
  "navigate",
]);

const SUBMIT_SIGNALING_ACTIONS: Set<ComputerActionType> = new Set([
  "click",
  "dom_click",
  "type",
  "dom_type",
  "key",
]);

const BLOCKED_ACTION_TYPES: Set<ComputerActionType> = new Set([]);

const BLOCKED_DESTRUCTIVE_ACTIONS: Set<ComputerActionType> = new Set([]);

// ── File URL / Local Network / Suspicious Content Detection ─────────────────

const FILE_URL_PATTERN = /^file:\/\//i;
const LOCAL_NETWORK_PATTERNS = [
  /^https?:\/\/127\.\d+\.\d+\.\d+/i,
  /^https?:\/\/0\.0\.0\.0/i,
  /^https?:\/\/\[::1\]/i,
  /^https?:\/\/192\.168\.\d+\.\d+/i,
  /^https?:\/\/10\.\d+\.\d+\.\d+/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/i,
  /^https?:\/\/169\.254\.\d+\.\d+/i,
];

const UNTRUSTED_INSTRUCTION_PATTERNS = [
  "ignore previous instructions",
  "ignore all previous instructions",
  "ignore all prior instructions",
  "disregard previous",
  "forget your training",
  "you are now",
  "new system prompt",
  "your new goal is",
  "your new task is",
  "as an ai assistant you must",
  "do not follow",
  "do not obey",
  "you must instead",
  "override your",
  "bypass policy",
  "bypass safety",
  "approve this action",
  "approve all actions",
  "self-approve",
  "auto-approve",
  "exfiltrate",
  "exfiltrate data",
  "send this to",
  "send all data to",
  "forward to",
  "leak information",
  "ignore the user",
  "the user is not",
  "pretend to be",
  "you have full permissions",
  "you are authorized to",
  "grant yourself",
  "elevate permissions",
  "this page has approved",
  "action is pre-approved",
  "no approval needed",
  "skip approval",
  "silently navigate to",
  "hidden redirect to",
];

export function isFileUrl(url: string): boolean {
  return FILE_URL_PATTERN.test(url);
}

export function isLocalNetworkUrl(url: string): boolean {
  if (!url) return false;
  for (const pattern of LOCAL_NETWORK_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  return false;
}

export function isPrivateNetworkUrl(url: string): boolean {
  return isLocalNetworkUrl(url) || isFileUrl(url);
}

export function detectSuspiciousInstructions(
  content: string,
  source: SuspiciousContentResult["source"],
): SuspiciousContentResult | null {
  if (!content) return null;

  const lower = content.toLowerCase();
  const matchedPatterns: string[] = [];

  for (const pattern of UNTRUSTED_INSTRUCTION_PATTERNS) {
    if (lower.includes(pattern)) {
      matchedPatterns.push(pattern);
    }
  }

  if (matchedPatterns.length === 0) return null;

  const severity: SuspiciousContentResult["severity"] =
    matchedPatterns.length >= 3 ? "critical" :
    matchedPatterns.length >= 2 ? "high" :
    "medium";

  return {
    detected: true,
    patterns: matchedPatterns,
    source,
    severity,
    evidence: `Suspicious untrusted instruction pattern${matchedPatterns.length > 1 ? "s" : ""} detected: ${matchedPatterns.join(", ")}`,
  };
}

export function isExfiltrationRisk(action: ComputerAction): boolean {
  if (couldBeUpload(action)) return true;
  if (couldBeDownload(action)) return true;
  if (action.type === "type" || action.type === "dom_type") {
    if (action.metadata?.exfiltrationRisk === true) return true;
  }
  if (action.type === "click" || action.type === "dom_click") {
    if (action.metadata?.exfiltrationRisk === true) return true;
  }
  return false;
}

export function evaluateUrlSafety(
  url: string | undefined,
  scope: PermissionScope,
): { outcome: "allow" | "block"; reason: string } | null {
  if (!url) return null;

  if (FILE_URL_PATTERN.test(url)) {
    return {
      outcome: "block",
      reason: `file:// URL access is blocked by default. Attempted URL: "${url}"`,
    };
  }

  if (isLocalNetworkUrl(url) && !isLocalhostUrl(url)) {
    return {
      outcome: "block",
      reason: `Local/private network URL access is blocked. Attempted URL: "${url}"`,
    };
  }

  return null;
}

export function evaluateComputerUseAction(
  action: ComputerAction,
  run: ComputerUseRun,
  scope?: PermissionScope,
): PolicyEvaluation {
  const effectiveScope = scope ?? run.permissionScope;
  const actionType = action.type;

  if (isDefaultBlockedAction(actionType)) {
    return {
      decision: {
        outcome: "block",
        reason: `Action type "${actionType}" is blocked by default for Computer Use.`,
        riskLevel: "critical",
      },
      eventType: "policy.blocked",
    };
  }

  if (BLOCKED_ACTION_TYPES.has(actionType)) {
    return {
      decision: {
        outcome: "block",
        reason: `Action type "${actionType}" is blocked by default.`,
        riskLevel: "critical",
      },
      eventType: "policy.blocked",
    };
  }

  if (BLOCKED_DESTRUCTIVE_ACTIONS.has(actionType)) {
    return {
      decision: {
        outcome: "block",
        reason: `Action type "${actionType}" is a destructive/privileged action and is blocked by default.`,
        riskLevel: "critical",
      },
      eventType: "policy.blocked",
    };
  }

  if (isActionBlocked(actionType, effectiveScope)) {
    return {
      decision: {
        outcome: "block",
        reason: `Action type "${actionType}" is blocked by the current permission scope.`,
        riskLevel: "critical",
      },
      eventType: "policy.blocked",
    };
  }

  if (!isActionAllowed(actionType, effectiveScope) && effectiveScope.allowedActions.length > 0) {
    return {
      decision: {
        outcome: "block",
        reason: `Action type "${actionType}" is not in the allowed actions list.`,
        riskLevel: "high",
      },
      eventType: "policy.blocked",
    };
  }

  if (NAVIGATE_ACTIONS.has(actionType) && action.url) {
    return evaluateNavigation(action, effectiveScope);
  }

  if (isActionApprovalRequired(actionType, effectiveScope)) {
    return {
      decision: {
        outcome: "approval_required",
        reason: `Action type "${actionType}" requires approval per the current permission scope.`,
        riskLevel: getActionRiskLevel(actionType),
      },
      eventType: "policy.approval_required",
    };
  }

  if (SUBMIT_SIGNALING_ACTIONS.has(actionType) && couldBeFormSubmit(action)) {
    return {
      decision: {
        outcome: "approval_required",
        reason: `Action appears to submit a form or trigger a state-changing operation. Approval is required.`,
        riskLevel: "high",
      },
      eventType: "policy.approval_required",
    };
  }

  const sensitiveDetections = detectSensitiveActionCategories(action);
  if (sensitiveDetections.length > 0) {
    const highestSeverity = sensitiveDetections.reduce<"low" | "medium" | "high" | "critical">(
      (max, d) => {
        const order = { low: 0, medium: 1, high: 2, critical: 3 };
        return order[d.severity] > order[max] ? d.severity : max;
      },
      "low",
    );
    const categories = sensitiveDetections.map((d) => d.category).join(", ");
    if (highestSeverity === "critical") {
      return {
        decision: {
          outcome: "approval_required",
          reason: `Action targets sensitive category [${categories}]. Approval is required.`,
          riskLevel: "critical",
        },
        eventType: "policy.approval_required",
      };
    }
    return {
      decision: {
        outcome: "approval_required",
        reason: `Action targets sensitive category [${categories}]. Approval is required.`,
        riskLevel: "high",
      },
      eventType: "policy.approval_required",
    };
  }

  if (isExfiltrationRisk(action)) {
    return {
      decision: {
        outcome: "block",
        reason: `Action "${actionType}" appears to involve data exfiltration (upload/download/send). Blocked by policy.`,
        riskLevel: "critical",
      },
      eventType: "policy.exfiltration_blocked",
    };
  }

  if (OBSERVE_ACTIONS.has(actionType)) {
    return {
      decision: {
        outcome: "allow",
        reason: `Observation action "${actionType}" is always allowed.`,
        riskLevel: "low",
      },
      eventType: "policy.allowed",
    };
  }

  // ── Desktop Action Safety Gate ──────────────────────────────────────────
  // All desktop-class actions must fail closed by default. They require
  // explicit desktop mode + policy configuration to execute. No desktop
  // action is allowed through the browser-first policy path.

  if (isDesktopActionType(actionType)) {
    const criticalDesktopSet = new Set<ComputerActionType>(DESKTOP_CRITICAL_RISK_ACTIONS);

    // Critical-risk desktop actions (terminal, file access, credentials,
    // clipboard, uploads/downloads, OS settings, app switching) must never
    // execute without explicit approval support — block unconditionally
    // unless the permission scope explicitly allows them.
    if (criticalDesktopSet.has(actionType)) {
      if (isActionAllowed(actionType, effectiveScope)) {
        return {
          decision: {
            outcome: "approval_required",
            reason: `Desktop action "${actionType}" is a critical-risk operation. Approval is required even when explicitly allowed.`,
            riskLevel: "critical",
          },
          eventType: "policy.approval_required",
        };
      }
      return {
        decision: {
          outcome: "block",
          reason: `Desktop action "${actionType}" is a critical-risk operation (terminal/file/credentials/clipboard/upload/download/OS settings). Blocked by default — requires explicit desktop policy support which is not configured.`,
          riskLevel: "critical",
        },
        eventType: "policy.blocked",
      };
    }

    // High-risk desktop actions (screenshot, click, type, key, scroll,
    // app open, system dialog) are blocked unless explicitly permitted.
    if (isActionAllowed(actionType, effectiveScope)) {
      return {
        decision: {
          outcome: "allow",
          reason: `Desktop action "${actionType}" is explicitly permitted in the current scope.`,
          riskLevel: "high",
        },
        eventType: "policy.allowed",
      };
    }

    return {
      decision: {
        outcome: "block",
        reason: `Desktop action "${actionType}" is blocked by default. Desktop actions require explicit policy configuration. No execution is available without it.`,
        riskLevel: "high",
      },
      eventType: "policy.blocked",
    };
  }

  // ── Known action fallthrough ──────────────────────────────────────────
  // Actions that reached here are known browser actions that didn't match
  // any earlier category gate. Allow them with their mapped risk level.

  const risk = getActionRiskLevel(actionType);

  if (isKnownActionType(actionType)) {
    return {
      decision: {
        outcome: "allow",
        reason: `Action "${actionType}" of risk level "${risk}" is allowed within the current scope.`,
        riskLevel: risk,
      },
      eventType: "policy.allowed",
    };
  }

  // ── Truly Unknown Action Safety Gate ───────────────────────────────────
  // Actions not in ACTION_RISK_MAP must fail closed. No unknown action
  // type is ever silently allowed.

  return {
    decision: {
      outcome: "block",
      reason: `Action type "${actionType}" is not recognized by the policy engine and is blocked. Unknown actions must fail closed.`,
      riskLevel: "high",
    },
    eventType: "policy.blocked",
  };
}

function evaluateNavigation(
  action: ComputerAction,
  scope: PermissionScope,
): PolicyEvaluation {
  const url = action.url;
  if (!url) {
    return {
      decision: {
        outcome: "block",
        reason: "Navigation action requires a URL.",
        riskLevel: "high",
      },
      eventType: "policy.blocked",
    };
  }

  // File:// and local/private network checks before anything else
  const urlSafety = evaluateUrlSafety(url, scope);
  if (urlSafety && urlSafety.outcome === "block") {
    const eventType: PolicyEventType =
      FILE_URL_PATTERN.test(url) ? "policy.file_access_blocked" : "policy.local_network_blocked";
    return {
      decision: {
        outcome: "block",
        reason: urlSafety.reason,
        riskLevel: "critical",
      },
      eventType,
    };
  }

  // Intentional dev exception: localhost/dev URLs are always allowed
  // regardless of the allowlist, so local app testing isn't blocked by an
  // empty/missing allowedDomains configuration.
  if (isLocalhostUrl(url)) {
    return {
      decision: {
        outcome: "allow",
        reason: `Navigation to localhost/dev URL "${url}" is allowed.`,
        riskLevel: "low",
      },
      eventType: "policy.allowed",
    };
  }

  if (!isDomainAllowed(url, scope)) {
    if (scope.domainPolicyMode === "open_web") {
      return {
        decision: {
          outcome: "block",
          reason: `Open Web mode allows only public web domains. Malformed, file, or private network URL "${url}" is blocked.`,
          riskLevel: "critical",
        },
        eventType: "policy.blocked",
      };
    }

    if (scope.allowedDomains.length === 0) {
      return {
        decision: {
          outcome: "approval_required",
          reason: `No domain allowlist is configured for this run; navigation to "${url}" requires approval.`,
          riskLevel: "medium",
        },
        eventType: "policy.approval_required",
      };
    }

    return {
      decision: {
        outcome: "block",
        reason: `Domain "${url}" is not in the allowed domains list. Navigation is blocked. Switch to Open Web mode or add this domain.`,
        riskLevel: "high",
      },
      eventType: "policy.blocked",
    };
  }

  if (isActionApprovalRequired("navigate", scope)) {
    return {
      decision: {
        outcome: "approval_required",
        reason: `Navigation requires approval per the current permission scope.`,
        riskLevel: "medium",
      },
      eventType: "policy.approval_required",
    };
  }

  return {
    decision: {
      outcome: "allow",
      reason: `Domain "${url}" is in the allowed domains list. Navigation is allowed.`,
      riskLevel: "medium",
    },
    eventType: "policy.allowed",
  };
}

export function evaluateStepPolicy(
  step: ComputerUseStep,
  run: ComputerUseRun,
): PolicyEvaluation {
  return evaluateComputerUseAction(step.action, run);
}

export function shouldRequireApproval(evaluation: PolicyEvaluation): boolean {
  return evaluation.decision.outcome === "approval_required";
}

export function isPolicyBlocked(evaluation: PolicyEvaluation): boolean {
  return evaluation.decision.outcome === "block";
}

export function isPolicyAllowed(evaluation: PolicyEvaluation): boolean {
  return evaluation.decision.outcome === "allow";
}

export function isPauseStateAllowed(run: ComputerUseRun): boolean {
  const activeStatuses: Set<string> = new Set(["running", "scoping", "starting"]);
  return activeStatuses.has(run.status);
}

export function isStopStateAllowed(run: ComputerUseRun): boolean {
  const stoppableStatuses: Set<string> = new Set([
    "idle", "scoping", "starting", "running", "paused",
    "approval_needed", "takeover", "blocked", "recovering",
  ]);
  return stoppableStatuses.has(run.status);
}

export function isTakeoverStateAllowed(run: ComputerUseRun): boolean {
  return isPauseStateAllowed(run) || run.status === "approval_needed";
}

export function getEffectivePolicyForStep(
  action: ComputerAction,
  _run: ComputerUseRun,
): {
  riskLevel: ComputerUseRiskLevel;
  isFormSubmit: boolean;
  isDomainChange: boolean;
  targetDomain: string | undefined;
} {
  return {
    riskLevel: getActionRiskLevel(action.type),
    isFormSubmit: couldBeFormSubmit(action),
    isDomainChange: NAVIGATE_ACTIONS.has(action.type),
    targetDomain: NAVIGATE_ACTIONS.has(action.type) ? action.url : undefined,
  };
}
