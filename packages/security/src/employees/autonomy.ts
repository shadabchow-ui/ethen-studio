import type { AutonomyLevel } from "./types";
import type { ApprovalRiskTier } from "@ethen/contracts/tools/types";

export const MAX_MVP_AUTONOMY_LEVEL: AutonomyLevel = 4;

export const AUTONOMY_LEVEL_LABELS: Record<AutonomyLevel, string> = {
  0: "Draft only",
  1: "Read only",
  2: "Safe internal",
  3: "Scheduled supervised",
  4: "Trusted routine",
};

export const AUTONOMY_LEVEL_DESCRIPTIONS: Record<AutonomyLevel, string> = {
  0: "Creates proposals and drafts only. Cannot read or write connected systems.",
  1: "Reads approved data and creates reports only.",
  2: "Can create internal notes, drafts, tags, tasks, and reports.",
  3: "Runs on schedule; external or sensitive actions require approval.",
  4: "Executes approved routine actions; exceptions escalate for approval.",
};

export function isValidAutonomyLevel(value: number): value is AutonomyLevel {
  return Number.isInteger(value) && value >= 0 && value <= MAX_MVP_AUTONOMY_LEVEL;
}

export function ensureSafeAutonomyLevel(value: number): AutonomyLevel {
  if (!Number.isInteger(value) || value < 0) {
    return 0;
  }
  if (value > MAX_MVP_AUTONOMY_LEVEL) {
    return MAX_MVP_AUTONOMY_LEVEL;
  }
  return value as AutonomyLevel;
}

export function isLevelAvailable(level: number): boolean {
  return isValidAutonomyLevel(level) && level <= MAX_MVP_AUTONOMY_LEVEL;
}

export function canExecuteAtLevel(
  requiredMinLevel: AutonomyLevel,
  employeeLevel: AutonomyLevel,
): boolean {
  return employeeLevel >= requiredMinLevel;
}

/**
 * Determine if a given risk tier requires approval for a specific autonomy level.
 *
 * Rules:
 * - Tier 0 (informational): never requires approval
 * - Tier 1 (read_only): never requires approval at level 1+
 * - Tier 2 (internal_write): requires approval only at level 1; allowed at level 2+
 * - Tier 3 (external_action): always requires approval (MVP rule)
 * - Tier 4 (sensitive/destructive): always requires approval
 * - Tier 5 (forbidden): always blocked (not "approval required" — outright blocked)
 */
export function requiresApprovalAtLevel(
  riskTier: number,
  autonomyLevel: AutonomyLevel,
): boolean {
  if (riskTier <= 0) {
    return false;
  }
  if (riskTier === 1) {
    return false;
  }
  if (riskTier === 2) {
    return autonomyLevel < 2;
  }
  if (riskTier >= 3) {
    return true;
  }
  return true;
}

/**
 * Determine if a given risk tier is outright blocked for a specific autonomy level.
 *
 * Rules:
 * - Tier 5 (forbidden): always blocked
 * - Tier 4 (sensitive/destructive): blocked unless level 4
 * - Tier 3 (external_action): blocked unless level 3+
 * - Tier 2 (internal_write): blocked at level 0
 * - Tier 1 (read_only): blocked at level 0
 * - Tier 0 (informational): never blocked
 */
export function isBlockedRiskAtLevel(
  riskTier: number,
  autonomyLevel: AutonomyLevel,
): boolean {
  if (riskTier >= 5) {
    return true;
  }
  if (riskTier === 4 && autonomyLevel < 4) {
    return true;
  }
  if (riskTier === 3 && autonomyLevel < 3) {
    return true;
  }
  if (riskTier === 2 && autonomyLevel < 1) {
    return true;
  }
  if (riskTier === 1 && autonomyLevel < 1) {
    return true;
  }
  return false;
}

/**
 * Map risk tier + autonomy level to a policy outcome: allow, approval_required, or block.
 * This is the determinant function for the fail-closed policy resolver.
 */
export function autonomyPolicyOutcome(
  riskTier: ApprovalRiskTier,
  autonomyLevel: AutonomyLevel,
): { outcome: "allow" | "approval_required" | "block"; reason: string } {
  switch (riskTier) {
    case 0:
      return { outcome: "allow", reason: "Informational actions are always allowed." };
    case 1:
      if (autonomyLevel >= 1) {
        return { outcome: "allow", reason: "Read-only actions allowed at autonomy level 1+." };
      }
      return { outcome: "block", reason: "Read-only actions require autonomy level 1+." };
    case 2:
      if (autonomyLevel >= 2) {
        return { outcome: "allow", reason: "Internal writes allowed at autonomy level 2+." };
      }
      if (autonomyLevel === 1) {
        return { outcome: "approval_required", reason: "Internal writes require approval at autonomy level 1." };
      }
      return { outcome: "block", reason: "Internal writes require autonomy level 1+." };
    case 3:
      if (autonomyLevel >= 3) {
        return { outcome: "approval_required", reason: "External actions always require approval in MVP." };
      }
      return { outcome: "block", reason: "External actions require autonomy level 3+." };
    case 4:
      if (autonomyLevel >= 4) {
        return { outcome: "approval_required", reason: "Sensitive/destructive actions require explicit approval." };
      }
      return { outcome: "block", reason: "Sensitive/destructive actions require autonomy level 4+." };
    case 5:
      return { outcome: "block", reason: "Forbidden actions are always blocked." };
  }
}

/**
 * Minimum autonomy level required to operate at a given risk tier.
 */
export function minimumAutonomyForRiskTier(tier: ApprovalRiskTier): AutonomyLevel {
  switch (tier) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 3;
    case 4:
      return 4;
    case 5:
      return 4; // Level 5 is not available in MVP
  }
}

/**
 * Check if an action at a given risk tier is within the employee's safe operating boundary.
 * Returns true if the action can proceed (either allowed or approval_required, but not blocked).
 */
export function isWithinBoundary(
  riskTier: ApprovalRiskTier,
  autonomyLevel: AutonomyLevel,
): boolean {
  const { outcome } = autonomyPolicyOutcome(riskTier, autonomyLevel);
  return outcome !== "block";
}
