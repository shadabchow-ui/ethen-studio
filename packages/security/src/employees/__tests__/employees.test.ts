// Employee + Business Profile Foundation — Validation Suite
// Run with: npx tsx lib/employees/__tests__/employees.test.ts

import { isValidAutonomyLevel, ensureSafeAutonomyLevel, canExecuteAtLevel, requiresApprovalAtLevel, isBlockedRiskAtLevel, isLevelAvailable, MAX_MVP_AUTONOMY_LEVEL, AUTONOMY_LEVEL_LABELS } from "../autonomy";
import { createDefaultEmployeeProfile, createDefaultBusinessProfile, validateEmployeeProfile, isEmployeeReady } from "../profiles";
import { buildEmployeeInsertPayload, buildBusinessProfileInsertPayload, toEmployeeProfile } from "../queries";

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

function setup(): void {}

// ── Autonomy Types ────────────────────────────────────────────────────

function testAutonomyTypes(): void {
  console.log("\n[Autonomy Types]");
  // Level 5 is not a valid AutonomyLevel type (0-4 only)
  const level5Invalid = !isValidAutonomyLevel(5);
  assert(level5Invalid, "Level 5 is not a valid autonomy level in MVP");
  assert(isValidAutonomyLevel(0), "Level 0 is valid");
  assert(isValidAutonomyLevel(4), "Level 4 is valid");
  assert(!isValidAutonomyLevel(-1), "Level -1 is invalid");
  assert(!isValidAutonomyLevel(6), "Level 6 is invalid");
  assert(!isValidAutonomyLevel(3.5), "Float 3.5 is invalid");
}

// ── Autonomy Helpers ──────────────────────────────────────────────────

function testAutonomyHelpers(): void {
  console.log("\n[Autonomy Helpers]");

  // ensureSafeAutonomyLevel clamps out-of-range values
  assertEqual(ensureSafeAutonomyLevel(5), MAX_MVP_AUTONOMY_LEVEL, "Level 5 clamped to 4");
  assertEqual(ensureSafeAutonomyLevel(10), MAX_MVP_AUTONOMY_LEVEL, "Level 10 clamped to 4");
  assertEqual(ensureSafeAutonomyLevel(-1), 0, "Level -1 clamped to 0");
  assertEqual(ensureSafeAutonomyLevel(3), 3, "Level 3 stays 3");
  assertEqual(ensureSafeAutonomyLevel(0), 0, "Level 0 stays 0");

  // isLevelAvailable
  assert(isLevelAvailable(0), "Level 0 is available");
  assert(isLevelAvailable(4), "Level 4 is available");
  assert(!isLevelAvailable(5), "Level 5 is not available");
  assert(!isLevelAvailable(-1), "Level -1 is not available");
}

// ── canExecuteAtLevel ─────────────────────────────────────────────────

function testCanExecuteAtLevel(): void {
  console.log("\n[canExecuteAtLevel]");

  // Employee with autonomy 3 can execute tasks requiring level 0-3
  assert(canExecuteAtLevel(0, 3), "Level 3 employee can do level 0 tasks");
  assert(canExecuteAtLevel(3, 3), "Level 3 employee can do level 3 tasks");
  assert(!canExecuteAtLevel(4, 3), "Level 3 employee cannot do level 4 tasks");
  assert(canExecuteAtLevel(4, 4), "Level 4 employee can do level 4 tasks");
}

// ── requiresApprovalAtLevel ───────────────────────────────────────────

function testRequiresApprovalAtLevel(): void {
  console.log("\n[requiresApprovalAtLevel]");

  // Risk tier 0-1 never requires approval
  assert(!requiresApprovalAtLevel(0, 0), "Risk tier 0 no approval at level 0");
  assert(!requiresApprovalAtLevel(1, 0), "Risk tier 1 no approval at level 0");

  // Risk tier 2 requires approval below level 2
  assert(requiresApprovalAtLevel(2, 0), "Risk tier 2 requires approval at level 0");
  assert(requiresApprovalAtLevel(2, 1), "Risk tier 2 requires approval at level 1");
  assert(!requiresApprovalAtLevel(2, 2), "Risk tier 2 no approval at level 2");

  // Risk tier 3+ always requires approval
  assert(requiresApprovalAtLevel(3, 4), "Risk tier 3 requires approval even at level 4");
  assert(requiresApprovalAtLevel(4, 4), "Risk tier 4 requires approval even at level 4");

  // Unknown risk (default-safe)
  assert(requiresApprovalAtLevel(99, 4), "Unknown risk tier defaults to approval required");
}

// ── isBlockedRiskAtLevel ──────────────────────────────────────────────

function testIsBlockedRiskAtLevel(): void {
  console.log("\n[isBlockedRiskAtLevel]");

  // Risk tier 5 is always blocked
  assert(isBlockedRiskAtLevel(5, 0), "Risk tier 5 blocked at level 0");
  assert(isBlockedRiskAtLevel(5, 4), "Risk tier 5 blocked at level 4");

  // Risk tier 4 blocked below level 4
  assert(isBlockedRiskAtLevel(4, 0), "Risk tier 4 blocked at level 0");
  assert(isBlockedRiskAtLevel(4, 3), "Risk tier 4 blocked at level 3");
  assert(!isBlockedRiskAtLevel(4, 4), "Risk tier 4 not blocked at level 4");

  // Risk tier 0 not blocked
  assert(!isBlockedRiskAtLevel(0, 0), "Risk tier 0 not blocked");
  // Risk tier 1-2 blocked below level 1
  assert(isBlockedRiskAtLevel(1, 0), "Risk tier 1 blocked at level 0");
  assert(isBlockedRiskAtLevel(2, 0), "Risk tier 2 blocked at level 0");
  assert(!isBlockedRiskAtLevel(1, 1), "Risk tier 1 not blocked at level 1");
  assert(!isBlockedRiskAtLevel(2, 1), "Risk tier 2 not blocked at level 1");
  // Risk tier 3 blocked below level 3
  assert(isBlockedRiskAtLevel(3, 0), "Risk tier 3 blocked at level 0");
  assert(!isBlockedRiskAtLevel(3, 3), "Risk tier 3 not blocked at level 3");
}

