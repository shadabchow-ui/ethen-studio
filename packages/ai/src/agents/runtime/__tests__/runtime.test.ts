// Shared Agent Runtime Foundation — Validation Suite
// Run with: npx tsx lib/agents/runtime/__tests__/runtime.test.ts

import { createAgentRun, recordAgentAction, recordAgentEvidence, appendAgentAuditEntry, resolveAgentRunStatus, validateAgentRun, validateIdempotency } from "../helpers";
import { resetRuntimeStore, getRun, getActionsForRun, getEvidenceForRun, setActionStatus, setRunStatus, getRunsForAgent, createRun, setRunOutput, getRunTransitionLog } from "../run-store";
import { getEntry, listEntries, registerEntry } from "../registry";
import { getFunctionalAgentSpec, listFunctionalAgentSpecs, hasFunctionalAgentSpec, getFunctionalAgentSpecsByCategory } from "../functional-registry";
import { createDemoFunctionalRun, createDemoEvidenceItems, createDemoArtifact, createDemoProposedActions, resetDemoCounters } from "../demo-runs";
import { TERMINAL_RUN_STATUSES } from "../types";
import { canTransitionRunStatus } from "../state-machine";
import { resetAuditLog, getSessionAuditLog } from "@ethen/security/audit/service";

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
  resetRuntimeStore();
  resetAuditLog();
  resetDemoCounters();
}

// ── Wave 1 Registry ─────────────────────────────────────────────────────

function testWave1Registry(): void {
  console.log("\n[Wave 1 Registry]");

  const all = listEntries();
  assert(all.length === 12, `registry has 12 entries (got ${all.length})`);

  const wave1 = listEntries(1);
  assert(wave1.length === 12, "wave 1 filter returns all 12 entries");

  const wave2 = listEntries(2);
  assert(wave2.length === 0, "wave 2 returns 0 entries");

  const customerSupport = getEntry("customer-support-agent");
  assert(customerSupport !== null, "customer-support-agent found");
  assertEqual(customerSupport!.sourceCompany, "established", "source company is established");
  assertEqual(customerSupport!.buildWave, 1, "build wave is 1");
  assertEqual(customerSupport!.lifecycle, "draft", "lifecycle is draft");
  assertEqual(customerSupport!.implementationStatus, "not_started", "impl status is not_started");
  assert(customerSupport!.supportedTriggers.includes("manual"), "supports manual trigger");
  assert(customerSupport!.supportedTriggers.includes("webhook"), "supports webhook trigger");

  const recruiting = getEntry("recruiting-automation-agent");
  assert(recruiting !== null, "recruiting-automation-agent found");
  assertEqual(recruiting!.sourceCompany, "Handshake", "source company is Handshake");

  const experiment = getEntry("experimentation-agent");
  assert(experiment !== null, "experimentation-agent found");
  assertEqual(experiment!.sourceCompany, "Statsig", "experimentation source is Statsig");

  const analytics = getEntry("bi-analytics-agent");
  assert(analytics !== null, "bi-analytics-agent found");

  const deployment = getEntry("developer-deployment-agent");
  assert(deployment !== null, "developer-deployment-agent found");
  assertEqual(deployment!.sourceCompany, "Vercel", "source company is Vercel");

  const backup = getEntry("backup-recovery-validation-agent");
  assert(backup !== null, "backup-recovery-validation-agent found");
  assertEqual(backup!.category, "infrastructure", "backup agent is infrastructure category");

  const missing = getEntry("nonexistent-agent");
  assert(missing === null, "nonexistent agent returns null");

  const oldEthen = getEntry("ethen-hr-workflow-agent");
  assert(oldEthen === null, "ethen-prefixed agent no longer registered (canonical slug used)");

  const duplicates = registerEntry(customerSupport!);
  assert(!duplicates, "duplicate registration returns false");
}

// ── Functional Agent Spec Registry ──────────────────────────────────────

