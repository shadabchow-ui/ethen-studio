import { runWorker } from "../worker-runtime";
import type { WorkerExecutor } from "../worker-runtime";
import type { UltraWorkerTaskContract } from "../ultra-types";

function makeContract(overrides: Partial<UltraWorkerTaskContract> = {}): UltraWorkerTaskContract {
  return {
    workerId: "w-test-1",
    role: "worker",
    specialistRole: "primary",
    assignedTask: "Test task",
    expectedOutputContract: ["answer"],
    requiredTools: ["search"],
    toolPolicy: { allowedTools: ["search"], mode: "optional" },
    evidenceRequirements: ["source_grounded"],
    verifierChecklistLink: ["claims_have_evidence"],
    maxToolCalls: 5,
    timeoutMs: 5000,
    ...overrides,
  };
}

async function testDefaultExecutorCompletes() {
  const contract = makeContract();
  const result = await runWorker(contract);
  console.assert(result.status === "complete", `Expected complete, got ${result.status}`);
  console.assert(result.workerResult.workerId === "w-test-1", "Worker ID should match");
  console.assert(result.workerResult.outputText.length > 0, "Output should not be empty");
  console.assert(result.workerResult.claims.length >= 1, "Should have at least 1 claim");
  console.assert(result.errors.length === 0, "Should have no errors");
  console.log("PASS: default executor completes successfully");
}

async function testInjectedExecutor() {
  const customExecutor: WorkerExecutor = async () => ({
    outputText: "Custom output",
    claims: [
      { summary: "Claim A", type: "factual", evidenceIds: ["ev-1"] },
      { summary: "Claim B", type: "analysis" },
    ],
    evidenceRefs: ["ev-1", "ev-2"],
  });
  const result = await runWorker(makeContract(), customExecutor);
  console.assert(result.status === "complete", "Should complete");
  console.assert(result.workerResult.claims.length === 2, "Should have 2 claims");
  console.assert(result.workerResult.claims[0].evidenceIds?.includes("ev-1"), "Claim should reference evidence");
  console.assert(result.evidenceRefs.length === 2, "Should have 2 evidence refs");
  console.log("PASS: injected executor works");
}

async function testPartialWithUncertainties() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Partial output",
    claims: [{ summary: "Uncertain claim", type: "analysis" }],
    uncertainties: ["Some data may be outdated"],
  });
  const result = await runWorker(makeContract(), executor);
  console.assert(result.status === "partial", `Expected partial, got ${result.status}`);
  console.log("PASS: uncertainties produce partial status");
}

async function testFailedWorker() {
  const executor: WorkerExecutor = async () => {
    throw new Error("Simulated failure");
  };
  const result = await runWorker(makeContract(), executor);
  console.assert(result.status === "failed", `Expected failed, got ${result.status}`);
  console.assert(result.errors.length === 1, "Should have 1 error");
  console.assert(result.workerResult.outputText === "", "Output should be empty on failure");
  console.log("PASS: worker failure handled");
}

async function testTimedOutWorker() {
  const executor: WorkerExecutor = async () => {
    return new Promise((resolve) => setTimeout(() => resolve({
      outputText: "Too late",
      claims: [],
    }), 100));
  };
  const result = await runWorker(makeContract({ timeoutMs: 10 }), executor);
  console.assert(result.status === "timed_out", `Expected timed_out, got ${result.status}`);
  console.log("PASS: worker timeout detected");
}

async function testPreExistingEvidenceRefs() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Output",
    claims: [{ summary: "Claim", type: "analysis" }],
  });
  const contract = makeContract({ evidenceRequirements: ["tool-ev-1", "tool-ev-2"] });
  const result = await runWorker(contract, executor);
  console.assert(result.preExistingEvidenceRefs.length === 2, `Expected 2 pre-existing refs, got ${result.preExistingEvidenceRefs.length}`);
  console.assert(result.preExistingEvidenceRefs.includes("tool-ev-1"), "Should include tool-ev-1");
  console.assert(result.preExistingEvidenceRefs.includes("tool-ev-2"), "Should include tool-ev-2");
  console.log("PASS: pre-existing evidence refs from contract");
}

async function testPreExistingRefsOnFailure() {
  const executor: WorkerExecutor = async () => {
    throw new Error("fail");
  };
  const contract = makeContract({ evidenceRequirements: ["tool-ev-1"] });
  const result = await runWorker(contract, executor);
  console.assert(result.status === "failed", "Should be failed");
  console.assert(result.preExistingEvidenceRefs.length === 1, "Pre-existing refs preserved on failure");
  console.log("PASS: pre-existing evidence refs preserved on failure");
}

async function main() {
  await testDefaultExecutorCompletes();
  await testInjectedExecutor();
  await testPartialWithUncertainties();
  await testFailedWorker();
  await testTimedOutWorker();
  await testPreExistingEvidenceRefs();
  await testPreExistingRefsOnFailure();
  console.log("\nAll worker-runtime tests passed.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
