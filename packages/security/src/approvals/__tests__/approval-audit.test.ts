// Approval + Audit Safety Layer — Validation Suite
// Run with: npx tsx lib/approvals/__tests__/approval-audit.test.ts
// or via the test script.

import { resolveFailClosedPolicy, type FailClosedPolicyContext } from "@ethen/tools/approval-policy";
import { toolRiskLevelToRiskTier, APPROVAL_RISK_TIER_LABELS, type ApprovalRiskTier } from "@ethen/contracts/tools/types";
import { evaluateEmployeeToolAccess, buildPolicyContext, isTerminalOutcome, requiresSetup, requiresHumanApproval } from "../policies";
import { createDefaultEmployeeProfile } from "../../employees/profiles";
import {
  autonomyPolicyOutcome,
  isBlockedRiskAtLevel,
  requiresApprovalAtLevel,
  isWithinBoundary,
  minimumAutonomyForRiskTier,
} from "../../employees/autonomy";
import {
  auditEmployeeCreated,
  auditEmployeeUpdated,
  auditEmployeePaused,
  auditEmployeeResumed,
  auditRunStarted,
  auditRunCompleted,
  auditRunFailed,
  auditRunBlocked,
  auditToolProposed,
  auditToolAllowed,
  auditToolBlocked,
  auditToolExecuted,
  auditApprovalRequested,
  auditApprovalApproved,
  auditApprovalRejected,
  auditReportGenerated,
  auditBudgetThresholdReached,
  auditConnectedAppChanged,
} from "../../audit/events";
import { resetAuditLog } from "../../audit/service";
import { getSessionAuditLog } from "../../audit/service";
import type { AutonomyLevel } from "../../employees/types";
import type { ToolId } from "@ethen/contracts/tools/types";
import { computePayloadHash, verifyPayloadHash } from "../../policies/payload-hash";
import {
  createApprovalRequest,
  submitApprovalDecision,
  validateApprovalPayload,
  isApprovalRequestStale,
  markApprovalStale,
  getApprovalRequest,
} from "../service";
import { createProposal, approveProposal, validateProposalForExecution, isApprovalStale, isApprovalExpired } from "../store";

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

// ── Test: Risk Tier Labels ───────────────────────────────────────────────

function testRiskTierLabels(): void {
  console.log("\n[Risk Tier Labels]");
  assertEqual(APPROVAL_RISK_TIER_LABELS[0], "Informational", "Tier 0 label");
  assertEqual(APPROVAL_RISK_TIER_LABELS[1], "Read Only", "Tier 1 label");
  assertEqual(APPROVAL_RISK_TIER_LABELS[2], "Internal Write", "Tier 2 label");
  assertEqual(APPROVAL_RISK_TIER_LABELS[3], "External Action", "Tier 3 label");
  assertEqual(APPROVAL_RISK_TIER_LABELS[4], "Sensitive / Destructive", "Tier 4 label");
  assertEqual(APPROVAL_RISK_TIER_LABELS[5], "Forbidden", "Tier 5 label");

  assertEqual(toolRiskLevelToRiskTier("read_only"), 1, "read_only → tier 1");
  assertEqual(toolRiskLevelToRiskTier("writes_user_content"), 2, "writes_user_content → tier 2");
  assertEqual(toolRiskLevelToRiskTier("external_side_effect"), 3, "external_side_effect → tier 3");
  assertEqual(toolRiskLevelToRiskTier("destructive"), 4, "destructive → tier 4");
  assertEqual(toolRiskLevelToRiskTier("privileged"), 5, "privileged → tier 5");
}

// ── Test: Autonomy Policy Outcomes ───────────────────────────────────────

