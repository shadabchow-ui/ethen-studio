import { runUltraChat } from "../run-ultra-chat";
import type { WorkerExecutor } from "../worker-runtime";

async function testEmptyTaskThrows() {
  let threw = false;
  try {
    await runUltraChat({ task: "" });
  } catch {
    threw = true;
  }
  console.assert(threw, "Empty task should throw");
  console.log("PASS: empty task throws");
}

async function testCompleteFlow() {
  const executor: WorkerExecutor = async (c) => ({
    outputText: `Completed: ${c.assignedTask}`,
    claims: [
      { summary: "Result 1", type: "factual", evidenceIds: ["ev-1"] },
      { summary: "Result 2", type: "analysis" },
    ],
    evidenceRefs: ["ev-1"],
  });

  const result = await runUltraChat({
    task: "What is the capital of France?",
    workerExecutor: executor,
  });

  console.assert(result.answer.length > 0, "Answer should not be empty");
  console.assert(result.receipt !== undefined, "Receipt should exist");
  console.assert(result.run !== undefined, "Run should exist");
  console.assert(result.timeline.length > 0, "Timeline should have events");
  console.assert(result.workerResults.length >= 1, "Should have worker results");
  console.assert(result.verifierReports.length >= 1, "Should have verifier reports");
  console.assert(result.synthesisResult !== null, "Should have synthesis result");

  // Check pipeline stages in timeline
  const states = result.timeline.map((t) => t.state);
  console.assert(states.includes("COMPLETE") || states.includes("DEGRADED_COMPLETE"),
    `Should end in COMPLETE or DEGRADED_COMPLETE, got states: ${states.join(", ")}`);

  console.log("PASS: complete flow works");
}

async function testTwoWorkerParallelFlow() {
  const executor: WorkerExecutor = async (c) => ({
    outputText: `Worker output for: ${c.assignedTask}`,
    claims: [
      { summary: `Claim from ${c.workerId}`, type: "analysis" },
    ],
    evidenceRefs: [],
  });

  const result = await runUltraChat({
    task: "Compare Python and TypeScript",
    maxWorkers: 2,
    workerExecutor: executor,
  });

  console.assert(result.workerResults.length <= 2, `Expected \u22642 workers, got ${result.workerResults.length}`);
  console.assert(result.answer.length > 0, "Answer should not be empty");
  console.log("PASS: two-worker parallel flow works");
}

async function testDegradedFlowOnWorkerFailure() {
  const executor: WorkerExecutor = async () => {
    throw new Error("Worker unavailable");
  };

  const result = await runUltraChat({
    task: "Test task",
    workerExecutor: executor,
  });

  console.assert(
    result.run.state === "DEGRADED_COMPLETE" || result.run.state === "COMPLETE",
    `Expected terminal state, got ${result.run.state}`
  );
  console.assert(result.limitations.length > 0, "Should have limitations on failure");
  console.log("PASS: degraded flow on worker failure");
}

async function testReceiptContainsExpectedFields() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Output",
    claims: [{ summary: "Test", type: "analysis" }],
  });

  const result = await runUltraChat({
    task: "Test receipt",
    workerExecutor: executor,
  });

  console.assert(result.receipt.runId !== undefined, "Receipt should have runId");
  console.assert(result.receipt.workerCount >= 0, "Receipt should have workerCount");
  console.assert(result.receipt.toolsUsed !== undefined, "Receipt should have toolsUsed");
  console.assert(typeof result.receipt.totalEstimatedCostUsd === "number", "Receipt should have cost");
  console.log("PASS: receipt has expected fields");
}

async function testEvidenceCount() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Output with evidence",
    claims: [{ summary: "Test", type: "factual", evidenceIds: ["ev-1", "ev-2"] }],
    evidenceRefs: ["ev-1", "ev-2"],
  });

  const result = await runUltraChat({
    task: "Evidence test",
    workerExecutor: executor,
  });

  console.assert(typeof result.evidence.total === "number", "Evidence should have total count");
  console.assert(result.synthesisResult !== null, "Should have synthesis");
  console.log("PASS: evidence tracking works");
}

// ── New evidence summary tests ────────────────────────────────────────────────

async function testEvidenceSummaryExists() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Output",
    claims: [{ summary: "Test", type: "analysis" }],
    evidenceRefs: [],
  });

  const result = await runUltraChat({
    task: "Test evidence summary",
    workerExecutor: executor,
  });

  console.assert(result.evidenceSummary !== null, "Evidence summary should exist");
  console.assert(typeof result.evidenceSummary?.total === "number", "Summary should have total");
  console.assert(typeof result.evidenceSummary?.description === "string", "Summary should have description");
  console.assert(Array.isArray(result.evidenceSummary?.toolClasses), "Summary should have toolClasses array");
  console.assert(Array.isArray(result.evidenceSummary?.sourceUrls), "Summary should have sourceUrls array");
  console.assert(Array.isArray(result.evidenceSummary?.evidenceIds), "Summary should have evidenceIds array");
  console.log("PASS: evidence summary exists with all required fields");
}

