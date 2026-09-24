/** Studio V5 catalog — pure deterministic routing (STUDIO_06). Browser-safe. */
import type { TaskName } from "../contracts/tasks";
import { STUDIO_TASK_SCHEMA_VERSION, type VersionPins } from "../contracts/versions";
import type {
  AutoRationale,
  CandidateExclusion,
  EndpointSpec,
  QualificationAttestation,
  QuoteInputs,
  RouteDecision,
  RouteIntent,
} from "./types";
import { filterEligible, type EligibilityContext } from "./eligibility";

export type RouteErrorCode =
  | "NO_ELIGIBLE_CANDIDATE"
  | "PINNED_UNAVAILABLE"
  | "PINNED_UNKNOWN";

export class RouteError extends Error {
  readonly code: RouteErrorCode;
  readonly endpointId: string | null;
  readonly excluded: readonly CandidateExclusion[];
  constructor(
    code: RouteErrorCode,
    message: string,
    endpointId: string | null = null,
    excluded: readonly CandidateExclusion[] = [],
  ) {
    super(message);
    this.name = "RouteError";
    this.code = code;
    this.endpointId = endpointId;
    this.excluded = excluded;
  }
}

export interface AvailabilityHint {
  /** Configured/credentialed providers; unknown providers are not assumed. */
  configuredProviders: ReadonlySet<string>;
}

export interface AutoRouteInput extends EligibilityContext {
  intent: RouteIntent;
  availability: AvailabilityHint;
  meterUnit: string;
  meterQuantity: number;
}

export interface AutoRouteRefs {
  specs: readonly EndpointSpec[];
  attestations: ReadonlyMap<string, QualificationAttestation>;
}

/**
 * Auto route among eligible qualified candidates. Deterministic priority:
 * identity compatibility → availability → quality-intent fit → price within
 * cap (lower first) → endpointId tiebreak. Same input always selects the
 * same endpoint. Requested pins are ignored: Auto qualifies on endpoint
 * self-consistency and pins FROM the winner, so a new winner always means
 * new pins and a new quote. Records every exclusion and the selected reason.
 */
export function routeAutoWith(refs: AutoRouteRefs, input: AutoRouteInput): RouteDecision {
  const { candidates, excluded } = filterEligible(refs.specs, refs.attestations, { ...input, pins: null });
  const priced = applyCap(candidates, input.intent);
  if (priced.kept.length === 0) {
    throw new RouteError(
      "NO_ELIGIBLE_CANDIDATE",
      "No eligible qualified candidate for this request; see exclusions.",
      null,
      [...excluded, ...priced.dropped],
    );
  }
  const ranked = [...priced.kept].sort((a, b) => compareCandidates(a, b, input));
  const winner = ranked[0];
  const rationale = buildRationale(winner, input);
  const quoteInputs = quoteInputsFor(winner, input);
  return {
    endpointId: winner.endpointId,
    mode: "auto",
    pins: { ...quoteInputs.pins },
    rationale,
    excluded: [...excluded, ...priced.dropped],
    quoteInputs,
  };
}

function applyCap(
  candidates: readonly EndpointSpec[],
  intent: RouteIntent,
): { kept: EndpointSpec[]; dropped: CandidateExclusion[] } {
  const kept: EndpointSpec[] = [];
  const dropped: CandidateExclusion[] = [];
  for (const spec of candidates) {
    const estimate = intent.estimatedIcuByEndpoint?.[spec.endpointId];
    if (intent.capIcu !== null && estimate !== undefined && estimate > intent.capIcu) {
      dropped.push({
        endpointId: spec.endpointId,
        reason: "PRICE_UNKNOWN",
        detail: `Endpoint ${spec.endpointId} estimate ${estimate} ICU exceeds the approved cap ${intent.capIcu} ICU.`,
      });
      continue;
    }
    kept.push(spec);
  }
  return { kept, dropped };
}

function compareCandidates(a: EndpointSpec, b: EndpointSpec, input: AutoRouteInput): number {
  const identityA = identityRank(a, input);
  const identityB = identityRank(b, input);
  if (identityA !== identityB) return identityA - identityB;
  const availA = input.availability.configuredProviders.has(a.providerId) ? 0 : 1;
  const availB = input.availability.configuredProviders.has(b.providerId) ? 0 : 1;
  if (availA !== availB) return availA - availB;
  const qualityA = qualityRank(a, input.intent.quality);
  const qualityB = qualityRank(b, input.intent.quality);
  if (qualityA !== qualityB) return qualityA - qualityB;
  const priceA = input.intent.estimatedIcuByEndpoint?.[a.endpointId];
  const priceB = input.intent.estimatedIcuByEndpoint?.[b.endpointId];
  // Unknown price sorts after known price; never guessed into the ranking.
  if (priceA !== undefined || priceB !== undefined) {
    if (priceA === undefined) return 1;
    if (priceB === undefined) return -1;
    if (priceA !== priceB) return priceA - priceB;
  }
  return a.endpointId < b.endpointId ? -1 : a.endpointId > b.endpointId ? 1 : 0;
}

function identityRank(spec: EndpointSpec, input: AutoRouteInput): number {
  if (!input.identityBinding) return 0;
  return spec.identityBinding ? 0 : 1;
}

