// Employee Run Persistence — Validation Suite
// Run with: npx tsx lib/employees/__tests__/runs.test.ts

import {
  createEmployeeRun,
  getEmployeeRun,
  setEmployeeRunStatus,
  updateEmployeeRun,
  getEmployeeRunsForEmployee,
  getEmployeeRunsForTask,
  getActiveEmployeeRuns,
  canTransitionRunStatus,
  TERMINAL_EMPLOYEE_RUN_STATUSES,
  ACTIVE_EMPLOYEE_RUN_STATUSES,
  ALLOWED_RUN_TRANSITIONS,
  resetEmployeeRunStore,
  type EmployeeRunStatus,
  type EmployeeRun,
} from "../runs";
import {
  createEmployeeTask,
  getEmployeeTask,
  setEmployeeTaskStatus,
  getEmployeeTasksForEmployee,
  resetEmployeeTaskStore,
} from "../tasks";
import {
  createEmployeeRunStep,
  getEmployeeRunStep,
  setEmployeeRunStepStatus,
  getStepsForEmployeeRun,
  resetEmployeeRunStepStore,
} from "../run-steps";
import {
  addTimelineEvent,
  getTimelineForRun,
  completeTimelineEvent,
  orderTimelineEvents,
} from "../run-timeline";
import {
  createRunWithTask,
  advanceRunStatus,
  completeRun,
  failRun,
  cancelRun,
} from "../run-queries";

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

function isActiveStatus(s: EmployeeRunStatus): boolean {
  return ACTIVE_EMPLOYEE_RUN_STATUSES.includes(s);
}

function isTerminalStatus(s: EmployeeRunStatus): boolean {
  return TERMINAL_EMPLOYEE_RUN_STATUSES.includes(s);
}

function setup() {
  resetEmployeeRunStore();
  resetEmployeeTaskStore();
  resetEmployeeRunStepStore();
}

// ── Status Transition Map ─────────────────────────────────────────────

function testStatusTransitionMapCompleteness(): void {
  console.log("\n[Status Transition Map Completeness]");

  const allStatuses: EmployeeRunStatus[] = [
    "queued", "planning", "loading_context", "running",
    "waiting_approval", "retrying", "completed", "failed",
    "cancelled", "blocked",
  ];

  for (const status of allStatuses) {
    assert(
      ALLOWED_RUN_TRANSITIONS[status] !== undefined,
      `${status} has transition entry`,
    );
    assert(
      Array.isArray(ALLOWED_RUN_TRANSITIONS[status]),
      `${status} transition entry is array`,
    );
  }
}

// ── Valid Status Transitions ──────────────────────────────────────────

function testValidTransitions(): void {
  console.log("\n[Valid Status Transitions]");

  assert(canTransitionRunStatus("queued", "planning"), "queued → planning");
  assert(canTransitionRunStatus("queued", "cancelled"), "queued → cancelled");
  assert(canTransitionRunStatus("planning", "loading_context"), "planning → loading_context");
  assert(canTransitionRunStatus("planning", "failed"), "planning → failed");
  assert(canTransitionRunStatus("loading_context", "running"), "loading_context → running");
  assert(canTransitionRunStatus("running", "completed"), "running → completed");
  assert(canTransitionRunStatus("running", "failed"), "running → failed");
  assert(canTransitionRunStatus("running", "waiting_approval"), "running → waiting_approval");
  assert(canTransitionRunStatus("running", "blocked"), "running → blocked");
  assert(canTransitionRunStatus("waiting_approval", "running"), "waiting_approval → running");
  assert(canTransitionRunStatus("waiting_approval", "retrying"), "waiting_approval → retrying");
  assert(canTransitionRunStatus("retrying", "running"), "retrying → running");
  assert(canTransitionRunStatus("blocked", "retrying"), "blocked → retrying");
  assert(canTransitionRunStatus("blocked", "cancelled"), "blocked → cancelled");
}

// ── Invalid Status Transitions ────────────────────────────────────────