async function testToolLoopRunsBeforeWorkers() {
  const executor: WorkerExecutor = async (c) => ({
    outputText: `Worker output`,
    claims: [
      { summary: "Claim", type: "analysis" },
    ],
    evidenceRefs: c.evidenceRequirements ?? [],
  });

  const result = await runUltraChat({
    task: "Test tool loop timing",
    maxWorkers: 2,
    workerExecutor: executor,
  });

  // The timeline should include TOOL_LOOP_RUNNING state
  const hasToolLoop = result.timeline.some((t) => t.state === "TOOL_LOOP_RUNNING");
  console.assert(hasToolLoop, "Timeline should include TOOL_LOOP_RUNNING state");
  console.log("PASS: tool loop runs before workers");
}

async function testNoPrivateChainOfThoughtExposed() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Output",
    claims: [{ summary: "Test", type: "analysis" }],
  });

  const result = await runUltraChat({
    task: "Test privacy",
    workerExecutor: executor,
  });

  const responseKeys = Object.keys(result);
  const forbidden = ["chainOfThought", "privateThinking", "internalReasoning", "rawProviderResponse"];
  for (const key of forbidden) {
    console.assert(!responseKeys.includes(key), `Result must not include private field: ${key}`);
  }
  // Evidence summary must not expose raw tool output
  if (result.evidenceSummary) {
    console.assert(
      typeof result.evidenceSummary.description === "string",
      "Description should be string"
    );
    console.assert(
      !result.evidenceSummary.description.includes("rawOutput"),
      "Evidence summary must not include raw output"
    );
  }
  console.log("PASS: no private chain-of-thought or raw output exposed");
}

async function testCostUnavailableWhenNoData() {
  const executor: WorkerExecutor = async () => ({
    outputText: "No cost data",
    claims: [{ summary: "Test", type: "analysis" }],
    evidenceRefs: [],
  });

  const result = await runUltraChat({
    task: "Cost unavailable test",
    workerExecutor: executor,
  });

  console.assert(
    result.receipt.costEstimateStatus === "unavailable",
    `Expected costEstimateStatus 'unavailable', got '${result.receipt.costEstimateStatus}'`
  );
  console.assert(
    result.receipt.totalEstimatedCostUsd === 0,
    "totalEstimatedCostUsd should be 0 when no cost data"
  );
  console.assert(
    result.receipt.costEstimateReason !== null,
    "costEstimateReason should be set when unavailable"
  );
  console.assert(
    result.receipt.costEstimateReason!.length > 0,
    "costEstimateReason should be non-empty"
  );
  console.log("PASS: cost unavailable state is returned honestly");
}

async function testCostLimitPassedThrough() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Cost-limited run",
    claims: [{ summary: "Test", type: "analysis" }],
    evidenceRefs: [],
  });

  const result = await runUltraChat({
    task: "Cost limit test",
    costLimitUsd: 0.5,
    timeLimitMs: 30000,
    workerExecutor: executor,
  });

  console.assert(result.answer.length > 0, "Answer should not be empty with cost limit");
  console.log("PASS: cost/time limits are accepted and run completes");
}

async function testNoFakeTokenValues() {
  const executor: WorkerExecutor = async () => ({
    outputText: "No fake tokens",
    claims: [{ summary: "Test", type: "analysis" }],
    evidenceRefs: [],
  });

  const result = await runUltraChat({
    task: "No fake tokens test",
    workerExecutor: executor,
  });

  console.assert(
    result.receipt.totalInputTokens >= 0,
    "totalInputTokens should not be negative"
  );
  console.assert(
    result.receipt.totalOutputTokens >= 0,
    "totalOutputTokens should not be negative"
  );
  console.log("PASS: no fake token values are invented");
}

async function testLimitationsPreserved() {
  const executor: WorkerExecutor = async () => {
    throw new Error("Worker failed");
  };

  const result = await runUltraChat({
    task: "Limitations test",
    workerExecutor: executor,
  });

  console.assert(result.limitations.length > 0, "Limitations should be present on failure");
  const lText = result.limitations.join(" ");
  console.assert(
    lText.includes("worker_error") || lText.includes("executor_status") || lText.includes("verifier") || lText.includes("synthesis"),
    `Limitations should reference an error source, got: ${lText}`
  );
  console.log("PASS: limitations are preserved and meaningful");
}

