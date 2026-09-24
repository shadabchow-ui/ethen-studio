import assert from "node:assert/strict";
import { canContinueRun, createUltraRunBudget, recordObservedUsage, recordToolUse, remainingRunTimeMs } from "../cost-controller";

const first = createUltraRunBudget({ maxTools: 1, timeLimitMs: 100, nowMs: 1_000 });
const second = createUltraRunBudget({ maxTools: 2, nowMs: 1_000 });
recordToolUse(first);
assert.equal(canContinueRun(first, 1_001), false);
assert.equal(canContinueRun(second, 1_001), true, "concurrent runs must not share counters");
assert.equal(remainingRunTimeMs(first, 1_050), 50);

const tokenBudget = createUltraRunBudget({ maxTokens: 10 });
recordObservedUsage(tokenBudget, 6, 4);
assert.equal(canContinueRun(tokenBudget), false);

const unknownCost = createUltraRunBudget({ maxCostUsd: 1 });
recordObservedUsage(unknownCost, 1, 1, null);
assert.equal(unknownCost.costStatus, "unknown");
assert.equal(canContinueRun(unknownCost), true, "unknown cost must not be claimed as enforced");

const knownCost = createUltraRunBudget({ maxCostUsd: 1 });
recordObservedUsage(knownCost, 1, 1, 1);
assert.equal(knownCost.costStatus, "enforced");
assert.equal(canContinueRun(knownCost), false);
console.log("cost-controller tests passed");
