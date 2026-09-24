// lib/platform/policies/risk-classification.ts
//
// APPROVAL-AUTHORITY-MERGE-01: canonical tool-risk classification, owned by
// the platform policy layer. This is the single source of truth for mapping a
// tool risk level to (a) a numeric risk tier and (b) an approval requirement.
//
// `lib/tools/approval-policy.ts` re-exports these so the dispatch gate keeps
// working unchanged; the canonical definitions live here so platform policies
// and the canonical approval service share one classification.

export type PlatformRiskTier = 0 | 1 | 2 | 3 | 4 | 5;

export type PlatformToolRiskLevel =
  | "read_only"
  | "write"
  | "writes_user_content"
  | "external_side_effect"
  | "destructive"
  | "privileged";

export type PlatformApprovalRequirement =
  | "no_approval"
  | "confirm_once"
  | "confirm_every_time"
  | "blocked";

/**
 * Default policy: risk level → approval requirement. Unknown risk levels are
 * not in this map and resolve to "blocked" (fail-safe).
 */
export const RISK_LEVEL_APPROVAL_POLICY: Readonly<
  Record<PlatformToolRiskLevel, PlatformApprovalRequirement>
> = {
  read_only: "no_approval",
  write: "confirm_once",
  writes_user_content: "confirm_once",
  external_side_effect: "confirm_every_time",
  destructive: "confirm_every_time",
  privileged: "blocked",
};

/** Return the approval requirement for a risk level. Unknown → "blocked". */
export function approvalRequirementForRiskLevel(
  riskLevel: PlatformToolRiskLevel,
): PlatformApprovalRequirement {
  return RISK_LEVEL_APPROVAL_POLICY[riskLevel] ?? "blocked";
}

/**
 * Risk levels whose mandatory approval can NEVER be waived by a user
 * preference, autonomy level, or workflow-author flag. Preference may only
 * ADD approval to these; it can never remove it (AUTO-P0-06).
 */
export const MANDATORY_APPROVAL_RISK_LEVELS: ReadonlySet<PlatformToolRiskLevel> =
  new Set(["external_side_effect", "destructive", "privileged"]);

/**
 * True when the risk level carries a mandatory approval that policy owns and
 * no caller-supplied flag may disable.
 */
export function hasMandatoryApproval(riskLevel: PlatformToolRiskLevel): boolean {
  return MANDATORY_APPROVAL_RISK_LEVELS.has(riskLevel);
}

/** Map a tool risk level to a numeric platform risk tier. */
export function riskLevelToTier(level: PlatformToolRiskLevel): PlatformRiskTier {
  switch (level) {
    case "read_only":
      return 1;
    case "write":
    case "writes_user_content":
      return 2;
    case "external_side_effect":
      return 3;
    case "destructive":
      return 4;
    case "privileged":
      return 5;
    default:
      return 5; // unknown → privileged → blocked (fail-safe)
  }
}
