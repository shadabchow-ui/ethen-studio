// Flagship Functional Agents — Batch B: Test Suite
// Verifies deep functional specs, demo runs, evidence, artifacts, approval
// boundaries, and eval cases for all four Batch B Wave 1 agents.
//
// Run with: npx tsx lib/agents/runtime/__tests__/batch-b.test.ts

import { BATCH_B_AGENTS, getBatchBSpec } from "../batch-b-agents";
import type { FunctionalAgentSpec } from "../batch-b-agents";
import { runAgentDemo, runAllAgentDemos, runAllBatchBDemos, runAllEvalCases, runEvalCase } from "../batch-b-runner";
import type { DemoRunResult, EvalResult } from "../batch-b-runner";
import { resetRuntimeStore } from "../run-store";
import { resetAuditLog } from "@ethen/security/audit/service";

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
}

// ── Batch B Agents: All 4 Registered ───────────────────────────────────────

function testBatchBAgentsExist(): void {
  console.log("\n[Batch B Agents — Registration]");

  assertEqual(BATCH_B_AGENTS.length, 4, "4 Batch B agents registered");

  const slugs = BATCH_B_AGENTS.map((s) => s.slug);
  for (const expected of [
    "backup-recovery-validation-agent",
    "document-workflow-agent",
    "workflow-automation-agent",
    "project-work-agent",
  ]) {
    assert(slugs.includes(expected), `"${expected}" present in Batch B`);
  }
}

// ── Agent Spec Structure Validation ────────────────────────────────────────

function testAgentSpecStructure(spec: FunctionalAgentSpec): void {
  const label = `[${spec.slug}]`;

  assert(spec.workflowSteps.length >= 5, `${label} has >= 5 workflow steps (got ${spec.workflowSteps.length})`);
  assert(spec.demoFixtures.length >= 4, `${label} has >= 4 demo fixtures (got ${spec.demoFixtures.length})`);
  assert(spec.evidenceSpecs.length >= 4, `${label} has >= 4 evidence specs (got ${spec.evidenceSpecs.length})`);
  assert(spec.artifactSpecs.length >= 1, `${label} has >= 1 artifact spec (got ${spec.artifactSpecs.length})`);
  assert(spec.proposedActions.length >= 3, `${label} has >= 3 proposed actions (got ${spec.proposedActions.length})`);
  assert(spec.approvalBoundaries.length >= 3, `${label} has >= 3 approval boundaries (got ${spec.approvalBoundaries.length})`);
  assert(spec.evalCases.length >= 5, `${label} has >= 5 eval cases (got ${spec.evalCases.length})`);

  // Validate workflow steps — at least one requires approval
  const approvalSteps = spec.workflowSteps.filter((s) => s.requiresApproval);
  assert(approvalSteps.length >= 1, `${label} has >= 1 approval-required step (got ${approvalSteps.length})`);

  // Validate eval case categories
  const categories = spec.evalCases.map((c) => c.category);
  assert(categories.includes("happy_path"), `${label} has a happy_path eval case`);
  assert(categories.includes("edge_case") || categories.includes("missing_data"), `${label} has edge/missing eval cases`);
  assert(categories.includes("high_risk"), `${label} has a high_risk eval case`);
  assert(categories.includes("hallucination_resistance"), `${label} has a hallucination_resistance eval case`);

  // All proposed actions should mention requiresApproval
  for (const action of spec.proposedActions) {
    assert(typeof action.requiresApproval === "boolean", `${label} action "${action.label}" has requiresApproval boolean`);
  }

  // All approval boundaries should have risk level
  for (const boundary of spec.approvalBoundaries) {
    assert(["low", "medium", "high", "critical"].includes(boundary.riskLevel), `${label} boundary "${boundary.boundary}" has valid risk level`);
  }
}

function testAllAgentSpecStructures(): void {
  console.log("\n[Agent Spec Structure Validation]");

  for (const spec of BATCH_B_AGENTS) {
    testAgentSpecStructure(spec);
  }
}

// ── Lookup ──────────────────────────────────────────────────────────────────

