/**
 * ETHEN-READY-042 — Policy simulation utilities.
 *
 * runSimulation: dry-runs the full enforcement path for a policy profile,
 * exercising every rule against representative contexts to verify correctness.
 * compareSimulationAndEnforcement: ensures enforcement and simulation produce
 * equivalent decisions for the same inputs.
 */

import { enforcePolicy, simulatePolicy, derivePolicyPosture } from "./enforcement";
import type { PolicyEnforcementInput, PolicyEnforcementOutcome, PolicySimulationResult } from "./enforcement";
import { getPolicyProfile, listPolicyDecisions } from "./fixtures";
import { listAuditEntries } from "@ethen/security/audit/service";

// ── Simulation scenarios ───────────────────────────────────────────────────

export interface SimulationScenario {
  name: string;
  input: PolicyEnforcementInput;
}

const DEFAULT_SCENARIOS: SimulationScenario[] = [
  {
    name: "provider-block-check",
    input: {
      policyId: "policy_default_safe",
      targetKind: "gateway_request",
      action: "unknown_provider",
      toolName: "provider.call",
      subjectId: "test-user",
      arguments: { provider: "unknown_provider", model: "gpt-4" },
      traceId: "sim-trace-provider-block",
    },
  },
  {
    name: "provider-allow-check",
    input: {
      policyId: "policy_default_safe",
      targetKind: "gateway_request",
      action: "openai",
      toolName: "provider.call",
      subjectId: "test-user",
      arguments: { provider: "openai", model: "gpt-4" },
      traceId: "sim-trace-provider-allow",
    },
  },
  {
    name: "approval-required-write",
    input: {
      policyId: "policy_default_safe",
      targetKind: "tool_call",
      action: "file.apply_patch",
      toolName: "file.apply_patch",
      subjectId: "test-user",
      arguments: { path: "/tmp/test.txt", content: "test" },
      traceId: "sim-trace-approval-write",
    },
  },
  {
    name: "expensive-model-block",
    input: {
      policyId: "policy_default_safe",
      targetKind: "gateway_request",
      action: "openai",
      toolName: "provider.call",
      subjectId: "test-user",
      arguments: { provider: "openai", modelTier: "flagship" },
      traceId: "sim-trace-expensive-model",
    },
  },
];

// ── runSimulation ──────────────────────────────────────────────────────────

/**
 * Run a simulation for a policy profile, exercising the full enforcement path
 * against representative scenarios. Returns a summary with per-scenario outcomes
 * and the derived posture.
 */
export function runSimulation(
  policyId: string,
  scenarios?: SimulationScenario[],
): PolicySimulationResult {
  const profile = getPolicyProfile(policyId);
  const usedScenarios = scenarios ?? DEFAULT_SCENARIOS;
  const results: PolicyEnforcementOutcome[] = [];
  const auditBefore = listAuditEntries({ limit: 100 }).length;

  // Run each scenario through simulatePolicy (no audit logging)
  for (const scenario of usedScenarios) {
    // Override policyId in scenario input
    const result = simulatePolicy(policyId, { ...scenario.input, policyId });
    results.push(result);
  }

  // Check audit count — simulation must NOT have added entries
  const auditAfter = listAuditEntries({ limit: 100 }).length;
  const auditEventCount = auditAfter - auditBefore;

  const deniedCount = results.filter((r) => r.denied).length;
  const approvalCount = results.filter((r) => r.requiresApproval).length;
  const allowedCount = results.filter((r) => r.allowed).length;
  const derivedPosture = derivePolicyPosture(policyId);

  const rationale = buildRationale(
    usedScenarios,
    results,
    deniedCount,
    approvalCount,
    allowedCount,
    derivedPosture,
    auditEventCount,
    profile,
  );

  return {
    policyId,
    profile,
    decision: null,
    derivedPosture,
    rationale,
    auditEventCount,
  };
}

