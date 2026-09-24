import type {
  ComputerUseRun,
  ComputerUseStep,
  ComputerUseReplayEvent,
  ComputerUseScreenshot,
  ComputerUseArtifact,
  ComputerUseApproval,
  ComputerUseObservation,
} from "./types";
import {
  getComputerUseRun,
  getComputerUseSteps,
  getComputerUseEvents,
  getComputerUseScreenshots,
  getComputerUseArtifacts,
  getComputerUseApprovals,
  getComputerUseObservations,
} from "./store-adapter";

export interface ReplayBundle {
  runId: string;
  generatedAt: string;
  run: ComputerUseRun | null;
  steps: ComputerUseStep[];
  events: ComputerUseReplayEvent[];
  screenshots: ReplayScreenshotEntry[];
  artifacts: ComputerUseArtifact[];
  approvals: ComputerUseApproval[];
  observations: ComputerUseObservation[];
  missingScreenshots: string[];
  invariantWarnings: string[];
  /** Task/goal from the run, or "not provided" */
  task: string;
  /** Effective mode label */
  mode: string;
  /** Run status */
  status: string;
  /** Duration in ms if completedAt available, else null */
  durationMs: number | null;
  /** Human-readable limitations of this replay bundle */
  limitations: string[];
  /** Whether console logs are captured by this runtime */
  consoleLogsAvailable: boolean;
  /** Whether network logs are captured by this runtime */
  networkLogsAvailable: boolean;
}

export interface ReplayScreenshotEntry {
  screenshot: ComputerUseScreenshot;
  available: boolean;
  placeholder: boolean;
}

export function generateReplayBundle(runId: string): ReplayBundle {
  const run = getComputerUseRun(runId);
  const steps = getComputerUseSteps(runId);
  const events = getComputerUseEvents(runId);
  const rawScreenshots = getComputerUseScreenshots(runId);
  const artifacts = getComputerUseArtifacts(runId);
  const approvals = getComputerUseApprovals(runId);
  const observations = getComputerUseObservations(runId);
  const invariantWarnings: string[] = [];
  const missingScreenshots: string[] = [];

  const screenshotEntries: ReplayScreenshotEntry[] = rawScreenshots.map((s) => {
    const available = !!s.imageUri && s.imageUri.length > 0;
    if (!available) {
      missingScreenshots.push(s.id);
    }
    return {
      screenshot: s,
      available,
      placeholder: !available,
    };
  });

  const eventScreenshotIds = new Set(
    events
      .filter((e) => e.screenshotId)
      .map((e) => e.screenshotId!)
  );
  const storedScreenshotIds = new Set(rawScreenshots.map((s) => s.id));

  for (const sid of eventScreenshotIds) {
    if (!storedScreenshotIds.has(sid)) {
      missingScreenshots.push(sid);
      invariantWarnings.push(`Event references screenshot "${sid}" not found in store`);
    }
  }

  if (steps.length > 0) {
    const indices = steps.map((s) => s.index).sort((a, b) => a - b);
    if (indices[0] !== 0) {
      invariantWarnings.push("First step index is not 0");
    }
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1] + 1) {
        invariantWarnings.push(`Step index gap between ${indices[i - 1]} and ${indices[i]}`);
        break;
      }
    }
  }

  if (run) {
    const hasInitialEvent = events.some(
      (e) => e.type === "run.started" || e.type === "sandbox.started" || e.type === "observation.captured"
    );
    if (!hasInitialEvent && steps.length > 0) {
      invariantWarnings.push("No initial run.started, sandbox.started, or observation.captured event found");
    }

  const approvedApprovals = approvals.filter(
    (a) => a.decision === "approved" || a.decision === "denied"
  );
  if (approvedApprovals.length > 0) {
      for (const approval of approvedApprovals) {
        const hasApprovalEvent = events.some(
          (e) =>
            e.type === "approval.approved" ||
            e.type === "approval.denied" ||
            e.type === "approval.requested"
        );
        if (!hasApprovalEvent) {
          invariantWarnings.push(
            `Approval "${approval.id}" resolved but no corresponding policy event found`
          );
        }
      }
    }

    if (run.status === "complete" || run.status === "failed") {
      const hasCompletionEvent = events.some(
        (e) => e.type === "run.completed" || e.type === "run.failed" || e.type === "run.aborted"
      );
      if (!hasCompletionEvent) {
        invariantWarnings.push(`Run status is "${run.status}" but no completion event found`);
      }
    }
  }

  const task = run?.task ?? "not provided";
  const mode = run?.mode ?? "not provided";
  const status = run?.status ?? "unknown";
  const durationMs = run?.startedAt && run?.completedAt
    ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
    : null;

  const limitations: string[] = [];
  if (!run) limitations.push("Run data not available; replay may be incomplete.");
  if (rawScreenshots.length === 0) limitations.push("No screenshots were captured during this run.");
  if (missingScreenshots.length > 0) limitations.push(`${missingScreenshots.length} screenshot(s) referenced but not available.`);
  if (!events.some((e) => e.type.includes("action"))) limitations.push("No action events recorded; timeline may be empty.");
  limitations.push("Console logs are not captured by the current runtime.");
  limitations.push("Network logs are not captured by the current runtime.");

  return {
    runId,
    generatedAt: new Date().toISOString(),
    run,
    steps: steps.sort((a, b) => a.index - b.index),
    events: events.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    ),
    screenshots: screenshotEntries,
    artifacts,
    approvals,
    observations,
    missingScreenshots,
    invariantWarnings,
    task,
    mode,
    status,
    durationMs,
    limitations,
    consoleLogsAvailable: false,
    networkLogsAvailable: false,
  };
}