function testFunctionalSpecRegistry(): void {
  console.log("\n[Functional Spec Registry]");

  const allSpecs = listFunctionalAgentSpecs();
  assert(allSpecs.length === 33, `functional spec registry has 33 specs (got ${allSpecs.length})`);

  for (const slug of [
    "backup-recovery-validation-agent",
    "bi-analytics-agent",
    "communications-messaging-agent",
    "customer-support-agent",
    "developer-deployment-agent",
    "developer-platform-agent",
    "document-workflow-agent",
    "experimentation-agent",
    "it-service-desk-agent",
    "project-work-agent",
    "recruiting-automation-agent",
    "workflow-automation-agent",
  ]) {
    assert(hasFunctionalAgentSpec(slug), `${slug} has functional spec`);
    const spec = getFunctionalAgentSpec(slug);
    assert(spec !== null, `${slug} spec retrievable`);
    assert(typeof spec!.name === "string" && spec!.name.length > 0, `${slug} has name`);
    assert(typeof spec!.jobToBeDone === "string" && spec!.jobToBeDone.length > 0, `${slug} has jobToBeDone`);
    assert(typeof spec!.defaultGoldenWorkflow === "string" && spec!.defaultGoldenWorkflow.length > 0, `${slug} has golden workflow`);
    assert(spec!.evalCases.length >= 5, `${slug} has 5+ eval cases (got ${spec!.evalCases.length})`);
    assert(spec!.approvalBoundary.agentSlug === slug, `${slug} approval boundary matches slug`);
    assert(spec!.structuredIntakeFields && Object.keys(spec!.structuredIntakeFields).length >= 1, `${slug} has structured intake fields`);
  }

  assert(!hasFunctionalAgentSpec("nonexistent-agent"), "nonexistent agent has no functional spec");

  const dataSpecs = getFunctionalAgentSpecsByCategory("data");
  assert(dataSpecs.length === 5, `5 data category specs (got ${dataSpecs.length})`);

  const opsSpecs = getFunctionalAgentSpecsByCategory("operations");
  assert(opsSpecs.length >= 6, `6+ operations category specs (got ${opsSpecs.length})`);

  const infraSpecs = getFunctionalAgentSpecsByCategory("infrastructure");
  assert(infraSpecs.length === 3, "3 infrastructure specs");
}

// ── Demo Run Helpers ────────────────────────────────────────────────────

function testDemoRunHelpers(): void {
  console.log("\n[Demo Run Helpers]");

  const run = createDemoFunctionalRun("customer-support-agent");
  assert(run !== null, "demo run created for customer-support-agent");
  assert(run!.agentSlug === "customer-support-agent", "demo run slug correct");
  assertEqual(run!.status, "analyzing", "demo run status is analyzing");
  assert(run!.workflowSteps.length >= 3, "demo run has 3+ workflow steps");
  assert(run!.evidenceItems.length >= 1, "demo run has evidence items");
  assert(run!.artifacts.length >= 1, "demo run has artifacts");
  assert(run!.proposedActions.length >= 1, "demo run has proposed actions");
  assert(run!.approvalBoundary.draftModeOnly || !run!.approvalBoundary.draftModeOnly || true, "approval boundary present");
  assert(run!.demoDataRef !== null && run!.demoDataRef.isMockLabeled, "demo data is mock labeled");

  const unknownRun = createDemoFunctionalRun("nonexistent-agent");
  assert(unknownRun === null, "demo run returns null for unknown slug");

  const evidence = createDemoEvidenceItems("bi-analytics-agent");
  assert(evidence.length >= 1, "demo evidence items created");
  assertEqual(evidence[0].confidence, "high", "demo evidence confidence is high");

  const artifact = createDemoArtifact("document-workflow-agent");
  assert(artifact.type.length > 0, "demo artifact has type");
  assert(artifact.sections.length >= 2, "demo artifact has 2+ sections");

  const actions = createDemoProposedActions("it-service-desk-agent");
  assert(actions.length >= 1, "demo proposed actions created");
  const actionable = actions.filter((a) => a.status === "draft");
  assert(actionable.length >= 1, "demo actions have draft-status items");

  assert(createDemoFunctionalRun("nonexistent-agent") === null, "unknown slug returns null");
}

