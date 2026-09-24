// Project Work Agent — Action & State Validation Suite
// Run with: npx tsx lib/agents/workbenches/project-work-agent/__tests__/project-work.test.ts

import { createInitialProjectWorkState } from "../fixture";
import {
  updateTaskStatus,
  assignOwner,
  prioritizeTasks,
  resolveBlocker,
  generateActionPlan,
  composeStakeholderReport,
  linkDependency,
  escalateRisk,
} from "../actions";
import type { ProjectWorkState } from "../state";

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

function makeState(): ProjectWorkState {
  return createInitialProjectWorkState();
}

// ── Fixture / Initial State ──────────────────────────────────────────────

function testFixtureIntegrity(): void {
  console.log("\n[Fixture Integrity]");

  const state = makeState();
  assert(state.tasks.length >= 10, `fixture has at least 10 tasks (got ${state.tasks.length})`);
  assert(state.blockers.length >= 3, `fixture has at least 3 blockers (got ${state.blockers.length})`);
  assert(state.dependencies.length >= 5, `fixture has at least 5 dependencies (got ${state.dependencies.length})`);
  assert(state.actionPlanItems.length >= 5, `fixture has at least 5 action plan items (got ${state.actionPlanItems.length})`);

  assert(state.project.name.length > 0, "project has a name");
  assert(state.project.lead.length > 0, "project has a lead");
  assert(state.project.sponsor.length > 0, "project has a sponsor");
  assert(state.project.health === "at_risk", "project starts at_risk");

  assert(state.artifacts.length === 0, "no artifacts initially");
  assert(state.activityLog.length === 0, "no activity log initially");
  assert(state.selectedTaskId === null, "no selected task initially");
  assert(state.selectedBlockerId === null, "no selected blocker initially");

  assert(state.tasks.every((t) => t.id.length > 0), "all tasks have ids");
  assert(state.tasks.every((t) => t.title.length > 0), "all tasks have titles");
  assert(state.tasks.some((t) => t.status === "done"), "at least one done task in fixture");
  assert(state.tasks.some((t) => t.status === "in_progress"), "at least one in_progress task");
  assert(state.tasks.some((t) => t.status === "blocked"), "at least one blocked task");

  assert(state.blockers.every((b) => b.status !== "resolved"), "all fixture blockers are open");
}

function testTaskFieldIntegrity(): void {
  console.log("\n[Task Field Integrity]");

  const state = makeState();
  const task = state.tasks[0];
  assert(task.id.length > 0, "task has id");
  assert(task.title.length > 0, "task has title");
  assert(task.owner.length > 0, "task has owner");
  assert(task.dueDate.length > 0, "task has dueDate");
  assert(task.phase.length > 0, "task has phase");
  assert(typeof task.progressPercent === "number", "progressPercent is number");
  assert(Array.isArray(task.blockedBy), "blockedBy is array");
  assert(Array.isArray(task.dependsOn), "dependsOn is array");
  assert(Array.isArray(task.unblocks), "unblocks is array");
}

// ── updateTaskStatus ─────────────────────────────────────────────────────

function testUpdateTaskStatus(): void {
  console.log("\n[updateTaskStatus]");

  let state = makeState();
  const taskId = state.tasks[0].id;
  const originalStatus = state.tasks[0].status;

  const result = updateTaskStatus(state, taskId, "done");
  state = result.state;

  const updated = state.tasks.find((t) => t.id === taskId);
  assert(updated !== undefined, "task found after update");
  assertEqual(updated!.status, "done", "status changed to done");
  assert(updated!.status !== originalStatus, "status actually changed");

  assert(result.event !== undefined, "event returned");
  assert(result.event.action === "update_task_status", "event action is update_task_status");
  assert(result.event.summary.length > 0, "event has human-readable summary");
  assert(result.event.linkedTaskIds.includes(taskId), "event references task");

  assert(state.activityLog.length === 1, "activity log has one entry");
}

// ── assignOwner ──────────────────────────────────────────────────────────

function testAssignOwner(): void {
  console.log("\n[assignOwner]");

  let state = makeState();
  const taskId = state.tasks[0].id;
  const newOwner = "Alex Kim";

  const result = assignOwner(state, taskId, newOwner);
  state = result.state;

  const updated = state.tasks.find((t) => t.id === taskId);
  assertEqual(updated!.owner, "Alex Kim", "owner changed to Alex Kim");

  assert(result.event.action === "assign_owner", "event action is assign_owner");
  assert(result.event.summary.includes("Alex Kim"), "event mentions new owner");
}

// ── prioritizeTasks ──────────────────────────────────────────────────────

function testPrioritizeTasks(): void {
  console.log("\n[prioritizeTasks]");

  let state = makeState();
  const result = prioritizeTasks(state);
  state = result.state;

  assert(state.tasks.length === makeState().tasks.length, "task count unchanged after prioritize");
  assert(result.event.action === "prioritize_tasks", "event action is prioritize_tasks");
  assert(result.event.summary.includes("Prioritized"), "summary mentions prioritized");
  assert(result.event.linkedTaskIds.length > 0, "event references tasks");
}