export function generateReplayJson(runId: string): Record<string, unknown> {
  const bundle = generateReplayBundle(runId);
  return {
    runId: bundle.runId,
    generatedAt: bundle.generatedAt,
    run: bundle.run ? serializeRun(bundle.run) : null,
    steps: bundle.steps.map(serializeStep),
    events: bundle.events,
    screenshotCount: bundle.screenshots.length,
    availableScreenshots: bundle.screenshots.filter((s) => s.available).length,
    missingScreenshots: bundle.missingScreenshots,
    artifactCount: bundle.artifacts.length,
    approvalCount: bundle.approvals.length,
    observationCount: bundle.observations.length,
    invariantWarnings: bundle.invariantWarnings,
    task: bundle.task,
    mode: bundle.mode,
    status: bundle.status,
    durationMs: bundle.durationMs,
    limitations: bundle.limitations,
    consoleLogsAvailable: bundle.consoleLogsAvailable,
    networkLogsAvailable: bundle.networkLogsAvailable,
  };
}

export function generateReplayMarkdown(runId: string): string {
  const bundle = generateReplayBundle(runId);
  const lines: string[] = [];

  lines.push(`# Computer Use Run Replay`);
  lines.push(``);
  lines.push(`**Run ID:** ${bundle.runId}`);
  lines.push(`**Generated:** ${bundle.generatedAt}`);
  lines.push(``);

  lines.push(`## Run Summary`);
  lines.push(``);
  lines.push(`- **Task:** ${bundle.task}`);
  lines.push(`- **Mode:** ${bundle.mode}`);
  lines.push(`- **Status:** ${bundle.status}`);
  if (bundle.run) {
    const r = bundle.run;
    lines.push(`- **Title:** ${r.title || "(untitled)"}`);
    lines.push(`- **Provider:** ${r.provider}`);
    lines.push(`- **Step Count:** ${r.stepCount} / ${r.maxSteps}`);
    lines.push(`- **Started:** ${r.startedAt}`);
    if (r.completedAt) lines.push(`- **Completed:** ${r.completedAt}`);
    if (r.resultStatus) lines.push(`- **Result:** ${r.resultStatus}`);
    if (r.summary) lines.push(`- **Summary:** ${r.summary}`);
  }
  if (bundle.durationMs !== null) {
    lines.push(`- **Duration:** ${(bundle.durationMs / 1000).toFixed(1)}s`);
  }
  lines.push(``);

  if (bundle.steps.length > 0) {
    lines.push(`## Steps (${bundle.steps.length})`);
    lines.push(``);
    for (const step of bundle.steps) {
      lines.push(`### Step ${step.index}: ${step.action.type}`);
      lines.push(``);
      lines.push(`- **Status:** ${step.status}`);
      lines.push(`- **Action:** \`${step.action.type}\``);
      if (step.action.targetLabel) lines.push(`- **Target:** ${step.action.targetLabel}`);
      if (step.policyDecision) {
        lines.push(`- **Policy:** ${step.policyDecision.outcome} (${step.policyDecision.reason})`);
      }
      if (step.result) {
        lines.push(`- **Result:** ${step.result.success ? "success" : "failed"}`);
        if (step.result.error) lines.push(`- **Error:** ${step.result.error}`);
      }
      if (step.beforeScreenshotId) lines.push(`- **Before Screenshot:** ${step.beforeScreenshotId}`);
      if (step.afterScreenshotId) lines.push(`- **After Screenshot:** ${step.afterScreenshotId}`);
      lines.push(``);
    }
  }

  if (bundle.approvals.length > 0) {
    lines.push(`## Approvals (${bundle.approvals.length})`);
    lines.push(``);
    for (const a of bundle.approvals) {
      lines.push(`- ${a.decision ?? "pending"} — ${a.reason} (risk: ${a.riskLevel})`);
    }
    lines.push(``);
  }

  if (bundle.invariantWarnings.length > 0) {
    lines.push(`## Invariant Warnings`);
    lines.push(``);
    for (const w of bundle.invariantWarnings) {
      lines.push(`- ⚠ ${w}`);
    }
    lines.push(``);
  }

  if (bundle.missingScreenshots.length > 0) {
    lines.push(`## Missing Screenshots`);
    lines.push(``);
    lines.push(`${bundle.missingScreenshots.length} screenshot(s) were referenced but not available.`);
    lines.push(``);
  }

  if (bundle.limitations.length > 0) {
    lines.push(`## Limitations`);
    lines.push(``);
    for (const l of bundle.limitations) {
      lines.push(`- ${l}`);
    }
    lines.push(``);
  }

  lines.push(`## Evidence Availability`);
  lines.push(``);
  lines.push(`- **Console Logs:** ${bundle.consoleLogsAvailable ? "available" : "not captured"}`);
  lines.push(`- **Network Logs:** ${bundle.networkLogsAvailable ? "available" : "not captured"}`);
  lines.push(`- **Screenshots:** ${bundle.screenshots.filter((s) => s.available).length} available / ${bundle.screenshots.length} total`);
  lines.push(``);

  return lines.join("\n");
}