function testAutonomyPolicyOutcomes(): void {
  console.log("\n[Autonomy Policy Outcomes]");

  // Tier 0: always allow at any level
  assertEqual(autonomyPolicyOutcome(0, 0).outcome, "allow", "tier0@level0 → allow");
  assertEqual(autonomyPolicyOutcome(0, 4).outcome, "allow", "tier0@level4 → allow");

  // Tier 1: allow at 1+, block at 0
  assertEqual(autonomyPolicyOutcome(1, 0).outcome, "block", "tier1@level0 → block");
  assertEqual(autonomyPolicyOutcome(1, 1).outcome, "allow", "tier1@level1 → allow");

  // Tier 2: allow at 2+, approval at 1, block at 0
  assertEqual(autonomyPolicyOutcome(2, 0).outcome, "block", "tier2@level0 → block");
  assertEqual(autonomyPolicyOutcome(2, 1).outcome, "approval_required", "tier2@level1 → approval_required");
  assertEqual(autonomyPolicyOutcome(2, 2).outcome, "allow", "tier2@level2 → allow");

  // Tier 3: approval at 3+, block at ≤2
  assertEqual(autonomyPolicyOutcome(3, 2).outcome, "block", "tier3@level2 → block");
  assertEqual(autonomyPolicyOutcome(3, 3).outcome, "approval_required", "tier3@level3 → approval_required (MVP rule)");
  assertEqual(autonomyPolicyOutcome(3, 4).outcome, "approval_required", "tier3@level4 → approval_required (MVP rule)");

  // Tier 4: approval at 4 only, block below
  assertEqual(autonomyPolicyOutcome(4, 3).outcome, "block", "tier4@level3 → block");
  assertEqual(autonomyPolicyOutcome(4, 4).outcome, "approval_required", "tier4@level4 → approval_required");

  // Tier 5: always block
  assertEqual(autonomyPolicyOutcome(5, 4).outcome, "block", "tier5@level4 → block (forbidden)");
  assertEqual(autonomyPolicyOutcome(5, 3).outcome, "block", "tier5@level3 → block (forbidden)");
}

// ── Test: isBlockedRiskAtLevel ───────────────────────────────────────────

function testBlockedRiskAtLevel(): void {
  console.log("\n[Blocked Risk At Level]");

  assert(!isBlockedRiskAtLevel(0, 0), "tier0@level0 not blocked");
  assert(isBlockedRiskAtLevel(1, 0), "tier1@level0 blocked");
  assert(!isBlockedRiskAtLevel(1, 1), "tier1@level1 not blocked");
  assert(isBlockedRiskAtLevel(2, 0), "tier2@level0 blocked");
  assert(!isBlockedRiskAtLevel(2, 1), "tier2@level1 not blocked");
  assert(isBlockedRiskAtLevel(3, 2), "tier3@level2 blocked");
  assert(isBlockedRiskAtLevel(4, 3), "tier4@level3 blocked");
  assert(isBlockedRiskAtLevel(5, 4), "tier5@level4 blocked (forbidden)");
}

// ── Test: requiresApprovalAtLevel ────────────────────────────────────────

function testRequiresApprovalAtLevel(): void {
  console.log("\n[Requires Approval At Level]");

  assert(!requiresApprovalAtLevel(0, 0), "tier0 never requires approval");
  assert(!requiresApprovalAtLevel(1, 0), "tier1 never requires approval");
  assert(requiresApprovalAtLevel(2, 1), "tier2@level1 requires approval");
  assert(!requiresApprovalAtLevel(2, 2), "tier2@level2 no approval needed");
  assert(requiresApprovalAtLevel(3, 3), "tier3@level3 requires approval (MVP)");
  assert(requiresApprovalAtLevel(4, 4), "tier4@level4 requires approval");
}

// ── Test: isWithinBoundary ───────────────────────────────────────────────

function testWithinBoundary(): void {
  console.log("\n[Is Within Boundary]");

  assert(isWithinBoundary(0, 0), "tier0@level0 within boundary");
  assert(!isWithinBoundary(1, 0), "tier1@level0 outside boundary");
  assert(isWithinBoundary(2, 2), "tier2@level2 within boundary");
  assert(!isWithinBoundary(3, 2), "tier3@level2 outside boundary");
  assert(isWithinBoundary(4, 4), "tier4@level4 within boundary (approval_required != block)");
  assert(!isWithinBoundary(5, 4), "tier5@level4 outside boundary (forbidden)");
}

// ── Test: minimumAutonomyForRiskTier ─────────────────────────────────────

