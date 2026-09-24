/**
 * STUDIO_20 — feature cohort map and flag qualification.
 *
 * Flags are set only for qualified cohorts. Externally gated cohorts
 * (realtime, live provider spend, live billing) stay visibly
 * unavailable until their evidence exists; the UI must render the
 * unqualified state, never a dead control.
 */

export type FeatureCohort =
  | "create"
  | "asset"
  | "canvas"
  | "workbench"
  | "review"
  | "identity"
  | "composites"
  | "agent"
  | "realtime-voice"
  | "provider-canary"
  | "live-billing";

export interface CohortQualification {
  cohort: FeatureCohort;
  /** Evidence keys that must ALL be present to qualify. Empty = code-complete. */
  requires: readonly string[];
  unqualifiedLabel: string;
}

export const FEATURE_COHORTS: readonly CohortQualification[] = [
  { cohort: "create", requires: [], unqualifiedLabel: "Create" },
  { cohort: "asset", requires: [], unqualifiedLabel: "Assets" },
  { cohort: "canvas", requires: [], unqualifiedLabel: "Canvas" },
  { cohort: "workbench", requires: [], unqualifiedLabel: "Workbench" },
  { cohort: "review", requires: [], unqualifiedLabel: "Review" },
  { cohort: "identity", requires: [], unqualifiedLabel: "Identities" },
  { cohort: "composites", requires: [], unqualifiedLabel: "Composites" },
  { cohort: "agent", requires: [], unqualifiedLabel: "Agent" },
  { cohort: "realtime-voice", requires: ["realtime.provider"], unqualifiedLabel: "Realtime voice unavailable — provider not qualified" },
  { cohort: "provider-canary", requires: ["provider.canary"], unqualifiedLabel: "Provider canary unavailable — no credentialed run" },
  { cohort: "live-billing", requires: ["billing.live"], unqualifiedLabel: "Live billing unavailable — staged proof only" },
] as const;

export function isCohortQualified(cohort: FeatureCohort, evidence: ReadonlySet<string>): boolean {
  const entry = FEATURE_COHORTS.find((c) => c.cohort === cohort);
  if (!entry) return false;
  return entry.requires.every((key) => evidence.has(key));
}

export function qualifiedCohorts(evidence: ReadonlySet<string>): FeatureCohort[] {
  return FEATURE_COHORTS.filter((c) => c.requires.every((key) => evidence.has(key))).map((c) => c.cohort);
}