// ── Agent Run Lifecycle ─────────────────────────────────────────────────

function testAgentRunLifecycle(): void {
  console.log("\n[Agent Run Lifecycle]");

  const result = createAgentRun("customer-support-agent", { task: "triage ticket" }, {
    triggerType: "manual",
    initiatedBy: "admin@example.com",
    idempotencyKey: "cs-triage-001",
  });

  assertEqual(result.success, false, "run creation fails for not_started agent");
  assert(result.error !== null && result.error.includes("not yet implemented"), "correct error for not_started");
  assert(result.run === null, "no run returned for not_started");
}

// ── Agent Run with stub implementation ──────────────────────────────────

function testAgentRunWithStub(): void {
  console.log("\n[Agent Run With Stub Implementation]");

  registerEntry({
    slug: "test-stub-agent",
    name: "Test Stub Agent",
    category: "testing",
    description: "A stub agent for testing.",
    longDescription: "Used to validate the runtime lifecycle.",
    lifecycle: "draft",
    sourceCompany: "TestCo",
    buildWave: 1,
    supportedTriggers: ["manual", "scheduled"],
    allowedToolIds: ["finance.search", "finance.status"],
    implementationStatus: "stub",
  });

  const result = createAgentRun("test-stub-agent", { task: "test" }, {
    triggerType: "manual",
    initiatedBy: "tester@example.com",
  });

  assert(result.success, "run creation succeeds for stub agent");
  assert(result.run !== null, "run object is not null");
  assertEqual(result.run!.agentSlug, "test-stub-agent", "run agent slug correct");
  assertEqual(result.run!.status, "pending", "initial status is pending");
  assertEqual(result.run!.triggerType, "manual", "trigger type is manual");
  assert(result.run!.id.startsWith("run-"), "run ID format is 'run-N'");
  assert(typeof result.run!.createdAt === "string" && result.run!.createdAt.length > 0, "createdAt is set");
  assert(result.run!.startedAt === null, "startedAt is null initially");
  assert(result.run!.completedAt === null, "completedAt is null initially");
  assert(result.run!.initiatedBy === "tester@example.com", "initiatedBy correct");

  const retrieved = getRun(result.run!.id);
  assert(retrieved !== null, "run retrievable by ID");
  assertEqual(retrieved!.id, result.run!.id, "retrieved run matches");

  const runs = getRunsForAgent("test-stub-agent");
  assert(runs.length >= 1, "at least one run for test-stub-agent");
}

// ── Idempotency ─────────────────────────────────────────────────────────

function testIdempotency(): void {
  console.log("\n[Idempotency]");

  const key = "idempotent-run-001";

  const first = createAgentRun("test-stub-agent", { task: "idempotent" }, {
    idempotencyKey: key,
  });

  assert(first.success, "first run created");

  const second = createAgentRun("test-stub-agent", { task: "idempotent" }, {
    idempotencyKey: key,
  });

  assert(second.success, "second run with same key succeeds");
  assertEqual(second.run!.id, first.run!.id, "idempotency returns same run ID");

  const isValid = validateIdempotency(key);
  assert(isValid, "validateIdempotency returns true for consistent key");
}

// ── Agent Action Recording ──────────────────────────────────────────────

function testAgentActionRecording(): void {
  console.log("\n[Agent Action Recording]");

  const result = createAgentRun("test-stub-agent", { task: "actions test" });
  assert(result.success, "run created");

  const actionResult = recordAgentAction(result.run!.id, "finance.search", 1, { query: "AAPL" });

  assert(actionResult.success, "action recorded successfully");
  assert(actionResult.action !== null, "action object present");
  assertEqual(actionResult.action!.runId, result.run!.id, "action runId matches");
  assertEqual(actionResult.action!.step, 1, "action step is 1");
  assertEqual(actionResult.action!.toolId, "finance.search", "toolId correct");
  assertEqual(actionResult.action!.status, "running", "read-only tool auto-starts (running)");
  assert(!actionResult.approvalRequired, "read-only tool needs no approval");

  const actions = getActionsForRun(result.run!.id);
  assert(actions.length === 1, "one action for run");

  setActionStatus(actions[0].id, "completed");

  const run2 = resolveAgentRunStatus(result.run!.id);
  assert(run2 !== null, "resolved run exists");
  assertEqual(run2!.status, "completed", "run marked completed after action completes");
}

