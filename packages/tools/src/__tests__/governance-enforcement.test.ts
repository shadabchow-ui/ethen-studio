// Governed tool validation enforcement tests
// Run with: NODE_OPTIONS=--conditions=react-server npx tsx lib/tools/__tests__/governance-enforcement.test.ts

import { TOOL_REGISTRY } from "../registry";
import { assertValidToolDefinition } from "../queries";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label}`);
}

function main(): void {
  const valid = TOOL_REGISTRY.find((tool) => tool.id === "file.apply_patch");
  assert(Boolean(valid), "file.apply_patch exists in registry");
  if (!valid) return finish();

  let validDefinitionAccepted = true;
  try {
    assertValidToolDefinition(valid);
  } catch {
    validDefinitionAccepted = false;
  }
  assert(validDefinitionAccepted, "real governed executable tool passes runtime assertion");

  const invalid = {
    ...valid,
    approvalRequirement: "no_approval" as const,
  };

  let threw = false;
  try {
    assertValidToolDefinition(invalid);
  } catch (error) {
    threw = error instanceof Error && error.message.includes("state_change_without_approval_gate");
  }
  assert(threw, "runtime assertion rejects governed approval-gate drift");

  finish();
}

function finish(): void {
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
