import type {
  CodingProvider,
  CodingProviderExecutionRequest,
  CodingProviderExecutionResult,
  CodingProviderCapabilities,
  CodingProviderFinalReport,
  CodingProviderPatch,
  CodingProviderPlan,
} from "./coding-provider";
import { resolveRuntimeLane, type RuntimeLane } from "@ethen/config/env-contract";

export interface MockCodingProviderScenario {
  plan: CodingProviderPlan;
  patch: CodingProviderPatch;
  repairPatch?: CodingProviderPatch | null | (() => CodingProviderPatch | null);
  finalReport?: CodingProviderFinalReport | null;
  capabilities?: Partial<CodingProviderCapabilities>;
}

/**
 * Explicit Demo-only gate (LIVE-PATH-SIMULATION-REMOVAL-01, COD-P0-06).
 *
 * The mock coding provider may only be created in a development/test lane.
 * Production and preview runtimes refuse it at the provider boundary, so a
 * live run can never be routed into fixture execution even if a future caller
 * forgets the API-level gate (`isMockModeAllowed`). Live failures stay
 * failures; mock output is an explicit demo action only.
 */
export function assertDemoLaneAllowed(
  lane: RuntimeLane,
): void {
  if (lane === "production" || lane === "preview") {
    throw new Error(
      "MOCK_PROVIDER_FORBIDDEN: the mock coding provider is Demo/test-only and cannot be created in this runtime.",
    );
  }
}

export function createMockCodingProvider(
  scenario: MockCodingProviderScenario,
  env: Record<string, string | undefined> = process.env,
): CodingProvider {
  assertDemoLaneAllowed(resolveRuntimeLane(env));
  function resolveRepairPatch(): CodingProviderPatch | null {
    if (scenario.repairPatch == null) return null;
    if (typeof scenario.repairPatch === "function") return scenario.repairPatch();
    return scenario.repairPatch;
  }
  return {
    id: "mock-coding-provider",
    label: "Mock coding provider",
    lastProviderUsage: null,
    capabilities: {
      toolCalling: true,
      toolResultContinuation: true,
      codingMode: true,
      warnings: [],
      ...scenario.capabilities,
    },
    async execute<T>(request: CodingProviderExecutionRequest): Promise<CodingProviderExecutionResult<T>> {
      if (request.signal?.aborted) throw new DOMException("Provider execution was cancelled.", "AbortError");
      const value = request.operation === "plan" ? scenario.plan
        : request.operation === "patch" ? scenario.patch
        : request.operation === "repair" ? resolveRepairPatch()
        : scenario.finalReport ?? null;
      return { value: value as T, usage: null, providerId: "mock-coding-provider", providerLabel: "Mock coding provider", warnings: ["Fixture mode: no provider model was called."] };
    },
    async createPlan() {
      return scenario.plan;
    },
    async createPatch() {
      return scenario.patch;
    },
    async createRepairPatch() {
      return resolveRepairPatch();
    },
    async createFinalReport() {
      return scenario.finalReport ?? null;
    },
  };
}
