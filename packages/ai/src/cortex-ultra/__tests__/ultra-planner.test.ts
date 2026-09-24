import { planUltraTask } from "../ultra-planner";

function testEmptyTaskThrows() {
  let threw = false;
  try {
    planUltraTask({ task: "" });
  } catch {
    threw = true;
  }
  console.assert(threw, "Empty task should throw");
  console.log("PASS: empty task throws");
}

function testSingleVerifiedForSimpleTask() {
  const plan = planUltraTask({ task: "What is the weather?" });
  console.assert(plan.topology === "single_verified", `Expected single_verified, got ${plan.topology}`);
  console.assert(plan.workers.length === 1, "Should have 1 worker");
  console.assert(plan.maxWorkers <= 2, "maxWorkers should be ≤2");
  console.log("PASS: simple task selects single_verified");
}

function testPrimaryAndCriticForComparison() {
  const plan = planUltraTask({ task: "Compare Python vs TypeScript" });
  console.assert(plan.topology === "parallel_primary_and_critic", `Expected parallel_primary_and_critic, got ${plan.topology}`);
  console.assert(plan.workers.length === 2, "Should have 2 workers");
  console.assert(plan.workers[0].specialistRole === "primary", "First worker should be primary");
  console.assert(plan.workers[1].specialistRole === "critic", "Second worker should be critic");
  console.assert(plan.workers[0].assignedTask !== plan.workers[1].assignedTask, "Parallel assignments must be semantically distinct");
  console.log("PASS: comparison task selects primary-and-critic contracts");
}

function testResearchAndAnalysisForResearch() {
  const plan = planUltraTask({ task: "Research the best databases" });
  console.assert(plan.topology === "research_and_analysis", `Expected research_and_analysis, got ${plan.topology}`);
  console.assert(plan.workers.length === 2, "Research and analysis should use two complementary workers");
  console.assert(plan.workers.map((worker) => worker.specialistRole).join(",") === "researcher,analyst", "Research topology should assign researcher and analyst roles");
  console.log("PASS: research task selects research-and-analysis contracts");
}

function testToolHeavySingleWorker() {
  const plan = planUltraTask({ task: "Use tools to gather files for the incident review" });
  console.assert(plan.topology === "tool_heavy_single_worker", `Expected tool_heavy_single_worker, got ${plan.topology}`);
  console.assert(plan.workers.length === 1, "Tool-heavy topology must have one worker");
  console.assert(plan.workers[0].specialistRole === "tool_specialist", "Tool-heavy worker should be a tool specialist");
  console.assert(plan.workers[0].maxToolCalls === 8, "Tool-heavy worker should have bounded expanded tool calls");
  console.log("PASS: tool-heavy task selects one bounded tool-specialist contract");
}

function testPlanHasRequiredFields() {
  const plan = planUltraTask({ task: "Explain monads" });
  console.assert(plan.planId.startsWith("plan-"), "planId should start with plan-");
  console.assert(plan.taskSummary === "Explain monads", "taskSummary should match");
  console.assert(plan.topology !== undefined, "topology should be set");
  console.assert(plan.workers.length >= 1, "should have at least 1 worker");
  console.assert(plan.toolRequirements.length >= 1, "should have tool requirements");
  console.assert(plan.verifierChecklist.length >= 1, "should have verifier checklist");
  console.assert(plan.userVisibleSummary.length > 0, "should have user-visible summary");
  console.assert(plan.costLimitUsd > 0, "cost limit should be positive");
  console.assert(plan.timeLimitMs > 0, "time limit should be positive");
  console.assert(plan.maxWorkers <= 2, "maxWorkers should be ≤2");
  console.log("PASS: plan has all required fields");
}

function testMaxWorkersEnforced() {
  const plan = planUltraTask({ task: "Compare A and B", maxWorkers: 5 });
  console.assert(plan.maxWorkers <= 2, "maxWorkers should be capped at 2");
  console.assert(plan.workers.length <= 2, "worker count should be ≤2");
  console.log("PASS: maxWorkers capped at 2");
}

function testCustomLimits() {
  const plan = planUltraTask({ task: "Simple task", costLimitUsd: 5.0, timeLimitMs: 30_000 });
  console.assert(plan.costLimitUsd === 5.0, `Expected 5.0, got ${plan.costLimitUsd}`);
  console.assert(plan.timeLimitMs === 30_000, `Expected 30000, got ${plan.timeLimitMs}`);
  console.log("PASS: custom limits respected");
}

function testConstraintPropagation() {
  const plan = planUltraTask({
    task: "Research new privacy requirements",
    availableTools: ["retrieval"],
    timeLimitMs: 12_000,
    maxWorkers: 99,
  });
  console.assert(plan.maxWorkers === 2, "maxWorkers should be capped at two");
  console.assert(plan.timeLimitMs === 12_000, "Plan timeout should propagate");
  console.assert(plan.workers.every((worker) => worker.timeoutMs === 12_000), "Worker timeouts should propagate");
  console.assert(plan.workers.every((worker) => worker.requiredTools.every((tool) => tool === "retrieval")), "Contracts must not claim unavailable tools");
  console.assert(plan.workers.every((worker) => worker.verifierChecklistLink.length === plan.verifierChecklist.length), "Every contract should link to the plan verifier checklist");
  console.log("PASS: constraints propagate to bounded worker contracts");
}

function testPlannerOutputIsStable() {
  const first = planUltraTask({ task: "Compare A and B" });
  const second = planUltraTask({ task: "Compare A and B" });
  console.assert(first.planId === second.planId, "Planner ID should be stable for the same topology");
  console.assert(JSON.stringify(first.workers) === JSON.stringify(second.workers), "Planner worker contracts should be stable");
  console.log("PASS: planner decisions and contracts are deterministic");
}

testEmptyTaskThrows();
testSingleVerifiedForSimpleTask();
testPrimaryAndCriticForComparison();
testResearchAndAnalysisForResearch();
testToolHeavySingleWorker();
testPlanHasRequiredFields();
testMaxWorkersEnforced();
testCustomLimits();
testConstraintPropagation();
testPlannerOutputIsStable();
console.log("\nAll ultra-planner tests passed.");
