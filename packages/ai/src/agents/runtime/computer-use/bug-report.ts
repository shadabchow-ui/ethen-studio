import type { ComputerUseStep, ComputerUseArtifact } from "./types";
import {
  getComputerUseRun,
  getComputerUseSteps,
  getComputerUseScreenshots,
  addArtifact,
} from "./store-adapter";

export type BugSeverity = "critical" | "high" | "medium" | "low" | "cosmetic";

export interface BugFinding {
  id: string;
  title: string;
  description: string;
  severity: BugSeverity;
  evidenceScreenshotIds: string[];
  evidenceStepIds: string[];
  reproductionSteps: string[];
  likelySource: string;
  verified: boolean;
}

export interface BugReport {
  runId: string;
  title: string;
  task: string;
  targetUrl: string;
  resultStatus: string;
  generatedAt: string;
  findings: BugFinding[];
  evidenceScreenshots: Array<{ id: string; uri: string; label?: string }>;
  reproductionStepCount: number;
  limitations: string[];
  /** Effective mode the run operated in */
  mode: string;
  /** Duration in ms if available, else null */
  durationMs: number | null;
  /** Whether console logs are captured */
  consoleLogsAvailable: boolean;
  /** Whether network logs are captured */
  networkLogsAvailable: boolean;
}

export function collectBugFindings(runId: string): BugFinding[] {
  const steps = getComputerUseSteps(runId);
  const findings: BugFinding[] = [];

  for (const step of steps) {
    if (step.status === "failed" || (step.result && !step.result.success)) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        title: `Failed action: ${step.action.type}`,
        description: step.result?.error ?? `Action "${step.action.type}" did not complete successfully.`,
        severity: deriveBugSeverity(step),
        evidenceScreenshotIds: [
          step.beforeScreenshotId,
          step.afterScreenshotId,
        ].filter((id): id is string => !!id),
        evidenceStepIds: [step.id],
        reproductionSteps: buildReproductionSteps(step),
        likelySource: `Step ${step.index}: ${step.action.type} action`,
        verified: false,
      });
    }

    if (step.policyDecision && step.policyDecision.outcome === "block") {
      findings.push({
        id: `finding-${findings.length + 1}`,
        title: `Blocked action: ${step.action.type}`,
        description: `Policy blocked this action: ${step.policyDecision.reason}`,
        severity: "medium",
        evidenceScreenshotIds: [
          step.beforeScreenshotId,
        ].filter((id): id is string => !!id),
        evidenceStepIds: [step.id],
        reproductionSteps: [
          `Attempt to execute "${step.action.type}" action`,
          `Policy engine evaluates the action`,
          `Action is blocked with reason: ${step.policyDecision.reason}`,
        ],
        likelySource: `Step ${step.index}: Policy decision`,
        verified: false,
      });
    }
  }

  return findings;
}

function deriveBugSeverity(step: ComputerUseStep): BugSeverity {
  if (step.policyDecision?.riskLevel === "critical") return "critical";
  if (step.policyDecision?.riskLevel === "high") return "high";

  const actionType = step.action.type;
  if (actionType === "navigate" || actionType === "complete") return "high";
  if (actionType === "click" || actionType === "type") return "medium";

  return "low";
}

function buildReproductionSteps(step: ComputerUseStep): string[] {
  const steps: string[] = [];

  if (step.action.type === "navigate") {
    steps.push(`Navigate to ${step.action.url ?? "the target URL"}`);
  } else if (step.action.type === "click") {
    const target = step.action.targetLabel
      ? `"${step.action.targetLabel}"`
      : `coordinates (${step.action.x}, ${step.action.y})`;
    steps.push(`Click on ${target}`);
  } else if (step.action.type === "type") {
    const target = step.action.targetLabel
      ? `"${step.action.targetLabel}"`
      : "the target field";
    steps.push(`Type ${step.action.sensitive ? "[redacted]" : step.action.text ?? "text"} into ${target}`);
  } else if (step.action.type === "scroll") {
    steps.push(`Scroll ${step.action.direction ?? "down"} by ${step.action.amount ?? 0}`);
  } else {
    steps.push(`Execute "${step.action.type}" action`);
  }

  if (step.policyDecision) {
    steps.push(`Policy check: ${step.policyDecision.outcome} — ${step.policyDecision.reason}`);
  }

  if (step.result?.error) {
    steps.push(`Error encountered: ${step.result.error}`);
  }

  return steps;
}

