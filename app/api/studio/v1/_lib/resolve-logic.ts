/**
 * Studio V5 P01 — local-lane resolve logic (pure, lane-agnostic core). The
 * resolve route adapter injects the local catalog source; this module runs
 * the shared deterministic router over it with the local lane's empty
 * attestation set. The route itself is not importable in the root harness
 * (see preferences-logic.ts), so the suite drives this module directly.
 */
import type { TaskName, VersionPins } from "@ethen/studio-core/contracts";
import {
  routeAutoWith,
  routeExplicit,
  RouteError,
  type CandidateExclusion,
  type CatalogSourceEndpoint,
  type EndpointSpec,
  type QualityIntent,
  type RouteDecision,
} from "@ethen/studio-core/catalog";

/**
 * Local-lane adapter: a normalized local source row becomes the EndpointSpec
 * shape the shared router consumes. Taskless rows (unmapped slugs) serve no
 * canonical task, so they are left out — the router would TASK_MISMATCH them
 * against every request. `jsonSchema` stays empty: endpoint controls still
 * come from the verified snapshots (required/supportedControls), while full
 * JSON-schema parameter validation belongs to the Supabase lane's stored
 * specs. Nothing here can qualify without an attestation, so no route is
 * ever promoted beyond what the evidence supports.
 */
export function localSourceToSpecs(source: readonly CatalogSourceEndpoint[]): EndpointSpec[] {
  const specs: EndpointSpec[] = [];
  for (const row of source) {
    const task = row.tasks[0];
    if (!task) continue;
    specs.push({
      endpointId: row.endpointId,
      familyId: row.familyId,
      providerId: row.providerId,
      task,
      label: row.label,
      description: row.description,
      adapterName: row.adapterName,
      adapterVersion: row.adapterVersion,
      schemaVersion: row.schemaVersion,
      jsonSchema: {},
      requiredControls: [...row.requiredControls],
      supportedControls: [...row.supportedControls],
      rawParams: {},
      priceVersion: row.priceVersion,
      policyProfile: row.policyProfile,
      identityBinding: row.identityBinding,
      capabilityTags: [...row.capabilityTags],
    });
  }
  return specs;
}

export type LocalResolveOutcome =
  | { kind: "decision"; decision: RouteDecision }
  | { kind: "no-route"; reason: string; excluded: readonly CandidateExclusion[] }
  | { kind: "unknown-pin"; message: string };

export interface LocalResolveInput {
  specs: readonly EndpointSpec[];
  task: TaskName;
  pins: VersionPins;
  parameters: Readonly<Record<string, unknown>>;
  providerParams: unknown;
  endpointId: string | null;
  quality: QualityIntent;
  capIcu: number | null;
}

/**
 * Route one local-lane request through the shared router. Either a qualified
 * route wins, or the caller gets the router's honest no-route result with
 * its recorded exclusions — never a substituted endpoint, never a guess.
 */
export function resolveLocalRoute(input: LocalResolveInput): LocalResolveOutcome {
  const base = {
    task: input.task,
    pins: input.pins,
    parameters: input.parameters,
    providerParams: input.providerParams,
    identityBinding: null,
    tenantProviders: {},
    workspaceEndpoints: {},
    breakerPaused: new Set<string>(),
    disabledEndpoints: new Set<string>(),
  };
  // The local lane holds no attestations: nothing is promoted to executable
  // beyond what the projection already states.
  const refs = { specs: input.specs, attestations: new Map() };
  if (input.endpointId) {
    try {
      const decision = routeExplicit(refs, {
        ...base,
        endpointId: input.endpointId,
        meterUnit: "task_unit",
        meterQuantity: 1,
      });
      return { kind: "decision", decision };
    } catch (error) {
      if (error instanceof RouteError) {
        if (error.code === "PINNED_UNKNOWN") return { kind: "unknown-pin", message: error.message };
        return { kind: "no-route", reason: error.message, excluded: error.excluded };
      }
      throw error;
    }
  }
  try {
    const decision = routeAutoWith(refs, {
      ...base,
      intent: { quality: input.quality, capIcu: input.capIcu },
      availability: { configuredProviders: new Set<string>() },
      meterUnit: "task_unit",
      meterQuantity: 1,
    });
    return { kind: "decision", decision };
  } catch (error) {
    if (error instanceof RouteError) {
      return { kind: "no-route", reason: error.message, excluded: error.excluded };
    }
    throw error;
  }
}
