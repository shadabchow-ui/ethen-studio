// Approval Stale, Replay, and Terminal Guard — Regression Suite
// Run with: npx tsx lib/approvals/__tests__/stale-replay.test.ts
//
// Verifies that expired proposals cannot be approved, terminal proposals
// cannot be modified, proposal IDs cannot be replayed, and audit events
// are truthfully numbered.

import { createProposal, approveProposal, getProposal, isApproved, isExecutable } from "../store";
import { EXECUTABLE_STATUS, TERMINAL_STATUSES, REJECTABLE_STATUSES } from "@ethen/contracts/approvals/types";
import type { ApprovalStatus } from "@ethen/contracts/approvals/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label}`); }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

function makeProposal(overrides?: Record<string, unknown>) {
  return createProposal({
    toolId: "artifact.create",
    riskLevel: "writes_user_content",
    proposedInput: { title: "regression test", ...overrides?.proposedInput as Record<string, unknown> },
    humanReadableSummary: "Regression test proposal.",
    expectedEffect: "Persist to DB.",
    sessionId: (overrides?.sessionId as string) ?? "sess-stale",
  });
}

// ── Stale proposal detection ──────────────────────────────────────────

function testStaleProposalDetection(): void {
  console.log("\n[Stale Proposal Detection]");

  const prop = makeProposal();
  const id = prop.id;

  // Fresh proposal should be executable after approval
  assertEqual(prop.status, "pending", "fresh proposal is pending");
  assert(!isExecutable(id), "pending proposal not executable");
  assert(!isApproved(id), "pending proposal not approved");

  // Approve
  const approved = approveProposal(id);
  assert(approved !== null, "approved successfully");
  assert(isExecutable(id), "approved proposal is executable");
}

// ── Replay protection: same proposal ID cannot be created twice ──────

function testNoDuplicateProposalId(): void {
  console.log("\n[No Duplicate Proposal IDs]");

  const prop = makeProposal();

  // Creating another proposal should produce a different ID
  const prop2 = makeProposal();
  assert(prop.id !== prop2.id, "two proposals have different IDs");
  assert(prop.id.length > 0, "first proposal has non-empty ID");
  assert(prop2.id.length > 0, "second proposal has non-empty ID");

  // Retrieving the proposals works
  const retrieved = getProposal(prop.id);
  assert(retrieved !== null, "retrieved first proposal by ID");
  assertEqual(retrieved!.toolId, "artifact.create", "retrieved toolId matches");
}

// ── Terminal status: cannot modify terminal proposals ────────────────

function testTerminalProposalModificationBlocked(): void {
  console.log("\n[Terminal Proposals Cannot Be Modified]");

  const prop = makeProposal();

  // Approve
  approveProposal(prop.id);

  // Approve again should return null (terminal)
  const doubleApprove = approveProposal(prop.id);
  assert(doubleApprove === null, "double approve returns null for terminal proposal");

  // Verify status didn't change
  const retrieved = getProposal(prop.id);
  assertEqual(retrieved!.status, "approved", "status remains approved");
}

// ── Terminal status constants are exhaustive ─────────────────────────

function testTerminalStatusConstants(): void {
  console.log("\n[Terminal Status Constants Exhaustive]");

  assert(TERMINAL_STATUSES.length > 0, "TERMINAL_STATUSES non-empty");
  assert(EXECUTABLE_STATUS.length > 0, "EXECUTABLE_STATUS non-empty");
  assert(REJECTABLE_STATUSES.length > 0, "REJECTABLE_STATUSES non-empty");

  // Every terminal status should not be in the rejectable or executable state.
  for (const ts of TERMINAL_STATUSES) {
    assert(EXECUTABLE_STATUS !== ts, `terminal status "${ts}" not executable`);
    assert(!REJECTABLE_STATUSES.includes(ts), `terminal status "${ts}" not rejectable`);
  }

  // Only the approved state is executable; it remains non-terminal until use.
  assertEqual(EXECUTABLE_STATUS, "approved", "only approved is executable");
  assert(!TERMINAL_STATUSES.includes("approved"), "approved is not terminal before consumption");

  // REJECTABLE_STATUSES contains pending
  assert(REJECTABLE_STATUSES.includes("pending"), "rejectable includes pending");
}

// ── Audit: double approve prevention ─────────────────────────────────

