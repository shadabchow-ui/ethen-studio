// Server-authoritative coding-run policy resolver.
//
// The resolved policy is the single source of truth for runtime behavior
// (auto-approve flags, max iterations, validation command subset, effective
// limits). It is computed ONCE on the server at run creation and snapshotted
// onto the run. The client must never be trusted to resolve policy — only the
// server resolver is authoritative.
//
// Backward compatibility: legacy runs created before this module existed have
// no stored resolved policy. `resolveFallbackPolicy()` derives a safe policy
// from their existing stored fields (mode/executionTarget) so they keep
// working.

import type {
  CodingPermissionMode,
  ExecutionTarget,
} from "./runtime-types";
import {
  PERMISSION_MODE_TIERS,
} from "./runtime-types";
import type { UsageLimits } from "./limits";
import { DEFAULT_USAGE_LIMITS } from "./limits";
import type {
  CodingAgentSettings,
  CodingSettingsSnapshot,
} from "./settings-schema";
import {
  SAFE_DEFAULT_PERMISSION_MODE,
  SAFE_VALIDATION_COMMAND_SET,
  migrateCodingAgentSettings,
  normalizeLegacyAccessMode,
  restrictValidationCommands,
} from "./settings-schema";

/**
 * A single recorded downgrade — a field the resolver had to clamp, reject, or
 * substitute because the requested value was unsafe, unimplemented, or
 * invalid. Captured so callers can audit and surface honest feedback.
 */
export interface PolicyDowngrade {
  /** The setting field that was downgraded. */
  field: string;
  /** The value that was requested (stringified for auditability). */
  requested: string;
  /** The value the resolver substituted. */
  resolved: string;
  /** Why the resolver downgraded it. */
  reason: string;
}

/**
 * The authoritative runtime policy for a single coding run. Derived from the
 * settings snapshot plus hard server-side safety rules. Stored on the run and
 * used by the agent controller / execute route.
 */
export interface ResolvedCodingRunPolicy {
  /** Schema version of the resolver that produced this policy. */
  resolverVersion: number;
  /** Effective permission mode after server-side clamping. */
  permissionMode: CodingPermissionMode;
  /** Effective execution target after server-side clamping. */
  executionTarget: ExecutionTarget;
  /**
   * Whether patches may be auto-approved. This is the AND of the user's
   * setting AND the requirement that the effective mode is permissive enough
   * (workspace_write). A plan_only / chat_only / ask_before_editing run can
   * never auto-approve patches regardless of the client setting.
   */
  autoApprovePatch: boolean;
  /**
   * Whether validation commands may be auto-approved. Validation commands are
   * always from the fixed safe allowlist (typecheck/build/test/lint), so this
   * may be true even when patch approval is not.
   */
  autoApproveValidation: boolean;
  /** Resolved provider/model preference (mode only — never a secret). */
  provider: { id?: string; model?: string; byok: boolean };
  /**
   * Fixed subset of validation commands the runtime is permitted to run.
   * Always a subset of the safe allowlist — the client cannot add arbitrary
   * commands.
   */
  validationCommands: ReadonlyArray<string>;
  /**
   * Effective usage limits after clamping user overrides down to the safe
   * defaults. Never larger than DEFAULT_USAGE_LIMITS on any field.
   */
  effectiveLimits: UsageLimits;
  /** Whether browser/app QA tooling is enabled for this run. */
  browserQaEnabled: boolean;
  /** Whether subagent tooling is enabled for this run. */
  subagentsEnabled: boolean;
  /**
   * Hard ceiling on build iterations for this run. Bounded by usage limits,
   * never enlarged by the client.
   */
  maxIterations: number;
  /** Whether the snapshot's permission mode was clamped down by the server. */
  wasClamped: boolean;
  /**
   * Every downgrade the resolver applied. Empty when the requested settings
   * were accepted as-is. Captured for audit / honest UI feedback.
   */
  downgrades: PolicyDowngrade[];
  /** ISO timestamp the policy was resolved. */
  resolvedAt: string;
}

export const CODING_POLICY_RESOLVER_VERSION = 1 as const;

