// Computer Use Storage Adapter, Artifact Generation, Reliability Metrics — Tests
// Run with: npx tsx lib/agents/runtime/__tests__/computer-use-storage.test.ts

import {
  createInMemoryComputerUseAdapter,
  getComputerUseStorageAdapter,
  setComputerUseStorageAdapter,
  resetComputerUseStorageAdapter,
} from "../computer-use/storage";
import {
  createComputerUseRun,
  getComputerUseRun,
  addComputerUseStep,
  getComputerUseSteps,
  addComputerUseScreenshot,
  getComputerUseScreenshots,
  addComputerUseArtifact,
  getComputerUseArtifacts,
  addComputerUseEvent,
  getComputerUseEvents,
  resetComputerUseStore,
  getNowIso,
} from "../computer-use/store";
import { generateBugReport, validateBugReportSchema } from "../computer-use/bug-report";
import { createArtifact, getArtifacts, getArtifactSummary } from "../computer-use/artifacts";
import { computeReliabilityMetrics, runReliabilityScenario, runReliabilityEvals } from "../computer-use/reliability";
import { createSupabaseComputerUseAdapter, getSupabaseAdapterReadiness } from "../computer-use/storage-supabase";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label}`); }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

function setup() {
  resetComputerUseStore();
  resetComputerUseStorageAdapter();
}

// ── In-Memory Adapter Direct Tests ────────────────────────────────────────

function testInMemoryAdapterCreatesRetrievesRun() {
  console.log("\n[Storage: In-Memory Adapter Creates & Retrieves Run]");

  const adapter = createInMemoryComputerUseAdapter();
  assertEqual(adapter.kind, "in_memory", "adapter kind is in_memory");

  setup();
  const run = createComputerUseRun({
    userId: "test-user",
    title: "Adapter Test Run",
    task: "Test storage adapter",
    mode: "browser",
    provider: "playwright",
    status: "running",
    taskBrief: {
      goal: "Test adapter",
      environment: "browser",
      allowedDomains: ["localhost:3000"],
      allowedActions: ["navigate"],
      requiresApprovalFor: [],
      maxSteps: 10,
    },
    permissionScope: {
      allowedDomains: ["localhost:3000"],
      blockedDomains: [],
      allowedActions: ["navigate"],
      approvalRequiredActions: [],
      blockedActions: [],
      credentialMode: "none",
      fileSystemScope: "none",
      networkMode: "allowlist",
      dataRetention: "standard",
      maxSteps: 10,
      maxRuntimeMinutes: 5,
    },
    sandbox: {
      sandboxId: "test-sandbox",
      mode: "browser",
      status: "ready",
      viewport: { width: 1280, height: 720, scale: 1 },
      createdAt: getNowIso(),
    },
    stepCount: 0,
    maxSteps: 10,
    startedAt: getNowIso(),
  });

  assert(typeof run.id === "string", "run has id");
  assert(run.id.startsWith("cu-run-"), "run id prefix correct");

  const retrieved = getComputerUseRun(run.id);
  assert(retrieved !== null, "run retrievable");
  assertEqual(retrieved!.id, run.id, "retrieved id matches");
}

function testInMemoryAdapterStepsAndScreenshots() {
  console.log("\n[Storage: In-Memory Adapter Steps & Screenshots]");

  setup();
  const run = createComputerUseRun({
    userId: "test-user", title: "Steps Test", task: "Test steps", mode: "browser", provider: "playwright", status: "running",
    taskBrief: { goal: "test", environment: "b", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 5 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 5, maxRuntimeMinutes: 5 },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 5, startedAt: getNowIso(),
  });

  addComputerUseStep(run.id, {
    runId: run.id, index: 0, status: "executed",
    action: { type: "navigate", url: "https://localhost:3000" },
    startedAt: getNowIso(),
  });

  addComputerUseScreenshot(run.id, {
    id: "ss-1", runId: run.id, capturedAt: getNowIso(),
    originalWidth: 1280, originalHeight: 720, sentWidth: 1280, sentHeight: 720,
    scaleX: 1, scaleY: 1, devicePixelRatio: 1, imageUri: "data:image/png;base64,mock", hash: "abc",
  });

  const steps = getComputerUseSteps(run.id);
  assertEqual(steps.length, 1, "one step stored");
  assertEqual(steps[0].action.type, "navigate", "step action correct");

  const screenshots = getComputerUseScreenshots(run.id);
  assertEqual(screenshots.length, 1, "one screenshot stored");
  assert(screenshots[0].imageUri.length > 0, "screenshot has imageUri");
}

function testInMemoryAdapterArtifactsAndEvents() {
  console.log("\n[Storage: In-Memory Adapter Artifacts & Events]");

  setup();
  const run = createComputerUseRun({
    userId: "test-user", title: "Artifacts Test", task: "Test", mode: "browser", provider: "playwright", status: "running",
    taskBrief: { goal: "t", environment: "b", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 3 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 3, maxRuntimeMinutes: 5 },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 3, startedAt: getNowIso(),
  });

  addComputerUseArtifact(run.id, {
    type: "screenshot", title: "Test SS",
    uri: "data:image/png;base64,test", contentType: "image/png",
    sizeBytes: 1024, hash: "hash-1", redacted: false,
  });

  addComputerUseEvent(run.id, {
    runId: run.id, type: "run.started", timestamp: getNowIso(), actor: "system",
  });

  const artifacts = getComputerUseArtifacts(run.id);
  assertEqual(artifacts.length, 1, "one artifact stored");
  assertEqual(artifacts[0].type, "screenshot", "artifact type correct");

  const events = getComputerUseEvents(run.id);
  assertEqual(events.length, 1, "one event stored");
  assertEqual(events[0].type, "run.started", "event type correct");
}

function testInMemoryAdapterReset() {
  console.log("\n[Storage: In-Memory Adapter Reset]");

  setup();
  const run = createComputerUseRun({
    userId: "test-user", title: "Reset Test", task: "Test", mode: "browser", provider: "playwright", status: "running",
    taskBrief: { goal: "t", environment: "b", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 3 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 3, maxRuntimeMinutes: 5 },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 3, startedAt: getNowIso(),
  });

  addComputerUseStep(run.id, { runId: run.id, index: 0, status: "executed", action: { type: "screenshot" }, startedAt: getNowIso() });

  assertEqual(getComputerUseSteps(run.id).length, 1, "step exists before reset");

  resetComputerUseStore();

  assertEqual(getComputerUseRun(run.id), null, "run is null after reset");
  assertEqual(getComputerUseSteps(run.id).length, 0, "steps empty after reset");
}

// ── Supabase Adapter Tests ─────────────────────────────────────────────────

function testSupabaseAdapterReportsNotReady() {
  console.log("\n[Storage: Supabase Adapter Reports Not Ready]");

  const readiness = getSupabaseAdapterReadiness();
  assertEqual(readiness.ready, false, "supabase adapter readiness is false");
  assert(readiness.reason.length > 0, "readiness reason is provided");
}

function testSupabaseAdapterKindIsSupabase() {
  console.log("\n[Storage: Supabase Adapter Kind Is Supabase]");

  const adapter = createSupabaseComputerUseAdapter();
  assertEqual(adapter.kind, "supabase", "supabase adapter kind is supabase");
}

function testSupabaseAdapterReadMethodsReturnEmpty() {
  console.log("\n[Storage: Supabase Adapter Read Methods Return Empty]");

  const adapter = createSupabaseComputerUseAdapter();

  // reset should be callable without throwing
  assert(typeof adapter.runs.reset === "function", "reset is a function");
  try {
    adapter.runs.reset();
  } catch {
    assert(false, "reset throws unexpectedly");
  }

  // list/get should return empty/null when not configured
  const test = async () => {
    const runs = await adapter.runs.list();
    assertEqual(runs.length, 0, "supabase adapter list returns empty array");

    const run = await adapter.runs.get("nonexistent");
    assertEqual(run, null, "supabase adapter get returns null");

    const steps = await adapter.steps.getByRun("nonexistent");
    assertEqual(steps.length, 0, "supabase adapter steps returns empty");

    const screenshots = await adapter.screenshots.getByRun("nonexistent");
    assertEqual(screenshots.length, 0, "supabase adapter screenshots returns empty");

    const approvals = await adapter.approvals.getByRun("nonexistent");
    assertEqual(approvals.length, 0, "supabase adapter approvals returns empty");

    const pending = await adapter.approvals.getPending("nonexistent");
    assertEqual(pending.length, 0, "supabase adapter pending approvals returns empty");

    const artifacts = await adapter.artifacts.getByRun("nonexistent");
    assertEqual(artifacts.length, 0, "supabase adapter artifacts returns empty");

    const observations = await adapter.observations.getByRun("nonexistent");
    assertEqual(observations.length, 0, "supabase adapter observations returns empty");

    const events = await adapter.events.getByRun("nonexistent");
    assertEqual(events.length, 0, "supabase adapter events returns empty");
  };

  // Run async tests
  test().catch(() => {
    assert(false, "supabase adapter read methods should not throw");
  });
}

// ── Artifact Generation Tests ─────────────────────────────────────────────

function testArtifactGenerationCompletedRun() {
  console.log("\n[Artifacts: Generation From Completed Run]");

  setup();
  const run = createComputerUseRun({
    userId: "test-user", title: "Completed Run", task: "Test artifacts on complete", mode: "browser", provider: "playwright", status: "complete",
    taskBrief: { goal: "t", environment: "b", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 3 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 3, maxRuntimeMinutes: 5 },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 3, startedAt: getNowIso(),
  });

  createArtifact(run.id, {
    type: "screenshot", title: "Page 1",
    uri: "data:image/png;base64,p1", contentType: "image/png",
    sizeBytes: 2048, hash: "h1", redacted: false,
  });
  createArtifact(run.id, {
    type: "report", title: "QA Report",
    uri: "data:text/markdown;base64,r", contentType: "text/markdown",
    sizeBytes: 512, hash: "h2", redacted: true,
  });

  const summary = getArtifactSummary(run.id);
  assertEqual(summary.totalArtifacts, 2, "two artifacts in completed run");
  assertEqual(summary.byType.screenshot, 1, "one screenshot artifact");
  assertEqual(summary.byType.report, 1, "one report artifact");
  assertEqual(summary.runId, run.id, "summary runId matches");

  const all = getArtifacts(run.id);
  assertEqual(all.length, 2, "getArtifacts returns two");
}

function testArtifactGenerationFailedRun() {
  console.log("\n[Artifacts: Generation From Failed Run]");

  setup();
  const run = createComputerUseRun({
    userId: "test-user", title: "Failed Run", task: "Test artifacts on failure", mode: "browser", provider: "playwright", status: "failed",
    taskBrief: { goal: "t", environment: "b", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 3 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 3, maxRuntimeMinutes: 5 },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 3, startedAt: getNowIso(),
    resultStatus: "failed",
  });

  createArtifact(run.id, {
    type: "screenshot", title: "Error state",
    uri: "data:image/png;base64,err", contentType: "image/png",
    sizeBytes: 1024, hash: "h-err", redacted: false,
  });

  const summary = getArtifactSummary(run.id);
  assertEqual(summary.totalArtifacts, 1, "one artifact in failed run");
  const all = getArtifacts(run.id);
  assertEqual(all.length, 1, "getArtifacts returns one for failed run");
}

// ── Reliability Metrics Tests ─────────────────────────────────────────────

function testReliabilityEmptyRun() {
  console.log("\n[Reliability: Empty Run Metrics]");

  setup();
  const run = createComputerUseRun({
    userId: "test-user", title: "Empty", task: "No steps", mode: "browser", provider: "playwright", status: "running",
    taskBrief: { goal: "t", environment: "b", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 3 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 3, maxRuntimeMinutes: 5 },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 3, startedAt: getNowIso(),
  });

  const metrics = computeReliabilityMetrics(run.id);
  assertEqual(metrics.totalSteps, 0, "empty run has 0 totalSteps");
  assertEqual(metrics.stepCount, 0, "empty run has 0 stepCount");
  assertEqual(metrics.taskCompletion, false, "empty run taskCompletion is false");
  assertEqual(metrics.executedSteps, 0, "empty run has 0 executedSteps");
  assertEqual(metrics.failedSteps, 0, "empty run has 0 failedSteps");
  assertEqual(metrics.task, "No steps", "empty run task captured");
}

function testReliabilityScenarioAllSuccess() {
  console.log("\n[Reliability: All-Success Scenario]");

  const metrics = runReliabilityScenario({
    task: "Test all success",
    steps: [
      { action: { type: "navigate", url: "https://localhost:3000" }, expectedStatus: "verified" },
      { action: { type: "click", x: 100, y: 200 }, expectedStatus: "verified" },
      { action: { type: "screenshot" }, expectedStatus: "verified" },
    ],
  });

  assertEqual(metrics.totalSteps, 3, "all-success has 3 total steps");
  assertEqual(metrics.executedSteps, 3, "all-success has 3 executed steps");
  assertEqual(metrics.failedSteps, 0, "all-success has 0 failed steps");
  assertEqual(metrics.blockedSteps, 0, "all-success has 0 blocked steps");
  assertEqual(metrics.taskCompletion, true, "all-success taskCompletion is true");
  assertEqual(metrics.status, "complete", "all-success status is complete");
}

function testReliabilityScenarioMixed() {
  console.log("\n[Reliability: Mixed Success/Failure Scenario]");

  const metrics = runReliabilityScenario({
    task: "Test mixed",
    steps: [
      { action: { type: "navigate", url: "https://localhost:3000" }, expectedStatus: "verified" },
      { action: { type: "click", x: 100, y: 200 }, expectedStatus: "failed" },
      { action: { type: "screenshot" }, expectedStatus: "verified" },
    ],
  });

  assertEqual(metrics.totalSteps, 3, "mixed has 3 total steps");
  assertEqual(metrics.executedSteps, 2, "mixed has 2 executed steps");
  assertEqual(metrics.failedSteps, 1, "mixed has 1 failed step");
  assertEqual(metrics.taskCompletion, false, "mixed taskCompletion is false");
  assertEqual(metrics.status, "failed", "mixed status is failed");
}

function testReliabilityScenarioBlocked() {
  console.log("\n[Reliability: Policy-Blocked Scenario]");

  const metrics = runReliabilityScenario({
    task: "Test blocked",
    steps: [
      { action: { type: "navigate", url: "https://localhost:3000" }, expectedStatus: "verified" },
      { action: { type: "navigate", url: "https://evil.com" }, expectedStatus: "blocked", policyOutcome: "block" },
    ],
  });

  assertEqual(metrics.blockedSteps, 1, "blocked scenario has 1 blocked step");
  assertEqual(metrics.blockedCount, 1, "blocked scenario blockedCount is 1");
  assertEqual(metrics.executedSteps, 1, "blocked scenario has 1 executed step");
  assertEqual(metrics.status, "blocked", "blocked scenario status is blocked");
}

function testReliabilityScenarioApproval() {
  console.log("\n[Reliability: Approval Scenario]");

  const metrics = runReliabilityScenario({
    task: "Test approval",
    steps: [
      { action: { type: "navigate", url: "https://localhost:3000" }, expectedStatus: "verified" },
      { action: { type: "click", x: 400, y: 300, targetLabel: "Submit" }, expectedStatus: "approved" },
    ],
  });

  assertEqual(metrics.approvedSteps, 1, "approval scenario has 1 approved step");
  assertEqual(metrics.executedSteps, 1, "approval scenario has 1 executed step");
  assertEqual(metrics.totalSteps, 2, "approval scenario has 2 total steps");
}

function testReliabilityEvalsRun() {
  console.log("\n[Reliability: Eval Suite]");

  const result = runReliabilityEvals();
  assert(result.passed > 0, `reliability evals have ${result.passed} passed assertions`);
  assert(result.results.length > 0, `reliability evals have ${result.results.length} total checks`);
  assertEqual(result.failed, 0, "all reliability evals pass");
}

// ── Bug Report Tests ──────────────────────────────────────────────────────

function testBugReportFromFailedRun() {
  console.log("\n[Bug Report: From Failed Run]");

  setup();
  const run = createComputerUseRun({
    userId: "test-user", title: "Bug Test", task: "Find bugs", mode: "browser", provider: "playwright", status: "failed",
    taskBrief: { goal: "t", environment: "b", allowedDomains: ["localhost:3000"], allowedActions: ["navigate", "click"], requiresApprovalFor: [], maxSteps: 5 },
    permissionScope: { allowedDomains: ["localhost:3000"], blockedDomains: [], allowedActions: ["navigate", "click"], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 5, maxRuntimeMinutes: 5 },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, url: "https://localhost:3000", createdAt: getNowIso() },
    stepCount: 0, maxSteps: 5, startedAt: getNowIso(),
    resultStatus: "failed",
  });

  addComputerUseScreenshot(run.id, {
    id: "bug-ss", runId: run.id, capturedAt: getNowIso(),
    originalWidth: 1280, originalHeight: 720, sentWidth: 1280, sentHeight: 720,
    scaleX: 1, scaleY: 1, devicePixelRatio: 1, imageUri: "data:image/png;base64,bug", hash: "bug-hash", label: "Error",
  });

  addComputerUseStep(run.id, {
    runId: run.id, index: 0, status: "failed",
    action: { type: "click", x: 400, y: 300, targetLabel: "Broken" },
    result: { success: false, error: "Element not interactable" },
    beforeScreenshotId: "bug-ss",
    startedAt: getNowIso(),
  });

  const report = generateBugReport(run.id);
  assert(report.findings.length > 0, "bug report has findings");
  assert(report.evidenceScreenshots.length > 0, "bug report has evidence screenshots");
  assertEqual(report.resultStatus, "failed", "result status is failed");

  const schemaResult = validateBugReportSchema(report);
  assert(schemaResult.passed, "bug report schema is valid");
}

function testBugReportFromSuccessfulRun() {
  console.log("\n[Bug Report: From Successful Run]");

  setup();
  const run = createComputerUseRun({
    userId: "test-user", title: "Success Run", task: "All good", mode: "browser", provider: "playwright", status: "complete",
    taskBrief: { goal: "t", environment: "b", allowedDomains: [], allowedActions: [], requiresApprovalFor: [], maxSteps: 3 },
    permissionScope: { allowedDomains: [], blockedDomains: [], allowedActions: [], approvalRequiredActions: [], blockedActions: [], credentialMode: "none", fileSystemScope: "none", networkMode: "allowlist", dataRetention: "standard", maxSteps: 3, maxRuntimeMinutes: 5 },
    sandbox: { sandboxId: "s", mode: "browser", status: "ready", viewport: { width: 1280, height: 720, scale: 1 }, createdAt: getNowIso() },
    stepCount: 0, maxSteps: 3, startedAt: getNowIso(),
  });

  addComputerUseStep(run.id, {
    runId: run.id, index: 0, status: "verified",
    action: { type: "navigate", url: "https://localhost:3000" },
    startedAt: getNowIso(),
  });

  const report = generateBugReport(run.id);
  assertEqual(report.findings.length, 0, "successful run has no findings");
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  setup(); testInMemoryAdapterCreatesRetrievesRun();
  setup(); testInMemoryAdapterStepsAndScreenshots();
  setup(); testInMemoryAdapterArtifactsAndEvents();
  setup(); testInMemoryAdapterReset();

  testSupabaseAdapterReportsNotReady();
  testSupabaseAdapterKindIsSupabase();
  testSupabaseAdapterReadMethodsReturnEmpty();

  setup(); testArtifactGenerationCompletedRun();
  setup(); testArtifactGenerationFailedRun();

  setup(); testReliabilityEmptyRun();
  testReliabilityScenarioAllSuccess();
  testReliabilityScenarioMixed();
  testReliabilityScenarioBlocked();
  testReliabilityScenarioApproval();
  testReliabilityEvalsRun();

  setup(); testBugReportFromFailedRun();
  setup(); testBugReportFromSuccessfulRun();

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
  if (failed > 0) { console.error("Some assertions failed."); process.exitCode = 1; }
  else { console.log("All assertions passed."); }
}

main();