function testMinimumAutonomyForRiskTier(): void {
  console.log("\n[Minimum Autonomy For Risk Tier]");

  assertEqual(minimumAutonomyForRiskTier(0), 0, "tier0 requires level 0");
  assertEqual(minimumAutonomyForRiskTier(1), 1, "tier1 requires level 1");
  assertEqual(minimumAutonomyForRiskTier(2), 2, "tier2 requires level 2");
  assertEqual(minimumAutonomyForRiskTier(3), 3, "tier3 requires level 3");
  assertEqual(minimumAutonomyForRiskTier(4), 4, "tier4 requires level 4");
  assertEqual(minimumAutonomyForRiskTier(5), 4, "tier5 requires level 4 (MVP cap)");
}

// ── Test: Fail-Closed Policy Resolver — Read-only tools ──────────────────

function testFailClosedReadOnly(): void {
  console.log("\n[Fail-Closed Policy — Read-Only Tools]");

  const ctx: FailClosedPolicyContext = {
    autonomyLevel: 2,
    employeeActive: true,
    profileComplete: true,
  };

  // finance.search is read-only and available
  const result = resolveFailClosedPolicy("finance.search" as ToolId, ctx);
  assertEqual(result.outcome, "allow", "finance.search@level2 → allow");
  assert(result.allowed, "allowed=true");
  assert(!result.blocked, "blocked=false");
  assert(!result.requiresApproval, "requiresApproval=false");
  assertEqual(result.riskTier, 1, "riskTier=1 (read_only)");

  // Block at level 0
  const ctx0: FailClosedPolicyContext = { autonomyLevel: 0, employeeActive: true, profileComplete: true };
  const result0 = resolveFailClosedPolicy("finance.search" as ToolId, ctx0);
  assertEqual(result0.outcome, "block", "finance.search@level0 → block");
  assert(result0.blocked, "blocked=true for level 0");
}

// ── Test: Fail-Closed Policy Resolver — Write tools ──────────────────────

function testFailClosedWrite(): void {
  console.log("\n[Fail-Closed Policy — Write Tools]");

  // artifact.create is writes_user_content, contract_only
  const ctx: FailClosedPolicyContext = {
    autonomyLevel: 2,
    employeeActive: true,
    profileComplete: true,
  };

  const result = resolveFailClosedPolicy("artifact.create" as ToolId, ctx);
  assertEqual(result.outcome, "setup_required", "artifact.create (contract_only) → setup_required");
  assert(result.blocked, "blocked=true for contract_only");
}

// ── Test: Fail-Closed Policy Resolver — Unknown tool ─────────────────────

function testFailClosedUnknownTool(): void {
  console.log("\n[Fail-Closed Policy — Unknown Tool]");

  const ctx: FailClosedPolicyContext = {
    autonomyLevel: 4,
    employeeActive: true,
    profileComplete: true,
  };

  const result = resolveFailClosedPolicy("nonexistent.tool" as ToolId, ctx);
  assertEqual(result.outcome, "not_provided", "unknown tool → not_provided");
  assert(result.blocked, "blocked=true for unknown tool");
  assert(!result.allowed, "allowed=false for unknown tool");
}

// ── Test: Fail-Closed Policy Resolver — Employee not active ──────────────

function testFailClosedInactiveEmployee(): void {
  console.log("\n[Fail-Closed Policy — Inactive Employee]");

  const ctx: FailClosedPolicyContext = {
    autonomyLevel: 4,
    employeeActive: false,
    profileComplete: true,
  };

  const result = resolveFailClosedPolicy("finance.search" as ToolId, ctx);
  assertEqual(result.outcome, "setup_required", "inactive employee → setup_required");
  assert(result.blocked, "blocked=true for inactive employee");
}

// ── Test: Fail-Closed Policy Resolver — Budget exceeded ──────────────────

function testFailClosedBudgetExceeded(): void {
  console.log("\n[Fail-Closed Policy — Budget Exceeded]");

  const ctx: FailClosedPolicyContext = {
    autonomyLevel: 4,
    employeeActive: true,
    profileComplete: true,
    budgetExceeded: true,
  };

  const result = resolveFailClosedPolicy("finance.search" as ToolId, ctx);
  assertEqual(result.outcome, "over_budget", "over budget → over_budget");
  assert(result.blocked, "blocked=true for over budget");
}

