import type { ShadowClassification, ShadowRecord } from "./shadow";

/**
 * P13 — feature-flag rollout for the composed seam.
 *
 * Strict enum following the repository env-flag convention (`ETHEN_*`).
 * Missing/unknown → `legacy`, never permissive.
 */

export type ExecutionControlMode = "legacy" | "shadow" | "enforce";

export const EXECUTION_CONTROL_MODE_ENV_VAR = "ETHEN_EXECUTION_CONTROL_MODE";

export function readExecutionControlMode(
  env: Record<string, string | undefined> = process.env,
): ExecutionControlMode {
  const raw = (env[EXECUTION_CONTROL_MODE_ENV_VAR] ?? "").trim().toLowerCase();
  if (raw === "shadow") return "shadow";
  if (raw === "enforce") return "enforce";
  return "legacy";
}

export interface RolloutEvaluation {
  mode: ExecutionControlMode;
  /** The decision that actually governs dispatch. */
  effectiveDecision: string | null;
  /** Where the effective decision came from. */
  authority: "legacy" | "composed";
  shadow: ShadowRecord | null;
}

export class UnsafeLooserDivergenceError extends Error {
  readonly code = "UNSAFE_LOOSER_DIVERGENCE";
}

/**
 * Resolve dispatch authority under rollout. Legacy decides in legacy and
 * shadow modes (shadow additionally records the comparison, zero side
 * effects). Enforce mode uses the composed decision — except NEW_LOOSER,
 * which fails closed back onto the safe legacy path.
 */
export function resolveRolloutDecision(input: {
  mode: ExecutionControlMode;
  legacyDecision: string | null;
  composedDecision: string | null;
  shadow: ShadowRecord | null;
}): RolloutEvaluation {
  if (input.mode === "enforce") {
    if (input.shadow && input.shadow.classification === "NEW_LOOSER") {
      return {
        mode: input.mode,
        effectiveDecision: input.legacyDecision,
        authority: "legacy",
        shadow: input.shadow,
      };
    }
    return {
      mode: input.mode,
      effectiveDecision: input.composedDecision,
      authority: "composed",
      shadow: input.shadow,
    };
  }
  return {
    mode: input.mode,
    effectiveDecision: input.legacyDecision,
    authority: "legacy",
    shadow: input.mode === "shadow" ? input.shadow : null,
  };
}

export type { ShadowClassification };
