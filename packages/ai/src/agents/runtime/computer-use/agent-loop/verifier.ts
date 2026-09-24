import type {
  ComputerAction,
  ComputerUseRun,
  ComputerUseScreenshot,
  ComputerUseObservation,
  PolicyDecision,
  BrowserSessionMode,
  VerificationResult,
  VerificationStatus,
} from "../types";

export interface VerificationContext {
  action: ComputerAction;
  run: ComputerUseRun;
  executionSuccess: boolean;
  executionError?: string;
  beforeUrl: string;
  afterUrl: string;
  beforeScreenshot: ComputerUseScreenshot | null;
  afterScreenshot: ComputerUseScreenshot | null;
  beforeObservation: ComputerUseObservation | null;
  afterObservation: ComputerUseObservation | null;
  sessionMode: BrowserSessionMode;
  policyDecision?: PolicyDecision;
  elementCount?: number;
}

function hasRenderableImage(shot: ComputerUseScreenshot | null): boolean {
  if (!shot) return false;
  return shot.imageUri.length > 0;
}

function deriveConfidence(confidence: "high" | "medium" | "low", context: VerificationContext): "high" | "medium" | "low" {
  if (context.sessionMode === "simulation" && confidence === "high") {
    return "low";
  }
  return confidence;
}

function makeResult(
  status: VerificationStatus,
  summary: string,
  evidence: string | undefined,
  confidence: "high" | "medium" | "low",
  context: VerificationContext,
  overrides?: Partial<VerificationResult>,
): VerificationResult {
  return {
    status,
    passed: status === "passed",
    confidence: deriveConfidence(confidence, context),
    summary,
    evidence,
    beforeObservationId: context.beforeScreenshot?.id ?? context.beforeObservation?.screenshot?.id,
    afterObservationId: context.afterScreenshot?.id ?? context.afterObservation?.screenshot?.id,
    expectedOutcome: overrides?.expectedOutcome,
    actualOutcome: overrides?.actualOutcome,
    retryable: overrides?.retryable,
    retryRecommendation: overrides?.retryRecommendation,
    failureCode: overrides?.failureCode,
    failureReason: overrides?.failureReason,
  };
}

function missingObservations(context: VerificationContext): boolean {
  const hasBefore =
    (context.beforeScreenshot && hasRenderableImage(context.beforeScreenshot)) ||
    context.beforeObservation !== null;
  const hasAfter =
    (context.afterScreenshot && hasRenderableImage(context.afterScreenshot)) ||
    context.afterObservation !== null;
  return !hasBefore && !hasAfter;
}

// ── Deterministic Verification Heuristics ────────────────────────────────