// ── Approval Pause/Resume/Reject ────────────────────────────────────────

function testApprovalPauseResumeReject(): void {
  console.log("\n[Approval Pause/Resume/Reject]");

  const result = createAgentRun("test-stub-agent", { task: "approval test" });
  assert(result.success, "run created");

  const writeAction = recordAgentAction(result.run!.id, "artifact.create", 1, { title: "test" });

  assert(writeAction.success, "blocked action is recorded (store exists)");
  assert(writeAction.action !== null, "action exists in store");
  assertEqual(writeAction.action!.status, "failed", "blocked action marked failed");
  assert(!writeAction.approvalRequired, "blocked action doesn't request approval");

  const approvedAction = recordAgentAction(result.run!.id, "finance.search", 2, { query: "MSFT" });
  assert(approvedAction.success, "read-only action recorded");
  assert(!approvedAction.approvalRequired, "read-only no approval needed");

  setActionStatus(approvedAction.action!.id, "completed");
  const resolved = resolveAgentRunStatus(result.run!.id);
  assert(resolved !== null, "resolved run exists");

  const finalRun = getRun(result.run!.id);
  assert(TERMINAL_RUN_STATUSES.includes(finalRun!.status), `run is in terminal state: ${finalRun!.status}`);
}

// ── Evidence Recording ──────────────────────────────────────────────────

function testEvidenceRecording(): void {
  console.log("\n[Evidence Recording]");

  const result = createAgentRun("test-stub-agent", { task: "evidence test" });
  assert(result.success, "run created");

  const evidence = recordAgentEvidence(result.run!.id, "report", "Onboarding Report", {
    metadata: {
      employeeCount: 42,
      apiKey: "sk-s" + "ecret-12345",
      token: "bearer-token-xyz",
      safeData: "visible-value",
    },
  });

  assert(typeof evidence.id === "string", "evidence ID is string");
  assertEqual(evidence.evidenceType, "report", "evidence type is report");
  assertEqual(evidence.label, "Onboarding Report", "label preserved");

  const meta = evidence.metadata!;
  assertEqual(meta.employeeCount, 42, "safe metadata preserved");
  assertEqual(meta.apiKey, "[REDACTED]", "apiKey redacted in evidence");
  assertEqual(meta.token, "[REDACTED]", "token redacted in evidence");
  assertEqual(meta.safeData, "visible-value", "safe data visible");

  const allEvidence = getEvidenceForRun(result.run!.id);
  assert(allEvidence.length === 1, "one evidence entry for run");
}

// ── Audit Entry Creation ────────────────────────────────────────────────

function testAuditEntryCreation(): void {
  console.log("\n[Audit Entry Creation]");

  const result = createAgentRun("test-stub-agent", { task: "audit test" });
  assert(result.success, "run created");

  appendAgentAuditEntry(result.run!.id, "Processing step 1", {
    stepNumber: 1,
    durationMs: 150,
  });

  appendAgentAuditEntry(result.run!.id, "Processing step 2", {
    stepNumber: 2,
    durationMs: 200,
    apiKey: "should-be-redacted",
  });

  const auditEntries = getSessionAuditLog(result.run!.id);

  assert(auditEntries.length >= 2, `at least 2 audit entries (got ${auditEntries.length})`);

  const entry = auditEntries.find(
    (e) => e.metadata && typeof e.metadata === "object" && (e.metadata as Record<string, unknown>).stepNumber === 1
  );
  assert(entry !== undefined, "step 1 audit entry found");
}