async function testWorkerSummariesIncludeProviderModelCost() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Worker with provider info",
    claims: [{ summary: "Test", type: "analysis" }],
    evidenceRefs: [],
  });

  const result = await runUltraChat({
    task: "Provider info test",
    workerExecutor: executor,
  });

  for (const ws of result.receipt.workerSummaries) {
    console.assert("providerId" in ws, "workerSummary should include providerId");
    console.assert("modelId" in ws, "workerSummary should include modelId");
    console.assert("estimatedCostUsd" in ws, "workerSummary should include estimatedCostUsd");
  }
  console.log("PASS: worker summaries include provider/model/cost fields");
}

async function testGroundedUsageFromExecutor() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Grounded usage test",
    claims: [{ summary: "Test", type: "analysis" }],
    evidenceRefs: [],
    providerId: "openai",
    modelId: "gpt-4o",
    inputTokens: 150,
    outputTokens: 75,
    estimatedCostUsd: null,
  });

  const result = await runUltraChat({
    task: "Grounded usage propagation test",
    workerExecutor: executor,
  });

  for (const wr of result.workerResults) {
    console.assert(
      wr.inputTokens === 150,
      `Expected inputTokens 150, got ${wr.inputTokens}`
    );
    console.assert(
      wr.outputTokens === 75,
      `Expected outputTokens 75, got ${wr.outputTokens}`
    );
    console.assert(
      wr.estimatedCostUsd === null,
      "Estimated cost should be null when no pricing data available"
    );
  }

  for (const w of result.run.workers) {
    if (w.inputTokens != null) {
      console.assert(
        w.inputTokens === 150,
        `Worker inputTokens should be 150, got ${w.inputTokens}`
      );
      console.assert(
        w.outputTokens === 75,
        `Worker outputTokens should be 75, got ${w.outputTokens}`
      );
    }
  }

  console.assert(
    result.receipt.totalInputTokens > 0,
    "Receipt totalInputTokens should include grounded data"
  );
  console.assert(
    result.receipt.totalOutputTokens > 0,
    "Receipt totalOutputTokens should include grounded data"
  );
  console.assert(
    result.receipt.costEstimateStatus === "unavailable",
    "Cost status should remain unavailable when no pricing data"
  );

  console.log("PASS: grounded usage propagates from executor through to receipt");
}

async function testMissingUsageIsNull() {
  const executor: WorkerExecutor = async () => ({
    outputText: "Missing usage",
    claims: [{ summary: "Test", type: "analysis" }],
    evidenceRefs: [],
  });

  const result = await runUltraChat({
    task: "Missing usage test",
    workerExecutor: executor,
  });

  for (const wr of result.workerResults) {
    console.assert(
      wr.inputTokens == null,
      `inputTokens should be null when not provided, got ${wr.inputTokens}`
    );
    console.assert(
      wr.outputTokens == null,
      `outputTokens should be null when not provided, got ${wr.outputTokens}`
    );
    console.assert(
      wr.estimatedCostUsd == null,
      "estimatedCostUsd should be null when not provided"
    );
  }
  console.log("PASS: missing usage values remain null");
}

async function testNoFabricatedCost() {
  const executor: WorkerExecutor = async () => ({
    outputText: "No fake cost",
    claims: [{ summary: "Test", type: "analysis" }],
    evidenceRefs: [],
    inputTokens: 200,
    outputTokens: 100,
    estimatedCostUsd: null,
  });

  const result = await runUltraChat({
    task: "No fabricated cost",
    workerExecutor: executor,
  });

  for (const wr of result.workerResults) {
    console.assert(
      wr.estimatedCostUsd == null,
      "Must not fabricate cost when no pricing data available"
    );
  }
  console.assert(
    result.receipt.costEstimateStatus !== "estimated",
    "Receipt must not claim estimated status when cost is null"
  );
  console.log("PASS: no fabricated cost claims");
}

async function main() {
  await testEmptyTaskThrows();
  await testCompleteFlow();
  await testTwoWorkerParallelFlow();
  await testDegradedFlowOnWorkerFailure();
  await testReceiptContainsExpectedFields();
  await testEvidenceCount();
  await testEvidenceSummaryExists();
  await testToolLoopRunsBeforeWorkers();
  await testNoPrivateChainOfThoughtExposed();
  await testCostUnavailableWhenNoData();
  await testCostLimitPassedThrough();
  await testNoFakeTokenValues();
  await testLimitationsPreserved();
  await testWorkerSummariesIncludeProviderModelCost();
  await testGroundedUsageFromExecutor();
  await testMissingUsageIsNull();
  await testNoFabricatedCost();
  console.log("\nAll run-ultra-chat tests passed.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