/** Default iteration ceiling. Mirrors DEFAULT_USAGE_LIMITS.maxPatchProposalsPerRun. */
const DEFAULT_MAX_ITERATIONS = 6;

/**
 * Minimum permission tier at which patch auto-approval is even considered.
 * Below this tier (chat_only, plan_only, ask_before_editing) patches always
 * require explicit approval.
 */
const MIN_TIER_FOR_AUTO_APPROVE_PATCH =
  PERMISSION_MODE_TIERS.workspace_write;

// ── Internal clamp helpers ──────────────────────────────────────────────────

function clampPermissionMode(
  requested: CodingPermissionMode,
  executionTarget: ExecutionTarget,
  downgrades: PolicyDowngrade[],
): { mode: CodingPermissionMode; wasClamped: boolean } {
  // `full_access` is reserved/not implemented. Never escalate into it.
  if (requested === "full_access") {
    downgrades.push({
      field: "permissionMode",
      requested,
      resolved: SAFE_DEFAULT_PERMISSION_MODE,
      reason: "full_access is not implemented; downgraded to plan_only.",
    });
    return { mode: SAFE_DEFAULT_PERMISSION_MODE, wasClamped: true };
  }

  // Cloud sandbox and remote devbox targets are not implemented in this repo.
  // A run cannot actually execute there, so clamp down to plan_only to keep
  // behavior honest rather than pretending a permissive mode is honored.
  if (
    (executionTarget === "cloud_sandbox" || executionTarget === "remote_devbox") &&
    PERMISSION_MODE_TIERS[requested] > PERMISSION_MODE_TIERS.plan_only
  ) {
    downgrades.push({
      field: "permissionMode",
      requested,
      resolved: "plan_only",
      reason: `${executionTarget} is not implemented; permission downgraded to plan_only.`,
    });
    return { mode: "plan_only", wasClamped: true };
  }

  return { mode: requested, wasClamped: false };
}

function downgradeExecutionTarget(
  requested: ExecutionTarget,
  downgrades: PolicyDowngrade[],
): ExecutionTarget {
  if (requested === "cloud_sandbox" || requested === "remote_devbox") {
    downgrades.push({
      field: "executionTarget",
      requested,
      resolved: "local_direct",
      reason: `${requested} is not implemented; downgraded to local_direct.`,
    });
    return "local_direct";
  }
  return requested;
}

function clampIterations(requested: number | undefined): number {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_MAX_ITERATIONS;
  }
  // Never allow more than the hard default ceiling from the client side.
  return Math.min(Math.floor(requested), DEFAULT_MAX_ITERATIONS);
}

/**
 * Clamp a user-supplied limit override down to the safe default. Any value
 * exceeding the default is rejected and recorded as a downgrade; any value
 * below the default is honored (clamping down is always allowed).
 */