function buildRationale(
  scenarios: SimulationScenario[],
  results: PolicyEnforcementOutcome[],
  deniedCount: number,
  approvalCount: number,
  allowedCount: number,
  derivedPosture: string,
  auditEventCount: number,
  profile: { name: string } | null,
): string {
  const parts: string[] = [];
  const profileName = profile?.name ?? scenarios[0]?.input.policyId ?? "unknown";

  parts.push(
    `Simulation for "${profileName}": ` +
    `${results.length} scenarios evaluated, ` +
    `${deniedCount} denied, ${approvalCount} approval-required, ${allowedCount} allowed.`,
  );

  if (deniedCount > 0) {
    const deniedRules = results
      .map((r, i) => ({ result: r, scenario: scenarios[i] }))
      .filter(({ result }) => result.denied)
      .map(({ result, scenario }) => `  - ${scenario.name}: ${result.reason}`)
      .join("\n");
    parts.push(`Denials:\n${deniedRules}`);
  }

  if (approvalCount > 0) {
    const approvalRules = results
      .map((r, i) => ({ result: r, scenario: scenarios[i] }))
      .filter(({ result }) => result.requiresApproval)
      .map(({ result, scenario }) => `  - ${scenario.name}: ${result.reason}`)
      .join("\n");
    parts.push(`Approval required:\n${approvalRules}`);
  }

  parts.push(`Derived posture: ${derivedPosture}`);
  parts.push(
    `Audit event side-effect check: ${auditEventCount > 0 ? `${auditEventCount} events leaked` : "clean (no audit events leaked during simulation)"}`,
  );

  return parts.join("\n");
}

// ── compareSimulationAndEnforcement ────────────────────────────────────────

export interface ComparisonResult {
  equivalent: boolean;
  scenarios: number;
  matches: number;
  mismatches: Array<{
    scenario: string;
    simulationState: string;
    enforcementState: string;
    reason: string;
  }>;
}

/**
 * Compare simulation and enforcement decisions for the same inputs.
 * Verifies that both paths produce the same decision (state, allowed/denied, reason).
 */
export function compareSimulationAndEnforcement(
  scenario: PolicyEnforcementInput,
): ComparisonResult {
  // Run simulation first
  const simResult = simulatePolicy(scenario.policyId, scenario);
  // Then run enforcement (this WILL log audit events for denials)
  const enfResult = enforcePolicy(scenario.policyId, scenario);

  const stateMatch = simResult.state === enfResult.state;
  const allowedMatch = simResult.allowed === enfResult.allowed;
  const deniedMatch = simResult.denied === enfResult.denied;
  const approvalMatch = simResult.requiresApproval === enfResult.requiresApproval;
  const reasonMatch = simResult.reason === enfResult.reason;

  const equivalent = stateMatch && allowedMatch && deniedMatch && approvalMatch && reasonMatch;

  const mismatches: ComparisonResult["mismatches"] = [];

  if (!equivalent) {
    if (!stateMatch) {
      mismatches.push({
        scenario: scenario.action,
        simulationState: simResult.state,
        enforcementState: enfResult.state,
        reason: "State differs between simulation and enforcement",
      });
    }
    if (!reasonMatch) {
      mismatches.push({
        scenario: scenario.action,
        simulationState: simResult.reason,
        enforcementState: enfResult.reason,
        reason: "Reason differs between simulation and enforcement",
      });
    }
    if (!allowedMatch || !deniedMatch || !approvalMatch) {
      mismatches.push({
        scenario: scenario.action,
        simulationState: `allowed=${simResult.allowed} denied=${simResult.denied} approval=${simResult.requiresApproval}`,
        enforcementState: `allowed=${enfResult.allowed} denied=${enfResult.denied} approval=${enfResult.requiresApproval}`,
        reason: "Decision flags differ between simulation and enforcement",
      });
    }
  }

  return {
    equivalent,
    scenarios: 1,
    matches: equivalent ? 1 : 0,
    mismatches,
  };
}

/**
 * Compare simulation and enforcement across multiple scenarios.
 */
export function compareAllScenarios(
  scenarios: SimulationScenario[],
): { overallEquivalent: boolean; total: number; matches: number; comparisons: ComparisonResult[] } {
  const comparisons = scenarios.map((s) =>
    compareSimulationAndEnforcement(s.input),
  );

  const total = comparisons.length;
  const matches = comparisons.filter((c) => c.equivalent).length;
  const overallEquivalent = matches === total;

  return { overallEquivalent, total, matches, comparisons };
}