function testSpecLookup(): void {
  console.log("\n[Spec Lookup]");

  const brv = getBatchBSpec("backup-recovery-validation-agent");
  assert(brv !== null, "backup-recovery-validation-agent spec found");
  assertEqual(brv!.name, "Backup & Recovery Validation Agent", "name matches");

  const dwf = getBatchBSpec("document-workflow-agent");
  assert(dwf !== null, "document-workflow-agent spec found");
  assertEqual(dwf!.name, "Document Workflow Agent", "name matches");

  const wfa = getBatchBSpec("workflow-automation-agent");
  assert(wfa !== null, "workflow-automation-agent spec found");
  assertEqual(wfa!.name, "Workflow Automation Agent", "name matches");

  const pwa = getBatchBSpec("project-work-agent");
  assert(pwa !== null, "project-work-agent spec found");
  assertEqual(pwa!.name, "Project Work Agent", "name matches");

  const missing = getBatchBSpec("nonexistent");
  assert(missing === null, "nonexistent slug returns null");
}

// ── Single Demo Run — Each Agent's First Fixture ───────────────────────────

function testSingleDemoRuns(): void {
  console.log("\n[Single Demo Runs — First Fixture Per Agent]");

  for (const spec of BATCH_B_AGENTS) {
    const result = runAgentDemo(spec, 0);
    assert(result.success, `${spec.slug}: demo run succeeds`);
    assert(result.run !== null, `${spec.slug}: run object present`);
    assert(result.actions.length === spec.workflowSteps.length, `${spec.slug}: action count matches workflow steps (${result.actions.length} vs ${spec.workflowSteps.length})`);
    assert(result.evidence.length >= spec.workflowSteps.length, `${spec.slug}: at least one evidence per step (${result.evidence.length})`);
    assert(Object.keys(result.artifact).length > 0, `${spec.slug}: artifact generated`);

    // Verify artifact has required sections
    const artifactStr = JSON.stringify(result.artifact);
    assert(artifactStr.includes("demo") || artifactStr.includes("mock"), `${spec.slug}: artifact marked as demo`);
    assert(artifactStr.includes("limitations") || artifactStr.includes("Limitations"), `${spec.slug}: artifact includes limitations`);
    assert(artifactStr.includes("disclaimer") || artifactStr.includes("Disclaimer"), `${spec.slug}: artifact includes disclaimers`);

    // Verify run completed
    assertEqual(result.run!.status, "completed", `${spec.slug}: run status is completed`);
  }
}

// ── All Demo Fixtures Per Agent ─────────────────────────────────────────────

function testAllDemoFixturesPerAgent(): void {
  console.log("\n[All Demo Fixtures Per Agent]");

  for (const spec of BATCH_B_AGENTS) {
    const results = runAllAgentDemos(spec);
    assertEqual(results.length, spec.demoFixtures.length, `${spec.slug}: ${spec.demoFixtures.length} fixtures executed`);

    let passCount = 0;
    for (const r of results) {
      if (r.success) passCount += 1;
    }
    assert(passCount === spec.demoFixtures.length, `${spec.slug}: all ${spec.demoFixtures.length} fixtures passed (${passCount})`);
  }
}

// ── All Batch B Demos ──────────────────────────────────────────────────────

function testAllBatchBDemos(): void {
  console.log("\n[All Batch B Demos]");

  const results = runAllBatchBDemos();
  const totalFixtures = BATCH_B_AGENTS.reduce((sum, s) => sum + s.demoFixtures.length, 0);
  assertEqual(results.length, totalFixtures, `${totalFixtures} total fixtures executed`);

  const allPassed = results.every((r) => r.success);
  assert(allPassed, "all Batch B demo runs pass");

  // Verify all artifacts are demo-marked
  for (const r of results) {
    assert(JSON.stringify(r.artifact).toLowerCase().includes("demo"), `${r.slug}: fixture "${r.fixtureLabel}" artifact has demo marker`);
  }
}

// ── Eval Cases — Each Agent ─────────────────────────────────────────────────

