import { createInitialWorkflowAutomationState } from "../fixture";
import {
  analyzeProcessWorkflow,
  mapProcessSteps,
  identifyBottlenecks,
  designAutomationFlow,
  configureApprovalGates,
  generateDeploymentPlan,
} from "../actions";
import type { WorkflowAutomationState } from "../state";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label}`); }
}

function makeState(): WorkflowAutomationState {
  return createInitialWorkflowAutomationState();
}

function testFixtureIntegrity(): void {
  console.log("\n[Fixture Integrity]");
  const state = makeState();
  assert(state.flows.length >= 2, `fixture has at least 2 flows (got ${state.flows.length})`);
  assert(state.flows.some((f) => f.steps.length >= 4), "flows have at least 4 steps");
  assert(state.flows.some((f) => f.approvalGates.length > 0), "flows have approval gates");
  assert(state.bottlenecks.length >= 2, "has bottlenecks");
  assert(state.artifacts.length === 0, "no artifacts initially");
}

function testAnalyzeProcessWorkflow(): void {
  console.log("\n[analyzeProcessWorkflow]");
  const state = makeState();
  const flow = state.flows[0];
  const result = analyzeProcessWorkflow(state, flow.id);
  assert(result.event.action === "analyze_process_workflow", "event action is correct");
  assert(result.event.summary.includes(flow.name), "summary mentions flow name");
  assert(result.state.activityLog.length === 1, "one event logged");
}

function testAnalyzeProcessWorkflowNotFound(): void {
  console.log("\n[analyzeProcessWorkflow — not found]");
  const state = makeState();
  const result = analyzeProcessWorkflow(state, "nonexistent");
  assert(result.event.summary.includes("not found"), "reports not found");
}

function testMapProcessSteps(): void {
  console.log("\n[mapProcessSteps]");
  const state = makeState();
  const flow = state.flows[0];
  const result = mapProcessSteps(state, flow.id);
  assert(result.artifact.type === "plan", "artifact type is plan");
  assert(result.artifact.content.includes(flow.name), "content includes flow name");
  assert(result.artifact.content.includes("Step Sequence"), "content includes step sequence");
  assert(result.state.artifacts.length === 1, "one artifact created");
}

function testIdentifyBottlenecks(): void {
  console.log("\n[identifyBottlenecks]");
  const state = makeState();
  const flow = state.flows[0];
  const result = identifyBottlenecks(state, flow.id);
  assert(result.artifact.type === "report", "artifact type is report");
  assert(result.artifact.content.includes("Bottleneck Analysis"), "content includes header");
  assert(result.artifact.content.includes("Manual Touchpoints"), "content lists manual touchpoints");
}

function testDesignAutomationFlow(): void {
  console.log("\n[designAutomationFlow]");
  const state = makeState();
  const flow = state.flows[0];
  const result = designAutomationFlow(state, flow.id);
  assert(result.artifact.type === "plan", "artifact type is plan");
  assert(result.artifact.content.includes("Automation Flow Design"), "content includes design header");
  assert(result.artifact.content.includes("Automation Recommendations"), "content has recommendations");
}

function testConfigureApprovalGates(): void {
  console.log("\n[configureApprovalGates]");
  const state = makeState();
  const flow = state.flows[0];
  const result = configureApprovalGates(state, flow.id);
  assert(result.artifact.type === "recommendation", "artifact type is recommendation");
  assert(result.artifact.content.includes("Approval Gate Configuration"), "content includes config header");
  assert(result.artifact.content.length > 20, "artifact has meaningful content");
}

function testGenerateDeploymentPlan(): void {
  console.log("\n[generateDeploymentPlan]");
  const state = makeState();
  const flow = state.flows[0];
  const result = generateDeploymentPlan(state, flow.id);
  assert(result.artifact.type === "plan", "artifact type is plan");
  assert(result.artifact.content.includes("Deployment Plan"), "content includes plan header");
  assert(result.artifact.content.includes("Phase 1"), "includes phase information");
}

function testGenerateDeploymentPlanNotFound(): void {
  console.log("\n[generateDeploymentPlan — not found]");
  const state = makeState();
  const result = generateDeploymentPlan(state, "nonexistent");
  assert(result.event.summary.includes("not found"), "reports not found");
}

function testReceiptQuality(): void {
  console.log("\n[Receipt Quality]");
  const state = makeState();
  const flow = state.flows[0];
  const r1 = analyzeProcessWorkflow(state, flow.id);
  assert(!r1.event.summary.includes("[object"), "receipt is not raw JSON");
  assert(r1.event.summary.startsWith("Analyzed"), "receipt starts clearly");
}

function runAll(): void {
  passed = 0; failed = 0;
  testFixtureIntegrity();
  testAnalyzeProcessWorkflow();
  testAnalyzeProcessWorkflowNotFound();
  testMapProcessSteps();
  testIdentifyBottlenecks();
  testDesignAutomationFlow();
  testConfigureApprovalGates();
  testGenerateDeploymentPlan();
  testGenerateDeploymentPlanNotFound();
  testReceiptQuality();
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

runAll();