function serializeRun(run: ComputerUseRun): Record<string, unknown> {
  return {
    id: run.id,
    userId: run.userId,
    title: run.title,
    task: run.task,
    mode: run.mode,
    provider: run.provider,
    status: run.status,
    stepCount: run.stepCount,
    maxSteps: run.maxSteps,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    resultStatus: run.resultStatus,
    summary: run.summary,
    taskBrief: run.taskBrief,
    permissionScope: {
      allowedDomains: run.permissionScope.allowedDomains,
      allowedActions: run.permissionScope.allowedActions,
      approvalRequiredActions: run.permissionScope.approvalRequiredActions,
      blockedActions: run.permissionScope.blockedActions,
    },
  };
}

function serializeStep(step: ComputerUseStep): Record<string, unknown> {
  return {
    id: step.id,
    index: step.index,
    status: step.status,
    action: step.action,
    result: step.result,
    policyDecision: step.policyDecision,
    beforeScreenshotId: step.beforeScreenshotId,
    afterScreenshotId: step.afterScreenshotId,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
  };
}

export function validateReplayInvariants(runId: string): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const bundle = generateReplayBundle(runId);
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  checks.push({
    name: "bundle_generated",
    passed: true,
    detail: `Replay bundle generated for run "${runId}"`,
  });

  checks.push({
    name: "run_exists",
    passed: bundle.run !== null,
    detail: bundle.run ? `Run "${runId}" found` : `Run "${runId}" not found`,
  });

  const orderedSteps = bundle.steps;
  const hasSteps = orderedSteps.length > 0;
  checks.push({
    name: "steps_ordered",
    passed: hasSteps ? orderedSteps.every((s, i) => s.index === i || orderedSteps[i - 1]?.index === s.index - 1 || i === 0) : true,
    detail: hasSteps ? "Steps are ordered by index" : "No steps to order",
  });

  if (hasSteps) {
    const firstStep = orderedSteps[0];
    checks.push({
      name: "initial_step_index_zero",
      passed: firstStep.index === 0,
      detail: firstStep.index === 0
        ? "First step has index 0"
        : `First step index is ${firstStep.index}, expected 0`,
    });
  } else {
    checks.push({
      name: "initial_step_index_zero",
      passed: true,
      detail: "No steps present",
    });
  }

  const hasScreenshots = bundle.screenshots.length > 0;
  checks.push({
    name: "screenshot_handling",
    passed: hasScreenshots ? bundle.missingScreenshots.length === 0 : true,
    detail: hasScreenshots
      ? bundle.missingScreenshots.length === 0
        ? "All screenshots available"
        : `${bundle.missingScreenshots.length} screenshots missing`
      : "No screenshots in bundle",
  });

  const approvalsWithDecision = bundle.approvals.filter(
    (a) => a.decision === "approved" || a.decision === "denied"
  );
  checks.push({
    name: "approval_events_present",
    passed: approvalsWithDecision.length === 0 || bundle.events.some(
      (e) => e.type === "approval.approved" || e.type === "approval.denied" || e.type === "approval.requested"
    ),
    detail: approvalsWithDecision.length > 0
      ? "Policy/approval events present"
      : "No resolved approvals to check",
  });

  checks.push({
    name: "task_provided",
    passed: bundle.task !== "not provided" && bundle.task.length > 0,
    detail: bundle.task !== "not provided" ? `Task: "${bundle.task}"` : "Task not provided",
  });

  checks.push({
    name: "mode_provided",
    passed: bundle.mode !== "not provided",
    detail: `Mode: ${bundle.mode}`,
  });

  checks.push({
    name: "limitations_honest",
    passed: bundle.limitations.length > 0,
    detail: bundle.limitations.length > 0
      ? `${bundle.limitations.length} limitations documented`
      : "No limitations documented",
  });

  checks.push({
    name: "console_network_not_claimed",
    passed: !bundle.consoleLogsAvailable && !bundle.networkLogsAvailable,
    detail: bundle.consoleLogsAvailable || bundle.networkLogsAvailable
      ? "Console/network availability claim may be inaccurate"
      : "Console and network logs correctly reported as not captured",
  });

  const passed = checks.every((c) => c.passed);

  return { passed, checks };
}