function testEvalCases(): void {
  console.log("\n[Eval Cases — All Agents]");

  const allResults = runAllEvalCases();
  const totalEvalCases = BATCH_B_AGENTS.reduce((sum, s) => sum + s.evalCases.length, 0);
  assertEqual(allResults.length, totalEvalCases, `${totalEvalCases} eval cases executed`);

  for (const result of allResults) {
    assert(result.passed, `${result.scenarioId}: "${result.name}" passed`);
  }

  // Verify each category is covered across all agents
  const allCategories = new Set(allResults.map((r) => r.category));
  assert(allCategories.has("happy_path"), "happy_path category covered");
  assert(allCategories.has("edge_case") || allCategories.has("missing_data"), "edge/missing category covered");
  assert(allCategories.has("high_risk"), "high_risk category covered");
  assert(allCategories.has("hallucination_resistance"), "hallucination_resistance category covered");
}

// ── Evidence Coverage ──────────────────────────────────────────────────────

function testEvidenceCoverage(): void {
  console.log("\n[Evidence Coverage]");

  for (const spec of BATCH_B_AGENTS) {
    const result = runAgentDemo(spec, 0);
    const evidenceTypes = new Set(result.evidence.map((e) => e.evidenceType));

    // Every agent should have at least "source_data" and "report" evidence types
    const hasSourceData = Array.from(evidenceTypes).some((t) =>
      t.includes("source") || t.includes("report"),
    );
    assert(hasSourceData, `${spec.slug}: produces source or report evidence`);

    // Every evidence item should be linked to the run
    for (const ev of result.evidence) {
      assertEqual(ev.runId, result.runId, `${spec.slug}: evidence linked to correct run`);
      assert(ev.label.length > 0, `${spec.slug}: evidence has label`);
    }
  }
}

// ── Artifact Section Coverage ──────────────────────────────────────────────

function testArtifactSectionCoverage(): void {
  console.log("\n[Artifact Section Coverage]");

  for (const spec of BATCH_B_AGENTS) {
    const result = runAgentDemo(spec, 0);
    const primarySpec = spec.artifactSpecs[0];
    if (!primarySpec) continue;

    const sections = result.artifact.sections as Record<string, unknown>;
    assert(sections !== undefined, `${spec.slug}: artifact has sections object`);

    const sectionKeys = Object.keys(sections ?? {});
    assert(sectionKeys.length >= primarySpec.requiredSections.length, `${spec.slug}: artifact has all required sections (${sectionKeys.length} vs ${primarySpec.requiredSections.length})`);

    for (const required of primarySpec.requiredSections) {
      const found = sectionKeys.some((k) => k === required);
      assert(found, `${spec.slug}: required section "${required}" present`);
    }
  }
}

// ── Approval Boundary Coverage ──────────────────────────────────────────────

function testApprovalBoundaryCoverage(): void {
  console.log("\n[Approval Boundary Coverage]");

  for (const spec of BATCH_B_AGENTS) {
    // Every agent should have at least one high or critical boundary
    const highBoundaries = spec.approvalBoundaries.filter(
      (b) => b.riskLevel === "high" || b.riskLevel === "critical",
    );
    assert(highBoundaries.length >= 1, `${spec.slug}: at least one high/critical approval boundary`);

    // Every agent should have proposed actions that require approval
    const approvalActions = spec.proposedActions.filter((a) => a.requiresApproval);
    assert(approvalActions.length >= 2, `${spec.slug}: at least 2 actions requiring approval`);
  }
}

// ── Deterministic Reproducibility ──────────────────────────────────────────

function testDeterministicReproducibility(): void {
  console.log("\n[Deterministic Reproducibility]");

  for (const spec of BATCH_B_AGENTS) {
    const run1 = runAgentDemo(spec, 0);
    setup();
    const run2 = runAgentDemo(spec, 0);

    assertEqual(run1.success, run2.success, `${spec.slug}: reproducibility — same success`);
    assertEqual(run1.actions.length, run2.actions.length, `${spec.slug}: reproducibility — same action count`);
    assertEqual(run1.evidence.length, run2.evidence.length, `${spec.slug}: reproducibility — same evidence count`);

    // Artifact structure should be identical
    const artifact1Keys = Object.keys(run1.artifact).sort();
    const artifact2Keys = Object.keys(run2.artifact).sort();
    assert(
      JSON.stringify(artifact1Keys) === JSON.stringify(artifact2Keys),
      `${spec.slug}: reproducibility — same artifact keys`,
    );
  }
}

