// Reusable, deterministic Cortex eval execution + scoring library.
// No live provider calls — every check exercises in-repo Cortex modules
// against fixed fixtures. See fixtures/evals/cortex/fixtures.ts for cases
// and scripts/validate-cortex-evals.ts for the CLI entrypoint.

import { classifyIntent, getDefaultModeForIntent } from "./intent-classifier";
import { selectCandidates } from "./model-router";
import type { ModelCandidate } from "./types";
import { getCortexRouteProfile } from "./routes";
import { verifyCortexOutput } from "./verifier";
import { buildResearchCortexReceipt } from "./research";
import type { CortexFallbackAttempt, FallbackFinalStatus } from "./types";
import {
  INTENT_FIXTURES,
  MODE_PROFILE_FIXTURES,
  ROUTE_SELECTION_FIXTURES,
  VERIFIER_FIXTURES,
  RECEIPT_TRUTH_FIXTURES,
  FALLBACK_BEHAVIOR_FIXTURES,
  COST_LATENCY_FIXTURES,
  RESEARCH_GROUNDING_FIXTURES,
  CAPABILITY_GATING_FIXTURES,
  PROVIDER_OUTAGE_FIXTURES,
} from "../evals/fixtures/cortex/fixtures";
import type {
  CortexEvalCategory,
  CortexEvalCategorySummary,
  CortexEvalCheck,
  CortexEvalSummary,
} from "./eval-types";

// Mirrors lib/cortex/route-receipt.ts#resolveFallbackFinalStatus, which is
// not exported. Keep this in sync if that logic changes.
function resolveFallbackFinalStatus(
  attempts: CortexFallbackAttempt[] | undefined,
  fallbackUsed: boolean | undefined
): FallbackFinalStatus {
  if (!attempts || attempts.length === 0) {
    return fallbackUsed ? "failed" : "primary_success";
  }
  const last = attempts[attempts.length - 1];
  if (last.succeeded) {
    const firstFailed = attempts.some((a) => !a.succeeded);
    return firstFailed ? "fallback_success" : "primary_success";
  }
  return "failed";
}

export function runIntentRoutingChecks(): CortexEvalCheck[] {
  return INTENT_FIXTURES.flatMap((fixture) => {
    const classification = classifyIntent({ message: fixture.message, selectedMode: fixture.selectedMode });
    const resolvedMode =
      fixture.selectedMode !== "auto" ? fixture.selectedMode : getDefaultModeForIntent(classification.primaryIntent);

    return [
      {
        category: "intent-routing" as const,
        name: `${fixture.name}: intent`,
        passed: classification.primaryIntent === fixture.expectedIntent,
        detail: `expected ${fixture.expectedIntent}, got ${classification.primaryIntent}`,
      },
      {
        category: "intent-routing" as const,
        name: `${fixture.name}: mode`,
        passed: resolvedMode === fixture.expectedMode,
        detail: `expected ${fixture.expectedMode}, got ${resolvedMode}`,
      },
    ];
  });
}

export function runModeResolutionChecks(): CortexEvalCheck[] {
  return MODE_PROFILE_FIXTURES.flatMap((fixture) => {
    const profile = getCortexRouteProfile(fixture.mode);
    return [
      {
        category: "mode-resolution" as const,
        name: `${fixture.name}: status`,
        passed: profile?.status === fixture.expectedStatus,
        detail: `got ${profile?.status}`,
      },
      {
        category: "mode-resolution" as const,
        name: `${fixture.name}: toolPolicy`,
        passed: profile?.toolPolicy === fixture.expectedToolPolicy,
        detail: `got ${profile?.toolPolicy}`,
      },
    ];
  });
}

export function runRouteSelectionChecks(): CortexEvalCheck[] {
  return ROUTE_SELECTION_FIXTURES.map((fixture) => {
    const result = selectCandidates(fixture.routeId, fixture.candidates);
    const selectedId = result.selected?.id ?? null;
    return {
      category: "route-selection" as const,
      name: fixture.name,
      passed: selectedId === fixture.expectedSelectedId,
      detail: `expected ${fixture.expectedSelectedId}, got ${selectedId}`,
    };
  });
}

export function runVerifierPolicyChecks(): CortexEvalCheck[] {
  return VERIFIER_FIXTURES.map((fixture) => {
    const output = verifyCortexOutput(fixture.input);
    return {
      category: "verifier-policy" as const,
      name: fixture.name,
      passed: output.status === fixture.expectedStatus,
      detail: `expected ${fixture.expectedStatus}, got ${output.status}`,
    };
  });
}