function testInvalidTransitions(): void {
  console.log("\n[Invalid Status Transitions]");

  assert(!canTransitionRunStatus("queued", "completed"), "queued → completed blocked");
  assert(!canTransitionRunStatus("running", "queued"), "running → queued blocked");
  assert(!canTransitionRunStatus("completed", "running"), "terminal → running blocked");
  assert(!canTransitionRunStatus("failed", "retrying"), "terminal → retrying blocked");
  assert(!canTransitionRunStatus("cancelled", "queued"), "terminal → queued blocked");
  assert(!canTransitionRunStatus("completed", "failed"), "completed → failed blocked");
  assert(!canTransitionRunStatus("loading_context", "waiting_approval"), "loading_context → waiting_approval blocked");
  assert(!canTransitionRunStatus("queued", "blocked"), "queued → blocked blocked");
}

// ─── Terminal and Active Status Consistency ───────────────────────────

function testTerminalAndActiveConsistency(): void {
  console.log("\n[Terminal and Active Consistency]");

  for (const s of TERMINAL_EMPLOYEE_RUN_STATUSES) {
    assert(!isActiveStatus(s), `${s} not active`);
    assert(isTerminalStatus(s), `${s} is terminal`);
  }
  for (const s of ACTIVE_EMPLOYEE_RUN_STATUSES) {
    assert(isActiveStatus(s), `${s} is active`);
    assert(!isTerminalStatus(s), `${s} not terminal`);
  }
  assert(
    TERMINAL_EMPLOYEE_RUN_STATUSES.length + ACTIVE_EMPLOYEE_RUN_STATUSES.length >= 10,
    "all 10 statuses covered",
  );
}

// ── EmployeeRun Lifecycle ─────────────────────────────────────────────

function testEmployeeRunLifecycle(): void {
  console.log("\n[Employee Run Lifecycle]");

  const run = createEmployeeRun({
    orgId: "org-1",
    employeeId: "emp-1",
    trigger: "manual",
  });

  assertEqual(run.status, "queued", "initial status is queued");
  assertEqual(run.orgId, "org-1", "orgId set");
  assertEqual(run.employeeId, "emp-1", "employeeId set");
  assert(run.id.startsWith("erun-"), `run ID format correct: ${run.id}`);
  assert(run.startedAt === null, "startedAt null initially");
  assert(run.completedAt === null, "completedAt null initially");

  const s1 = setEmployeeRunStatus(run.id, "planning");
  assert(s1 !== null, "set status to planning");
  assertEqual(s1!.status, "planning", "status is planning");

  const s2 = setEmployeeRunStatus(run.id, "loading_context");
  assert(s2 !== null, "set status to loading_context");

  const s3 = setEmployeeRunStatus(run.id, "running");
  assert(s3 !== null, "set status to running");
  assert(s3!.startedAt !== null, "startedAt set on running");

  const s4 = setEmployeeRunStatus(run.id, "completed");
  assert(s4 !== null, "set status to completed");
  assertEqual(s4!.status, "completed", "status is completed");
  assert(s4!.completedAt !== null, "completedAt set");
  assert(s4!.durationMs !== null, "durationMs computed");

  const cannotChange = setEmployeeRunStatus(run.id, "running");
  assert(cannotChange === null, "cannot change terminal status");
}

// ── Full Lifecycle with startedAt ─────────────────────────────────────

function testFullLifecycleWithStartedAt(): void {
  console.log("\n[Full Lifecycle With StartedAt]");

  const run = createEmployeeRun({
    orgId: "org-1",
    employeeId: "emp-1",
    trigger: "manual",
  });

  setEmployeeRunStatus(run.id, "planning");
  setEmployeeRunStatus(run.id, "loading_context");
  const running = setEmployeeRunStatus(run.id, "running");

  assert(running !== null, "run is now running");
  assert(running!.startedAt !== null, "startedAt set when entering running");
  assert(running!.completedAt === null, "completedAt still null");

  const completed = setEmployeeRunStatus(run.id, "completed");
  assert(completed !== null, "run completed");
  assert(completed!.completedAt !== null, "completedAt set");
  assert(completed!.durationMs !== null, "durationMs computed");
  assert(completed!.durationMs! >= 0, "durationMs non-negative");
}

