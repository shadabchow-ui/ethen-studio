// Reusable test utilities for agent console test suites.
// Usage:
//   import { assert, assertEqual, runTests } from "../test-utils";
//
//   runTests("My Agent", () => {
//     test("should do something", () => {
//       assert(condition, "description");
//       assertEqual(actual, expected, "description");
//     });
//   });

let passed = 0;
let failed = 0;

export function resetCounters(): void {
  passed = 0;
  failed = 0;
}

export function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label}`); }
}

export function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

export function getResults(): { passed: number; failed: number } {
  return { passed, failed };
}

export function runTests(suiteName: string, fn: () => void): void {
  console.log(`\n[${suiteName}]`);
  fn();
}

export function printSummary(): void {
  console.log(`\n${"\u2500".repeat(40)}`);
  console.log(`Results: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    process.exit(1);
  }
}