function clampLimits(
  overrides: Partial<UsageLimits>,
  downgrades: PolicyDowngrade[],
): UsageLimits {
  const effective: UsageLimits = { ...DEFAULT_USAGE_LIMITS };

  if (isPlainObject(overrides)) {
    for (const key of Object.keys(overrides) as Array<keyof UsageLimits>) {
      const requested = overrides[key];
      if (typeof requested !== "number" || !Number.isFinite(requested)) {
        continue;
      }
      const ceiling = DEFAULT_USAGE_LIMITS[key];
      if (requested > ceiling) {
        downgrades.push({
          field: `limits.${key}`,
          requested: String(requested),
          resolved: String(ceiling),
          reason: "cannot exceed safe default; clamped down.",
        });
        continue;
      }
      // Clamp down only (also reject non-positive where meaningless).
      effective[key] = requested > 0 ? Math.floor(requested) : ceiling;
    }
  }

  return effective;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── Public resolver: canonical CodingAgentSettings → policy ─────────────────

/**
 * Input accepted by the canonical resolver. Either a fully-formed
 * `CodingAgentSettings` document, or raw unknown input which will be migrated
 * first. Optional server-side knobs (maxIterations) may be supplied.
 */
export interface ResolveCodingRunPolicyInput {
  settings?: CodingAgentSettings | unknown;
  /** Optional server-side iteration ceiling hint. */
  maxIterations?: number;
}

/**
 * Resolve the authoritative policy from the canonical coding-agent settings
 * document. This is the canonical entry point for new code: it migrates any
 * raw input, applies every safety clamp, and records each downgrade.
 *
 * Pure and unit-testable — no I/O, no clock side effects beyond the
 * `resolvedAt` timestamp.
 */
export function resolveCodingRunPolicy(
  input: ResolveCodingRunPolicyInput | CodingSettingsSnapshot,
  options?: { maxIterations?: number },
): ResolvedCodingRunPolicy {
  // ── Backward-compatible overload ──────────────────────────────────────────
  // Existing callers (app/api/coding/runs/route.ts) pass a CodingSettingsSnapshot
  // directly. Detect that shape and route through the snapshot resolver so we
  // do not break them.
  if (isSettingsSnapshot(input)) {
    return resolvePolicyFromSnapshot(input, options);
  }

  const canonical = migrateCodingAgentSettings(
    (input as ResolveCodingRunPolicyInput)?.settings,
  );
  const downgrades: PolicyDowngrade[] = [];

  const requestedTarget = canonical.execution.target;

  // Permission mode: `full_access` rejected; permissive modes requested for an
  // UNIMPLEMENTED target (cloud/devbox) are downgraded to plan_only. The clamp
  // sees the ORIGINAL requested target so a permissive mode never survives
  // onto a target the runtime cannot actually honor.
  const requestedMode = canonical.permissions.permissionMode;
  const { mode, wasClamped } = clampPermissionMode(
    requestedMode as CodingPermissionMode,
    requestedTarget,
    downgrades,
  );

  // Execution target: downgrade unimplemented targets to local_direct for the
  // effective policy. Recorded so the honest target substitution is auditable.
  const executionTarget = downgradeExecutionTarget(
    requestedTarget,
    downgrades,
  );

  const tier = PERMISSION_MODE_TIERS[mode];
  const modeAllowsAutoApprovePatch = tier >= MIN_TIER_FOR_AUTO_APPROVE_PATCH;

  // autoApprovePatch is true only when (a) the user explicitly opted in via
  // patchApproval === "auto" AND (b) the effective mode is workspace_write.
  const userOptedPatchAuto = canonical.permissions.patchApproval === "auto";
  const autoApprovePatch = userOptedPatchAuto && modeAllowsAutoApprovePatch;
  if (userOptedPatchAuto && !modeAllowsAutoApprovePatch) {
    downgrades.push({
      field: "autoApprovePatch",
      requested: "true",
      resolved: "false",
      reason: "patch auto-approval requires workspace_write permission mode.",
    });
  }

  const autoApproveValidation =
    canonical.permissions.validationApproval === "auto";

  // Validation commands: always restricted to the safe set.
  const validationCommands = restrictValidationCommands(
    canonical.validation.commands,
  );

  // Effective limits: clamp overrides down only.
  const effectiveLimits = clampLimits(canonical.limits.overrides, downgrades);

  const provider = {
    id: canonical.model.pref.provider,
    model: canonical.model.pref.model,
    byok: canonical.model.pref.byok === true,
  };

  const maxIterations = clampIterations(
    options?.maxIterations ?? (input as ResolveCodingRunPolicyInput)?.maxIterations,
  );

  return {
    resolverVersion: CODING_POLICY_RESOLVER_VERSION,
    permissionMode: mode,
    executionTarget,
    autoApprovePatch,
    autoApproveValidation,
    provider,
    validationCommands,
    effectiveLimits,
    browserQaEnabled: canonical.tools.browserQaEnabled,
    subagentsEnabled: canonical.advanced.subagents === "preview",
    maxIterations,
    wasClamped,
    downgrades,
    resolvedAt: new Date().toISOString(),
  };
}

// ── Snapshot-based resolver (legacy / run-creation route) ───────────────────

function resolvePolicyFromSnapshot(
  snapshot: CodingSettingsSnapshot,
  options?: { maxIterations?: number },
): ResolvedCodingRunPolicy {
  const downgrades: PolicyDowngrade[] = [];

  const executionTarget = downgradeExecutionTarget(
    snapshot.executionTarget,
    downgrades,
  );

  const { mode, wasClamped } = clampPermissionMode(
    snapshot.defaultPermissionMode,
    executionTarget,
    downgrades,
  );

  const tier = PERMISSION_MODE_TIERS[mode];
  const modeAllowsAutoApprovePatch = tier >= MIN_TIER_FOR_AUTO_APPROVE_PATCH;

  const autoApprovePatch =
    snapshot.autoApprovePatch && modeAllowsAutoApprovePatch;
  if (snapshot.autoApprovePatch && !modeAllowsAutoApprovePatch) {
    downgrades.push({
      field: "autoApprovePatch",
      requested: "true",
      resolved: "false",
      reason: "patch auto-approval requires workspace_write permission mode.",
    });
  }

  const autoApproveValidation = snapshot.autoApproveValidation;

  return {
    resolverVersion: CODING_POLICY_RESOLVER_VERSION,
    permissionMode: mode,
    executionTarget,
    autoApprovePatch,
    autoApproveValidation,
    provider: { byok: false },
    validationCommands: Array.from(SAFE_VALIDATION_COMMAND_SET),
    effectiveLimits: { ...DEFAULT_USAGE_LIMITS },
    browserQaEnabled: false,
    subagentsEnabled: false,
    maxIterations: clampIterations(options?.maxIterations),
    wasClamped,
    downgrades,
    resolvedAt: new Date().toISOString(),
  };
}

function isSettingsSnapshot(value: unknown): value is CodingSettingsSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  // A snapshot always carries these fields; the canonical input object does
  // not (it carries `version` + nested sections).
  return (
    typeof v.schemaVersion === "number" &&
    typeof v.defaultPermissionMode === "string" &&
    typeof v.executionTarget === "string" &&
    !("permissions" in v)
  );
}