// ── Invalid Transition Returns Null ───────────────────────────────────

function testInvalidTransitionReturnsNull(): void {
  console.log("\n[Invalid Transition Returns Null]");

  const run = createEmployeeRun({
    orgId: "org-1",
    employeeId: "emp-1",
    trigger: "manual",
  });

  const result = setEmployeeRunStatus(run.id, "completed");
  assert(result === null, "queued → completed returns null");
  assert(getEmployeeRun(run.id)!.status === "queued", "status unchanged");
}

// ── Get Non-Existent Run ──────────────────────────────────────────────

function testGetNonExistentRun(): void {
  console.log("\n[Get Non-Existent Run]");

  assert(getEmployeeRun("nonexistent") === null, "null for unknown run ID");
  assert(setEmployeeRunStatus("nonexistent", "running") === null, "null for unknown status set");
  assert(updateEmployeeRun("nonexistent", { summary: "test" }) === null, "null for unknown update");
}

// ── Update Employee Run ───────────────────────────────────────────────

function testUpdateEmployeeRun(): void {
  console.log("\n[Update Employee Run]");

  const run = createEmployeeRun({
    orgId: "org-1",
    employeeId: "emp-1",
    trigger: "manual",
  });

  const updated = updateEmployeeRun(run.id, {
    summary: "Test summary",
    model: "gpt-4",
    totalTokens: 1500,
    totalCostCents: 15,
  });

  assert(updated !== null, "update succeeded");
  assertEqual(updated!.summary, "Test summary", "summary updated");
  assertEqual(updated!.model, "gpt-4", "model updated");
  assertEqual(updated!.totalTokens, 1500, "tokens updated");
  assertEqual(updated!.totalCostCents, 15, "cost updated");
}

// ── Runs by Employee ──────────────────────────────────────────────────

function testRunsByEmployee(): void {
  console.log("\n[Runs by Employee]");

  createEmployeeRun({ orgId: "org-1", employeeId: "emp-1", trigger: "manual" });
  createEmployeeRun({ orgId: "org-1", employeeId: "emp-1", trigger: "schedule" });
  createEmployeeRun({ orgId: "org-1", employeeId: "emp-2", trigger: "manual" });

  const emp1Runs = getEmployeeRunsForEmployee("emp-1");
  assertEqual(emp1Runs.length, 2, "emp-1 has 2 runs");

  const emp2Runs = getEmployeeRunsForEmployee("emp-2");
  assertEqual(emp2Runs.length, 1, "emp-2 has 1 run");

  const emp3Runs = getEmployeeRunsForEmployee("emp-3");
  assertEqual(emp3Runs.length, 0, "emp-3 has 0 runs");
}

// ── Active Runs ───────────────────────────────────────────────────────

function testActiveRuns(): void {
  console.log("\n[Active Runs]");

  const r1 = createEmployeeRun({ orgId: "org-1", employeeId: "emp-1", trigger: "manual" });
  const r2 = createEmployeeRun({ orgId: "org-1", employeeId: "emp-1", trigger: "manual" });
  const r3 = createEmployeeRun({ orgId: "org-1", employeeId: "emp-2", trigger: "manual" });

  setEmployeeRunStatus(r1.id, "planning");
  setEmployeeRunStatus(r1.id, "loading_context");
  setEmployeeRunStatus(r1.id, "running");
  setEmployeeRunStatus(r1.id, "completed");
  setEmployeeRunStatus(r3.id, "running");

  const active = getActiveEmployeeRuns();
  assertEqual(active.length, 2, "2 active runs (queued + running)");
}

// ── Employee Task ─────────────────────────────────────────────────────

function testEmployeeTask(): void {
  console.log("\n[Employee Task]");

  const task = createEmployeeTask({
    orgId: "org-1",
    employeeId: "emp-1",
    title: "Triage tickets",
    goal: "Review and categorize new support tickets",
    trigger: "schedule",
    input: { maxTickets: 25 },
  });

  assertEqual(task.status, "queued", "task initial status queued");
  assertEqual(task.title, "Triage tickets", "task title set");
  assertEqual(task.goal.startsWith("Review"), true, "goal set");
  assert(task.id.startsWith("etask-"), "task ID format correct");

  const retrieved = getEmployeeTask(task.id);
  assert(retrieved !== null, "task retrievable");
  assertEqual(retrieved!.status, "queued", "retrieved status matches");

  setEmployeeTaskStatus(task.id, "running");
  assertEqual(getEmployeeTask(task.id)!.status, "running", "task status updated");
}

