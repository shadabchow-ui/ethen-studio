import { assembleTeam } from "../team-assembler";
import { planUltraTask } from "../ultra-planner";
import type { UltraPlan } from "../ultra-types";

function testAssembleSingleVerified() {
  const plan = planUltraTask({ task: "Simple task" });
  const team = assembleTeam(plan);
  const roles = team.members.map((m) => m.role);
  console.assert(roles.includes("planner"), "Should include planner");
  console.assert(roles.includes("worker"), "Should include worker");
  console.assert(roles.includes("tool_executor"), "Should include tool executor");
  console.assert(roles.includes("verifier"), "Should include verifier");
  console.assert(roles.includes("synthesizer"), "Should include synthesizer");
  console.assert(team.maxWorkers <= 2, "maxWorkers should be ≤2");
  console.assert(team.assemblyId.startsWith("asm-"), "assemblyId should start with asm-");
  console.log("PASS: single_verified team assembled correctly");
}

function testAssemblePrimaryAndCritic() {
  const plan = planUltraTask({ task: "Compare Python vs TypeScript" });
  const team = assembleTeam(plan);
  const workers = team.members.filter((m) => m.role === "worker");
  console.assert(workers.length === 2, `Expected 2 workers, got ${workers.length}`);
  console.assert(workers.every((worker) => worker.workerContract !== undefined), "Assembled workers should retain their contracts");
  console.assert(workers[0].assignedTasks[0] !== workers[1].assignedTasks[0], "Assembled worker assignments should be distinct");
  console.log("PASS: primary-and-critic team retains distinct contracts");
}

function testAssembleToolHeavy() {
  const plan = planUltraTask({ task: "Use tools to gather files for incident review" });
  const team = assembleTeam(plan);
  const worker = team.members.find((m) => m.role === "worker");
  console.assert(worker !== undefined, "Should have a worker");
  if (worker) {
    console.assert(worker.toolScope.length >= 2, `Tool scope should be expanded, got ${worker.toolScope.length}`);
  }
  console.log("PASS: tool_heavy worker has expanded tool scope");
}

function testEnforcesMaxWorkers() {
  const plan: UltraPlan = {
    ...planUltraTask({ task: "Test" }),
    maxWorkers: 2,
  };
  const team = assembleTeam(plan);
  console.assert(team.maxWorkers <= 2, "maxWorkers should be ≤2");
  console.log("PASS: maxWorkers enforced");
}

function testCostControllerPresent() {
  const plan = planUltraTask({ task: "Test" });
  const team = assembleTeam(plan);
  console.assert(team.costController !== undefined, "Should have cost controller");
  console.assert(team.costController.role === "coordinator", "Cost controller should be coordinator role");
  console.log("PASS: cost controller present");
}

function testEmptyPlanThrows() {
  let threw = false;
  try {
    assembleTeam({ workers: [], maxWorkers: 0 } as unknown as UltraPlan);
  } catch {
    threw = true;
  }
  console.assert(threw, "Empty worker list should throw");
  console.log("PASS: empty worker list throws");
}

testAssembleSingleVerified();
testAssemblePrimaryAndCritic();
testAssembleToolHeavy();
testEnforcesMaxWorkers();
testCostControllerPresent();
testEmptyPlanThrows();
console.log("\nAll team-assembler tests passed.");
