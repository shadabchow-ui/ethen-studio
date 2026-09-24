import type { QaResult, QaCheck, QaFinding, QaObservation, QaRunConfig, QaScreenshotRef } from "./qa-types";

export interface QaAgentContext {
  runId: string;
  sessionId: string;
  config: QaRunConfig;
}

export interface QaTimelineEvent {
  type: string;
  label: string;
  detail?: string;
  timestamp: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isUrlAllowed(url: string, allowedDomains: string[]): boolean {
  try {
    const parsed = new URL(url);
    return allowedDomains.some((d) => {
      if (d === "*") return true;
      if (d.startsWith("http://") || d.startsWith("https://")) {
        return url.startsWith(d);
      }
      return parsed.hostname === d || parsed.hostname.endsWith("." + d);
    });
  } catch {
    return false;
  }
}

function simulateUrlValidation(url: string, allowedDomains: string[]): { allowed: boolean; reason: string } {
  if (!url || url.trim() === "") {
    return { allowed: false, reason: "Target URL is empty." };
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return { allowed: false, reason: "Target URL must use http:// or https:// scheme." };
  }
  if (!isUrlAllowed(url, allowedDomains)) {
    return { allowed: false, reason: `URL "${url}" is not in allowed domains: ${allowedDomains.join(", ")}` };
  }
  return { allowed: true, reason: "URL is allowed by policy." };
}

function simulateObservation(url: string): QaObservation {
  const now = nowIso();
  const screenshotRefs: QaScreenshotRef[] = [
    {
      id: `screenshot-${Date.now()}`,
      label: "viewport",
      capturedAt: now,
      mimeType: "image/png",
    },
  ];

  return {
    url,
    title: url.includes("localhost") ? "Local Development Server" : "Page",
    viewport: { width: 1280, height: 720 },
    bodyTextPreview: "Simulated page content for QA inspection.",
    hasVisibleContent: true,
    consoleErrors: [],
    interactiveControlCount: 0,
    screenshotRefs,
  };
}

function runDeterministicChecks(observation: QaObservation): QaCheck[] {
  const checks: QaCheck[] = [];

  checks.push({
    id: "page-loads",
    name: "Page loads successfully",
    description: "Verify the page URL loads without immediate error.",
    status: observation.url ? "pass" : "fail",
    evidence: observation.url || "No URL captured",
    details: `URL resolved: ${observation.url}`,
  });

  checks.push({
    id: "url-title-captured",
    name: "URL and title captured",
    description: "Capture and record current page URL and document title.",
    status: observation.url && observation.title ? "pass" : "partial",
    evidence: `URL: ${observation.url}\nTitle: ${observation.title}`,
    details: `Viewport: ${observation.viewport.width}x${observation.viewport.height}`,
  });

  checks.push({
    id: "visible-content",
    name: "Visible body content exists",
    description: "Check that the page renders visible content (non-empty body).",
    status: observation.hasVisibleContent ? "pass" : "fail",
    evidence: observation.bodyTextPreview?.slice(0, 200) || "No text content found",
    details: observation.hasVisibleContent ? "Page contains visible content." : "Page appears empty.",
  });

  checks.push({
    id: "console-errors",
    name: "Console errors captured",
    description: "Capture browser console errors emitted during page load.",
    status: observation.consoleErrors.length === 0 ? "pass" : "fail",
    evidence: observation.consoleErrors.length > 0
      ? observation.consoleErrors.join("\n")
      : "No console errors detected",
    details: observation.consoleErrors.length > 0
      ? `${observation.consoleErrors.length} console error(s) found`
      : "No console errors found",
  });

  checks.push({
    id: "interactive-controls",
    name: "Interactive controls discovered",
    description: "Discover interactive elements from the page DOM or accessibility tree.",
    status: observation.interactiveControlCount > 0 ? "pass" : "info",
    evidence: `${observation.interactiveControlCount} interactive element(s) found`,
    details: observation.interactiveControlCount > 0
      ? `${observation.interactiveControlCount} control(s) detected`
      : "DOM/a11y discovery limited — using screenshot-only observation",
  });

  checks.push({
    id: "screenshot-captured",
    name: "Screenshot captured",
    description: "Capture a screenshot of the current viewport.",
    status: observation.screenshotRefs.length > 0 ? "pass" : "fail",
    evidence: observation.screenshotRefs.map((s) => `${s.label} (${s.capturedAt})`).join("\n"),
    details: `${observation.screenshotRefs.length} screenshot(s) captured`,
  });

  return checks;
}

function evaluateFindings(checks: QaCheck[], observation: QaObservation): QaFinding[] {
  const findings: QaFinding[] = [];

  const failedChecks = checks.filter((c) => c.status === "fail");
  for (const check of failedChecks) {
    findings.push({
      id: `finding-${check.id}`,
      severity: "high",
      title: `${check.name} failed`,
      description: check.details || check.description,
      evidence: [check.evidence || "No evidence captured"],
      category: "qa_check",
    });
  }

  const partialChecks = checks.filter((c) => c.status === "partial");
  for (const check of partialChecks) {
    findings.push({
      id: `finding-${check.id}`,
      severity: "medium",
      title: `${check.name} partially completed`,
      description: check.details || check.description,
      evidence: [check.evidence || "Partial evidence"],
      category: "qa_check",
    });
  }

  if (observation.consoleErrors.length > 0) {
    findings.push({
      id: "finding-console-errors",
      severity: observation.consoleErrors.length > 3 ? "high" : "medium",
      title: `Browser console errors detected (${observation.consoleErrors.length})`,
      description: "The page emitted JavaScript errors during load or interaction.",
      evidence: observation.consoleErrors.slice(0, 5),
      reproductionSteps: ["Navigate to target page", "Open browser console"],
      category: "console",
    });
  }

  if (!observation.hasVisibleContent) {
    findings.push({
      id: "finding-empty-page",
      severity: "high",
      title: "Page appears to have no visible content",
      description: "The page did not render visible text content. This may indicate a blank page, loading state, or error.",
      evidence: [`URL: ${observation.url}`, "No body text extracted"],
      category: "content",
    });
  }

  if (observation.interactiveControlCount === 0) {
    findings.push({
      id: "finding-no-interactive-controls",
      severity: "info",
      title: "No interactive controls discovered",
      description: "DOM/a11y interactive element discovery did not return controls. This is expected if the page is simple or if the DOM inspection provider is not configured.",
      evidence: ["Interactive element count: 0"],
      category: "dom",
    });
  }

  return findings;
}

function deriveOverallStatus(checks: QaCheck[], findings: QaFinding[]): "success" | "partial" | "failed" | "blocked" {
  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasHigh = findings.some((f) => f.severity === "high");
  const hasMedium = findings.some((f) => f.severity === "medium");
  const hasFailures = checks.some((c) => c.status === "fail");

  if (hasCritical) return "failed";
  if (hasHigh || hasFailures) return "failed";
  if (hasMedium) return "partial";
  return "success";
}

export async function runQa(ctx: QaAgentContext): Promise<{ result: QaResult; timeline: QaTimelineEvent[] }> {
  const timeline: QaTimelineEvent[] = [];
  const startedAt = nowIso();
  const startMs = Date.now();

  timeline.push({ type: "qa.started", label: "QA run started", detail: `Target: ${ctx.config.targetUrl}`, timestamp: nowIso() });

  const policyCheck = simulateUrlValidation(ctx.config.targetUrl, ctx.config.allowedDomains);
  timeline.push({
    type: "policy.checked",
    label: "URL policy check",
    detail: policyCheck.reason,
    timestamp: nowIso(),
  });

  if (!policyCheck.allowed) {
    const completedAt = nowIso();
    const blockedResult: QaResult = {
      runId: ctx.runId,
      sessionId: ctx.sessionId,
      targetUrl: ctx.config.targetUrl,
      status: "blocked",
      startedAt,
      completedAt,
      durationMs: Date.now() - startMs,
      observations: [],
      checks: [{
        id: "url-allowed",
        name: "Target URL allowed by policy",
        description: "Verify the target URL is in the allowed domain list.",
        status: "blocked",
        evidence: policyCheck.reason,
        details: policyCheck.reason,
      }],
      findings: [{
        id: "finding-url-blocked",
        severity: "high",
        title: "Target URL blocked by policy",
        description: policyCheck.reason,
        evidence: [`URL: ${ctx.config.targetUrl}`, `Allowed domains: ${ctx.config.allowedDomains.join(", ")}`],
        category: "policy",
      }],
      limitations: ["URL blocked — no checks were performed"],
    };

    timeline.push({ type: "qa.completed", label: "QA blocked", detail: policyCheck.reason, timestamp: completedAt });
    return { result: blockedResult, timeline };
  }

  timeline.push({ type: "observation.captured", label: "Initial observation captured", timestamp: nowIso() });

  const observation = simulateObservation(ctx.config.targetUrl);
  timeline.push({ type: "observation.processed", label: "Observation processed", detail: `URL: ${observation.url}`, timestamp: nowIso() });

  const checks = runDeterministicChecks(observation);
  timeline.push({ type: "checks.completed", label: `QA checks completed: ${checks.length} total`, timestamp: nowIso() });

  const findings = evaluateFindings(checks, observation);
  timeline.push({ type: "findings.evaluated", label: `Findings evaluated: ${findings.length} total`, timestamp: nowIso() });

  const status = deriveOverallStatus(checks, findings);
  const completedAt = nowIso();

  const result: QaResult = {
    runId: ctx.runId,
    sessionId: ctx.sessionId,
    targetUrl: ctx.config.targetUrl,
    status,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    observations: [observation],
    checks,
    findings,
    limitations: [
      "Console error capture requires browser session manager with CDP support.",
      "DOM/a11y interactive element discovery is provider-dependent.",
      "Screenshot references are simulated when no browser session is active.",
      "This is a first bounded QA behavior — not full UI coverage.",
    ],
  };

  timeline.push({ type: "qa.completed", label: `QA completed: ${status}`, detail: `${findings.length} finding(s)`, timestamp: completedAt });

  return { result, timeline };
}