// ── Employee Run Step ─────────────────────────────────────────────────

function testEmployeeRunStep(): void {
  console.log("\n[Employee Run Step]");

  const run = createEmployeeRun({ orgId: "org-1", employeeId: "emp-1", trigger: "manual" });

  const step = createEmployeeRunStep({
    runId: run.id,
    order: 1,
    type: "plan",
    title: "Creating plan",
    input: { data: "test" },
  });

  assertEqual(step.status, "pending", "step initial status pending");
  assertEqual(step.runId, run.id, "step runId matches");
  assertEqual(step.order, 1, "step order is 1");
  assertEqual(step.type, "plan", "step type is plan");

  const running = setEmployeeRunStepStatus(step.id, "running");
  assert(running !== null, "step started");
  assert(running!.startedAt !== null, "step startedAt set");

  const completed = setEmployeeRunStepStatus(step.id, "completed");
  assert(completed !== null, "step completed");
  assert(completed!.completedAt !== null, "step completedAt set");
  assert(completed!.durationMs !== null, "step durationMs computed");

  const steps = getStepsForEmployeeRun(run.id);
  assertEqual(steps.length, 1, "one step for run");
  assertEqual(steps[0].id, step.id, "step in list matches");
}

// ── Timeline Ordering ─────────────────────────────────────────────────

function testTimelineOrdering(): void {
  console.log("\n[Timeline Ordering]");

  const run = createEmployeeRun({ orgId: "org-1", employeeId: "emp-1", trigger: "manual" });

  const s1 = addTimelineEvent(run.id, "plan", "Planning");
  const s2 = addTimelineEvent(run.id, "context_load", "Loading context");
  const s3 = addTimelineEvent(run.id, "tool_check", "Checking tools");

  assertEqual(s1.order, 1, "first event order 1");
  assertEqual(s2.order, 2, "second event order 2");
  assertEqual(s3.order, 3, "third event order 3");

  const timeline = getTimelineForRun(run.id);
  assertEqual(timeline.length, 3, "timeline has 3 events");

  for (let i = 0; i < timeline.length - 1; i++) {
    assert(
      timeline[i].order < timeline[i + 1].order,
      `event ${i} order < event ${i + 1} order`,
    );
  }
}

// ── Timeline Event Completion ─────────────────────────────────────────

function testTimelineEventCompletion(): void {
  console.log("\n[Timeline Event Completion]");

  const run = createEmployeeRun({ orgId: "org-1", employeeId: "emp-1", trigger: "manual" });
  const event = addTimelineEvent(run.id, "tool_call", "Search CRM", {
    toolId: "crm.search",
  });

  const completed = completeTimelineEvent(event.id, "completed", {
    results: ["contact-1", "contact-2"],
  });

  assert(completed !== null, "event completed");
  assertEqual(completed!.status, "completed", "status is completed");
  const outputResults = (completed!.output as Record<string, unknown> | null)?.results;
  assert(Array.isArray(outputResults) && outputResults[0] === "contact-1", "output preserved");
  assert(completed!.completedAt !== null, "completedAt set");
}

// ── createRunWithTask ─────────────────────────────────────────────────

function testCreateRunWithTask(): void {
  console.log("\n[Create Run With Task]");

  const result = createRunWithTask({
    orgId: "org-1",
    employeeId: "emp-1",
    taskTitle: "Daily support triage",
    taskGoal: "Triage all new support tickets from the last 24 hours",
    trigger: "schedule",
    workflowId: "wf-1",
  });

  assert(result.error === null, "no error");
  assert(result.task !== null, "task created");
  assert(result.run !== null, "run created");
  assertEqual(result.task.title, "Daily support triage", "task title correct");
  assertEqual(result.task.orgId, "org-1", "task orgId correct");
  assertEqual(result.run.taskId, result.task.id, "run linked to task");
  assertEqual(result.run.status, "queued", "run initial status queued");

  const timeline = getTimelineForRun(result.run.id);
  assert(timeline.length >= 1, "timeline has at least plan event");
  assertEqual(timeline[0].type, "plan", "first timeline event is plan");
}

