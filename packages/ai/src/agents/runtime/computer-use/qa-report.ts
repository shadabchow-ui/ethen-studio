import type { QaResult, QaFinding, QaCheck, QaObservation } from "./qa-types";

export interface QaReportDocument {
  title: string;
  generatedAt: string;
  summary: string;
  result: QaResult;
  markdown: string;
  findingSummary: { total: number; critical: number; high: number; medium: number; low: number; info: number };
}

function countFindings(findings: QaFinding[]): QaReportDocument["findingSummary"] {
  const total = findings.length;
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;
  const info = findings.filter((f) => f.severity === "info").length;
  return { total, critical, high, medium, low, info };
}

function renderCheckTable(checks: QaCheck[]): string {
  const rows = checks.map((c) => {
    const statusIcon =
      c.status === "pass" ? "✓" :
      c.status === "fail" ? "✗" :
      c.status === "partial" ? "~" :
      c.status === "blocked" ? "⊘" : "⋯";
    return `| ${statusIcon} ${c.name} | ${c.status} | ${c.details || "—"} |`;
  });
  return [
    "| Check | Status | Detail |",
    "|-------|--------|--------|",
    ...rows,
  ].join("\n");
}

function renderFindings(findings: QaFinding[]): string {
  if (findings.length === 0) return "No findings detected.";
  return findings
    .map((f) => {
      const severityLabel = f.severity.toUpperCase();
      const evidence = f.evidence.map((e) => `  - ${e}`).join("\n");
      const steps = f.reproductionSteps
        ? f.reproductionSteps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")
        : "";
      return [
        `### [${severityLabel}] ${f.title}`,
        f.description,
        "",
        `**Category:** ${f.category || "uncategorized"}`,
        "",
        "**Evidence:**",
        evidence,
        ...(steps ? ["", "**Reproduction:**", steps] : []),
      ].join("\n");
    })
    .join("\n\n");
}

function renderObservations(observations: QaObservation[]): string {
  if (observations.length === 0) return "No observations recorded.";
  return observations
    .map(
      (o) =>
        `- **URL:** ${o.url}\n  **Title:** ${o.title}\n  **Viewport:** ${o.viewport.width}×${o.viewport.height}\n  **Screenshots:** ${o.screenshotRefs.length}\n  **Console errors:** ${o.consoleErrors.length}\n  **Interactive controls:** ${o.interactiveControlCount}`,
    )
    .join("\n");
}

export function buildQaReport(result: QaResult): QaReportDocument {
  const findingSummary = countFindings(result.findings);
  const statusLabel =
    result.status === "success" ? "All checks passed" :
    result.status === "partial" ? "Some issues found" :
    result.status === "failed" ? "Critical issues found" :
    "Blocked by policy or environment";

  let summary = `## QA Report: ${result.targetUrl}\n\n`;
  summary += `**Status:** ${result.status} — ${statusLabel}\n`;
  summary += `**Duration:** ${result.durationMs}ms\n`;
  summary += `**URL:** ${result.targetUrl}\n`;
  summary += `**Run ID:** ${result.runId}\n\n`;
  summary += `### Finding Summary\n\n`;
  summary += `| Severity | Count |\n|----------|------:|\n`;

  for (const [sev, count] of Object.entries(findingSummary)) {
    if (sev === "total") continue;
    summary += `| ${sev.charAt(0).toUpperCase() + sev.slice(1)} | ${count} |\n`;
  }

  summary += `| **Total** | **${findingSummary.total}** |\n\n`;

  summary += `### Checks\n\n${renderCheckTable(result.checks)}\n\n`;

  if (result.observations.length > 0) {
    summary += `### Observations\n\n${renderObservations(result.observations)}\n\n`;
  }

  summary += `### Findings\n\n${renderFindings(result.findings)}\n\n`;

  if (result.limitations.length > 0) {
    summary += `### Known Limitations\n\n${result.limitations.map((l) => `- ${l}`).join("\n")}\n`;
  }

  const markdown = summary;

  return {
    title: `QA Report — ${result.targetUrl}`,
    generatedAt: result.completedAt,
    summary: statusLabel,
    result,
    markdown,
    findingSummary,
  };
}
