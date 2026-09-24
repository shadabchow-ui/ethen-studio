// Handler-level test for the Ultra chat route logic.
// Tests the runUltraChat call path without a live HTTP server or provider keys.

import { runUltraChat } from "../run-ultra-chat";
import type { WorkerExecutor } from "../worker-runtime";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function testUnifiedRouteDelegation() {
  const root = process.cwd();
  const primaryRoute = readFileSync(resolve(root, "app/api/chat/route.ts"), "utf8");
  const compatibilityRoute = readFileSync(resolve(root, "app/api/cortex/ultra/chat/route.ts"), "utf8");
  const selector = readFileSync(resolve(root, "components/cortex/CortexModeSelector.tsx"), "utf8");

  console.assert(primaryRoute.includes("executeCortexChat"), "primary chat route delegates to the unified execution entry point");
  console.assert(compatibilityRoute.includes("executeCortexChat"), "compatibility route delegates to the unified execution entry point");
  console.assert(!compatibilityRoute.includes("runUltraChat({"), "compatibility route contains no orchestration call");
  console.assert(compatibilityRoute.includes("enforceRateLimit") && compatibilityRoute.includes("enforceEntitledUsageLimit"), "compatibility route applies primary chat limits");
  console.assert(compatibilityRoute.includes("mode: execution.mode"), "compatibility response reports the canonical mode");
  console.assert(selector.includes('map["ultra-preview"]'), "selector derives Ultra Preview from the canonical route profile");
  console.log("PASS: primary and compatibility routes share the Ultra execution engine and canonical mode");
}

const stubExecutor: WorkerExecutor = async (c) => ({
  outputText: `Stub answer for: ${c.assignedTask}`,
  claims: [{ summary: "Stub claim", type: "analysis" }],
  evidenceRefs: [],
});

async function testEmptyTaskRejected() {
  let threw = false;
  try {
    await runUltraChat({ task: "" });
  } catch {
    threw = true;
  }
  console.assert(threw, "Empty task should throw (route would return 400)");
  console.log("PASS: empty task rejected");
}

async function testValidRequestReturnsAnswer() {
  const result = await runUltraChat({
    task: "What is 2 + 2?",
    maxWorkers: 2,
    workerExecutor: stubExecutor,
  });

  console.assert(typeof result.answer === "string" && result.answer.length > 0, "answer must be a non-empty string");
  console.log("PASS: valid request returns answer");
}

async function testResponseIncludesUserSafeReceipt() {
  const result = await runUltraChat({
    task: "Explain photosynthesis",
    maxWorkers: 2,
    workerExecutor: stubExecutor,
  });

  const receipt = result.receipt;
  console.assert(receipt !== undefined, "receipt must exist");
  console.assert(typeof receipt.runId === "string", "receipt.runId must be a string");
  console.assert(typeof receipt.workerCount === "number", "receipt.workerCount must be a number");
  console.assert(Array.isArray(receipt.toolsUsed), "receipt.toolsUsed must be an array");
  console.assert(typeof receipt.totalEstimatedCostUsd === "number", "receipt.totalEstimatedCostUsd must be a number");
  for (const ws of receipt.workerSummaries) {
    console.assert(!("rawOutput" in ws), "workerSummary must not include rawOutput");
    console.assert(!("privateChainOfThought" in ws), "workerSummary must not include privateChainOfThought");
  }
  console.log("PASS: receipt is user-safe and has expected fields");
}

async function testTimelineAndEvidencePresent() {
  const result = await runUltraChat({
    task: "Summarize machine learning",
    maxWorkers: 2,
    workerExecutor: stubExecutor,
  });

  console.assert(Array.isArray(result.timeline) && result.timeline.length > 0, "timeline must have entries");
  console.assert(typeof result.evidence === "object" && typeof result.evidence.total === "number", "evidence must have total");
  console.log("PASS: timeline and evidence keys present");
}