function qualityRank(spec: EndpointSpec, quality: RouteIntent["quality"]): number {
  if (quality === "custom") return 0;
  const tags = new Set(spec.capabilityTags);
  if (quality === "fast") return tags.has("fast") ? 0 : 1;
  if (quality === "quality") return tags.has("high-quality") ? 0 : 1;
  return 0;
}

function buildRationale(winner: EndpointSpec, input: AutoRouteInput): AutoRationale {
  const estimate = input.intent.estimatedIcuByEndpoint?.[winner.endpointId];
  return {
    selectedReason:
      `Auto selected ${winner.endpointId} (${winner.label}): task-fit ${winner.task}, ` +
      `${input.availability.configuredProviders.has(winner.providerId) ? "provider configured" : "provider availability unproven"}, ` +
      `quality intent ${input.intent.quality}, ` +
      `${estimate === undefined ? "price unknown (excluded from cost ranking)" : `estimate ${estimate} ICU`}.`,
    factors: {
      taskFit: `serves ${winner.task}`,
      identityCompatibility: input.identityBinding
        ? "binding compatible"
        : "no binding requested",
      workspaceAllowance: "allowed by tenant/workspace policy",
      availability: input.availability.configuredProviders.has(winner.providerId)
        ? "provider configured"
        : "provider availability unproven",
      qualityIntent: `intent ${input.intent.quality}`,
      priceWithinCap:
        estimate === undefined
          ? "price unknown; within-cap check skipped honestly"
          : input.intent.capIcu === null
            ? `estimate ${estimate} ICU; no cap set`
            : `estimate ${estimate} ICU within cap ${input.intent.capIcu} ICU`,
    },
  };
}

function quoteInputsFor(winner: EndpointSpec, input: AutoRouteInput): QuoteInputs {
  return {
    endpointId: winner.endpointId,
    task: winner.task,
    pins: {
      taskSchemaVersion: input.pins?.taskSchemaVersion ?? STUDIO_TASK_SCHEMA_VERSION,
      endpointSchemaVersion: winner.schemaVersion,
      priceVersion: winner.priceVersion,
      adapterVersion: winner.adapterVersion,
    },
    priceVersion: winner.priceVersion,
    meterUnit: input.meterUnit,
    meterQuantity: input.meterQuantity,
  };
}

export interface ExplicitRouteInput extends EligibilityContext {
  endpointId: string;
  meterUnit: string;
  meterQuantity: number;
}

/**
 * Explicit pinned route: the pinned endpoint either executes exactly or the
 * request fails with PINNED_UNAVAILABLE naming the endpoint. A pinned model
 * is NEVER silently replaced by another endpoint.
 */
export function routeExplicit(refs: AutoRouteRefs, input: ExplicitRouteInput): RouteDecision {
  const spec = refs.specs.find((s) => s.endpointId === input.endpointId);
  if (!spec) {
    throw new RouteError(
      "PINNED_UNKNOWN",
      `Pinned endpoint ${input.endpointId} is not in the catalog; refusing to substitute another endpoint.`,
      input.endpointId,
    );
  }
  const { candidates, excluded } = filterEligible(refs.specs, refs.attestations, input);
  const pinned = candidates.find((c) => c.endpointId === input.endpointId);
  if (!pinned) {
    const reasons = excluded.filter((e) => e.endpointId === input.endpointId);
    throw new RouteError(
      "PINNED_UNAVAILABLE",
      `Pinned endpoint ${input.endpointId} is not executable (${reasons.map((r) => r.reason).join(", ") || "no eligible match"}); refusing to substitute another endpoint.`,
      input.endpointId,
      excluded,
    );
  }
  const rationale: AutoRationale = {
    selectedReason: `Explicit pin ${pinned.endpointId} (${pinned.label}) honored exactly; no fallback considered.`,
    factors: {
      taskFit: `serves ${pinned.task}`,
      identityCompatibility: input.identityBinding ? "binding compatible" : "no binding requested",
      workspaceAllowance: "allowed by tenant/workspace policy",
      availability: "pinned endpoint qualified",
      qualityIntent: "explicit pin overrides quality intent",
      priceWithinCap: "cap enforced at estimate against the pinned endpoint",
    },
  };
  const taskSchemaVersion = input.pins?.taskSchemaVersion ?? STUDIO_TASK_SCHEMA_VERSION;
  return {
    endpointId: pinned.endpointId,
    mode: "explicit",
    pins: {
      taskSchemaVersion,
      endpointSchemaVersion: pinned.schemaVersion,
      priceVersion: pinned.priceVersion,
      adapterVersion: pinned.adapterVersion,
    },
    rationale,
    excluded,
    quoteInputs: {
      endpointId: pinned.endpointId,
      task: pinned.task as TaskName,
      pins: {
        taskSchemaVersion,
        endpointSchemaVersion: pinned.schemaVersion,
        priceVersion: pinned.priceVersion,
        adapterVersion: pinned.adapterVersion,
      } as VersionPins,
      priceVersion: pinned.priceVersion,
      meterUnit: input.meterUnit,
      meterQuantity: input.meterQuantity,
    },
  };
}