// ── resolveBlocker ───────────────────────────────────────────────────────

function testResolveBlocker(): void {
  console.log("\n[resolveBlocker]");

  let state = makeState();
  const blocker = state.blockers[0];
  assert(blocker.status !== "resolved", "blocker is not resolved initially");

  const result = resolveBlocker(state, blocker.id);
  state = result.state;

  const updated = state.blockers.find((b) => b.id === blocker.id);
  assertEqual(updated!.status, "resolved", "blocker status changed to resolved");

  assert(result.event.action === "resolve_blocker", "event action is resolve_blocker");
  assert(result.event.summary.includes(blocker.title), "event mentions blocker title");

  assert(state.artifacts.length === 1, "blocker summary artifact generated after resolve");
  const art = state.artifacts[0];
  assertEqual(art.type, "blocker_summary", "artifact type is blocker_summary");
  assert(art.preview.length > 0, "artifact has preview");
  assert(art.content.length > 0, "artifact has content");
}

function testResolveBlockerUnblocksTasks(): void {
  console.log("\n[resolveBlocker — unblocks tasks]");

  let state = makeState();
  const blockedTask = state.tasks.find((t) => t.status === "blocked");
  assert(blockedTask !== undefined, "fixture has a blocked task");

  const blockerId = blockedTask!.blockedBy[0];
  assert(blockerId !== undefined, "blocked task has a blocker");

  const blocker = state.blockers.find((b) => b.id === blockerId);
  assert(blocker !== undefined, "blocker exists in fixture");

  const result = resolveBlocker(state, blockerId);
  state = result.state;

  const taskAfter = state.tasks.find((t) => t.id === blockedTask!.id);
  const stillBlockedCount = taskAfter!.blockedBy.filter((bid) => {
    const b = state.blockers.find((bl) => bl.id === bid);
    return b && b.status !== "resolved";
  }).length;

  if (stillBlockedCount === 0) {
    assert(taskAfter!.status !== "blocked", "task no longer blocked when all blockers resolved");
  }

  const blockerAfter = state.blockers.find((b) => b.id === blockerId);
  assertEqual(blockerAfter!.status, "resolved", "blocker marked resolved");
}

// ── generateActionPlan ───────────────────────────────────────────────────

function testGenerateActionPlan(): void {
  console.log("\n[generateActionPlan]");

  let state = makeState();
  const result = generateActionPlan(state);
  state = result.state;

  assert(result.artifact.type === "action_plan", "artifact type is action_plan");
  assert(result.artifact.content.length > 0, "artifact has content");
  assert(result.artifact.preview.length > 0, "artifact has preview");
  assert(result.artifact.linkedTaskIds.length > 0, "artifact references tasks");

  assert(result.event.action === "generate_action_plan", "event action is generate_action_plan");
  assert(state.artifacts.length === 1, "one artifact generated");

  assert(state.actionPlanItems.length > 0, "action plan has items");
}

// ── composeStakeholderReport ─────────────────────────────────────────────

function testComposeStakeholderReport(): void {
  console.log("\n[composeStakeholderReport]");

  let state = makeState();
  const result = composeStakeholderReport(state);
  state = result.state;

  assert(result.artifact.type === "stakeholder_report", "artifact type is stakeholder_report");
  assert(result.artifact.content.includes("Stakeholder Report"), "content includes header");
  assert(result.artifact.content.includes("Executive Summary"), "content includes executive summary");
  assert(result.artifact.content.includes("Blockers"), "content includes blockers section");
  assert(result.artifact.content.includes("Next Steps"), "content includes next steps");
  assert(result.artifact.preview.length > 0, "artifact has preview");

  assert(result.event.action === "compose_stakeholder_report", "event action is compose_stakeholder_report");
  assert(state.artifacts.length === 1, "one artifact generated");
}

// ── linkDependency ───────────────────────────────────────────────────────

function testLinkDependency(): void {
  console.log("\n[linkDependency]");

  let state = makeState();
  const initialDepCount = state.dependencies.length;

  const result = linkDependency(
    state,
    state.tasks[0].id,
    state.tasks[1].id,
    "blocks",
    "high",
    "Test dependency reason",
  );
  state = result.state;

  assertEqual(state.dependencies.length, initialDepCount + 1, "one dependency added");
  const newDep = state.dependencies[state.dependencies.length - 1];
  assertEqual(newDep.type, "blocks", "dependency type set correctly");
  assertEqual(newDep.risk, "high", "dependency risk set correctly");
  assertEqual(newDep.status, "at_risk", "high risk dependency marked at_risk");

  assert(result.event.action === "link_dependency", "event action is link_dependency");
  assert(result.event.summary.includes("blocks"), "event mentions dependency type");
}

// ── escalateRisk ─────────────────────────────────────────────────────────

