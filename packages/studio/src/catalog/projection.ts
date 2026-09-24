/** Studio V5 M2 — the one catalog projection (both lanes). Pure, browser-safe. */
import type { VersionPins } from "../contracts/versions";
import type { TaskName } from "../contracts/tasks";
import type {
  DiscoverableEndpoint,
  FamilyProjection,
  PriceState,
  QualificationAttestation,
  QualificationState,
} from "./types";
import { resolveQualificationState } from "./qualification";
import { priceQuoteGuidance, resolvePriceState, type PriceRowView } from "./price-states";
import { TASK_MAP_VERSION } from "./task-map";
import { BLOCKED_SCHEMA_UNKNOWN, type CatalogSourceEndpoint } from "./source-local";
import { BLOCKED_UNMAPPED_TASK } from "./task-map";

export interface ProjectCatalogOptions {
  catalogVersion: string;
  taskMapVersion?: string;
  nowIso?: string;
  /** `?task=` filter: applied before rollups so tallies reflect the filter. */
  taskFilter?: TaskName | null;
  pins?: VersionPins | null;
  /**
   * M4 canary gate: PARTIALLY_QUALIFIED executes only when explicitly
   * allowed (dev `ETHEN_STUDIO_ALLOW_PARTIAL=1`). Default false.
   */
  allowPartial?: boolean;
}

export interface CatalogProjectionV2 {
  catalogVersion: string;
  taskMapVersion: string;
  projectedAt: string;
  families: FamilyProjection[];
  endpoints: DiscoverableEndpoint[];
  tallies: {
    families: number;
    endpoints: number;
    executable: number;
    /** Serious-candidate set: eligible + supported schema + mapped task. */
    candidates: number;
    byTask: Partial<Record<TaskName, number>>;
    byQualification: Record<QualificationState, number>;
    byPrice: Record<PriceState, number>;
  };
}

function emptyQualificationTally(): Record<QualificationState, number> {
  return {
    QUALIFIED: 0,
    PARTIALLY_QUALIFIED: 0,
    UNVERIFIED: 0,
    DISABLED: 0,
    DEPRECATED: 0,
    UNHEALTHY: 0,
    REGION_BLOCKED: 0,
    CREDENTIAL_MISSING: 0,
  };
}

function emptyPriceTally(): Record<PriceState, number> {
  return { VERIFIED: 0, DERIVED: 0, STALE: 0, UNKNOWN: 0 };
}

/**
 * Project normalized source rows from EITHER lane into the discoverable
 * catalog. Every endpoint gets exactly one qualification state and exactly
 * one price state; counts are derived live from the projection.
 */