// ── Labels ────────────────────────────────────────────────────────────

function testLabels(): void {
  console.log("\n[Labels]");
  assertEqual(AUTONOMY_LEVEL_LABELS[0], "Draft only", "Level 0 label");
  assertEqual(AUTONOMY_LEVEL_LABELS[4], "Trusted routine", "Level 4 label");
  // No Level 5 label
  const hasLevel5Label = "5" in AUTONOMY_LEVEL_LABELS;
  assert(!hasLevel5Label, "No Level 5 label in MVP");
}

// ── Profile Defaults ──────────────────────────────────────────────────

function testProfileDefaults(): void {
  console.log("\n[Profile Defaults]");

  const bp = createDefaultBusinessProfile();
  assertEqual(bp.timezone, "UTC", "Default timezone UTC");
  assertEqual(bp.version, 1, "Default version 1");
  assert(bp.createdAt.length > 0, "Has createdAt");
  assert(bp.updatedAt.length > 0, "Has updatedAt");

  const ep = createDefaultEmployeeProfile();
  assertEqual(ep.status, "draft", "Default status draft");
  assertEqual(ep.autonomyLevel, 0, "Default autonomy level 0");
  assertEqual(ep.version, 1, "Default version 1");
  assert(Array.isArray(ep.responsibilities), "Responsibilities is array");
  assert(Array.isArray(ep.nonGoals), "Non-goals is array");
}

// ── Validation ────────────────────────────────────────────────────────

function testValidation(): void {
  console.log("\n[Validation]");

  const empty = validateEmployeeProfile({});
  assert(empty.length > 0, "Empty profile has validation errors");

  const missing = validateEmployeeProfile({ name: "Support Bot" });
  assert(missing.length > 0, "Partial profile still has errors");

  const full = validateEmployeeProfile({
    name: "Support Bot",
    orgId: "org-1",
    businessProfileId: "bp-1",
    ownerUserId: "user-1",
  });
  assertEqual(full.length, 0, "Complete profile has no validation errors");

  // isEmployeeReady
  assert(!isEmployeeReady(createDefaultEmployeeProfile()), "Default profile not ready");
  const ready = createDefaultEmployeeProfile({
    name: "Support Bot",
    orgId: "org-1",
    businessProfileId: "bp-1",
    ownerUserId: "user-1",
    status: "active",
  });
  assert(isEmployeeReady(ready), "Active configured profile is ready");
}

// ── Query Helpers ─────────────────────────────────────────────────────

function testQueryHelpers(): void {
  console.log("\n[Query Helpers]");

  const payload = buildEmployeeInsertPayload({
    name: "Test Employee",
    orgId: "org-1",
    businessProfileId: "bp-1",
    ownerUserId: "user-1",
  });
  assertEqual(payload.name, "Test Employee", "Payload has name");
  assertEqual(payload.org_id, "org-1", "Payload has org_id (snake_case)");
  assertEqual(payload.status, "draft", "Payload defaults to draft");
  assertEqual(payload.autonomy_level, 0, "Payload defaults to level 0");

  const bpPayload = buildBusinessProfileInsertPayload({
    organizationName: "Test Corp",
    orgId: "org-1",
    ownerUserId: "user-1",
  });
  assertEqual(bpPayload.organization_name, "Test Corp", "BP payload has org name");
  assertEqual(bpPayload.timezone, "UTC", "BP payload defaults UTC");

  // Round-trip: build insert payload -> toEmployeeProfile
  const roundTripped = toEmployeeProfile({
    id: "00000000-0000-0000-0000-000000000001",
    org_id: "org-1",
    business_profile_id: "bp-1",
    name: "Test Employee",
    role: "customer_support",
    description: "A test employee",
    responsibilities: ["triage"],
    non_goals: ["refund"],
    status: "draft",
    autonomy_level: 0,
    skill_pack_ids: [],
    connected_app_ids: [],
    allowed_tool_ids: [],
    blocked_tool_ids: [],
    schedule_ids: [],
    owner_user_id: "user-1",
    reviewer_user_ids: [],
    version: 1,
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
  });

  assertEqual(roundTripped.id, "00000000-0000-0000-0000-000000000001", "Round-trip preserves id");
  assertEqual(roundTripped.orgId, "org-1", "Round-trip preserves orgId");
  assertEqual(roundTripped.role, "customer_support", "Round-trip preserves role");
}

// ── Main runner ───────────────────────────────────────────────────────

function main(): void {
  console.log("Employee + Business Profile Foundation — Validation Suite");
  setup();
  testAutonomyTypes();
  testAutonomyHelpers();
  testCanExecuteAtLevel();
  testRequiresApprovalAtLevel();
  testIsBlockedRiskAtLevel();
  testLabels();
  testProfileDefaults();
  testValidation();
  testQueryHelpers();

  console.log(`\n${"\u2500".repeat(40)}`);
  console.log(`Results: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