// ── completeRun / failRun / cancelRun ─────────────────────────────────

function testRunCompletionHelpers(): void {
  console.log("\n[Run Completion Helpers]");

  const { run } = createRunWithTask({
    orgId: "org-1",
    employeeId: "emp-1",
    taskTitle: "Test task",
    taskGoal: "Test goal",
    trigger: "manual",
  });

  advanceRunStatus(run.id, "planning");
  advanceRunStatus(run.id, "loading_context");
  advanceRunStatus(run.id, "running");

  const completed = completeRun(run.id, "All steps completed");
  assert(completed !== null, "run completed");
  assertEqual(completed!.status, "completed", "status is completed");
  assertEqual(completed!.summary, "All steps completed", "summary set");

  const timeline = getTimelineForRun(run.id);
  assert(timeline.some((s) => s.type === "complete"), "timeline has complete event");
}

function testRunFailureAndCancel(): void {
  console.log("\n[Run Failure and Cancel]");

  const { run: run1 } = createRunWithTask({
    orgId: "org-1",
    employeeId: "emp-1",
    taskTitle: "Failing task",
    taskGoal: "Test failure",
    trigger: "manual",
  });

  advanceRunStatus(run1.id, "planning");
  const failed = failRun(run1.id, "Connection to Zendesk failed");
  assert(failed !== null, "run failed");
  assertEqual(failed!.status, "failed", "status is failed");
  assert(failed!.error !== null && failed!.error.includes("Zendesk"), "error message contains Zendesk");

  const { run: run2 } = createRunWithTask({
    orgId: "org-1",
    employeeId: "emp-1",
    taskTitle: "Cancelled task",
    taskGoal: "Test cancel",
    trigger: "manual",
  });

  const cancelled = cancelRun(run2.id);
  assert(cancelled !== null, "run cancelled");
  assertEqual(cancelled!.status, "cancelled", "status is cancelled");
}

// ── Cross-store Cleanup ───────────────────────────────────────────────

function testCrossStoreCleanup(): void {
  console.log("\n[Cross-store Cleanup]");

  createEmployeeTask({ orgId: "org-1", employeeId: "emp-1", title: "T1", goal: "G1", trigger: "manual" });
  createEmployeeRun({ orgId: "org-1", employeeId: "emp-1", trigger: "manual" });

  setup();

  assertEqual(getEmployeeTasksForEmployee("emp-1").length, 0, "tasks cleared after reset");
  assertEqual(getEmployeeRunsForEmployee("emp-1").length, 0, "runs cleared after reset");
}

// ── Run ───────────────────────────────────────────────────────────────

async function main() {
  console.log("Employee Run Persistence — Validation\n");

  setup();
  testStatusTransitionMapCompleteness();

  setup();
  testValidTransitions();

  setup();
  testInvalidTransitions();

  setup();
  testTerminalAndActiveConsistency();

  setup();
  testEmployeeRunLifecycle();

  setup();
  testFullLifecycleWithStartedAt();

  setup();
  testInvalidTransitionReturnsNull();

  setup();
  testGetNonExistentRun();

  setup();
  testUpdateEmployeeRun();

  setup();
  testRunsByEmployee();

  setup();
  testActiveRuns();

  setup();
  testEmployeeTask();

  setup();
  testEmployeeRunStep();

  setup();
  testTimelineOrdering();

  setup();
  testTimelineEventCompletion();

  setup();
  testCreateRunWithTask();

  setup();
  testRunCompletionHelpers();

  setup();
  testRunFailureAndCancel();

  setup();
  testCrossStoreCleanup();

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
  if (failed > 0) { console.error("Some assertions failed."); process.exitCode = 1; }
  else { console.log("All assertions passed."); }
}

main();