export function generateBugReport(runId: string): BugReport {
  const run = getComputerUseRun(runId);
  const findings = collectBugFindings(runId);
  const screenshots = getComputerUseScreenshots(runId);

  const targetUrl = run?.sandbox?.url ?? run?.taskBrief?.allowedDomains?.[0] ?? "unknown";

  const limitations: string[] = [];
  if (findings.length === 0) {
    limitations.push("No bug findings were collected from this run.");
  }
  if (!run) {
    limitations.push("Run data not available; report may be incomplete.");
  }
  if (screenshots.length === 0) {
    limitations.push("No screenshots are available as evidence.");
  } else {
    const hasRenderable = screenshots.some(
      (s) => s.imageUri.startsWith("data:image/") || s.imageUri.startsWith("http")
    );
    if (!hasRenderable) {
      limitations.push("Screenshots exist but none are renderable image URIs; visual evidence is not available.");
    }
  }
  limitations.push("Console logs are not captured by the current runtime.");
  limitations.push("Network logs are not captured by the current runtime.");

  const stepFindings = findings.filter((f) => f.reproductionSteps.length > 0);

  const durationMs = run?.startedAt && run?.completedAt
    ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
    : null;

  return {
    runId,
    title: `Bug Report: ${run?.title ?? runId}`,
    task: run?.task ?? "unknown",
    targetUrl,
    resultStatus: run?.resultStatus ?? run?.status ?? "unknown",
    generatedAt: new Date().toISOString(),
    findings,
    evidenceScreenshots: screenshots.map((s) => ({
      id: s.id,
      uri: s.imageUri,
      label: s.label,
    })),
    reproductionStepCount: stepFindings.length,
    limitations,
    mode: run?.mode ?? "not provided",
    durationMs,
    consoleLogsAvailable: false,
    networkLogsAvailable: false,
  };
}

export function generateBugReportMarkdown(runId: string): string {
  const report = generateBugReport(runId);
  const lines: string[] = [];

  lines.push(`# ${report.title}`);
  lines.push(``);
  lines.push(`**Task:** ${report.task}`);
  lines.push(`**Target URL:** ${report.targetUrl}`);
  lines.push(`**Mode:** ${report.mode}`);
  lines.push(`**Result Status:** ${report.resultStatus}`);
  lines.push(`**Generated:** ${report.generatedAt}`);
  if (report.durationMs !== null) {
    lines.push(`**Duration:** ${(report.durationMs / 1000).toFixed(1)}s`);
  }
  lines.push(``);

  if (report.findings.length === 0) {
    lines.push(`## Findings`);
    lines.push(``);
    lines.push(`No issues detected during this run.`);
    lines.push(``);
  } else {
    lines.push(`## Findings (${report.findings.length})`);
    lines.push(``);

    const bySeverity: Record<string, BugFinding[]> = {};
    for (const f of report.findings) {
      if (!bySeverity[f.severity]) bySeverity[f.severity] = [];
      bySeverity[f.severity].push(f);
    }

    const severityOrder: BugSeverity[] = ["critical", "high", "medium", "low", "cosmetic"];

    for (const severity of severityOrder) {
      const items = bySeverity[severity];
      if (!items || items.length === 0) continue;

      lines.push(`### ${severity.toUpperCase()} (${items.length})`);
      lines.push(``);

      for (const f of items) {
        lines.push(`#### ${f.title}`);
        lines.push(``);
        lines.push(`- **Severity:** ${f.severity}`);
        lines.push(`- **Description:** ${f.description}`);
        lines.push(`- **Likely Source:** ${f.likelySource}`);

        if (f.reproductionSteps.length > 0) {
          lines.push(`- **Reproduction Steps:**`);
          for (const step of f.reproductionSteps) {
            lines.push(`  1. ${step}`);
          }
        }

        if (f.evidenceScreenshotIds.length > 0) {
          lines.push(`- **Evidence Screenshots:** ${f.evidenceScreenshotIds.join(", ")}`);
        }

        lines.push(``);
      }
    }
  }

  if (report.evidenceScreenshots.length > 0) {
    lines.push(`## Evidence Screenshots (${report.evidenceScreenshots.length})`);
    lines.push(``);
    for (const s of report.evidenceScreenshots) {
      lines.push(`- ${s.label ?? s.id}: ${s.uri}`);
    }
    lines.push(``);
  }

  if (report.limitations.length > 0) {
    lines.push(`## Limitations`);
    lines.push(``);
    for (const l of report.limitations) {
      lines.push(`- ${l}`);
    }
    lines.push(``);
  }

  lines.push(`## Evidence Availability`);
  lines.push(``);
  lines.push(`- **Console Logs:** ${report.consoleLogsAvailable ? "captured" : "not captured"}`);
  lines.push(`- **Network Logs:** ${report.networkLogsAvailable ? "captured" : "not captured"}`);
  lines.push(`- **Evidence Screenshots:** ${report.evidenceScreenshots.length} total`);
  lines.push(``);

  return lines.join("\n");
}