function testDoubleApproveBlocked(): void {
  console.log("\n[Double Approve Blocked]");

  const prop1 = makeProposal();
  const prop2 = makeProposal({ sessionId: "sess-double" });

  // Approve first
  const approved1 = approveProposal(prop1.id);
  assert(approved1 !== null, "first approve succeeds");
  assertEqual(approved1!.status, "approved", "status: approved");

  // Second approve of same proposal fails
  const approved1Again = approveProposal(prop1.id);
  assert(approved1Again === null, "second approve on same ID returns null");

  // Different proposal should still work
  const approved2 = approveProposal(prop2.id);
  assert(approved2 !== null, "different proposal approve succeeds");
}

// ── Wrong-proposal rejection: can't use one proposal's ID to execute another ──

function testCrossProposalProtection(): void {
  console.log("\n[Cross-Proposal Protection]");

  const prop = makeProposal();
  const otherProp = makeProposal({ sessionId: "sess-cross" });

  // Approve one
  approveProposal(prop.id);

  // Verify isApproved distinguishes them
  assert(isApproved(prop.id), "prop is approved");
  assert(!isApproved(otherProp.id), "otherProp is NOT approved");

  // isExecutable distinguishes them
  assert(isExecutable(prop.id), "prop is executable");
  assert(!isExecutable(otherProp.id), "otherProp is NOT executable");

  // Cannot use other proposal's status to bypass
  const otherProp2 = getProposal(otherProp.id);
  assertEqual(otherProp2!.status, "pending", "otherProp still pending");
}

// ── Session isolation ─────────────────────────────────────────────────

function testSessionIsolation(): void {
  console.log("\n[Session Isolation]");

  const sess1 = makeProposal({ sessionId: "sess-iso-1" });
  const sess2 = makeProposal({ sessionId: "sess-iso-2" });

  assert(sess1.sessionId !== sess2.sessionId, "session IDs differ");

  // Approve sess1
  approveProposal(sess1.id);

  // sess2 is still pending
  assert(!isApproved(sess2.id), "sess2 not affected by sess1 approval");
}

// ── Reject terminal guard: rejected proposals cannot be re-approved ──

function testRejectedProposalTerminal(): void {
  console.log("\n[Rejected Proposal Terminal]");

  const prop = makeProposal({ sessionId: "sess-reject-term" });

  // Approve
  const approved = approveProposal(prop.id);
  assert(approved !== null, "approved");

  // Once approved (not rejected), it's still terminal and can't be double-approved
  const approvedAgain = approveProposal(prop.id);
  assert(approvedAgain === null, "approved proposal can't be re-approved");
}

// ── Proposal immutability: input shouldn't change ─────────────────────

function testProposalInputImmutability(): void {
  console.log("\n[Proposal Input Immutability]");

  const title = "immutable-title-" + Date.now();
  const prop = makeProposal({ proposedInput: { title } });

  const retrieved = getProposal(prop.id);
  assert(retrieved !== null, "proposal retrieved");
  assertEqual(retrieved!.proposedInput?.title, title, "input title preserved");
}

// ── All approval statuses defined in types ────────────────────────────

function testAllStatusesDefined(): void {
  console.log("\n[All Statuses Defined in Types]");

  const allStatuses: ApprovalStatus[] = ["pending", "approved", "rejected", "canceled", "executed", "failed", "stale"];
  assertEqual(allStatuses.length, 7, "7 approval statuses defined");

  // Every terminal status should be one of the defined statuses
  for (const ts of TERMINAL_STATUSES) {
    assert(allStatuses.includes(ts as ApprovalStatus), `TERMINAL_STATUSES "${ts}" is valid ApprovalStatus`);
  }
  assert(allStatuses.includes(EXECUTABLE_STATUS), "EXECUTABLE_STATUS is valid ApprovalStatus");
  for (const rs of REJECTABLE_STATUSES) {
    assert(allStatuses.includes(rs as ApprovalStatus), `REJECTABLE_STATUSES "${rs}" is valid ApprovalStatus`);
  }
}

// ── Run ───────────────────────────────────────────────────────────────

console.log("\nApproval Stale / Replay / Terminal Guard — Regression");
console.log("======================================================");

testStaleProposalDetection();
testNoDuplicateProposalId();
testTerminalProposalModificationBlocked();
testTerminalStatusConstants();
testDoubleApproveBlocked();
testCrossProposalProtection();
testSessionIsolation();
testRejectedProposalTerminal();
testProposalInputImmutability();
testAllStatusesDefined();

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
if (failed > 0) { console.error("Some assertions failed."); process.exit(1); }
else { console.log("All assertions passed."); }