export function runReceiptTruthChecks(): CortexEvalCheck[] {
  return RECEIPT_TRUTH_FIXTURES.map((fixture) => {
    const attempts: CortexFallbackAttempt[] = fixture.attempts.map((a, i) => ({
      attemptNumber: i + 1,
      providerId: a.providerId,
      timestamp: new Date(0).toISOString(),
      succeeded: a.succeeded,
    }));
    const finalStatus = resolveFallbackFinalStatus(attempts, fixture.fallbackUsed);
    return {
      category: "receipt-truth" as const,
      name: fixture.name,
      passed: finalStatus === fixture.expectedFinalStatus,
      detail: `expected ${fixture.expectedFinalStatus}, got ${finalStatus}`,
    };
  });
}

export function runFallbackBehaviorChecks(): CortexEvalCheck[] {
  return FALLBACK_BEHAVIOR_FIXTURES.map((fixture) => {
    const attempts: CortexFallbackAttempt[] = fixture.attempts.map((a, i) => ({
      attemptNumber: i + 1,
      providerId: a.providerId,
      timestamp: new Date(0).toISOString(),
      succeeded: a.succeeded,
    }));
    const finalStatus = resolveFallbackFinalStatus(attempts, fixture.fallbackUsed);
    return {
      category: "fallback-behavior" as const,
      name: fixture.name,
      passed: finalStatus === fixture.expectedFinalStatus,
      detail: `expected ${fixture.expectedFinalStatus}, got ${finalStatus}`,
    };
  });
}

export function runCostLatencyChecks(): CortexEvalCheck[] {
  return COST_LATENCY_FIXTURES.flatMap((fixture) => {
    const result = selectCandidates(fixture.routeId, fixture.candidates);
    const selectedId = result.selected?.id ?? null;
    const checks: CortexEvalCheck[] = [
      {
        category: "cost-latency" as const,
        name: `${fixture.name}: selection`,
        passed: selectedId === fixture.expectedSelectedId,
        detail: `expected ${fixture.expectedSelectedId}, got ${selectedId}`,
      },
    ];

    if (fixture.expectedLatencyClass) {
      checks.push({
        category: "cost-latency" as const,
        name: `${fixture.name}: latency tier`,
        passed: result.selected?.latencyClass === fixture.expectedLatencyClass,
        detail: `expected ${fixture.expectedLatencyClass}, got ${result.selected?.latencyClass}`,
      });
    }

    if (fixture.expectedMaxCostPerToken !== undefined) {
      const cost =
        (result.selected?.costPerInputTokenUsd ?? 0) + (result.selected?.costPerOutputTokenUsd ?? 0);
      checks.push({
        category: "cost-latency" as const,
        name: `${fixture.name}: cost tier`,
        passed: cost <= fixture.expectedMaxCostPerToken,
        detail: `expected <= ${fixture.expectedMaxCostPerToken}, got ${cost}`,
      });
    }

    return checks;
  });
}

export function runResearchGroundingChecks(): CortexEvalCheck[] {
  return RESEARCH_GROUNDING_FIXTURES.flatMap((fixture) => {
    const receipt = buildResearchCortexReceipt(fixture.input);
    return [
      {
        category: "research-grounding" as const,
        name: `${fixture.name}: sourceGrounded`,
        passed: receipt.sourceGrounded === fixture.expectedSourceGrounded,
        detail: `expected ${fixture.expectedSourceGrounded}, got ${receipt.sourceGrounded}`,
      },
      {
        category: "research-grounding" as const,
        name: `${fixture.name}: citationsAvailable`,
        passed: receipt.citationsAvailable === fixture.expectedCitationsAvailable,
        detail: `expected ${fixture.expectedCitationsAvailable}, got ${receipt.citationsAvailable}`,
      },
      {
        category: "research-grounding" as const,
        name: `${fixture.name}: confidence`,
        passed: receipt.confidence === fixture.expectedConfidence,
        detail: `expected ${fixture.expectedConfidence}, got ${receipt.confidence}`,
      },
    ];
  });
}