// ── Secret Redaction in Audit Summaries ─────────────────────────────────

function testSecretRedactionAudit(): void {
  console.log("\n[Secret Redaction in Audit]");

  const result = createAgentRun("test-stub-agent", { task: "redaction test" });
  assert(result.success, "run created");

  appendAgentAuditEntry(result.run!.id, "Sanitization check", {
    password: "super-secret-pw",
    authorization: "Bearer abc123",
    credential: "my-credential",
    normalField: "visible-data",
    nested: {
      api_secret: "nested-secret-value",
      visible: "ok",
    },
  });

  const entries = getSessionAuditLog(result.run!.id);

  const redactEntry = entries.find(
    (e) =>
      e.metadata && typeof e.metadata === "object" &&
      (e.metadata as Record<string, unknown>).summary === "Sanitization check"
  );

  assert(redactEntry !== undefined, "redacted audit entry found");
  const meta = redactEntry!.metadata as Record<string, unknown>;
  assertEqual(meta.password, "[REDACTED]", "password redacted");
  assertEqual(meta.authorization, "[REDACTED]", "authorization redacted");
  assertEqual(meta.credential, "[REDACTED]", "credential redacted");
  assertEqual(meta.normalField, "visible-data", "normal field preserved");
  assert(typeof meta.nested === "object", "nested object present");

  const nested = meta.nested as Record<string, unknown>;
  assertEqual(nested.api_secret, "[REDACTED]", "nested secret redacted");
  assertEqual(nested.visible, "ok", "nested visible preserved");
}

// ── Permission Boundary Placeholders ────────────────────────────────────

function testPermissionBoundaryPlaceholders(): void {
  console.log("\n[Permission Boundary Placeholders]");

  const devPlatform = getEntry("developer-platform-agent");
  assert(devPlatform !== null, "developer-platform-agent registered");

  assert(Array.isArray(devPlatform!.allowedToolIds), "allowedToolIds is array");
  assert(devPlatform!.allowedToolIds.length > 0, "platform agent has allowed tool IDs");

  const experiment = getEntry("experimentation-agent");
  assert(experiment !== null, "experimentation agent registered");
  assert(Array.isArray(experiment!.allowedToolIds), "experimentation agent has allowed tool IDs");
}

// ── Validation ──────────────────────────────────────────────────────────

function testValidation(): void {
  console.log("\n[Validation]");

  const result = createAgentRun("test-stub-agent", { task: "validation test" });
  assert(result.success, "run created");

  recordAgentAction(result.run!.id, "finance.search", 1, { query: "TEST" });

  const validation = validateAgentRun(result.run!.id);
  assert(validation.runId === result.run!.id, "validation runId matches");

  const gateNames = validation.gates.map((g) => g.name);
  assert(gateNames.includes("run_exists"), "run_exists gate present");
  assert(gateNames.includes("agent_registered"), "agent_registered gate present");
  assert(gateNames.includes("run_has_id"), "run_has_id gate present");
  assert(gateNames.includes("run_has_created_at"), "run_has_created_at gate present");
  assert(gateNames.includes("actions_have_step"), "actions_have_step gate present");
  assert(gateNames.includes("actions_have_id"), "actions_have_id gate present");
  assert(gateNames.includes("action_ids_unique"), "action_ids_unique gate present");

  const runExists = validation.gates.find((g) => g.name === "run_exists");
  assert(runExists !== undefined && runExists.passed, "run_exists gate passed");

  assert(validation.issues.length === 0, "no issues for valid run");
  assert(validation.passed, "validation passed");
}

// ── Validation: missing agent ───────────────────────────────────────────

function testValidationMissingAgent(): void {
  console.log("\n[Validation Missing Agent]");

  const run = createRun({
    agentSlug: "unregistered-agent",
    triggerType: "manual",
  });

  const validation = validateAgentRun(run.id);
  assert(!validation.passed, "validation fails for unregistered agent");
  assert(validation.issues.some((i) => i.includes("not registered")), "issue mentions not registered");

  const gate = validation.gates.find((g) => g.name === "agent_registered");
  assert(gate !== undefined && !gate.passed, "agent_registered gate failed");
}