function testEscalateRisk(): void {
  console.log("\n[escalateRisk]");

  let state = makeState();
  const blocker = state.blockers.find((b) => b.severity === "medium")!;
  assert(blocker !== undefined, "fixture has a medium-severity blocker");

  const result = escalateRisk(state, blocker.id);
  state = result.state;

  const updated = state.blockers.find((b) => b.id === blocker.id);
  assertEqual(updated!.severity, "high", "medium escalated to high");

  assert(result.event.action === "escalate_risk", "event action is escalate_risk");
  assert(result.event.summary.includes("Escalated"), "event mentions escalation");
  assert(result.event.summary.includes("medium"), "event mentions old severity");
  assert(result.event.summary.includes("high"), "event mentions new severity");

  // Check risk memo artifact
  const memoArt = state.artifacts.find((a) => a.type === "risk_dependency_memo");
  assert(memoArt !== undefined, "risk memo artifact generated");
  assert(memoArt!.content.includes(blocker.title), "memo mentions blocker title");
}

function testEscalateRiskAtCritical(): void {
  console.log("\n[escalateRisk — critical ceiling]");

  const state = makeState();
  const blocker = state.blockers.find((b) => b.severity === "critical");
  if (!blocker) {
    // Manufacture a critical blocker
    state.blockers.push({
      id: "blocker-test-critical",
      title: "Test Critical Blocker",
      severity: "critical",
      owner: "Test Owner",
      status: "open",
      impact: "Test impact",
      resolutionPlan: "Test plan",
      linkedTaskIds: [],
      targetResolutionDate: "2026-07-01",
    });
  }
  const critical = state.blockers.find((b) => b.severity === "critical")!;

  const result = escalateRisk(state, critical.id);
  const updated = result.state.blockers.find((b) => b.id === critical.id);
  assertEqual(updated!.severity, "critical", "critical stays at critical");
}

// ── Project health recalculation ─────────────────────────────────────────

function testProjectHealthRecalculation(): void {
  console.log("\n[Project Health Recalculation]");

  let state = makeState();

  // Resolve all blockers — health should improve
  const openBlockers = state.blockers.filter((b) => b.status !== "resolved");
  for (const b of openBlockers) {
    const r = resolveBlocker(state, b.id);
    state = r.state;
  }

  assert(state.project.openBlockers === 0, "no open blockers after resolving all");
  assert(state.project.openBlockers === 0, "blocker count went to zero");
}

// ── Receipt quality ──────────────────────────────────────────────────────

function testReceiptQuality(): void {
  console.log("\n[Receipt Quality]");

  const state = makeState();

  const prioResult = prioritizeTasks(state);
  assert(prioResult.event.summary.startsWith("Prioritized"), "priority receipt starts with Prioritized");
  assert(!prioResult.event.summary.includes("[object"), "receipt is not raw JSON object");

  const resolveResult = resolveBlocker(state, state.blockers[0].id);
  assert(resolveResult.event.summary.includes("Resolved"), "resolve receipt contains Resolved");
  assert(!resolveResult.event.summary.includes('"status"'), "receipt is not raw JSON");

  const planResult = generateActionPlan(state);
  assert(planResult.event.summary.includes("Generated action plan"), "action plan receipt is human-readable");

  const reportResult = composeStakeholderReport(state);
  assert(reportResult.event.summary.includes("Generated stakeholder report"), "report receipt is human-readable");
}

// ── Artifact content quality ─────────────────────────────────────────────

function testArtifactContentQuality(): void {
  console.log("\n[Artifact Content Quality]");

  let state = makeState();

  // Generate artifacts
  state = generateActionPlan(state).state;
  state = composeStakeholderReport(state).state;

  // Resolve blocker — generates blocker summary
  state = resolveBlocker(state, state.blockers[0].id).state;

  // Escalate — generates risk memo
  const medBlocker = state.blockers.find((b) => b.severity === "medium");
  if (medBlocker) {
    state = escalateRisk(state, medBlocker.id).state;
  }

  assert(state.artifacts.length >= 3, `at least 3 artifacts generated (got ${state.artifacts.length})`);

  const types = state.artifacts.map((a) => a.type);
  assert(types.includes("action_plan"), "action_plan artifact present");
  assert(types.includes("stakeholder_report"), "stakeholder_report artifact present");
  assert(types.includes("blocker_summary"), "blocker_summary artifact present");

  for (const art of state.artifacts) {
    assert(art.title.length > 0, `artifact ${art.type} has title`);
    assert(art.content.length > 30, `artifact ${art.type} has substantial content`);
    assert(art.preview.length > 10, `artifact ${art.type} has preview`);
    assert(art.sourceAction.length > 0, `artifact ${art.type} has source action`);
    assert(art.createdAt.length > 0, `artifact ${art.type} has creation timestamp`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

function runAll(): void {
  passed = 0;
  failed = 0;

  testFixtureIntegrity();
  testTaskFieldIntegrity();
  testUpdateTaskStatus();
  testAssignOwner();
  testPrioritizeTasks();
  testResolveBlocker();
  testResolveBlockerUnblocksTasks();
  testGenerateActionPlan();
  testComposeStakeholderReport();
  testLinkDependency();
  testEscalateRisk();
  testEscalateRiskAtCritical();
  testProjectHealthRecalculation();
  testReceiptQuality();
  testArtifactContentQuality();

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