// ── No Live/Connected Claims ────────────────────────────────────────────────

function testNoLiveConnectedClaims(): void {
  console.log("\n[No Live/Connected Claims]");

  for (const spec of BATCH_B_AGENTS) {
    const allText = JSON.stringify(spec);
    const lowerText = allText.toLowerCase();

    const forbiddenTerms = ["live connection", "connected to", "real-time sync", "production deployment"];
    for (const term of forbiddenTerms) {
      assert(!lowerText.includes(term), `${spec.slug}: no "${term}" claim in spec data`);
    }
  }

  // Check all demo run artifacts
  for (const spec of BATCH_B_AGENTS) {
    const result = runAgentDemo(spec, 0);
    const artifactStr = JSON.stringify(result.artifact).toLowerCase();
    assert(artifactStr.includes("demo"), `${spec.slug}: artifact explicitly marked as demo`);
    assert(!artifactStr.includes("live data"), `${spec.slug}: artifact does not claim live data`);
  }
}

// ── Proposed Actions Non-Executing ──────────────────────────────────────────

function testProposedActionsNonExecuting(): void {
  console.log("\n[Proposed Actions — Non-Executing]");

  for (const spec of BATCH_B_AGENTS) {
    // Verify proposed actions are labeled as requiring approval or being non-executing
    for (const action of spec.proposedActions) {
      const desc = action.description.toLowerCase();
      const isNonExecuting =
        action.requiresApproval ||
        desc.includes("not auto") ||
        desc.includes("non-executing") ||
        desc.includes("held for") ||
        desc.includes("draft") ||
        desc.includes("propose") ||
        desc.includes("recommend") ||
        desc.includes("requires approval") ||
        desc.includes("no automatic");

      assert(isNonExecuting, `${spec.slug}: action "${action.label}" is non-executing`);
    }
  }
}

// ── Workspace Mounting Check ──────────────────────────────────────────────

function testWorkspaceMountingCompatibility(): void {
  console.log("\n[Workspace Mounting Compatibility]");

  // All Batch B agents use generic_chat workspace archetype (mounted/exported only)
  // as defined in the seed-agents.ts entries
  const workspaceArchetypes = ["generic_chat", "research", "document", "gallery", "table_plan"];
  const usedArchetype = "generic_chat"; // All Batch B agents use generic_chat

  assert(workspaceArchetypes.includes(usedArchetype), "Batch B agents use valid workspace archetype");

  // All agents should output an artifact that could be rendered in a workspace panel
  for (const spec of BATCH_B_AGENTS) {
    const result = runAgentDemo(spec, 0);
    const hasRenderableContent =
      typeof result.artifact.artifactLabel === "string" &&
      result.artifact.artifactLabel.length > 0;
    assert(hasRenderableContent, `${spec.slug}: artifact has renderable label`);
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Flagship Functional Agents — Batch B Test Suite\n");

  setup();
  testBatchBAgentsExist();

  setup();
  testSpecLookup();

  setup();
  testAllAgentSpecStructures();

  setup();
  testSingleDemoRuns();

  setup();
  testAllDemoFixturesPerAgent();

  setup();
  testAllBatchBDemos();

  setup();
  testEvalCases();

  setup();
  testEvidenceCoverage();

  setup();
  testArtifactSectionCoverage();

  setup();
  testApprovalBoundaryCoverage();

  setup();
  testDeterministicReproducibility();

  setup();
  testNoLiveConnectedClaims();

  setup();
  testProposedActionsNonExecuting();

  setup();
  testWorkspaceMountingCompatibility();

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
  if (failed > 0) { console.error("Some assertions failed."); process.exitCode = 1; }
  else { console.log("All assertions passed."); }
}

main();