export function projectCatalog(
  source: readonly CatalogSourceEndpoint[],
  attestations: ReadonlyMap<string, QualificationAttestation>,
  prices: ReadonlyMap<string, PriceRowView>,
  pauses: ReadonlySet<string>,
  options: ProjectCatalogOptions,
): CatalogProjectionV2 {
  const now = options.nowIso ?? new Date().toISOString();
  const taskFilter = options.taskFilter ?? null;
  const allowPartial = options.allowPartial ?? false;
  const filtered = taskFilter ? source.filter((row) => row.tasks.includes(taskFilter)) : source;

  const endpoints: DiscoverableEndpoint[] = filtered.map((row) => {
    const attestation = attestations.get(row.endpointId) ?? null;
    const priceRow = prices.get(row.endpointId) ?? row.priceRow ?? null;
    const priceState = resolvePriceState(priceRow, row.pricingSourceHash);
    const guidance = priceQuoteGuidance(priceState);
    const taskMapped = row.tasks.length > 0;
    const resolved = resolveQualificationState(
      {
        endpointId: row.endpointId,
        adapterName: row.adapterName,
        adapterVersion: row.adapterVersion,
        schemaVersion: row.schemaVersion,
        policyProfile: row.policyProfile,
        priceVersion: row.priceVersion,
      },
      attestation,
      options.pins ?? null,
      {
        disabled: !row.enabled,
        deprecated: row.deprecated,
        unhealthy: row.unhealthy || pauses.has(row.endpointId),
        regionBlocked: false,
        credentialMissing: false,
        schemaKnown: row.schemaKnown,
        taskMapped,
        hasPriceEvidence: priceState === "VERIFIED" || priceState === "DERIVED",
      },
      now,
    );
    const executable =
      resolved.state === "QUALIFIED" || (allowPartial && resolved.state === "PARTIALLY_QUALIFIED");
    const disabledReasons = resolved.exclusions.map((e) => e.detail);
    const blockedCodes: string[] = [];
    if (!taskMapped) blockedCodes.push(BLOCKED_UNMAPPED_TASK);
    if (!row.schemaKnown) blockedCodes.push(BLOCKED_SCHEMA_UNKNOWN);
    if (guidance.blockedCode) {
      blockedCodes.push(guidance.blockedCode);
      if (guidance.label) disabledReasons.push(guidance.label === "Price not verified" ? "Price not verified." : `Estimate only (${guidance.label}).`);
    }
    if (row.disposition === "quarantined") {
      disabledReasons.push(`Quarantined in source${row.dispositionReason ? `: ${row.dispositionReason}` : "."}`);
    } else if (row.disposition === "excluded") {
      disabledReasons.push(`Excluded from execution${row.dispositionReason ? `: ${row.dispositionReason}` : "."}`);
    }
    return {
      endpointId: row.endpointId,
      familyId: row.familyId,
      familyLabel: row.familyLabel,
      providerId: row.providerId,
      task: row.tasks[0] ?? null,
      tasks: row.tasks,
      label: row.label,
      supportedParameters: row.supportedControls,
      requiredParameters: row.requiredControls,
      executable,
      disabledReasons,
      qualificationState: resolved.state,
      priceState,
      capabilityTags: row.capabilityTags,
      modalityIn: row.modalityIn,
      modalityOut: row.modalityOut,
      parameterForm: row.parameterForm,
      blockedCodes,
    };
  });

  const byFamily = new Map<string, { label: string; providerId: string; tasks: Set<TaskName>; total: number; executable: number }>();
  for (const endpoint of endpoints) {
    const entry = byFamily.get(endpoint.familyId) ?? {
      label: endpoint.familyLabel,
      providerId: endpoint.providerId,
      tasks: new Set<TaskName>(),
      total: 0,
      executable: 0,
    };
    for (const task of endpoint.tasks) entry.tasks.add(task);
    entry.total += 1;
    if (endpoint.executable) entry.executable += 1;
    byFamily.set(endpoint.familyId, entry);
  }
  const families: FamilyProjection[] = [...byFamily.entries()].map(([familyId, entry]) => ({
    familyId,
    label: entry.label,
    providerId: entry.providerId,
    tasks: [...entry.tasks],
    endpointCount: entry.total,
    executableCount: entry.executable,
  }));

  const byTask: Partial<Record<TaskName, number>> = {};
  const byQualification = emptyQualificationTally();
  const byPrice = emptyPriceTally();
  for (const endpoint of endpoints) {
    for (const task of endpoint.tasks) byTask[task] = (byTask[task] ?? 0) + 1;
    byQualification[endpoint.qualificationState] += 1;
    byPrice[endpoint.priceState] += 1;
  }
  return {
    catalogVersion: options.catalogVersion,
    taskMapVersion: options.taskMapVersion ?? TASK_MAP_VERSION,
    projectedAt: now,
    families,
    endpoints,
    tallies: {
      families: families.length,
      endpoints: endpoints.length,
      executable: endpoints.filter((e) => e.executable).length,
      candidates: filtered.filter((row) => row.disposition === "eligible" && row.schemaKnown && row.tasks.length > 0).length,
      byTask,
      byQualification,
      byPrice,
    },
  };
}