/**
 * Derive a safe fallback policy for a legacy run that has no stored resolved
 * policy. Uses the run's existing stored `mode` and `executionTarget`.
 *
 * This is intentionally conservative: legacy runs default to requiring
 * approval for everything.
 */
export function resolveFallbackPolicy(
  mode: CodingPermissionMode | string | undefined,
  executionTarget: ExecutionTarget | undefined,
): ResolvedCodingRunPolicy {
  // A legacy run may have stored the settings-only `read_only` alias as its
  // mode (it has no direct runtime equivalent); normalize it to plan_only.
  // `full_access` is reserved/not implemented — never escalate into it.
  const normalizedMode: CodingPermissionMode | undefined =
    mode === "read_only" ? "plan_only" : (mode as CodingPermissionMode | undefined);
  const effectiveMode: CodingPermissionMode =
    normalizedMode && normalizedMode !== "full_access"
      ? normalizedMode
      : SAFE_DEFAULT_PERMISSION_MODE;
  const effectiveTarget: ExecutionTarget = executionTarget ?? "local_direct";

  const downgrades: PolicyDowngrade[] = [];
  // Re-clamp through the same logic so legacy runs get identical safety
  // treatment as new ones.
  const downgradedTarget = downgradeExecutionTarget(
    effectiveTarget,
    downgrades,
  );
  const { mode: clampedMode } = clampPermissionMode(
    effectiveMode,
    downgradedTarget,
    downgrades,
  );

  const tier = PERMISSION_MODE_TIERS[clampedMode];
  const modeAllowsAutoApprovePatch = tier >= MIN_TIER_FOR_AUTO_APPROVE_PATCH;

  return {
    resolverVersion: CODING_POLICY_RESOLVER_VERSION,
    permissionMode: clampedMode,
    executionTarget: downgradedTarget,
    // Legacy runs never auto-approve patches unless their stored mode already
    // permits it (workspace_write). We do not fabricate a permissive flag.
    autoApprovePatch: modeAllowsAutoApprovePatch,
    autoApproveValidation: false,
    provider: { byok: false },
    validationCommands: Array.from(SAFE_VALIDATION_COMMAND_SET),
    effectiveLimits: { ...DEFAULT_USAGE_LIMITS },
    browserQaEnabled: false,
    subagentsEnabled: false,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    wasClamped: effectiveMode !== clampedMode || downgrades.length > 0,
    downgrades,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * Resolve the effective policy for an already-loaded run, preferring its
 * stored resolved policy and falling back to a safe legacy policy when none
 * exists. This is what the execute route and agent controller call.
 */
export function resolveEffectivePolicyForRun(run: {
  resolvedPolicy?: ResolvedCodingRunPolicy;
  mode?: CodingPermissionMode;
  executionTarget?: ExecutionTarget;
}): ResolvedCodingRunPolicy {
  if (run.resolvedPolicy) {
    return run.resolvedPolicy;
  }
  return resolveFallbackPolicy(run.mode, run.executionTarget);
}

// ── Narrow-only request merging ─────────────────────────────────────────────

export interface PolicyNarrowRequest {
  /** Client may force every approval to be asked-for, never auto. */
  forceAskApproval?: boolean;
  /**
   * A client-supplied autoApprovePatch flag. Ignored if it would widen the
   * stored policy (see `mergeNarrowingRequest`).
   */
  autoApprovePatch?: boolean;
  /**
   * A client-supplied autoApproveValidation flag. Ignored if it would widen.
   */
  autoApproveValidation?: boolean;
  /** Client may lower, never raise, the iteration ceiling. */
  maxIterations?: number;
}

export interface PolicyNarrowResult {
  policy: ResolvedCodingRunPolicy;
  /** Warnings describing client requests that were ignored for widening. */
  ignoredWidening: string[];
}

/**
 * Apply a client request body to a stored policy, permitting ONLY narrowing
 * changes. Any field that would widen permissions is ignored and recorded in
 * `ignoredWidening` so the caller can emit an audit event.
 *
 * Examples:
 *  - `forceAskApproval: true` always narrows (both auto flags forced false).
 *  - `autoApprovePatch: true` against a plan_only policy is ignored.
 *  - `maxIterations` larger than the stored ceiling is ignored.
 */
export function mergeNarrowingRequest(
  stored: ResolvedCodingRunPolicy,
  request: PolicyNarrowRequest | undefined | null,
): PolicyNarrowResult {
  const ignoredWidening: string[] = [];

  if (!request) {
    return { policy: stored, ignoredWidening };
  }

  let autoApprovePatch = stored.autoApprovePatch;
  let autoApproveValidation = stored.autoApproveValidation;
  let maxIterations = stored.maxIterations;

  if (request.forceAskApproval === true) {
    // Narrowing: never auto-approve anything.
    autoApprovePatch = false;
    autoApproveValidation = false;
  } else {
    // autoApprovePatch may only narrow (true -> false), never widen.
    if (request.autoApprovePatch === true && !stored.autoApprovePatch) {
      ignoredWidening.push(
        "Client requested autoApprovePatch=true but stored policy requires patch approval; ignored.",
      );
    } else if (request.autoApprovePatch === false) {
      autoApprovePatch = false;
    }

    if (request.autoApproveValidation === true && !stored.autoApproveValidation) {
      ignoredWidening.push(
        "Client requested autoApproveValidation=true but stored policy requires validation approval; ignored.",
      );
    } else if (request.autoApproveValidation === false) {
      autoApproveValidation = false;
    }
  }

  if (typeof request.maxIterations === "number") {
    if (request.maxIterations > stored.maxIterations) {
      ignoredWidening.push(
        `Client requested maxIterations=${request.maxIterations} but stored ceiling is ${stored.maxIterations}; ignored.`,
      );
    } else if (request.maxIterations > 0) {
      maxIterations = Math.floor(request.maxIterations);
    }
  }

  const policy: ResolvedCodingRunPolicy = {
    ...stored,
    autoApprovePatch,
    autoApproveValidation,
    maxIterations,
  };

  return { policy, ignoredWidening };
}