export function runCapabilityGatingChecks(): CortexEvalCheck[] {
  return CAPABILITY_GATING_FIXTURES.map((fixture) => {
    const viable = fixture.candidates.filter((c) => {
      if (!c.enabled) return false;
      if (fixture.required.tools && !c.supportsTools) return false;
      if (fixture.required.jsonMode && !c.supportsJsonMode) return false;
      if (fixture.required.vision && !c.supportsVision) return false;
      return true;
    });
    const selectedId = viable.length > 0 ? viable[0].id : null;
    const passed = selectedId === fixture.expectedSelectedId;
    const detail = fixture.expectedError
      ? `expected ${fixture.expectedError}, got ${selectedId === null ? "capability_not_executable" : selectedId}`
      : `expected ${fixture.expectedSelectedId}, got ${selectedId}`;
    return {
      category: "capability-gating" as const,
      name: fixture.name,
      passed,
      detail,
    };
  });
}

export function runProviderOutageChecks(): CortexEvalCheck[] {
  return PROVIDER_OUTAGE_FIXTURES.map((fixture) => {
    const result = selectCandidates(fixture.routeId, fixture.candidates as ModelCandidate[]);
    const selectedId = result.selected?.id ?? null;
    return {
      category: "provider-outage" as const,
      name: fixture.name,
      passed: selectedId === fixture.expectedSelectedId,
      detail: `expected ${fixture.expectedSelectedId}, got ${selectedId}`,
    };
  });
}

const CATEGORY_RUNNERS: Record<CortexEvalCategory, () => CortexEvalCheck[]> = {
  "intent-routing": runIntentRoutingChecks,
  "mode-resolution": runModeResolutionChecks,
  "route-selection": runRouteSelectionChecks,
  "receipt-truth": runReceiptTruthChecks,
  "verifier-policy": runVerifierPolicyChecks,
  "fallback-behavior": runFallbackBehaviorChecks,
  "cost-latency": runCostLatencyChecks,
  "research-grounding": runResearchGroundingChecks,
  "capability-gating": runCapabilityGatingChecks,
  "provider-outage": runProviderOutageChecks,
};

function rate(checks: CortexEvalCheck[], category: CortexEvalCategory): number | null {
  const relevant = checks.filter((c) => c.category === category);
  if (relevant.length === 0) return null;
  return relevant.filter((c) => c.passed).length / relevant.length;
}

export function runCortexEvals(): CortexEvalSummary {
  const checks = (Object.keys(CATEGORY_RUNNERS) as CortexEvalCategory[]).flatMap((category) =>
    CATEGORY_RUNNERS[category]()
  );

  const byCategory: CortexEvalCategorySummary[] = (Object.keys(CATEGORY_RUNNERS) as CortexEvalCategory[]).map(
    (category) => {
      const relevant = checks.filter((c) => c.category === category);
      const passed = relevant.filter((c) => c.passed).length;
      return { category, total: relevant.length, passed, failed: relevant.length - passed };
    }
  );

  const totalPassed = checks.filter((c) => c.passed).length;

  return {
    checks,
    totalCases: checks.length,
    totalPassed,
    totalFailed: checks.length - totalPassed,
    byCategory,
    metrics: {
      routeAccuracy: rate(checks, "route-selection"),
      verifierAccuracy: rate(checks, "verifier-policy"),
      receiptTruthRate: rate(checks, "receipt-truth"),
      fallbackSuccessRate: rate(checks, "fallback-behavior"),
      costLatencyTierPassRate: rate(checks, "cost-latency"),
    },
  };
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

export function formatCortexEvalReport(summary: CortexEvalSummary): string {
  const lines: string[] = [];

  for (const cat of summary.byCategory) {
    if (cat.total === 0) continue;
    lines.push(`${cat.category}: ${cat.passed}/${cat.total} passed`);
    for (const check of summary.checks) {
      if (check.category === cat.category && !check.passed) {
        lines.push(`  FAIL: ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
      }
    }
  }

  lines.push("");
  lines.push(`Route accuracy: ${formatPercent(summary.metrics.routeAccuracy)}`);
  lines.push(`Verifier accuracy: ${formatPercent(summary.metrics.verifierAccuracy)}`);
  lines.push(`Receipt truth rate: ${formatPercent(summary.metrics.receiptTruthRate)}`);
  lines.push(`Fallback success rate: ${formatPercent(summary.metrics.fallbackSuccessRate)}`);
  lines.push(`Cost/latency tier pass rate: ${formatPercent(summary.metrics.costLatencyTierPassRate)}`);
  lines.push("");
  lines.push(`Total: ${summary.totalPassed}/${summary.totalCases} passed`);

  return lines.join("\n");
}