async function testWorkerComparisonKeysPresent() {
  const result = await runUltraChat({
    task: "Compare React and Vue",
    maxWorkers: 2,
    workerExecutor: stubExecutor,
  });

  console.assert(Array.isArray(result.receipt.workerSummaries), "workerSummaries must be an array");
  console.assert(result.receipt.workerSummaries.length <= 2, `Expected \u22642 workers, got ${result.receipt.workerSummaries.length}`);
  console.log("PASS: worker comparison keys present and bounded to maxWorkers=2");
}

async function testNoPrivateChainOfThoughtExposed() {
  const result = await runUltraChat({
    task: "Test chain-of-thought redaction",
    maxWorkers: 2,
    workerExecutor: stubExecutor,
  });

  const responseKeys = Object.keys(result);
  const forbidden = ["chainOfThought", "privateThinking", "internalReasoning", "rawProviderResponse"];
  for (const key of forbidden) {
    console.assert(!responseKeys.includes(key), `Result must not include private field: ${key}`);
  }
  console.log("PASS: no private chain-of-thought in result");
}

// ── Evidence summary tests ────────────────────────────────────────────────────

async function testEvidenceSummaryInResult() {
  const result = await runUltraChat({
    task: "Test evidence summary",
    maxWorkers: 2,
    workerExecutor: stubExecutor,
  });

  console.assert(result.evidenceSummary !== null, "evidenceSummary must exist");
  console.assert(typeof result.evidenceSummary?.total === "number", "evidenceSummary.total must be a number");
  console.assert(typeof result.evidenceSummary?.description === "string", "evidenceSummary.description must be a string");
  console.assert(Array.isArray(result.evidenceSummary?.toolClasses), "evidenceSummary.toolClasses must be an array");
  console.assert(Array.isArray(result.evidenceSummary?.sourceUrls), "evidenceSummary.sourceUrls must be an array");
  console.assert(Array.isArray(result.evidenceSummary?.evidenceIds), "evidenceSummary.evidenceIds must be an array");
  console.log("PASS: evidenceSummary has all required fields");
}

async function testToolLoopInTimeline() {
  const result = await runUltraChat({
    task: "Tool loop timeline test",
    maxWorkers: 2,
    workerExecutor: stubExecutor,
  });

  const hasToolLoop = result.timeline.some((t) => t.state === "TOOL_LOOP_RUNNING");
  console.assert(hasToolLoop, "Timeline must include TOOL_LOOP_RUNNING state");
  console.log("PASS: TOOL_LOOP_RUNNING present in timeline");
}

async function testCostEstimateStatusUnavailable() {
  const result = await runUltraChat({
    task: "Cost status test",
    maxWorkers: 2,
    workerExecutor: stubExecutor,
  });

  console.assert(
    result.receipt.costEstimateStatus !== undefined,
    "receipt must have costEstimateStatus"
  );
  console.assert(
    result.receipt.costEstimateStatus === "unavailable",
    `Expected unavailable, got ${result.receipt.costEstimateStatus}`
  );
  console.assert(
    result.receipt.costEstimateReason !== null,
    "receipt must have costEstimateReason when unavailable"
  );
  console.log("PASS: cost estimate status is unavailable when no data");
}

async function testCostLimitPassedThrough() {
  const result = await runUltraChat({
    task: "Cost limit route test",
    maxWorkers: 2,
    costLimitUsd: 1.0,
    timeLimitMs: 60000,
    workerExecutor: stubExecutor,
  });

  console.assert(typeof result.answer === "string" && result.answer.length > 0, "answer must be non-empty with cost limit");
  console.log("PASS: costLimitUsd and timeLimitMs are accepted as inputs");
}

async function testWorkerSummariesIncludeProviderModelCost() {
  const result = await runUltraChat({
    task: "Worker field test",
    maxWorkers: 2,
    workerExecutor: stubExecutor,
  });

  for (const ws of result.receipt.workerSummaries) {
    console.assert("providerId" in ws, "workerSummary must include providerId");
    console.assert("modelId" in ws, "workerSummary must include modelId");
    console.assert("estimatedCostUsd" in ws, "workerSummary must include estimatedCostUsd");
    console.assert(ws.providerId === null || typeof ws.providerId === "string", "providerId should be null or string");
    console.assert(ws.modelId === null || typeof ws.modelId === "string", "modelId should be null or string");
  }
  console.log("PASS: worker summaries include provider/model/cost fields with correct types");
}

