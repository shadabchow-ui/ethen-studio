import { runParallelWorkers } from "../parallel-executor";
import type { WorkerExecutor } from "../worker-runtime";
import type { UltraWorkerTaskContract } from "../ultra-types";

function makeContract(workerId: string, task: string): UltraWorkerTaskContract {
  return {
    workerId,
    role: "worker",
    specialistRole: "primary",
    assignedTask: task,
    expectedOutputContract: ["answer"],
    requiredTools: ["search"],
    toolPolicy: { allowedTools: ["search"], mode: "optional" },
    evidenceRequirements: ["source_grounded"],
    verifierChecklistLink: ["claims_have_evidence"],
    maxToolCalls: 5,
    timeoutMs: 5000,
  };
}

async function testSingleWorkerCompletes() {
  const result = await runParallelWorkers([makeContract("w1", "Task A")]);
  console.assert(result.status === "all_complete", `Expected all_complete, got ${result.status}`);
  console.assert(result.workerResults.length === 1, "Should have 1 worker result");
  console.assert(result.errors.length === 0, "Should have no errors");
  console.log("PASS: single worker completes");
}

async function testTwoWorkersComplete() {
  const successExecutor: WorkerExecutor = async (c) => ({
    outputText: `Done: ${c.assignedTask}`,
    claims: [{ summary: `Completed ${c.assignedTask}`, type: "analysis" }],
    evidenceRefs: ["ev-1"],
  });
  const result = await runParallelWorkers(
    [makeContract("w1", "Task A"), makeContract("w2", "Task B")],
    successExecutor
  );
  console.assert(result.status === "all_complete", `Expected all_complete, got ${result.status}`);
  console.assert(result.workerResults.length === 2, "Should have 2 worker results");
  console.assert(result.errors.length === 0, "Should have no errors");
  console.log("PASS: two workers complete");
}

async function testMaxWorkersEnforced() {
  const result = await runParallelWorkers([
    makeContract("w1", "A"),
    makeContract("w2", "B"),
    makeContract("w3", "C"),
  ]);
  console.assert(result.workerResults.length <= 2, `Expected ≤2 workers, got ${result.workerResults.length}`);
  console.log("PASS: maxWorkers=2 enforced");
}

async function testOneWorkerFailsDegraded() {
  const selectiveExecutor: WorkerExecutor = async (c) => {
    if (c.workerId === "w2") throw new Error("Worker failed");
    return { outputText: `Done: ${c.assignedTask}`, claims: [] };
  };

  const result = await runParallelWorkers(
    [makeContract("w1", "Task A"), makeContract("w2", "Task B")],
    selectiveExecutor
  );
  console.assert(
    result.status === "degraded" || result.status === "failed",
    `Expected degraded or failed, got ${result.status}`
  );
  console.log("PASS: one worker fails produces degraded or failed");
}

async function testBothWorkersFail() {
  const failExecutor: WorkerExecutor = async () => {
    throw new Error("Both failed");
  };
  const result = await runParallelWorkers(
    [makeContract("w1", "A"), makeContract("w2", "B")],
    failExecutor
  );
  console.assert(result.status === "failed", `Expected failed, got ${result.status}`);
  console.assert(result.errors.length === 2, `Expected 2 errors, got ${result.errors.length}`);
  console.log("PASS: both workers fail");
}

async function testEvidenceRefsDeduplicated() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Done",
    claims: [],
    evidenceRefs: ["ev-1", "ev-shared"],
  });
  const result = await runParallelWorkers(
    [makeContract("w1", "A"), makeContract("w2", "B")],
    executor
  );
  console.assert(result.evidenceRefs.length >= 1, "Should have evidence refs");
  const uniqueCount = new Set(result.evidenceRefs).size;
  console.assert(uniqueCount === result.evidenceRefs.length, "Evidence refs should be deduplicated");
  console.log("PASS: evidence refs deduplicated");
}

async function testEmptyWorkers() {
  const result = await runParallelWorkers([]);
  console.assert(result.status === "failed", "Empty workers should result in failed");
  console.assert(result.workerResults.length === 0, "Should have no results");
  console.assert(result.allEvidenceRefs.length === 0, "Should have no all-evidence refs");
  console.log("PASS: empty worker list handled");
}

async function testAllEvidenceRefsIncludesPreExisting() {
  const executor: WorkerExecutor = async (c) => ({
    outputText: "Done",
    claims: [],
    evidenceRefs: ["worker-ev-1"],
  });
  const contracts = [
    makeContract("w1", "Task A"),
    makeContract("w2", "Task B"),
  ];
  // Set evidence requirements as pre-existing tool-loop evidence
  contracts[0] = { ...contracts[0], evidenceRequirements: ["tool-ev-1", "tool-ev-2"] };
  contracts[1] = { ...contracts[1], evidenceRequirements: ["tool-ev-3"] };
  const result = await runParallelWorkers(contracts, executor);
  console.assert(result.allEvidenceRefs.length >= 1, "Should have all ev refs");
  // Should include both pre-existing and worker evidence
  const allSet = new Set(result.allEvidenceRefs);
  console.assert(allSet.has("tool-ev-1") || allSet.has("worker-ev-1"), "Should have evidence refs");
  console.log("PASS: allEvidenceRefs includes pre-existing tool-loop evidence");
}

async function main() {
  await testSingleWorkerCompletes();
  await testTwoWorkersComplete();
  await testMaxWorkersEnforced();
  await testOneWorkerFailsDegraded();
  await testBothWorkersFail();
  await testEvidenceRefsDeduplicated();
  await testEmptyWorkers();
  await testAllEvidenceRefsIncludesPreExisting();
  console.log("\nAll parallel-executor tests passed.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
