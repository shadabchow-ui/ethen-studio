// Shared Agent Runtime FSM — Focused Validation Suite
// Run with: npx tsx lib/agents/runtime/__tests__/state-machine.test.ts

import {
  canTransitionRunStatus,
  createRecoveryDescriptor,
  createRun,
  getRunTransitionLog,
  resetRuntimeStore,
  setRunStatus,
} from "..";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${label}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    passed += 1;
    console.log(`  PASS: ${label}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function setup() {
  resetRuntimeStore();
}

function testPureTransitionRules(): void {
  console.log("\n[Transition rules]");

  const pendingToRunning = canTransitionRunStatus("pending", "running");
  assert(pendingToRunning.allowed, "pending -> running is allowed");

  const missingApprovalContext = canTransitionRunStatus("planning", "awaiting_approval");
  assert(!missingApprovalContext.allowed, "planning -> awaiting_approval requires context");
  assertEqual(missingApprovalContext.error?.code, "MISSING_CONTEXT", "missing context code returned");

  const recoveryDescriptor = createRecoveryDescriptor("provider retry", { attempt: 1 });
  const runningToRecovering = canTransitionRunStatus("running", "recovering", recoveryDescriptor.context);
  assert(runningToRecovering.allowed, "running -> recovering is allowed");

  const planningToRecovering = canTransitionRunStatus("planning", "recovering", recoveryDescriptor.context);
  assert(!planningToRecovering.allowed, "planning -> recovering is blocked");
  assertEqual(planningToRecovering.error?.code, "INVALID_TRANSITION", "invalid transition code returned");

  const completedToRunning = canTransitionRunStatus("completed", "running");
  assert(!completedToRunning.allowed, "completed -> running is blocked");
  assertEqual(completedToRunning.error?.code, "TERMINAL_RUN", "terminal run code returned");
}

function testRunStoreEnforcementAndRecoveryLogging(): void {
  console.log("\n[Run store enforcement]");

  const run = createRun({
    agentSlug: "test-agent",
    triggerType: "manual",
  });

  assertEqual(run.status, "pending", "new run starts pending");
  assert(setRunStatus(run.id, "completed") === null, "illegal pending -> completed transition returns null");
  assert(setRunStatus(run.id, "queued")?.status === "queued", "pending -> queued succeeds");
  assert(setRunStatus(run.id, "planning")?.status === "planning", "queued -> planning succeeds");

  const recoveryDescriptor = createRecoveryDescriptor("resume after pause", { source: "unit-test" });
  assert(setRunStatus(run.id, "recovering", recoveryDescriptor.context) === null, "planning -> recovering remains blocked");
  assert(setRunStatus(run.id, "running")?.status === "running", "planning -> running succeeds");
  assert(setRunStatus(run.id, "recovering", recoveryDescriptor.context)?.status === "recovering", "running -> recovering succeeds");
  assert(setRunStatus(run.id, "running")?.status === "running", "recovering -> running succeeds");

  const transitionLog = getRunTransitionLog(run.id);
  assert(transitionLog.length >= 4, "transition log records allowed and blocked transitions");
  assert(transitionLog.some((entry) => entry.toStatus === "recovering" && entry.allowed), "transition log includes recovery transition");
  assert(
    transitionLog.some((entry) => entry.toStatus === "recovering" && !entry.allowed),
    "transition log includes blocked recovery attempt",
  );
}

function main() {
  console.log("Shared Agent Runtime FSM — Validation\n");
  setup();
  testPureTransitionRules();
  setup();
  testRunStoreEnforcementAndRecoveryLogging();

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
  if (failed > 0) {
    console.error("Some assertions failed.");
    process.exit(1);
  }
  console.log("All assertions passed.");
}

main();