// ── Test: Fail-Closed Policy Resolver — External action requires approval ─

function testFailClosedExternalActionRequiresApproval(): void {
  console.log("\n[Fail-Closed Policy — External Action Requires Approval]");

  // business-ops.zendesk.send_reply is external_side_effect, contract_only
  // But we need an available external-action tool. Let's use a conceptual case:
  // External actions always require approval in MVP, even at level 4.
  const ctx: FailClosedPolicyContext = {
    autonomyLevel: 4,
    employeeActive: true,
    profileComplete: true,
  };

  // The tool is contract_only so it returns setup_required.
  // What about an available tool with write risk at level 2?
  // finance.search is available and read_only → tier 1 → allowed at level 2
  // Let's check the executive_actions at level 4 → approval
  // For a real test of approval_required we need an available tool at tier 3+
  // There isn't one in the current registry (all external tools are contract_only).
  // This is correct behavior — contract_only tools block.

  const result = resolveFailClosedPolicy("business-ops.zendesk.send_reply" as ToolId, ctx);
  // contract_only → setup_required (not approval_required, because setup lacks the tool)
  assertEqual(result.outcome, "setup_required", "contract_only external tool → setup_required");
  assert(result.reason.includes("contract only"), "reason mentions contract state");
}

// ── Test: buildPolicyContext from employee profile ───────────────────────

function testBuildPolicyContext(): void {
  console.log("\n[Build Policy Context]");

  const employee = createDefaultEmployeeProfile({
    id: "emp-1",
    orgId: "org-1",
    businessProfileId: "bp-1",
    name: "Test Employee",
    ownerUserId: "user-1",
    status: "active",
    autonomyLevel: 3 as AutonomyLevel,
  });

  const ctx = buildPolicyContext(employee);
  assertEqual(ctx.autonomyLevel, 3, "autonomy level mapped");
  assert(ctx.employeeActive, "employee active");
  assert(ctx.profileComplete, "profile complete");
  assertEqual(ctx.budgetExceeded, null, "budget default null");
}

// ── Test: evaluateEmployeeToolAccess ─────────────────────────────────────

function testEvaluateEmployeeToolAccess(): void {
  console.log("\n[Evaluate Employee Tool Access]");

  const employee = createDefaultEmployeeProfile({
    id: "emp-2",
    orgId: "org-1",
    businessProfileId: "bp-1",
    name: "Sales Rep",
    ownerUserId: "user-2",
    status: "active",
    autonomyLevel: 2 as AutonomyLevel,
  });

  // read-only available tool → allow
  const r1 = evaluateEmployeeToolAccess(employee, "finance.search" as ToolId);
  assertEqual(r1.outcome, "allow", "level2 employee can use read-only tool");

  // write contract_only tool → setup_required
  const r2 = evaluateEmployeeToolAccess(employee, "artifact.create" as ToolId);
  assertEqual(r2.outcome, "setup_required", "contract_only tool → setup_required");

  // unknown tool → not_provided
  const r3 = evaluateEmployeeToolAccess(employee, "nonexistent" as ToolId);
  assertEqual(r3.outcome, "not_provided", "unknown tool → not_provided");
}

// ── Test: Terminal outcome helpers ───────────────────────────────────────

function testOutcomeHelpers(): void {
  console.log("\n[Outcome Helpers]");

  assert(isTerminalOutcome("block"), "block is terminal");
  assert(isTerminalOutcome("over_budget"), "over_budget is terminal");
  assert(isTerminalOutcome("not_provided"), "not_provided is terminal");
  assert(!isTerminalOutcome("allow"), "allow not terminal");
  assert(!isTerminalOutcome("approval_required"), "approval_required not terminal");
  assert(!isTerminalOutcome("setup_required"), "setup_required not terminal");

  assert(requiresSetup("setup_required"), "setup_required needs setup");
  assert(!requiresSetup("allow"), "allow doesn't need setup");

  assert(requiresHumanApproval("approval_required"), "approval_required needs human");
  assert(!requiresHumanApproval("allow"), "allow doesn't need human");
  assert(!requiresHumanApproval("block"), "block doesn't need human");
}

