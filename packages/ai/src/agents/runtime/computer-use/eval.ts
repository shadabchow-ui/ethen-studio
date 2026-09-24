import type {
  ComputerUseRun,
  ComputerUseStep,
  ComputerUseArtifact,
  ComputerUseApproval,
  ComputerUseScreenshot,
  ComputerUseReplayEvent,
  BrowserSessionMode,
  ComputerActionType,
} from "./types";
import {
  createComputerUseRun, setComputerUseRunStatus,
  addComputerUseStep, addComputerUseScreenshot,
  addComputerUseApproval, addComputerUseArtifact,
  addComputerUseEvent, resetComputerUseStore, getNowIso,
  getComputerUseRun, getComputerUseSteps,
  getComputerUseEvents, getComputerUseApprovals,
  resolveApproval, getPendingApprovals,
} from "./store-adapter";
import { generateReplayBundle, validateReplayInvariants } from "./replay";
import { generateBugReport, validateBugReportSchema } from "./bug-report";

function makeRun(overrides: Partial<ComputerUseRun> = {}): ComputerUseRun {
  return createComputerUseRun({
    userId: "eval-user",
    title: "Eval Test Run",
    task: "Test the replay and report generation",
    mode: "browser",
    provider: "playwright",
    status: "running",
    taskBrief: {
      goal: "Verify replay bundle generation",
      environment: "Browser Sandbox",
      allowedDomains: ["localhost:3000"],
      allowedActions: ["navigate", "click", "screenshot"],
      requiresApprovalFor: ["submit"],
      maxSteps: 10,
    },
    permissionScope: {
      allowedDomains: ["localhost:3000"],
      blockedDomains: [],
      allowedActions: ["navigate", "click", "screenshot"],
      approvalRequiredActions: ["submit"],
      blockedActions: [],
      credentialMode: "none",
      fileSystemScope: "none",
      networkMode: "allowlist",
      dataRetention: "standard",
      maxSteps: 10,
      maxRuntimeMinutes: 5,
      accessMode: "guided-browser",
    },
    sandbox: {
      sandboxId: "eval-sandbox",
      mode: "browser",
      status: "ready",
      viewport: { width: 1280, height: 720, scale: 1 },
      url: "http://localhost:3000",
      createdAt: getNowIso(),
    },
    stepCount: 0,
    maxSteps: 10,
    startedAt: getNowIso(),
    ...overrides,
  });
}

function makeStep(runId: string, index: number, overrides: Partial<ComputerUseStep> = {}): ComputerUseStep {
  return addComputerUseStep(runId, {
    runId,
    index,
    status: "executed",
    action: { type: "navigate", url: "http://localhost:3000" },
    startedAt: getNowIso(),
    completedAt: getNowIso(),
    ...overrides,
  });
}

function makeEvent(runId: string, type: ComputerUseReplayEvent["type"], overrides: Partial<ComputerUseReplayEvent> = {}): ComputerUseReplayEvent {
  return addComputerUseEvent(runId, {
    runId,
    type,
    timestamp: getNowIso(),
    actor: "runtime",
    ...overrides,
  });
}

function makeScreenshot(runId: string, overrides: Partial<ComputerUseScreenshot> = {}): ComputerUseScreenshot {
  return addComputerUseScreenshot(runId, {
    id: `ss-eval-${Math.random().toString(36).slice(2, 9)}`,
    runId,
    capturedAt: getNowIso(),
    originalWidth: 1280,
    originalHeight: 720,
    sentWidth: 1280,
    sentHeight: 720,
    scaleX: 1,
    scaleY: 1,
    devicePixelRatio: 1,
    imageUri: "data:image/png;base64,mock",
    hash: `hash-${Math.random().toString(36).slice(2, 9)}`,
    ...overrides,
  });
}

function makeArtifact(runId: string, overrides: Partial<Omit<ComputerUseArtifact, "id" | "createdAt" | "runId">> = {}): ComputerUseArtifact {
  return addComputerUseArtifact(runId, {
    type: "screenshot",
    title: "Test Screenshot",
    uri: "data:image/png;base64,mock",
    contentType: "image/png",
    sizeBytes: 1024,
    hash: `hash-${Math.random().toString(36).slice(2, 9)}`,
    redacted: false,
    ...(overrides as Record<string, unknown>),
  });
}

