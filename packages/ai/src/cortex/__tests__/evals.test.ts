// Cortex Eval Library — unit tests
// Run with: npx tsx lib/cortex/__tests__/evals.test.ts

import { runCortexEvals, formatCortexEvalReport } from "../evals";
import type { CortexEvalCategory } from "../eval-types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label}`);
}

const summary = runCortexEvals();

const expectedCategories: CortexEvalCategory[] = [
  "intent-routing",
  "mode-resolution",
  "route-selection",
  "receipt-truth",
  "verifier-policy",
  "fallback-behavior",
  "cost-latency",
  "research-grounding",
];

for (const category of expectedCategories) {
  const cat = summary.byCategory.find((c) => c.category === category);
  assert(!!cat && cat.total > 0, `category ${category} has at least one case`);
}

assert(summary.totalCases === summary.totalPassed + summary.totalFailed, "totalCases equals passed + failed");
assert(summary.totalFailed === 0, `all fixtures pass (saw ${summary.totalFailed} failures)`);

const report = formatCortexEvalReport(summary);
assert(report.includes("Route accuracy"), "report includes route accuracy line");
assert(report.includes("Total:"), "report includes total line");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