// ── Test: Audit event helpers ────────────────────────────────────────────

function testAuditEventHelpers(): void {
  console.log("\n[Audit Event Helpers]");
  resetAuditLog();

  // Employee lifecycle
  const e1 = auditEmployeeCreated("emp-1", { role: "customer_support" });
  assert(e1 !== null, "employee.created recorded");
  assertEqual(e1.eventType, "employee.created", "event type employee.created");

  auditEmployeeUpdated("emp-1", { field: "name" });
  auditEmployeePaused("emp-1", { reason: "vacation" });
  auditEmployeeResumed("emp-1");

  // Run lifecycle
  auditRunStarted("run-1", "emp-1");
  auditRunCompleted("run-1", { steps: 5 });
  auditRunFailed("run-2", "timeout");
  auditRunBlocked("run-3", "policy");

  // Tool lifecycle
  auditToolProposed("finance.search" as ToolId);
  auditToolAllowed("finance.search" as ToolId);
  auditToolBlocked("artifact.create" as ToolId, "contract_only");
  auditToolExecuted("finance.search" as ToolId);

  // Approval lifecycle
  auditApprovalRequested("areq-1", "artifact.create" as ToolId);
  auditApprovalApproved("areq-1", "artifact.create" as ToolId);
  auditApprovalRejected("areq-2", "travel.save_option" as ToolId);

  // Platform lifecycle
  auditReportGenerated("rpt-1", { type: "daily_summary" });
  auditBudgetThresholdReached("budget-policy-1", { threshold: 80 });
  auditConnectedAppChanged("gh-1", "connected");

  // Verify events count — all 19 events should be recorded
  const allEvents = getSessionAuditLog(null as unknown as string);
  assert(allEvents.length === 18, `18 events recorded, got ${allEvents.length}`);

  // Verify event types present
  const types = allEvents.map((e) => e.eventType);
  assert(types.includes("employee.created"), "employee.created present");
  assert(types.includes("run.started"), "run.started present");
  assert(types.includes("tool.proposed"), "tool.proposed present");
  assert(types.includes("approval.requested"), "approval.requested present");
  assert(types.includes("report.generated"), "report.generated present");
  assert(types.includes("budget.threshold_reached"), "budget.threshold_reached present");
  assert(types.includes("connected_app.changed"), "connected_app.changed present");
}

// ── Test: Forbidden risk tier always blocks ──────────────────────────────

function testForbiddenAlwaysBlocks(): void {
  console.log("\n[Forbidden Tier Always Blocks]");

  // At every autonomy level, tier 5 blocks
  for (let level = 0; level <= 4; level++) {
    assert(isBlockedRiskAtLevel(5, level as AutonomyLevel), `tier5@level${level} blocked`);
    assertEqual(autonomyPolicyOutcome(5, level as AutonomyLevel).outcome, "block", `tier5@level${level} policy outcome = block`);
  }
}

// ── Test: Autonomous employee run step integration ─────────────────────────

function testRunStepIntegration(): void {
  console.log("\n[Run Step Integration]");

  // The EmployeeRunStep type already has approvalRequestId and auditEventId fields.
  // This test verifies the integration contract.

  const ctx: FailClosedPolicyContext = {
    autonomyLevel: 3,
    employeeActive: true,
    profileComplete: true,
  };

  // At level 3, read-only is allowed, write requires approval
  const r1 = resolveFailClosedPolicy("finance.search" as ToolId, ctx);
  assert(r1.allowed, "finance.search@level3 allowed");
  assert(!r1.requiresApproval, "finance.search@level3 no approval needed");

  // External action at level 3 would be approval_required (if available)
  // But actual external tools are contract_only, so blocked for setup reasons
  const r2 = resolveFailClosedPolicy("business-ops.zendesk.send_reply" as ToolId, ctx);
  assertEqual(r2.outcome, "setup_required", "external send reply blocked (not available)");
}

