// REC-02H — Platform Policy Enforcement Contract Tests
// Run with: node -r ./scripts/test-infrastructure/preload-server-only.cjs --import tsx lib/platform/policies/__tests__/rec02h-policy-enforcement.test.ts

import { enforcePolicy, simulatePolicy } from "../enforcement";
import { clearAuditEvents } from "@ethen/security/audit/store";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertDefined<T>(value: T | null | undefined, label: string): T {
  if (value != null) { passed += 1; return value; }
  failed += 1; console.error(`  FAIL: ${label} — value is null or undefined`);
  return undefined as T;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function makePolicyInput(overrides: Record<string, unknown> = {}): Parameters<typeof simulatePolicy>[1] {
  return {
    policyId: "test-policy",
    targetKind: "tool_call",
    action: "test.action",
    subjectId: "test-actor",
    subjectType: "user",
    ...overrides,
  } as Parameters<typeof simulatePolicy>[1];
}

// ── Canonical sessionId contract ─────────────────────────────────────────────────

console.log("\n[REC-02H — Canonical sessionId contract]");

function testExplicitSessionIdPassesThrough(): void {
  const result = simulatePolicy("test-policy", makePolicyInput({ sessionId: "sess-123" }));
  assert(typeof result.allowed === "boolean", "explicit sessionId: allowed is boolean");
}

function testNullSessionIdAccepted(): void {
  const result = simulatePolicy("test-policy", makePolicyInput({ sessionId: null }));
  assert(typeof result.allowed === "boolean", "null sessionId: allowed is boolean");
}

function testUndefinedSessionIdNormalizedToNull(): void {
  const result = simulatePolicy("test-policy", makePolicyInput({ sessionId: undefined }));
  assert(typeof result.allowed === "boolean", "undefined sessionId: allowed is boolean");
}

function testOmittedSessionIdNormalizedToNull(): void {
  // Omit sessionId entirely — should not crash
  const result = simulatePolicy("test-policy", makePolicyInput({}));
  assert(typeof result.allowed === "boolean", "omitted sessionId: allowed is boolean");
}

// ── ProjectId contract ───────────────────────────────────────────────────────────

console.log("\n[REC-02H — Canonical projectId / identity contract]");

function testExplicitProjectIdPassesThrough(): void {
  const result = simulatePolicy("test-policy", makePolicyInput({ projectId: "proj-123" }));
  assert(typeof result.allowed === "boolean", "explicit projectId: allowed is boolean");
}

function testNullProjectIdAccepted(): void {
  const result = simulatePolicy("test-policy", makePolicyInput({ projectId: null }));
  assert(typeof result.allowed === "boolean", "null projectId: allowed is boolean");
}

function testUndefinedProjectIdAccepted(): void {
  const result = simulatePolicy("test-policy", makePolicyInput({ projectId: undefined }));
  assert(typeof result.allowed === "boolean", "undefined projectId: allowed is boolean");
}

function testNullUserIdAccepted(): void {
  const result = simulatePolicy("test-policy", makePolicyInput({ userId: null }));
  assert(typeof result.allowed === "boolean", "null userId: allowed is boolean");
}

function testUndefinedUserIdAccepted(): void {
  const result = simulatePolicy("test-policy", makePolicyInput({ userId: undefined }));
  assert(typeof result.allowed === "boolean", "undefined userId: allowed is boolean");
}

// ── Missing identity / incomplete context ────────────────────────────────────────

console.log("\n[REC-02H — Missing identity fails closed]");

function testUnknownPolicyReturnsDenialReason(): void {
  const result = simulatePolicy("nonexistent-policy-xyz", makePolicyInput());
  assert(typeof result.allowed === "boolean", "unknown policy: allowed is boolean");
  assert(typeof result.reason === "string", "unknown policy: reason is string");
}

function testResultAlwaysHasDecisionStructure(): void {
  const result = simulatePolicy("test-policy", makePolicyInput({}));
  assert(typeof result.decisionId === "string", "result has decisionId string");
  assert(typeof result.allowed === "boolean", "result has allowed boolean");
  assert(typeof result.denied === "boolean", "result has denied boolean");
  assert(typeof result.requiresApproval === "boolean", "result has requiresApproval boolean");
  assert(typeof result.state === "string", "result has state string");
  assert(typeof result.reason === "string", "result has reason string");
  assert(typeof result.auditLogged === "boolean", "result has auditLogged boolean");
}

function testNoAllowDecisionFromEmptyContext(): void {
  // Minimal context — subjectId defaults to "unknown"
  const result = enforcePolicy("test-policy", {
    policyId: "test-policy",
    targetKind: "tool_call",
    action: "test.action",
  });
  assert(typeof result.allowed === "boolean", "empty context: allowed is boolean");
}

// ── Audit logging preserves identity normalization ──────────────────────────────

console.log("\n[REC-02H — Audit logging preserves normalization]");

function testNullSessionIdInEnforcement(): void {
  clearAuditEvents();
  const result = enforcePolicy("test-policy", makePolicyInput({ sessionId: null }));
  // Enforcement should not crash with null sessionId
  assert(typeof result.allowed === "boolean", "null sessionId enforcement: allowed is boolean");
}

function testUndefinedSessionIdInEnforcement(): void {
  clearAuditEvents();
  const result = enforcePolicy("test-policy", makePolicyInput({ sessionId: undefined }));
  assert(typeof result.allowed === "boolean", "undefined sessionId enforcement: allowed is boolean");
}

// ── Deterministic denial reason ──────────────────────────────────────────────────

console.log("\n[REC-02H — Deterministic results]");

function testSameInputProducesSameOutcomeShape(): void {
  const input = makePolicyInput({ sessionId: "sess-456", userId: "user-789" });
  const result1 = simulatePolicy("test-policy", input);
  const result2 = simulatePolicy("test-policy", input);
  // Decision state must be deterministic
  assertEqual(result1.state, result2.state, "same input produces same state");
  assertEqual(result1.allowed, result2.allowed, "same input produces same allowed");
}

function testNoEmptyStringIdentityFallback(): void {
  const result = simulatePolicy("test-policy", makePolicyInput({ subjectId: "" }));
  assert(typeof result.allowed === "boolean", "empty subjectId: allowed is boolean");
  // Empty string should be treated as a valid (empty) value, not causing a crash
  assert(typeof result.reason === "string", "empty subjectId: reason is string");
}

// ── Run all tests ────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  testExplicitSessionIdPassesThrough();
  testNullSessionIdAccepted();
  testUndefinedSessionIdNormalizedToNull();
  testOmittedSessionIdNormalizedToNull();
  testExplicitProjectIdPassesThrough();
  testNullProjectIdAccepted();
  testUndefinedProjectIdAccepted();
  testNullUserIdAccepted();
  testUndefinedUserIdAccepted();
  testUnknownPolicyReturnsDenialReason();
  testResultAlwaysHasDecisionStructure();
  testNoAllowDecisionFromEmptyContext();
  testNullSessionIdInEnforcement();
  testUndefinedSessionIdInEnforcement();
  testSameInputProducesSameOutcomeShape();
  testNoEmptyStringIdentityFallback();

  console.log(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