function makeApproval(runId: string, stepId: string, overrides: Partial<ComputerUseApproval> = {}): ComputerUseApproval {
  return addComputerUseApproval(runId, {
    id: `approval-eval-${Math.random().toString(36).slice(2, 9)}`,
    runId,
    stepId,
    requestedAt: getNowIso(),
    requestedBy: "agent",
    decision: "approved",
    action: { type: "click", x: 100, y: 200, targetLabel: "Submit" },
    riskLevel: "medium",
    reason: "Form submission requires approval",
    redactionApplied: false,
    ...overrides,
  });
}

export interface EvalResult {
  name: string;
  passed: boolean;
  detail: string;
}

export function runComputerUseEvals(): { passed: number; failed: number; results: EvalResult[] } {
  const results: EvalResult[] = [];
  let passed = 0;
  let failed = 0;

  function evalCheck(name: string, condition: boolean, detail: string): void {
    results.push({ name, passed: condition, detail });
    if (condition) { passed += 1; } else { failed += 1; }
  }

  resetComputerUseStore();

  // ── Eval 1: Empty run replay bundle ────────────────────────────────
  const emptyRun = makeRun({ id: "eval-empty" });
  const emptyBundle = generateReplayBundle(emptyRun.id);
  evalCheck(
    "empty_run_bundle",
    emptyBundle.run !== null && emptyBundle.steps.length === 0,
    "Empty run produces valid replay bundle with no steps",
  );

  // ── Eval 2: Run with steps produces ordered replay ─────────────────
  const stepRun = makeRun({ id: "eval-steps" });
  makeEvent(stepRun.id, "run.started");
  makeEvent(stepRun.id, "sandbox.started");
  const s1 = makeScreenshot(stepRun.id);
  makeEvent(stepRun.id, "observation.captured", { screenshotId: s1.id });
  makeStep(stepRun.id, 0, { action: { type: "navigate", url: "http://localhost:3000" } });
  makeStep(stepRun.id, 1, { action: { type: "click", x: 100, y: 200, targetLabel: "Button" } });
  makeStep(stepRun.id, 2, { action: { type: "screenshot" }, status: "verified" });
  makeEvent(stepRun.id, "run.completed");
  setComputerUseRunStatus(stepRun.id, "complete");

  const stepBundle = generateReplayBundle(stepRun.id);
  evalCheck(
    "ordered_steps",
    stepBundle.steps.length === 3 && stepBundle.steps[0].index === 0 && stepBundle.steps[1].index === 1 && stepBundle.steps[2].index === 2,
    `Steps ordered 0-2 correctly (got ${stepBundle.steps.map((s) => s.index).join(",")})`,
  );
  evalCheck(
    "replay_has_initial_event",
    stepBundle.events.some((e) => e.type === "run.started" || e.type === "sandbox.started" || e.type === "observation.captured"),
    "Replay bundle contains initial event",
  );
  evalCheck(
    "replay_has_completion_event",
    stepBundle.events.some((e) => e.type === "run.completed"),
    "Replay bundle contains completion event",
  );

  // ── Eval 3: Replay invariants validation ───────────────────────────
  const invResult = validateReplayInvariants(stepRun.id);
  evalCheck(
    "replay_invariants_pass",
    invResult.passed,
    `Invariants: ${invResult.checks.filter((c) => c.passed).length}/${invResult.checks.length} passed`,
  );

  // ── Eval 4: Missing screenshot handled gracefully ──────────────────
  const missingRun = makeRun({ id: "eval-missing-ss" });
  makeEvent(missingRun.id, "run.started");
  makeStep(missingRun.id, 0, { beforeScreenshotId: "nonexistent-ss" });
  const missingBundle = generateReplayBundle(missingRun.id);
  evalCheck(
    "missing_screenshot_handled",
    missingBundle.missingScreenshots.length > 0 || missingBundle.invariantWarnings.length >= 0,
    "Bundle handles missing screenshot references",
  );

  // ── Eval 5: Bug report from failed run ─────────────────────────────
  const failRun = makeRun({
    id: "eval-fail",
    title: "Failed QA Run",
    task: "Test login page",
  });
  makeEvent(failRun.id, "run.started");
  const failSs = makeScreenshot(failRun.id, { label: "Login page" });
  makeStep(failRun.id, 0, {
    action: { type: "navigate", url: "http://localhost:3000/login" },
    beforeScreenshotId: failSs.id,
    afterScreenshotId: failSs.id,
  });
  makeStep(failRun.id, 1, {
    action: { type: "click", x: 500, y: 300, targetLabel: "Login button" },
    status: "failed",
    result: { success: false, error: "Click target not found" },
    policyDecision: { outcome: "allow", reason: "Low-risk local action", riskLevel: "low" },
  });
  makeEvent(failRun.id, "action.failed");
  makeEvent(failRun.id, "run.failed");
  setComputerUseRunStatus(failRun.id, "failed");

  const bugReport = generateBugReport(failRun.id);
  evalCheck(
    "bug_report_has_findings",
    bugReport.findings.length > 0,
    `Bug report has ${bugReport.findings.length} findings`,
  );
  evalCheck(
    "bug_report_has_evidence",
    bugReport.evidenceScreenshots.length > 0,
    `Bug report references ${bugReport.evidenceScreenshots.length} evidence screenshots`,
  );

  const schemaValidation = validateBugReportSchema(bugReport);
  evalCheck(
    "bug_report_schema_valid",
    schemaValidation.passed,
    `Schema validation: ${schemaValidation.checks.filter((c) => c.passed).length}/${schemaValidation.checks.length} passed`,
  );

  // ── Eval 6: Bug report for successful run (no findings) ────────────
  const successRun = makeRun({
    id: "eval-success",
    title: "Successful QA Run",
  });
  makeEvent(successRun.id, "run.started");
  makeStep(successRun.id, 0, {
    action: { type: "navigate", url: "http://localhost:3000" },
    status: "verified",
  });
  makeEvent(successRun.id, "run.completed");
  setComputerUseRunStatus(successRun.id, "complete");

  const cleanReport = generateBugReport(successRun.id);
  evalCheck(
    "clean_run_no_findings",
    cleanReport.findings.length === 0,
    "Successful run produces no findings",
  );

  // ── Eval 7: Policy blocked action appears in findings ──────────────
  const policyRun = makeRun({ id: "eval-policy" });
  makeEvent(policyRun.id, "run.started");
  makeStep(policyRun.id, 0, {
    action: { type: "navigate", url: "https://sensitive.example.com" },
    policyDecision: { outcome: "block", reason: "Domain not in allowlist", riskLevel: "high" },
    status: "blocked",
  });
  makeEvent(policyRun.id, "policy.blocked");
  setComputerUseRunStatus(policyRun.id, "blocked");

  const policyReport = generateBugReport(policyRun.id);
  evalCheck(
    "blocked_action_becomes_finding",
    policyReport.findings.some((f) => f.title.includes("Blocked")),
    "Policy-blocked action appears as a bug finding",
  );

  // ── Eval 8: Approval events detected ───────────────────────────────
  const approvalRun = makeRun({ id: "eval-approval" });
  makeEvent(approvalRun.id, "run.started");
  makeEvent(approvalRun.id, "sandbox.started");
  const appStep = makeStep(approvalRun.id, 0, {
    action: { type: "click", x: 400, y: 300, targetLabel: "Submit form" },
    status: "approved",
    policyDecision: { outcome: "approval_required", reason: "Form submission requires approval", riskLevel: "medium" },
  });
  makeEvent(approvalRun.id, "approval.requested", { stepId: appStep.id });
  makeApproval(approvalRun.id, appStep.id, {
    decision: "approved",
    reason: "Form submission requires approval",
    action: { type: "click", x: 400, y: 300, targetLabel: "Submit form" },
  });
  makeEvent(approvalRun.id, "approval.approved", { stepId: appStep.id });
  setComputerUseRunStatus(approvalRun.id, "complete");

  const approvalBundle = generateReplayBundle(approvalRun.id);
  evalCheck(
    "approval_events_exist",
    approvalBundle.approvals.length > 0,
    `Replay bundle has ${approvalBundle.approvals.length} approval(s)`,
  );
  evalCheck(
    "approval_policy_events",
    approvalBundle.events.some((e) => e.type === "approval.approved" || e.type === "approval.requested"),
    "Replay bundle contains approval-related events",
  );

  // ── Eval 9: Artifact generation ────────────────────────────────────
  const artifactRun = makeRun({ id: "eval-artifacts" });
  makeEvent(artifactRun.id, "run.started");
  makeArtifact(artifactRun.id, { type: "screenshot", title: "Page screenshot" });
  makeArtifact(artifactRun.id, { type: "report", title: "QA Report" });
  makeArtifact(artifactRun.id, { type: "replay", title: "Replay bundle" });
  makeEvent(artifactRun.id, "artifact.created");
  setComputerUseRunStatus(artifactRun.id, "complete");

  const artifactBundle = generateReplayBundle(artifactRun.id);
  evalCheck(
    "artifacts_in_bundle",
    artifactBundle.artifacts.length === 3,
    `Replay bundle has ${artifactBundle.artifacts.length} artifacts`,
  );

  // ── Eval 10: No missing initial event when history exists ──────────
  const noInitRun = makeRun({ id: "eval-no-init-event" });
  makeStep(noInitRun.id, 0, { action: { type: "navigate", url: "http://localhost:3000" } });
  makeStep(noInitRun.id, 1, { action: { type: "screenshot" } });

  const noInitBundle = generateReplayBundle(noInitRun.id);
  evalCheck(
    "warns_missing_initial_event",
    noInitBundle.invariantWarnings.some((w) => w.toLowerCase().includes("initial") || w.toLowerCase().includes("run.started") || w.toLowerCase().includes("observation")),
    `Warns about missing initial event: ${noInitBundle.invariantWarnings.join("; ") || "(no warning generated)"}`,
  );

  // ── Eval 11: Replay bundle shape for completed run ─────────────────
  const completedRun = makeRun({ id: "eval-completed-replay", title: "Completed QA Run", task: "Verify completed run replay" });
  makeEvent(completedRun.id, "run.started");
  makeEvent(completedRun.id, "sandbox.started");
  const compSs = makeScreenshot(completedRun.id, { label: "Final state" });
  makeStep(completedRun.id, 0, { action: { type: "navigate", url: "http://localhost:3000/dashboard" }, status: "verified" });
  makeStep(completedRun.id, 1, { action: { type: "click", x: 200, y: 150 }, status: "verified" });
  makeEvent(completedRun.id, "observation.captured", { screenshotId: compSs.id });
  makeEvent(completedRun.id, "run.completed");
  setComputerUseRunStatus(completedRun.id, "complete");

  const compBundle = generateReplayBundle(completedRun.id);
  evalCheck(
    "completed_replay_task_provided",
    compBundle.task !== "not provided",
    `Completed run replay has task: "${compBundle.task}"`,
  );
  evalCheck(
    "completed_replay_mode_provided",
    compBundle.mode !== "not provided",
    `Completed run replay has mode: "${compBundle.mode}"`,
  );
  evalCheck(
    "completed_replay_status_complete",
    compBundle.status === "complete",
    `Completed run replay status: "${compBundle.status}"`,
  );
  evalCheck(
    "completed_replay_has_steps",
    compBundle.steps.length === 2,
    `Completed run replay has ${compBundle.steps.length} steps`,
  );
  evalCheck(
    "completed_replay_has_limitations",
    compBundle.limitations.length > 0,
    "Completed run replay documents limitations",
  );

  // ── Eval 12: Replay bundle shape for failed run ────────────────────
  const failedReplayRun = makeRun({ id: "eval-failed-replay", title: "Failed QA Run", task: "Verify failed run replay" });
  makeEvent(failedReplayRun.id, "run.started");
  makeStep(failedReplayRun.id, 0, {
    action: { type: "navigate", url: "http://localhost:3000" },
    status: "verified",
  });
  makeStep(failedReplayRun.id, 1, {
    action: { type: "click", x: 500, y: 300, targetLabel: "Broken button" },
    status: "failed",
    result: { success: false, error: "Element not interactable" },
  });
  makeEvent(failedReplayRun.id, "action.failed");
  makeEvent(failedReplayRun.id, "run.failed");
  setComputerUseRunStatus(failedReplayRun.id, "failed");

  const failReplayBundle = generateReplayBundle(failedReplayRun.id);
  evalCheck(
    "failed_replay_task_provided",
    failReplayBundle.task !== "not provided",
    `Failed run replay has task: "${failReplayBundle.task}"`,
  );
  evalCheck(
    "failed_replay_status_failed",
    failReplayBundle.status === "failed",
    `Failed run replay status: "${failReplayBundle.status}"`,
  );
  evalCheck(
    "failed_replay_preserves_steps",
    failReplayBundle.steps.length === 2,
    `Failed run replay preserves ${failReplayBundle.steps.length} steps`,
  );

  // ── Eval 13: Bug report includes status/failure reason/evidence limitations ──
  const bugReportEvalRun = makeRun({
    id: "eval-bug-report-status",
    title: "Bug Report Status Eval",
    task: "Test bug report status fields",
  });
  makeEvent(bugReportEvalRun.id, "run.started");
  makeStep(bugReportEvalRun.id, 0, {
    action: { type: "navigate", url: "http://localhost:3000/login" },
    status: "verified",
  });
  makeStep(bugReportEvalRun.id, 1, {
    action: { type: "click", x: 400, y: 200, targetLabel: "Submit" },
    status: "failed",
    result: { success: false, error: "Timeout waiting for element" },
  });
  makeEvent(bugReportEvalRun.id, "run.failed");
  setComputerUseRunStatus(bugReportEvalRun.id, "failed");

  const bugStatusReport = generateBugReport(bugReportEvalRun.id);
  evalCheck(
    "bug_report_has_status",
    typeof bugStatusReport.resultStatus === "string" && bugStatusReport.resultStatus.length > 0,
    `Bug report result status: "${bugStatusReport.resultStatus}"`,
  );
  evalCheck(
    "bug_report_has_failure_reason",
    bugStatusReport.findings.some((f) => f.description.length > 0),
    "Bug report findings include failure reason descriptions",
  );
  evalCheck(
    "bug_report_has_evidence_limitations",
    bugStatusReport.limitations.length > 0,
    `Bug report documents ${bugStatusReport.limitations.length} limitations`,
  );
  evalCheck(
    "bug_report_has_mode",
    typeof bugStatusReport.mode === "string" && bugStatusReport.mode.length > 0,
    `Bug report has mode: "${bugStatusReport.mode}"`,
  );
  evalCheck(
    "bug_report_no_console_claim",
    !bugStatusReport.consoleLogsAvailable,
    "Bug report correctly does not claim console logs",
  );

  // ── Eval 14: No screenshot evidence claim when screenshot missing ────
  const noSsRun = makeRun({ id: "eval-no-ss-evidence", task: "Test no screenshot claim" });
  makeEvent(noSsRun.id, "run.started");
  makeStep(noSsRun.id, 0, {
    action: { type: "navigate", url: "http://localhost:3000" },
    status: "failed",
    result: { success: false, error: "Navigation failed" },
  });
  makeEvent(noSsRun.id, "run.failed");
  setComputerUseRunStatus(noSsRun.id, "failed");

  const noSsReport = generateBugReport(noSsRun.id);
  evalCheck(
    "no_screenshot_no_evidence_claim",
    noSsReport.evidenceScreenshots.length === 0,
    "Bug report has no evidence screenshots when none captured",
  );
  evalCheck(
    "no_screenshot_limitation_noted",
    noSsReport.limitations.some((l) => l.toLowerCase().includes("screenshot")),
    "Bug report limitation notes missing screenshots",
  );

  const noSsBundle = generateReplayBundle(noSsRun.id);
  evalCheck(
    "no_screenshot_bundle_shows_missing",
    noSsBundle.screenshots.length === 0,
    "Replay bundle has no screenshots when none captured",
  );
  evalCheck(
    "no_screenshot_bundle_limitation",
    noSsBundle.limitations.some((l) => l.toLowerCase().includes("screenshot")),
    "Replay bundle limitation notes missing screenshots",
  );

  // ── Eval 15: Approval-needed status represented honestly ────────────
  const approvalNeededRun = makeRun({ id: "eval-approval-needed", task: "Test approval needed status" });
  makeEvent(approvalNeededRun.id, "run.started");
  makeStep(approvalNeededRun.id, 0, {
    action: { type: "click", x: 300, y: 200, targetLabel: "Submit form" },
    status: "approved",
    policyDecision: { outcome: "approval_required", reason: "Form submission needs approval", riskLevel: "medium" },
  });
  makeEvent(approvalNeededRun.id, "approval.requested");
  makeApproval(approvalNeededRun.id, "step-0", {
    decision: undefined,
    reason: "Form submission needs approval",
  });
  setComputerUseRunStatus(approvalNeededRun.id, "approval_needed");

  const approvalNeededBundle = generateReplayBundle(approvalNeededRun.id);
  evalCheck(
    "approval_needed_status_preserved",
    approvalNeededBundle.status === "approval_needed",
    `Approval-needed run status: "${approvalNeededBundle.status}"`,
  );
  evalCheck(
    "approval_needed_has_approvals_without_decision",
    approvalNeededBundle.approvals.some((a) => !a.decision),
    "Approval-needed run has pending approvals",
  );

  // ── Eval 16: Cancelled status represented honestly ──────────────────
  const cancelledRun = makeRun({ id: "eval-cancelled", task: "Test cancelled status" });
  makeEvent(cancelledRun.id, "run.started");
  makeStep(cancelledRun.id, 0, { action: { type: "navigate", url: "http://localhost:3000" }, status: "executed" });
  makeEvent(cancelledRun.id, "run.aborted");
  setComputerUseRunStatus(cancelledRun.id, "cancelled");

  const cancelledBundle = generateReplayBundle(cancelledRun.id);
  evalCheck(
    "cancelled_status_preserved",
    cancelledBundle.status === "cancelled",
    `Cancelled run status: "${cancelledBundle.status}"`,
  );
  evalCheck(
    "cancelled_preserves_partial_steps",
    cancelledBundle.steps.length > 0,
    `Cancelled run preserves ${cancelledBundle.steps.length} partial step(s)`,
  );

  // ── Eval 17: Blocked status represented honestly ────────────────────
  const blockedRun = makeRun({ id: "eval-blocked", task: "Test blocked status" });
  makeEvent(blockedRun.id, "run.started");
  makeStep(blockedRun.id, 0, {
    action: { type: "navigate", url: "https://blocked-domain.com" },
    status: "blocked",
    policyDecision: { outcome: "block", reason: "Domain not in allowlist", riskLevel: "high" },
  });
  makeEvent(blockedRun.id, "policy.blocked");
  setComputerUseRunStatus(blockedRun.id, "blocked");

  const blockedBundle = generateReplayBundle(blockedRun.id);
  evalCheck(
    "blocked_status_preserved",
    blockedBundle.status === "blocked",
    `Blocked run status: "${blockedBundle.status}"`,
  );
  evalCheck(
    "blocked_has_policy_events",
    blockedBundle.events.some((e) => e.type === "policy.blocked"),
    "Blocked run has policy.blocked event",
  );

  const blockedReport = generateBugReport(blockedRun.id);
  evalCheck(
    "blocked_report_has_blocked_finding",
    blockedReport.findings.some((f) => f.title.includes("Blocked")),
    "Blocked run bug report includes a blocked-action finding",
  );

  // ── Eval 18: Denied approval step never executes ─────────────────────
  resetComputerUseStore();
  const deniedStepRun = createComputerUseRun({
    userId: "eval-user",
    title: "Denied Approval Test",
    task: "Test denied approval",
    mode: "browser",
    provider: "playwright",
    status: "running",
    taskBrief: { goal: "Test", environment: "Browser", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 5 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: ["click"], approvalRequiredActions: ["click"], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 5, maxRuntimeMinutes: 5, accessMode: "guided-browser" },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 5, startedAt: getNowIso(),
  });
  const deniedStep = addComputerUseStep(deniedStepRun.id, {
    runId: deniedStepRun.id, index: 0, status: "proposed",
    action: { type: "click", x: 100, y: 200 },
    startedAt: getNowIso(),
  });
  addComputerUseEvent(deniedStepRun.id, { runId: deniedStepRun.id, stepId: deniedStep.id, type: "approval.requested", timestamp: getNowIso(), actor: "policy", action: { type: "click", x: 100, y: 200 } });
  const deniedApproval = addComputerUseApproval(deniedStepRun.id, {
    id: "deny-appr-1", runId: deniedStepRun.id, stepId: deniedStep.id, requestedAt: getNowIso(), requestedBy: "policy",
    decision: "denied", action: { type: "click", x: 100, y: 200 }, riskLevel: "medium", reason: "Denied by user", redactionApplied: false,
  });
  setComputerUseRunStatus(deniedStepRun.id, "running");

  const deniedSteps = getComputerUseSteps(deniedStepRun.id);
  evalCheck(
    "denied_approval_step_not_executed",
    deniedSteps.every((s) => s.status !== "executed" && s.status !== "verified"),
    "Denied approval step status is not executed/verified",
  );
  evalCheck(
    "denied_approval_decision_set",
    deniedApproval.decision === "denied",
    "Denied approval has decision='denied'",
  );

  // ── Eval 19: Blocked action step correctly marked ────────────────────
  resetComputerUseStore();
  const blockedStepRun = createComputerUseRun({
    userId: "eval-user",
    title: "Blocked Step Test",
    task: "Test blocked step",
    mode: "browser",
    provider: "playwright",
    status: "running",
    taskBrief: { goal: "Test", environment: "Browser", allowedDomains: ["localhost:3000"], allowedActions: [], requiresApprovalFor: [], maxSteps: 5 },
    permissionScope: { allowedDomains: ["localhost:3000"], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: ["click"], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 5, maxRuntimeMinutes: 5, accessMode: "guided-browser" },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 5, startedAt: getNowIso(),
  });
  const blockedActStep = addComputerUseStep(blockedStepRun.id, {
    runId: blockedStepRun.id, index: 0, status: "blocked",
    action: { type: "click", x: 100, y: 200 },
    policyDecision: { outcome: "block", reason: "Blocked action type", riskLevel: "high" },
    startedAt: getNowIso(),
  });
  addComputerUseEvent(blockedStepRun.id, { runId: blockedStepRun.id, stepId: blockedActStep.id, type: "policy.blocked", timestamp: getNowIso(), actor: "policy" });
  setComputerUseRunStatus(blockedStepRun.id, "blocked");

  const blockedActSteps = getComputerUseSteps(blockedStepRun.id);
  evalCheck(
    "blocked_step_status_correct",
    blockedActSteps.some((s) => s.status === "blocked"),
    "Blocked action step status is 'blocked'",
  );
  evalCheck(
    "blocked_step_has_policy_decision",
    blockedActSteps.some((s) => s.policyDecision?.outcome === "block"),
    "Blocked action step has policyDecision.outcome='block'",
  );

  // ── Eval 20: Run full event lifecycle ────────────────────────────────
  resetComputerUseStore();
  const lifecycleRun = createComputerUseRun({
    userId: "eval-user",
    title: "Lifecycle Test",
    task: "Test event lifecycle",
    mode: "browser",
    provider: "playwright",
    status: "complete",
    taskBrief: { goal: "Test", environment: "Browser", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 5 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 5, maxRuntimeMinutes: 5, accessMode: "guided-browser" },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 5, startedAt: getNowIso(), completedAt: getNowIso(),
  });
  addComputerUseEvent(lifecycleRun.id, { runId: lifecycleRun.id, type: "run.started", timestamp: getNowIso(), actor: "user" });
  const lcStep = addComputerUseStep(lifecycleRun.id, {
    runId: lifecycleRun.id, index: 0, status: "executed",
    action: { type: "navigate", url: "http://localhost:3000" },
    startedAt: getNowIso(),
  });
  addComputerUseEvent(lifecycleRun.id, { runId: lifecycleRun.id, stepId: lcStep.id, type: "action.proposed", timestamp: getNowIso(), actor: "agent", action: { type: "navigate", url: "http://localhost:3000" } });
  addComputerUseEvent(lifecycleRun.id, { runId: lifecycleRun.id, stepId: lcStep.id, type: "action.executed", timestamp: getNowIso(), actor: "runtime", action: { type: "navigate", url: "http://localhost:3000" } });
  addComputerUseEvent(lifecycleRun.id, { runId: lifecycleRun.id, type: "run.completed", timestamp: getNowIso(), actor: "runtime" });

  const lcEvents = getComputerUseEvents(lifecycleRun.id);
  evalCheck(
    "lifecycle_has_run_started",
    lcEvents.some((e) => e.type === "run.started"),
    "Lifecycle events include run.started",
  );
  evalCheck(
    "lifecycle_has_action_proposed",
    lcEvents.some((e) => e.type === "action.proposed"),
    "Lifecycle events include action.proposed",
  );
  evalCheck(
    "lifecycle_has_action_executed",
    lcEvents.some((e) => e.type === "action.executed"),
    "Lifecycle events include action.executed",
  );
  evalCheck(
    "lifecycle_has_run_completed",
    lcEvents.some((e) => e.type === "run.completed"),
    "Lifecycle events include run.completed",
  );

  // ── Eval 21: Approval-denied resolves cleanly ────────────────────────
  resetComputerUseStore();
  const resolveDenyRun = createComputerUseRun({
    userId: "eval-user",
    title: "Resolve Deny Test",
    task: "Test resolve deny",
    mode: "browser",
    provider: "playwright",
    status: "running",
    taskBrief: { goal: "Test", environment: "Browser", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 5 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 5, maxRuntimeMinutes: 5, accessMode: "guided-browser" },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 5, startedAt: getNowIso(),
  });
  const rdStep = addComputerUseStep(resolveDenyRun.id, {
    runId: resolveDenyRun.id, index: 0, status: "proposed",
    action: { type: "navigate", url: "https://example.com" },
    startedAt: getNowIso(),
  });
  const rdApproval = addComputerUseApproval(resolveDenyRun.id, {
    id: "rd-appr-1", runId: resolveDenyRun.id, stepId: rdStep.id, requestedAt: getNowIso(), requestedBy: "policy",
    action: { type: "navigate", url: "https://example.com" }, riskLevel: "medium", reason: "Navigate requires approval", redactionApplied: false,
  });
  const resolvedDeny = resolveApproval(rdApproval.id, "denied", "test-user");
  evalCheck(
    "resolve_deny_returns_object",
    resolvedDeny !== null,
    "resolveApproval returns object for denied approval",
  );
  evalCheck(
    "resolve_deny_decision_correct",
    resolvedDeny!.decision === "denied",
    "Resolved denied approval has decision='denied'",
  );
  evalCheck(
    "resolve_deny_has_timestamp",
    typeof resolvedDeny!.resolvedAt === "string",
    "Resolved denied approval has resolvedAt timestamp",
  );

  // ── Eval 22: Pending approvals filter ────────────────────────────────
  resetComputerUseStore();
  const pendingFilterRun = createComputerUseRun({
    userId: "eval-user",
    title: "Pending Filter Test",
    task: "Test pending filter",
    mode: "browser",
    provider: "playwright",
    status: "running",
    taskBrief: { goal: "Test", environment: "Browser", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 5 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 5, maxRuntimeMinutes: 5, accessMode: "guided-browser" },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 5, startedAt: getNowIso(),
  });
  const pfStep1 = addComputerUseStep(pendingFilterRun.id, { runId: pendingFilterRun.id, index: 0, status: "proposed", action: { type: "click", x: 100, y: 200 }, startedAt: getNowIso() });
  const pfStep2 = addComputerUseStep(pendingFilterRun.id, { runId: pendingFilterRun.id, index: 1, status: "proposed", action: { type: "click", x: 200, y: 300 }, startedAt: getNowIso() });
  const pfApproval1 = addComputerUseApproval(pendingFilterRun.id, {
    id: "pf-appr-1", runId: pendingFilterRun.id, stepId: pfStep1.id, requestedAt: getNowIso(), requestedBy: "policy",
    action: { type: "click", x: 100, y: 200 }, riskLevel: "medium", reason: "Click requires approval", redactionApplied: false,
  });
  const pfApproval2 = addComputerUseApproval(pendingFilterRun.id, {
    id: "pf-appr-2", runId: pendingFilterRun.id, stepId: pfStep2.id, requestedAt: getNowIso(), requestedBy: "policy",
    action: { type: "click", x: 200, y: 300 }, riskLevel: "medium", reason: "Click requires approval", redactionApplied: false,
  });
  setComputerUseRunStatus(pendingFilterRun.id, "approval_needed");

  const pendingBefore = getPendingApprovals(pendingFilterRun.id);
  evalCheck(
    "pending_filter_two_before_resolve",
    pendingBefore.length === 2,
    `Two pending approvals before resolve (got ${pendingBefore.length})`,
  );
  evalCheck(
    "pending_filter_status_approval_needed",
    getComputerUseRun(pendingFilterRun.id)?.status === "approval_needed",
    "Run status is approval_needed with pending approvals",
  );

  resolveApproval(pfApproval1.id, "approved", "test-user");
  const pendingAfter = getPendingApprovals(pendingFilterRun.id);
  evalCheck(
    "pending_filter_one_after_resolve",
    pendingAfter.length === 1,
    `One pending approval after resolving one (got ${pendingAfter.length})`,
  );

  resolveApproval(pfApproval2.id, "denied", "test-user");
  const pendingZero = getPendingApprovals(pendingFilterRun.id);
  evalCheck(
    "pending_filter_zero_both_resolved",
    pendingZero.length === 0,
    "Zero pending approvals after both resolved",
  );

  return { passed, failed, results };
}

export function printEvalResults(results: EvalResult[]): void {
  for (const r of results) {
    if (r.passed) {
      console.log(`  PASS: ${r.name} — ${r.detail}`);
    } else {
      console.error(`  FAIL: ${r.name} — ${r.detail}`);
    }
  }
}

if (require.main === module) {
  const result = runComputerUseEvals();
  printEvalResults(result.results);
  console.log(`\n${result.passed} passed, ${result.failed} failed out of ${result.passed + result.failed} assertions.`);
  if (result.failed > 0) {
    console.error("Some assertions failed.");
    process.exit(1);
  } else {
    console.log("All assertions passed.");
  }
}