// ── Test: Payload Hash Computation ──────────────────────────────────────

function testPayloadHash(): void {
  console.log("\n[Payload Hash Computation]");

  const payload1 = { action: "createFile", path: "/tmp/test.txt", content: "hello" };
  const payload2 = { action: "createFile", path: "/tmp/test.txt", content: "world" };
  const payload3 = { action: "createFile", path: "/tmp/test.txt", content: "hello" };

  const hash1 = computePayloadHash(payload1);
  const hash2 = computePayloadHash(payload2);
  const hash3 = computePayloadHash(payload3);

  assert(hash1.length === 64, "hash is 64 hex chars (SHA-256)");
  assert(hash1 !== hash2, "different payloads produce different hashes");
  assertEqual(hash1, hash3, "identical payloads produce identical hashes");

  assert(verifyPayloadHash(payload1, hash1), "verifyPayloadHash returns true for match");
  assert(!verifyPayloadHash(payload2, hash1), "verifyPayloadHash returns false for mismatch");

  // Stable ordering test
  const unordered1 = { b: 2, a: 1 };
  const unordered2 = { a: 1, b: 2 };
  assertEqual(computePayloadHash(unordered1), computePayloadHash(unordered2), "key order does not affect hash");

  // Extra salt
  const hashWithSalt = computePayloadHash(payload1, "salt");
  assert(hashWithSalt !== hash1, "salt produces different hash");
  assert(verifyPayloadHash(payload1, hashWithSalt, "salt"), "verifyPayloadHash works with salt");
  assert(!verifyPayloadHash(payload1, hash1, "wrong-salt"), "wrong salt causes verification failure");
}

// ── Test: Stale Approval — Changed Payload ───────────────────────────────

function testStaleApprovalChangedPayload(): void {
  console.log("\n[Stale Approval — Changed Payload]");
  resetAuditLog();

  // Create an approval request with a payload hash
  const originalPayload = { action: "deleteFile", path: "/tmp/important.txt" };
  const payloadHash1 = computePayloadHash(originalPayload);

  const request = createApprovalRequest({
    title: "Delete file request",
    description: "Deletes an important file",
    riskLevel: "destructive",
    proposedAction: "deleteFile",
    affectedEntities: ["/tmp/important.txt"],
    rationale: "User requested cleanup",
    expectedEffect: "File will be permanently deleted",
    payloadHash: payloadHash1,
    sessionId: "stale-test-1",
  });

  assert(request !== null, "approval request created");
  assertEqual(request.payloadHash, payloadHash1, "payloadHash stored");

  // Submit approval
  const approved = submitApprovalDecision(request.id, "approve", { id: "user-1", name: "Admin", role: "admin" });
  assert(approved !== null, "approval submitted");
  assertEqual(approved!.status, "approved", "status is approved");

  // Validate with same payload — should pass
  const validResult = validateApprovalPayload(request.id, payloadHash1);
  assert(validResult.valid, "payload validation passes for matching hash");

  // Validate with different payload — should fail
  const differentPayloadHash = computePayloadHash({ action: "deleteFile", path: "/tmp/different.txt" });
  const invalidResult = validateApprovalPayload(request.id, differentPayloadHash);
  assert(!invalidResult.valid, "payload validation fails for different hash");
  assert(invalidResult.reason.includes("Payload has changed"), "reason mentions payload change");

  // Request should now be marked stale
  const staleReq = getApprovalRequest(request.id);
  assert(staleReq !== null, "request still exists");
  assertEqual(staleReq!.status, "stale", "request status is stale after mismatched payload");

  // Check audit event
  const auditLog = getSessionAuditLog("stale-test-1");
  assert(auditLog.some((e) => e.eventType === "action_blocked"), "audit has action_blocked for stale");
}

// ── Test: Stale Approval — Expired ───────────────────────────────────────