function verifyNavigate(context: VerificationContext): VerificationResult {
  const expectedOutcome = `Navigate to ${context.action.url ?? "target URL"}`;
  const actualOutcome = `Current URL: ${context.afterUrl}`;

  if (context.policyDecision?.outcome === "block") {
    return makeResult("failed", "Navigation blocked by policy", context.policyDecision.reason, "high", context, {
      expectedOutcome,
      actualOutcome: `Blocked: ${context.policyDecision.reason}`,
      failureCode: "policy_blocked",
      failureReason: context.policyDecision.reason,
    });
  }

  if (!context.executionSuccess) {
    return makeResult("failed", "Navigation execution failed", context.executionError ?? "Navigate action returned failure", "high", context, {
      expectedOutcome,
      actualOutcome: "Execution error",
      retryable: true,
      retryRecommendation: "Retry navigation after verifying the URL is reachable",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  if (context.beforeUrl === context.afterUrl) {
    return makeResult("failed", "URL did not change after navigation", `URL remained ${context.afterUrl}`, "high", context, {
      expectedOutcome,
      actualOutcome: `Page did not change from ${context.beforeUrl}`,
      retryable: true,
      retryRecommendation: "Page may have failed to load; Retry or try a different URL",
      failureCode: "url_unchanged",
      failureReason: "Destination URL matches source URL after navigate action",
    });
  }

  if (context.afterUrl !== context.action.url && context.action.url && !context.afterUrl.startsWith(context.action.url)) {
    return makeResult("passed", "Navigation succeeded (redirected)", `Navigated to ${context.afterUrl} instead of requested ${context.action.url}`, "medium", context, {
      expectedOutcome,
      actualOutcome: `Redirected to ${context.afterUrl}`,
    });
  }

  return makeResult("passed", "Navigation succeeded", `Navigated from ${context.beforeUrl} to ${context.afterUrl}`, "high", context, {
    expectedOutcome,
    actualOutcome: `Arrived at ${context.afterUrl}`,
  });
}

function verifyScreenshot(context: VerificationContext): VerificationResult {
  const expectedOutcome = "Capture a screenshot of the current page";
  const actualOutcome = context.afterScreenshot
    ? `Screenshot captured at ${context.afterUrl}`
    : "No screenshot captured";

  if (context.sessionMode === "simulation") {
    return makeResult("passed", "Simulated screenshot recorded", "Simulation mode — no real image was captured", "low", context, {
      expectedOutcome,
      actualOutcome: "Simulated screenshot (mock:// URI; not a real image)",
    });
  }

  if (!context.executionSuccess) {
    return makeResult("failed", "Screenshot capture failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "Capture error",
      retryable: true,
      retryRecommendation: "Retry screenshot. If repeated, check browser session health.",
      failureCode: "capture_failed",
      failureReason: context.executionError,
    });
  }

  if (missingObservations(context)) {
    return makeResult("unknown", "Screenshot capture status unclear", "No observable screenshot evidence found after capture attempt", "low", context, {
      expectedOutcome,
      actualOutcome: "No screenshot evidence available",
      retryable: true,
      retryRecommendation: "Screenshot may have been captured but not yet available. Retry or check session.",
      failureCode: "no_evidence",
      failureReason: "Screenshot capture reported success but no renderable after-screenshot was stored",
    });
  }

    return makeResult("passed", "Screenshot captured successfully", "Screenshot captured successfully at " + context.afterUrl, "high", context, {
    expectedOutcome,
    actualOutcome: "Screenshot evidence is available",
  });
}

function verifyClick(context: VerificationContext): VerificationResult {
  const target = context.action.targetLabel
    ? `"${context.action.targetLabel}" at (${context.action.x}, ${context.action.y})`
    : `at (${context.action.x}, ${context.action.y})`;
  const expectedOutcome = `Click ${target}`;
  const actualOutcome = context.afterUrl !== context.beforeUrl
    ? `Page navigated to ${context.afterUrl}`
    : `Page remained at ${context.afterUrl}`;

  if (!context.executionSuccess) {
    return makeResult("failed", "Click execution failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "Click action returned error",
      retryable: true,
      retryRecommendation: "Retry click; verify coordinates are within viewport",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  if (missingObservations(context)) {
    return makeResult("unknown", "Click verification inconclusive", "No before/after observations available to confirm click effect", "low", context, {
      expectedOutcome,
      actualOutcome: "No observable effect",
      retryable: true,
      retryRecommendation: "Capture a screenshot to verify page state after click",
      failureCode: "no_evidence",
      failureReason: "No observation data available to verify click result",
    });
  }

  if (context.afterUrl !== context.beforeUrl) {
    return makeResult("passed", "Click caused navigation", `Page changed from ${context.beforeUrl} to ${context.afterUrl}`, "high", context, {
      expectedOutcome,
      actualOutcome,
    });
  }

  return makeResult("passed", "Click executed successfully", `After-observation captured; page remained at ${context.afterUrl}`, "medium", context, {
    expectedOutcome,
    actualOutcome,
  });
}

function verifyType(context: VerificationContext): VerificationResult {
  const expectedOutcome = `Type text${context.action.targetLabel ? ` into "${context.action.targetLabel}"` : ""}`;
  const actualOutcome = context.afterObservation ? "After-observation captured" : "No after-observation available";

  if (!context.executionSuccess) {
    return makeResult("failed", "Type execution failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "Type action returned error",
      retryable: true,
      retryRecommendation: "Retry type; verify the target field is focused and interactable",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  if (missingObservations(context)) {
    return makeResult("unknown", "Type verification inconclusive", "No after-observation available to confirm text was entered", "low", context, {
      expectedOutcome,
      actualOutcome: "No observable effect",
      retryable: true,
      retryRecommendation: "Capture a screenshot to confirm text was entered",
      failureCode: "no_evidence",
      failureReason: "No observation data available to verify type result",
    });
  }

  return makeResult("passed", "Type executed successfully", "After-observation captured", "medium", context, {
    expectedOutcome,
    actualOutcome,
  });
}

function verifyScroll(context: VerificationContext): VerificationResult {
  const direction = context.action.direction ?? "down";
  const amount = context.action.amount ?? 0;
  const expectedOutcome = `Scroll ${direction} by ${amount}px`;
  const actualOutcome = context.afterObservation ? "After-observation captured" : "No after-observation available";

  if (!context.executionSuccess) {
    return makeResult("failed", "Scroll execution failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "Scroll action returned error",
      retryable: true,
      retryRecommendation: "Retry scroll; verify page is scrollable",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  if (missingObservations(context)) {
    return makeResult("unknown", "Scroll verification inconclusive", "No after-observation available to confirm scroll occurred", "low", context, {
      expectedOutcome,
      actualOutcome: "No observable effect",
      retryable: true,
      retryRecommendation: "Capture a screenshot to verify scroll position",
      failureCode: "no_evidence",
      failureReason: "No observation data available to verify scroll result",
    });
  }

  return makeResult("passed", "Scroll executed successfully", "After-observation captured", "medium", context, {
    expectedOutcome,
    actualOutcome,
  });
}

function verifyKey(context: VerificationContext): VerificationResult {
  const keys = context.action.keys?.join(", ") ?? context.action.text ?? "key";
  const expectedOutcome = `Press key(s): ${keys}`;
  const actualOutcome = context.afterObservation ? "After-observation captured" : "No after-observation available";

  if (!context.executionSuccess) {
    return makeResult("failed", "Key press execution failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "Key action returned error",
      retryable: true,
      retryRecommendation: "Retry key press; verify target element is focused",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  if (missingObservations(context)) {
    return makeResult("unknown", "Key press verification inconclusive", "No after-observation available to confirm key effect", "low", context, {
      expectedOutcome,
      actualOutcome: "No observable effect",
      retryable: true,
      retryRecommendation: "Capture a screenshot to verify key press result",
      failureCode: "no_evidence",
      failureReason: "No observation data available to verify key result",
    });
  }

  return makeResult("passed", "Key press executed successfully", "After-observation captured", "medium", context, {
    expectedOutcome,
    actualOutcome,
  });
}

function verifyWait(context: VerificationContext): VerificationResult {
  const ms = context.action.ms ?? 0;
  const expectedOutcome = `Wait ${ms}ms`;
  const actualOutcome = ms > 0 ? `Waited ${ms}ms` : "Wait completed";

  if (!context.executionSuccess) {
    return makeResult("failed", "Wait execution failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "Wait action returned error",
      retryable: true,
      retryRecommendation: "Retry wait",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  if (missingObservations(context)) {
    return makeResult("passed", "Wait completed", "Wait executed without observable evidence", "high", context, {
      expectedOutcome,
      actualOutcome,
    });
  }

  return makeResult("passed", "Wait completed", actualOutcome, "high", context, {
    expectedOutcome,
    actualOutcome,
  });
}

function verifyInspectDom(context: VerificationContext): VerificationResult {
  const expectedOutcome = "Inspect DOM for interactive elements";
  const actualOutcome = context.elementCount !== undefined && context.elementCount > 0
    ? `Found ${context.elementCount} interactive elements`
    : "DOM inspection completed";

  if (!context.executionSuccess) {
    return makeResult("failed", "DOM inspection failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "DOM inspection returned error",
      retryable: true,
      retryRecommendation: "Retry DOM inspection",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  if (context.elementCount !== undefined && context.elementCount > 0) {
    return makeResult("passed", actualOutcome, actualOutcome, "high", context, {
      expectedOutcome,
      actualOutcome,
    });
  }

  return makeResult("passed", "DOM inspection completed", actualOutcome, "medium", context, {
    expectedOutcome,
    actualOutcome,
  });
}

function verifyTextExtraction(context: VerificationContext): VerificationResult {
  const selector = context.action.selector;
  const expectedOutcome = `Extract visible text${selector ? ` from "${selector}"` : " from page"}`;
  const actualOutcome = `Text extraction performed at ${context.afterUrl}`;

  if (context.sessionMode !== "live_browser") {
    return makeResult("failed", "Text extraction unavailable", "Not a live browser session — cannot extract real page text", "high", context, {
      expectedOutcome,
      actualOutcome: "Unavailable: no live browser session",
      failureCode: "live_session_required",
      failureReason: "Text extraction requires a live Playwright browser session",
    });
  }

  if (!context.executionSuccess) {
    return makeResult("failed", "Text extraction failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "Extraction returned error",
      retryable: true,
      retryRecommendation: "Retry extraction after ensuring the page is fully loaded",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  return makeResult("passed", "Text extracted successfully", `Extracted text from ${context.afterUrl}`, "high", context, {
    expectedOutcome,
    actualOutcome: "Text content extracted",
  });
}

function verifyLinkExtraction(context: VerificationContext): VerificationResult {
  const expectedOutcome = "Extract links from current page";
  const actualOutcome = `Link extraction performed at ${context.afterUrl}`;

  if (context.sessionMode !== "live_browser") {
    return makeResult("failed", "Link extraction unavailable", "Not a live browser session — cannot extract real page links", "high", context, {
      expectedOutcome,
      actualOutcome: "Unavailable: no live browser session",
      failureCode: "live_session_required",
      failureReason: "Link extraction requires a live Playwright browser session",
    });
  }

  if (!context.executionSuccess) {
    return makeResult("failed", "Link extraction failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "Extraction returned error",
      retryable: true,
      retryRecommendation: "Retry link extraction",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  return makeResult("passed", "Links extracted successfully", `Links extracted from ${context.afterUrl}`, "high", context, {
    expectedOutcome,
    actualOutcome: "Link data extracted",
  });
}

function verifyHeadingExtraction(context: VerificationContext): VerificationResult {
  const expectedOutcome = "Extract headings from current page";
  const actualOutcome = `Heading extraction performed at ${context.afterUrl}`;

  if (context.sessionMode !== "live_browser") {
    return makeResult("failed", "Heading extraction unavailable", "Not a live browser session — cannot extract real page headings", "high", context, {
      expectedOutcome,
      actualOutcome: "Unavailable: no live browser session",
      failureCode: "live_session_required",
      failureReason: "Heading extraction requires a live Playwright browser session",
    });
  }

  if (!context.executionSuccess) {
    return makeResult("failed", "Heading extraction failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "Extraction returned error",
      retryable: true,
      retryRecommendation: "Retry heading extraction",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  return makeResult("passed", "Headings extracted successfully", `Headings extracted from ${context.afterUrl}`, "high", context, {
    expectedOutcome,
    actualOutcome: "Heading data extracted",
  });
}

function verifyTableExtraction(context: VerificationContext): VerificationResult {
  const selector = context.action.selector;
  const expectedOutcome = `Extract table${selector ? ` from "${selector}"` : " from page"}`;
  const actualOutcome = `Table extraction performed at ${context.afterUrl}`;

  if (context.sessionMode !== "live_browser") {
    return makeResult("failed", "Table extraction unavailable", "Not a live browser session — cannot extract real table data", "high", context, {
      expectedOutcome,
      actualOutcome: "Unavailable: no live browser session",
      failureCode: "live_session_required",
      failureReason: "Table extraction requires a live Playwright browser session",
    });
  }

  if (!context.executionSuccess) {
    return makeResult("failed", "Table extraction failed", context.executionError, "high", context, {
      expectedOutcome,
      actualOutcome: "Extraction returned error",
      retryable: true,
      retryRecommendation: "Retry table extraction; verify a table element exists on the page",
      failureCode: "execution_failed",
      failureReason: context.executionError,
    });
  }

  return makeResult("passed", "Table extracted successfully", `Table data extracted from ${context.afterUrl}`, "high", context, {
    expectedOutcome,
    actualOutcome: "Table data extracted",
  });
}

function verifyComplete(context: VerificationContext): VerificationResult {
  const expectedOutcome = "Mark run as complete";
  const actualOutcome = "Run marked complete";
  return makeResult("passed", "Run completed", context.action.summary ?? "Agent marked the run complete", "high", context, {
    expectedOutcome,
    actualOutcome,
  });
}

function verifyFail(context: VerificationContext): VerificationResult {
  const expectedOutcome = "Mark run as failed";
  const reason = context.action.reason ?? "Agent marked the run as failed";
  return makeResult("failed", "Run failed", reason, "high", context, {
    expectedOutcome,
    actualOutcome: reason,
    failureCode: "agent_marked_fail",
    failureReason: reason,
  });
}

// ── Public API ───────────────────────────────────────────────────────────

export function verifyComputerAction(context: VerificationContext): VerificationResult {
  if (context.policyDecision?.outcome === "block") {
    return makeResult("failed", `Action blocked by policy: ${context.policyDecision.reason}`, context.policyDecision.reason, "high", context, {
      expectedOutcome: `${context.action.type} action`,
      actualOutcome: `Blocked: ${context.policyDecision.reason}`,
      failureCode: "policy_blocked",
      failureReason: context.policyDecision.reason,
    });
  }

  if (context.policyDecision?.outcome === "approval_required") {
    return makeResult("unknown", `Action requires approval: ${context.policyDecision.reason}`, context.policyDecision.reason, "medium", context, {
      expectedOutcome: `${context.action.type} action`,
      actualOutcome: `Awaiting approval: ${context.policyDecision.reason}`,
      retryable: false,
      retryRecommendation: "Action cannot be verified until approved",
      failureCode: "approval_required",
      failureReason: context.policyDecision.reason,
    });
  }

  switch (context.action.type) {
    case "navigate":
      return verifyNavigate(context);
    case "screenshot":
      return verifyScreenshot(context);
    case "click":
    case "double_click":
    case "dom_click":
      return verifyClick(context);
    case "type":
    case "dom_type":
      return verifyType(context);
    case "scroll":
      return verifyScroll(context);
    case "key":
    case "pressKey":
      return verifyKey(context);
    case "wait":
      return verifyWait(context);
    case "inspectDom":
      return verifyInspectDom(context);
    case "extractText":
      return verifyTextExtraction(context);
    case "extractLinks":
      return verifyLinkExtraction(context);
    case "extractHeadings":
      return verifyHeadingExtraction(context);
    case "extractTable":
      return verifyTableExtraction(context);
    case "complete":
      return verifyComplete(context);
    case "fail":
      return verifyFail(context);
    default:
      return makeResult("unknown", `Unsupported action type: ${(context.action as ComputerAction).type}`, undefined, "low", context, {
        expectedOutcome: `${(context.action as ComputerAction).type} action`,
        actualOutcome: "No verification heuristic for this action type",
        failureCode: "unsupported_action_type",
        failureReason: `Verification not implemented for action type "${(context.action as ComputerAction).type}"`,
      });
  }
}

export function resolutionEventType(result: VerificationResult): "verification.passed" | "verification.failed" | "verification.unknown" {
  switch (result.status) {
    case "passed":
      return "verification.passed";
    case "failed":
      return "verification.failed";
    case "unknown":
      return "verification.unknown";
  }
}