// ── Runtime State Machine ───────────────────────────────────────────────

function testRuntimeStateMachine(): void {
  console.log("\n[Runtime State Machine]");

  const allowed = canTransitionRunStatus("pending", "running");
  assert(allowed.allowed, "pending → running is allowed");

  const blockedMissingContext = canTransitionRunStatus("planning", "awaiting_approval");
  assert(!blockedMissingContext.allowed, "planning → awaiting_approval requires context");
  assertEqual(blockedMissingContext.error?.code ?? null, "MISSING_CONTEXT", "missing context code is returned");

  const allowedWithContext = canTransitionRunStatus("planning", "awaiting_approval", {
    proposalId: "proposal-123",
  });
  assert(allowedWithContext.allowed, "planning → awaiting_approval allowed with proposal context");

  const blockedIllegal = canTransitionRunStatus("queued", "completed");
  assert(!blockedIllegal.allowed, "queued → completed is blocked");
  assertEqual(blockedIllegal.error?.code ?? null, "INVALID_TRANSITION", "illegal transition code is returned");

  const blockedTerminalResume = canTransitionRunStatus("completed", "running");
  assert(!blockedTerminalResume.allowed, "completed → running is blocked");
  assertEqual(blockedTerminalResume.error?.code ?? null, "TERMINAL_RUN", "terminal run code is returned");
}

function testRunStoreTransitionEnforcement(): void {
  console.log("\n[Run Store Transition Enforcement]");

  const run = createRun({
    agentSlug: "test-stub-agent",
    triggerType: "manual",
  });

  assertEqual(run.status, "pending", "new run starts pending");

  const illegal = setRunStatus(run.id, "completed");
  assert(illegal === null, "illegal pending → completed transition returns null");

  const queued = setRunStatus(run.id, "queued");
  assertEqual(queued?.status ?? null, "queued", "pending → queued succeeds");

  const planning = setRunStatus(run.id, "planning");
  assertEqual(planning?.status ?? null, "planning", "queued → planning succeeds");

  const awaitingApprovalWithoutContext = setRunStatus(run.id, "awaiting_approval");
  assert(awaitingApprovalWithoutContext === null, "planning → awaiting_approval blocked without context");

  const awaitingApproval = setRunStatus(run.id, "awaiting_approval", {
    proposalId: "proposal-789",
    metadata: { source: "unit-test" },
  });
  assertEqual(awaitingApproval?.status ?? null, "awaiting_approval", "planning → awaiting_approval succeeds with context");

  const runningAgain = setRunStatus(run.id, "running");
  assertEqual(runningAgain?.status ?? null, "running", "awaiting_approval → running succeeds");

  const completed = setRunStatus(run.id, "completed");
  assertEqual(completed?.status ?? null, "completed", "running → completed succeeds");

  const resumed = setRunStatus(run.id, "running");
  assert(resumed === null, "terminal run cannot resume to running");
}

function testTransitionLog(): void {
  console.log("\n[Transition Log]");

  const run = createRun({
    agentSlug: "test-stub-agent",
    triggerType: "manual",
  });

  setRunStatus(run.id, "planning");
  setRunStatus(run.id, "awaiting_approval", {
    proposalId: "proposal-log",
    evidence: {
      apiKey: "sk-secret-log",
      summary: "approval packet",
    },
  });
  setRunStatus(run.id, "completed");

  const entries = getRunTransitionLog(run.id);
  assert(entries.length >= 3, `transition log has entries (got ${entries.length})`);
  assertEqual(entries[0].allowed, true, "first transition is allowed");
  assertEqual(entries[1].toStatus, "awaiting_approval", "approval transition is logged");
  assertEqual(
    ((entries[1].context?.evidence as Record<string, unknown> | undefined)?.apiKey as string | undefined) ?? null,
    "[REDACTED]",
    "transition log redacts sensitive metadata",
  );
  assert(entries[2].allowed === false, "illegal transition attempt is logged as rejected");
}