function testStaleApprovalExpired(): void {
  console.log("\n[Stale Approval — Expired]");
  resetAuditLog();

  const payload = { action: "sendEmail", to: "test@example.com" };
  const payloadHash = computePayloadHash(payload);

  // Create with expiry 1 second in the past
  const pastExpiry = new Date(Date.now() - 1000).toISOString();

  const request = createApprovalRequest({
    title: "Send email",
    description: "Sends an email",
    riskLevel: "external_side_effect",
    proposedAction: "sendEmail",
    affectedEntities: ["test@example.com"],
    rationale: "Test",
    expectedEffect: "Email will be sent",
    payloadHash,
    expiryAt: pastExpiry,
    sessionId: "stale-expiry",
  });

  assert(request !== null, "approval request created with past expiry");
  assertEqual(request.expiryAt, pastExpiry, "expiryAt stored");

  // Approve
  submitApprovalDecision(request.id, "approve", { id: "user-1", name: "Admin", role: "admin" });

  // isApprovalRequestStale should detect expiry
  const staleCheck1 = isApprovalRequestStale(request.id, payloadHash);
  assert(staleCheck1.stale, "staleCheck returns stale for expired request");
  assert(staleCheck1.reason.includes("expired"), "reason mentions expiry");

  // validateApprovalPayload should also fail
  const validResult = validateApprovalPayload(request.id, payloadHash);
  assert(!validResult.valid, "validateApprovalPayload fails for expired request");
  assert(validResult.reason.includes("expired"), "reason mentions expiry");

  // Status should now be expired
  const reqAfter = getApprovalRequest(request.id);
  assertEqual(reqAfter!.status, "expired", "request status is expired");
}

// ── Test: Stale Approval — Non-Expired Works ─────────────────────────────

function testStaleApprovalNonExpiredWorks(): void {
  console.log("\n[Stale Approval — Non-Expired Works]");
  resetAuditLog();

  const payload = { action: "readFile", path: "/tmp/data.txt" };
  const payloadHash = computePayloadHash(payload);

  // Create with expiry far in the future
  const futureExpiry = new Date(Date.now() + 86400000).toISOString(); // +1 day

  const request = createApprovalRequest({
    title: "Read file",
    description: "Read file contents",
    riskLevel: "read_only",
    proposedAction: "readFile",
    affectedEntities: ["/tmp/data.txt"],
    rationale: "Need to read data",
    expectedEffect: "File will be read",
    payloadHash,
    expiryAt: futureExpiry,
    sessionId: "stale-fresh",
  });

  submitApprovalDecision(request.id, "approve", { id: "user-1", name: "Admin", role: "admin" });

  // Not stale
  const staleCheck = isApprovalRequestStale(request.id, payloadHash);
  assert(!staleCheck.stale, "fresh approval is not stale");

  // Valid for execution
  const validResult = validateApprovalPayload(request.id, payloadHash);
  assert(validResult.valid, "fresh approval payload validates");
}

// ── Test: Approval Cannot Execute if Denied ──────────────────────────────

function testDeniedApprovalCannotExecute(): void {
  console.log("\n[Denied Approval Cannot Execute]");
  resetAuditLog();

  const payload = { action: "rebootVM", vmId: "vm-123" };
  const payloadHash = computePayloadHash(payload);

  const request = createApprovalRequest({
    title: "Reboot VM",
    description: "Reboots a production VM",
    riskLevel: "destructive",
    proposedAction: "rebootVM",
    affectedEntities: ["vm-123"],
    rationale: "Maintenance",
    expectedEffect: "VM will reboot",
    payloadHash,
    sessionId: "stale-denied",
  });

  // Reject immediately
  const rejected = submitApprovalDecision(request.id, "reject", { id: "user-1", name: "Admin", role: "admin" });
  assertEqual(rejected!.status, "rejected", "request is rejected");

  // Validation should fail
  const validResult = validateApprovalPayload(request.id, payloadHash);
  assert(!validResult.valid, "rejected approval does not validate");
  assert(validResult.reason.includes("rejected"), "reason mentions rejected status");
}

// ── Test: Proposal Store Stale Detection ─────────────────────────────────