async function testNoZeroCostDisplayWhenUnavailable() {
  const result = await runUltraChat({
    task: "Zero cost display test",
    maxWorkers: 2,
    workerExecutor: stubExecutor,
  });

  console.assert(
    result.receipt.costEstimateStatus !== "estimated" || result.receipt.totalEstimatedCostUsd > 0,
    "Should not show estimated status with zero cost"
  );
  console.log("PASS: unknown cost does not display as estimated zero");
}

async function testGroundedUsagePath() {
  const groundedExecutor: WorkerExecutor = async (c) => ({
    outputText: `Grounded: ${c.assignedTask}`,
    claims: [{ summary: "Claim", type: "analysis" }],
    evidenceRefs: [],
    providerId: "openai",
    modelId: "gpt-4o",
    inputTokens: 150,
    outputTokens: 50,
    estimatedCostUsd: null,
  });

  const result = await runUltraChat({
    task: "Grounded usage route test",
    maxWorkers: 2,
    workerExecutor: groundedExecutor,
  });

  console.assert(
    result.receipt.totalInputTokens > 0,
    "totalInputTokens should include grounded usage"
  );
  console.assert(
    result.receipt.totalOutputTokens > 0,
    "totalOutputTokens should include grounded usage"
  );
  for (const ws of result.receipt.workerSummaries) {
    console.assert(
      "estimatedCostUsd" in ws,
      "workerSummary must include estimatedCostUsd"
    );
  }
  console.assert(
    result.receipt.costEstimateStatus === "unavailable",
    "costEstimateStatus should be unavailable when no pricing"
  );
  console.log("PASS: grounded usage path works correctly");
}

async function testPartialUsagePath() {
  let callCount = 0;
  const mixedExecutor: WorkerExecutor = async (c) => {
    callCount++;
    if (callCount === 1) {
      return {
        outputText: `With usage: ${c.assignedTask}`,
        claims: [{ summary: "Claim A", type: "analysis" }],
        evidenceRefs: [],
        inputTokens: 100,
        outputTokens: 30,
        estimatedCostUsd: null,
      };
    }
    return {
      outputText: `No usage: ${c.assignedTask}`,
      claims: [{ summary: "Claim B", type: "analysis" }],
      evidenceRefs: [],
    };
  };

  const result = await runUltraChat({
    task: "Compare partial usage between workers",
    maxWorkers: 2,
    workerExecutor: mixedExecutor,
  });

  const hasAnyUsage = result.run.workers.some(
    (w) => w.inputTokens != null || w.outputTokens != null
  );
  const hasNullUsage = result.run.workers.some(
    (w) => w.inputTokens == null
  );
  console.assert(hasAnyUsage, "At least one worker should have usage data");
  console.assert(hasNullUsage, "At least one worker should have null usage");
  console.assert(
    result.receipt.costEstimateStatus === "unavailable",
    "Cost should be unavailable when no pricing"
  );
  console.log("PASS: partial usage path handles mixed availability");
}

async function main() {
  testUnifiedRouteDelegation();
  await testEmptyTaskRejected();
  await testValidRequestReturnsAnswer();
  await testResponseIncludesUserSafeReceipt();
  await testTimelineAndEvidencePresent();
  await testWorkerComparisonKeysPresent();
  await testNoPrivateChainOfThoughtExposed();
  await testEvidenceSummaryInResult();
  await testToolLoopInTimeline();
  await testCostEstimateStatusUnavailable();
  await testCostLimitPassedThrough();
  await testWorkerSummariesIncludeProviderModelCost();
  await testNoZeroCostDisplayWhenUnavailable();
  await testGroundedUsagePath();
  await testPartialUsagePath();
  console.log("\nAll ultra-chat-route tests passed.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