export function validateBugReportSchema(report: BugReport): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  checks.push({
    name: "has_title",
    passed: typeof report.title === "string" && report.title.length > 0,
    detail: report.title ? `Title: "${report.title}"` : "Title missing",
  });

  checks.push({
    name: "has_task",
    passed: typeof report.task === "string" && report.task.length > 0,
    detail: report.task ? `Task present` : "Task missing",
  });

  checks.push({
    name: "has_target_url",
    passed: typeof report.targetUrl === "string",
    detail: `Target URL: ${report.targetUrl}`,
  });

  checks.push({
    name: "has_result_status",
    passed: typeof report.resultStatus === "string",
    detail: `Result status: ${report.resultStatus}`,
  });

  checks.push({
    name: "findings_have_severity",
    passed: report.findings.every(
      (f) =>
        f.severity === "critical" ||
        f.severity === "high" ||
        f.severity === "medium" ||
        f.severity === "low" ||
        f.severity === "cosmetic"
    ),
    detail: "All findings have valid severity",
  });

  checks.push({
    name: "no_false_evidence",
    passed: report.findings.every(
      (f) => f.evidenceScreenshotIds.every((id) => typeof id === "string" && id.length > 0)
    ),
    detail: "Evidence screenshot IDs validated",
  });

  checks.push({
    name: "has_mode",
    passed: typeof report.mode === "string" && report.mode.length > 0,
    detail: `Mode: ${report.mode}`,
  });

  checks.push({
    name: "console_network_not_claimed",
    passed: !report.consoleLogsAvailable && !report.networkLogsAvailable,
    detail: report.consoleLogsAvailable || report.networkLogsAvailable
      ? "Console/network logs incorrectly claimed as available"
      : "Console and network logs correctly reported as not captured",
  });

  checks.push({
    name: "no_screenshot_evidence_when_empty",
    passed: report.evidenceScreenshots.length > 0
      ? report.evidenceScreenshots.every((s) => typeof s.uri === "string")
      : true,
    detail: report.evidenceScreenshots.length > 0
      ? `${report.evidenceScreenshots.length} evidence screenshots present`
      : "No evidence screenshots; limitations note this honesty",
  });

  checks.push({
    name: "duration_type",
    passed: report.durationMs === null || typeof report.durationMs === "number",
    detail: report.durationMs !== null ? `Duration: ${(report.durationMs / 1000).toFixed(1)}s` : "Duration not available",
  });

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

export function generateBugReportArtifact(runId: string): ComputerUseArtifact | null {
  const run = getComputerUseRun(runId);
  if (!run) return null;

  const report = generateBugReport(runId);
  const markdown = generateBugReportMarkdown(runId);

  const findingSummary = report.findings.length > 0
    ? report.findings.map((f) => `${f.severity}: ${f.title}`).join("\n")
    : "No findings detected.";

  return addArtifact(runId, {
    type: "report",
    title: `Bug Report: ${run.title}`,
    uri: `artifact://bug-report/${runId}`,
    contentType: "text/markdown",
    sizeBytes: new TextEncoder().encode(markdown).length,
    hash: `bug-report-${runId}-${report.generatedAt}`,
    redacted: false,
  });
}