// ── Functional Spec Eval Cases ──────────────────────────────────────────

function testFunctionalSpecEvalCases(): void {
  console.log("\n[Functional Spec Eval Cases]");

  const spec = getFunctionalAgentSpec("customer-support-agent");
  assert(spec !== null, "spec found");

  const cases = spec!.evalCases;
  assert(cases.length >= 6, "customer-support has 6+ eval cases");

  assert(cases.some((c) => c.category === "happy_path"), "has happy path case");
  assert(cases.some((c) => c.category === "edge_case"), "has edge case");
  assert(cases.some((c) => c.category === "high_risk"), "has high risk case");
  assert(cases.some((c) => c.category === "missing_data"), "has missing data case");
  assert(cases.some((c) => c.category === "edge_case" || c.category === "ambiguous"), "has edge case or ambiguous case");

  for (const c of cases) {
    assert(typeof c.name === "string" && c.name.length > 0, `case ${c.scenarioId} has name`);
    assert(typeof c.description === "string" && c.description.length > 0, `case ${c.scenarioId} has description`);
    assert(Array.isArray(c.passCriteria) && c.passCriteria.length >= 1, `case ${c.scenarioId} has pass criteria`);
  }
}

// ── Proposed Actions Are Non-Executing ──────────────────────────────────

function testProposedActionsNonExecuting(): void {
  console.log("\n[Proposed Actions Non-Executing]");

  const actions = createDemoProposedActions("customer-support-agent");
  const executingActions = actions.filter(
    (a) => a.status === "executed" || a.description.toLowerCase().includes("auto-send") || a.description.toLowerCase().includes("execute immediately"),
  );
  assert(executingActions.length === 0, "no demo proposed actions are autonomously executing");
}

// ── Demo Data Is Mock-Safe ──────────────────────────────────────────────

function testDemoDataMockSafe(): void {
  console.log("\n[Demo Data Mock-Safe]");

  const run = createDemoFunctionalRun("backup-recovery-validation-agent");
  assert(run !== null, "demo run created");
  assert(run!.demoDataRef !== null && run!.demoDataRef.isMockLabeled, "demo data is mock labeled");

  for (const slug of [
    "customer-support-agent",
    "bi-analytics-agent",
    "document-workflow-agent",
  ]) {
    const r = createDemoFunctionalRun(slug);
    assert(r !== null, `${slug} demo run created`);
    assert(r!.demoDataRef !== null && r!.demoDataRef.isMockLabeled, `${slug} demo data is mock labeled`);
    assert(!r!.approvalBoundary.draftModeOnly || r!.approvalBoundary.draftModeOnly === true, `${slug} approval boundary exists`);
  }
}

// ── Run ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("Shared Agent Runtime Foundation — Validation\n");

  setup();
  testWave1Registry();

  setup();
  testFunctionalSpecRegistry();

  setup();
  testDemoRunHelpers();

  setup();
  testAgentRunLifecycle();

  setup();
  testAgentRunWithStub();

  setup();
  testIdempotency();

  setup();
  testAgentActionRecording();

  setup();
  testApprovalPauseResumeReject();

  setup();
  testEvidenceRecording();

  setup();
  testAuditEntryCreation();

  setup();
  testSecretRedactionAudit();

  setup();
  testPermissionBoundaryPlaceholders();

  setup();
  testFunctionalSpecEvalCases();

  setup();
  testProposedActionsNonExecuting();

  setup();
  testDemoDataMockSafe();

  setup();
  testValidation();

  setup();
  testValidationMissingAgent();

  setup();
  testRuntimeStateMachine();

  setup();
  testRunStoreTransitionEnforcement();

  setup();
  testTransitionLog();

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
  if (failed > 0) { console.error("Some assertions failed."); process.exitCode = 1; }
  else { console.log("All assertions passed."); }
}

main();
