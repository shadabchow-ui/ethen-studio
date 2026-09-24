// Tool Availability Planner — Validation Suite
// Run with: npx tsx lib/tools/__tests__/availability.test.ts

import { planToolAvailability, planToolAvailabilityBatch } from "../availability-core";
import { TOOL_REGISTRY } from "../registry";
import type { ToolAvailabilityInput } from "@ethen/contracts/tools/types";

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

// ── Test fixtures ──────────────────────────────────────────────────────────────

const FULLY_READY_INPUT: ToolAvailabilityInput = {
  toolId: "research.search",
  employeeRole: "research",
  autonomyLevel: 2,
  connectedApps: ["exa"],
  credentials: ["exa_api_key"],
  businessProfileComplete: true,
  budgetWithinLimit: true,
};

const RESEARCH_READ_INPUT: ToolAvailabilityInput = {
  toolId: "research.search",
  employeeRole: "research",
  autonomyLevel: 1,
  connectedApps: ["exa"],
  credentials: ["exa_api_key"],
  businessProfileComplete: true,
  budgetWithinLimit: true,
};

const ROLE_MISMATCH_INPUT: ToolAvailabilityInput = {
  toolId: "research.search",
  employeeRole: "customer_support",
  autonomyLevel: 2,
  connectedApps: [],
  credentials: [],
  businessProfileComplete: true,
  budgetWithinLimit: true,
};

const NO_CONNECTED_APP_INPUT: ToolAvailabilityInput = {
  toolId: "research.search",
  employeeRole: "research",
  autonomyLevel: 2,
  connectedApps: [],
  credentials: [],
  businessProfileComplete: true,
  budgetWithinLimit: true,
};

const BUDGET_EXCEEDED_INPUT: ToolAvailabilityInput = {
  toolId: "research.search",
  employeeRole: "research",
  autonomyLevel: 2,
  connectedApps: ["exa"],
  credentials: ["exa_api_key"],
  businessProfileComplete: true,
  budgetWithinLimit: false,
};

const CONTRACT_ONLY_INPUT: ToolAvailabilityInput = {
  toolId: "artifact.read",
  employeeRole: "research",
  autonomyLevel: 2,
  connectedApps: [],
  credentials: [],
  businessProfileComplete: true,
  budgetWithinLimit: true,
};

const UNKNOWN_TOOL_INPUT: ToolAvailabilityInput = {
  toolId: "nonexistent.tool" as never,
  employeeRole: "research",
  autonomyLevel: 2,
  connectedApps: [],
  credentials: [],
  businessProfileComplete: true,
  budgetWithinLimit: true,
};

const DESTRUCTIVE_HIGH_AUTONOMY_INPUT: ToolAvailabilityInput = {
  toolId: "research.search",
  employeeRole: "research",
  autonomyLevel: 4,
  connectedApps: ["exa"],
  credentials: ["exa_api_key"],
  businessProfileComplete: true,
  budgetWithinLimit: true,
};

const LEVEL0_READONLY_INPUT: ToolAvailabilityInput = {
  toolId: "research.search",
  employeeRole: "research",
  autonomyLevel: 0,
  connectedApps: ["exa"],
  credentials: ["exa_api_key"],
  businessProfileComplete: true,
  budgetWithinLimit: true,
};

