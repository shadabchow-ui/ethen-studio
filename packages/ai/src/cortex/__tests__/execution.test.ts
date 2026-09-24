import { createCortexExecutionRunner } from "../execution";
import type { RunCortexChatParams, RunCortexChatResult } from "../run-cortex-chat";
import type { RunUltraChatInput, RunUltraChatResult } from "../../cortex-ultra/run-ultra-chat";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

function standardResult(effectiveMode: "cortex-lite" | "cortex-pro"): RunCortexChatResult {
  return {
    effectiveMode,
    result: {} as RunCortexChatResult["result"],
    receipt: { source: "production", verifier: { used: false, status: "skipped" } } as RunCortexChatResult["receipt"],
    classification: {} as RunCortexChatResult["classification"],
    cortexProfile: null,
  };
}

function ultraResult(state: "COMPLETE" | "DEGRADED_COMPLETE" = "COMPLETE"): RunUltraChatResult {
  return {
    answer: "Ultra answer",
    run: { state } as RunUltraChatResult["run"],
    verifierReports: [{ status: "passed" }] as RunUltraChatResult["verifierReports"],
  } as RunUltraChatResult;
}

async function run(): Promise<void> {
  const standardCalls: Array<RunCortexChatParams> = [];
  const ultraCalls: Array<RunUltraChatInput> = [];
  const runner = createCortexExecutionRunner({
    runCortexChat: async (input) => {
      standardCalls.push(input);
      return standardResult(input.selectedMode === "cortex-pro" ? "cortex-pro" : "cortex-lite");
    },
    runUltraChat: async (input) => {
      ultraCalls.push(input);
      return ultraResult();
    },
  });

  const fast = await runner({ depth: "fast", messages: [{ role: "user", content: "hello" }] });
  assert(fast.status === "completed" && standardCalls[0]?.selectedMode === "cortex-lite", "fast dispatches to Cortex Lite");
  assert(fast.status !== "error" && fast.metadata.executedDepth === "fast", "fast reports its actual depth");

  const deep = await runner({ depth: "deep", messages: [{ role: "user", content: "analyze" }], budget: { maxOutputTokens: 400 } });
  assert(deep.status === "completed" && standardCalls[1]?.selectedMode === "cortex-pro", "deep dispatches to Cortex Pro");
  assert(standardCalls[1]?.maxOutputTokens === 400, "deep forwards supported standard budget");

  const ultra = await runner({ depth: "ultra", messages: [{ role: "user", content: "investigate" }], budget: { maxWorkers: 2, costLimitUsd: 1, timeLimitMs: 5000 } });
  assert(ultra.status === "completed" && ultraCalls.length === 1, "ultra dispatches to the Ultra runtime");
  assert(ultraCalls[0]?.maxWorkers === 2 && ultraCalls[0]?.costLimitUsd === 1, "ultra forwards Ultra budget controls");

  const mismatchRunner = createCortexExecutionRunner({
    runCortexChat: async () => standardResult("cortex-lite"),
    runUltraChat: async () => ultraResult(),
  });
  const mismatch = await mismatchRunner({ depth: "deep", messages: [{ role: "user", content: "must stay deep" }] });
  assert(mismatch.status === "error" && mismatch.error.code === "mode_substitution", "deep never silently substitutes Fast");

  const unsupported = await runner({ depth: "fast", messages: [{ role: "user", content: "hello" }], tools: ["search"] });
  assert(unsupported.status === "error" && unsupported.error.code === "unsupported_input", "unsupported input is explicit rather than ignored");

  const invalid = await runner({ depth: "ultra", messages: [{ role: "assistant", content: "no user request" }] });
  assert(invalid.status === "error" && invalid.error.code === "invalid_input", "missing user message is explicit");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

run();