function testProposalStoreStaleDetection(): void {
  console.log("\n[Proposal Store Stale Detection]");
  resetAuditLog();

  const payload1 = { action: "updateRecord", id: "rec-1", data: { name: "Alice" } };
  const payload2 = { action: "updateRecord", id: "rec-1", data: { name: "Bob" } };
  const hash1 = computePayloadHash(payload1);
  const hash2 = computePayloadHash(payload2);

  // Create with payloadHash
  const proposal = createProposal({
    toolId: "artifact.create",
    riskLevel: "writes_user_content",
    proposedInput: payload1,
    humanReadableSummary: "Update record",
    expectedEffect: "Record updated in DB",
    payloadHash: hash1,
    sessionId: "store-stale",
  });

  assert(proposal.payloadHash === hash1, "payloadHash stored on proposal");

  // Not stale yet (still pending)
  assert(!isApprovalStale(proposal.id, hash1), "pending proposal not stale");
  assert(!isApprovalStale(proposal.id, hash2), "pending proposal not stale even with different hash");

  // Approve
  const approved = approveProposal(proposal.id);
  assertEqual(approved!.status, "approved", "proposal approved");

  // Now stale with different payload
  assert(isApprovalStale(proposal.id, hash2), "approved proposal is stale with different payload");
  assert(!isApprovalStale(proposal.id, hash1), "approved proposal matches original hash");

  // Validate for execution
  const validResult = validateProposalForExecution(proposal.id, hash1);
  assert(validResult.allowed, "validateProposalForExecution passes for matching hash");

  const invalidResult = validateProposalForExecution(proposal.id, hash2);
  assert(!invalidResult.allowed, "validateProposalForExecution fails for different hash");
  assert(invalidResult.reason.includes("Payload has changed"), "reason mentions payload change");
}

// ── Test: Proposal Store Expiry Detection ────────────────────────────────

function testProposalStoreExpiryDetection(): void {
  console.log("\n[Proposal Store Expiry Detection]");
  resetAuditLog();

  const pastExpiry = new Date(Date.now() - 60000).toISOString(); // 1 min ago
  const payload = { action: "test" };
  const payloadHash = computePayloadHash(payload);

  const proposal = createProposal({
    toolId: "artifact.create",
    riskLevel: "writes_user_content",
    proposedInput: payload,
    humanReadableSummary: "Test",
    expectedEffect: "Test",
    payloadHash,
    expiresAt: pastExpiry,
    sessionId: "store-expiry",
  });

  assert(isApprovalExpired(proposal.id), "proposal is expired");

  const futureExpiry = new Date(Date.now() + 86400000).toISOString();
  const proposal2 = createProposal({
    toolId: "artifact.create",
    riskLevel: "writes_user_content",
    proposedInput: payload,
    humanReadableSummary: "Test",
    expectedEffect: "Test",
    payloadHash,
    expiresAt: futureExpiry,
    sessionId: "store-expiry-2",
  });

  assert(!isApprovalExpired(proposal2.id), "future proposal is not expired");
  assert(!proposal2.expiresAt || new Date(proposal2.expiresAt) > new Date(), "future expiry date is after now");
}

// ── Run ──────────────────────────────────────────────────────────────────

function main() {
  console.log("Approval + Audit Safety Layer — Validation\n");

  testRiskTierLabels();
  testAutonomyPolicyOutcomes();
  testBlockedRiskAtLevel();
  testRequiresApprovalAtLevel();
  testWithinBoundary();
  testMinimumAutonomyForRiskTier();
  testFailClosedReadOnly();
  testFailClosedWrite();
  testFailClosedUnknownTool();
  testFailClosedInactiveEmployee();
  testFailClosedBudgetExceeded();
  testFailClosedExternalActionRequiresApproval();
  testBuildPolicyContext();
  testEvaluateEmployeeToolAccess();
  testOutcomeHelpers();
  testAuditEventHelpers();
  testForbiddenAlwaysBlocks();
  testRunStepIntegration();
  testPayloadHash();
  testStaleApprovalChangedPayload();
  testStaleApprovalExpired();
  testStaleApprovalNonExpiredWorks();
  testDeniedApprovalCannotExecute();
  testProposalStoreStaleDetection();
  testProposalStoreExpiryDetection();

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
  if (failed > 0) { console.error("Some assertions failed."); process.exitCode = 1; }
  else { console.log("All assertions passed."); }
}

main();