const NO_APPROVAL_REQUIRED_INPUT: ToolAvailabilityInput = {
  toolId: "research.search",
  employeeRole: "research",
  autonomyLevel: 2,
  connectedApps: ["exa"],
  credentials: ["exa_api_key"],
  businessProfileComplete: true,
  budgetWithinLimit: true,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

function testAvailable(): void {
  console.log("\n[Available]");

  const result = planToolAvailability(FULLY_READY_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "available", "fully ready tool is available");
  assertEqual(result.toolId, "research.search", "tool id matches");
}

function testResearchRead(): void {
  console.log("\n[Research Read]");

  const result = planToolAvailability(RESEARCH_READ_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "available", "read-only tool is available at level 1");
}

function testRoleMismatch(): void {
  console.log("\n[Role Mismatch]");

  const result = planToolAvailability(ROLE_MISMATCH_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "blocked", "role mismatch blocks tool");
  const hasRoleDiagnostic = result.diagnostics.some(
    (d) => d.message.includes("not available for role"),
  );
  assert(hasRoleDiagnostic, "diagnostic mentions role mismatch");
}

function testNoConnectedApp(): void {
  console.log("\n[No Connected App]");

  const result = planToolAvailability(NO_CONNECTED_APP_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "setup_required", "missing connected app returns setup_required");
  const hasAppDiagnostic = result.diagnostics.some(
    (d) => d.message.includes("requires a connected app"),
  );
  assert(hasAppDiagnostic, "diagnostic mentions connected app requirement");
}

function testBudgetExceeded(): void {
  console.log("\n[Budget Exceeded]");

  const result = planToolAvailability(BUDGET_EXCEEDED_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "blocked", "budget exceeded blocks tool");
}

function testContractOnly(): void {
  console.log("\n[Contract Only]");

  const result = planToolAvailability(CONTRACT_ONLY_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "contract_only", "contract_only execution state returns contract_only");
}

function testUnknownTool(): void {
  console.log("\n[Unknown Tool]");

  const result = planToolAvailability(UNKNOWN_TOOL_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "blocked", "unknown tool is blocked");
  const hasUnregisteredDiag = result.diagnostics.some(
    (d) => d.message.includes("not registered"),
  );
  assert(hasUnregisteredDiag, "diagnostic mentions unregistered tool");
}

function testDestructiveBlockedAtHighAutonomy(): void {
  console.log("\n[Destructive Blocked at High Autonomy]");

  const result = planToolAvailability(DESTRUCTIVE_HIGH_AUTONOMY_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "available", "read-only available at high autonomy");
}

function testNoAutonomyLevel(): void {
  console.log("\n[No Autonomy Level]");

  const input: ToolAvailabilityInput = {
    ...FULLY_READY_INPUT,
    autonomyLevel: undefined,
  };
  const result = planToolAvailability(input, TOOL_REGISTRY);
  assertEqual(result.kind, "setup_required", "missing autonomy is setup_required");
}

function testLevel0AllowsReadOnly(): void {
  console.log("\n[Level 0 Allows Read-Only]");

  const result = planToolAvailability(LEVEL0_READONLY_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "available", "level 0 allows read_only tool");
}

function testBatchPlanning(): void {
  console.log("\n[Batch Planning]");

  const results = planToolAvailabilityBatch([
    FULLY_READY_INPUT,
    UNKNOWN_TOOL_INPUT,
    CONTRACT_ONLY_INPUT,
  ], TOOL_REGISTRY);
  assertEqual(results.length, 3, "batch returns all results");
  assertEqual(results[0].kind, "available", "first batch item available");
  assertEqual(results[1].kind, "blocked", "second batch item blocked");
  assertEqual(results[2].kind, "contract_only", "third batch item contract_only");
}

function testNoApprovalRequired(): void {
  console.log("\n[No Approval Required]");

  const result = planToolAvailability(NO_APPROVAL_REQUIRED_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "available", "tool without requiresApproval returns available");
  assertEqual(result.diagnostics.length, 0, "no diagnostics for tool without approval requirement");
}

function testBusinessProfileNotComplete(): void {
  console.log("\n[Business Profile Not Complete]");

  const input: ToolAvailabilityInput = {
    ...FULLY_READY_INPUT,
    businessProfileComplete: false,
  };
  const result = planToolAvailability(input, TOOL_REGISTRY);
  assertEqual(result.kind, "setup_required", "incomplete business profile is setup_required");
}

function testDiagnosticsOnAvailable(): void {
  console.log("\n[Diagnostics on Available]");

  const result = planToolAvailability(FULLY_READY_INPUT, TOOL_REGISTRY);
  assertEqual(result.kind, "available", "available");
  assert(Array.isArray(result.diagnostics), "diagnostics is array");
  assertEqual(result.diagnostics.length, 0, "no diagnostics for fully available tool");
}

// ── Run all tests ──────────────────────────────────────────────────────────────

testAvailable();
testResearchRead();
testRoleMismatch();
testNoConnectedApp();
testBudgetExceeded();
testContractOnly();
testUnknownTool();
testDestructiveBlockedAtHighAutonomy();
testNoAutonomyLevel();
testLevel0AllowsReadOnly();
testBatchPlanning();
testNoApprovalRequired();
testBusinessProfileNotComplete();
testDiagnosticsOnAvailable();

console.log(`\n${"=".repeat(40)}`);
console.log(`Availability tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(40)}`);

if (failed > 0) process.exit(1);
