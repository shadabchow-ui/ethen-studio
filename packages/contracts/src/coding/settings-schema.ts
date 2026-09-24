// Canonical coding-agent settings schema.
//
// This is the single source of truth for the persisted settings shape that is
// snapshotted onto every new CodingAgentRun. The snapshot is immutable for the
// lifetime of the run — changing global defaults after a run is created must
// never mutate that run's stored policy (see resolve-policy.ts).
//
// These types are intentionally framework-agnostic (no React, no Next.js) so
// they can be imported from both server routes and client components.

import type {
  CodingPermissionMode,
  ExecutionTarget,
} from "./runtime-types";
import type { CodingSettingsWorkflowMode } from "./settings";
import type { UsageLimits } from "./limits";

/**
 * Default permission mode the console opens with. Honored at run creation as
 * a *preference* only — the server resolver is authoritative and may reject
 * modes that are not safe for the connected execution target.
 */
export type CodingDefaultPermissionMode =
  | "chat_only"
  | "plan_only"
  | "ask_before_editing"
  | "workspace_write";

/** Schema version for the snapshot itself. Bumped on breaking shape changes. */
export const CODING_SETTINGS_SCHEMA_VERSION = 1 as const;

// ── Patch / validation approval preferences ─────────────────────────────────

export type PatchApprovalMode = "always_ask" | "auto";
export type ValidationApprovalMode = "always_ask" | "auto";

// ── Follow-up / subagent behaviors ──────────────────────────────────────────

export type FollowUpBehavior = "queue" | "interrupt" | "ignore";
export type SubagentPolicy = "off" | "preview";

// ── Execution target model ──────────────────────────────────────────────────

/**
 * Per-BYOK provider preference stored in settings. Stores MODE ONLY — never a
 * secret. A real API key must never live in persisted settings; it is supplied
 * per-session via env or the request body.
 */
export interface CodingSettingsModelPref {
  /** Provider id (e.g. "anthropic", "byok", "ethen-free"). Free-form string. */
  provider?: string;
  /** Model id within the provider. Free-form string. */
  model?: string;
  /**
   * BYOK mode marker. When "byok" the run uses a per-session key supplied out
   * of band. No key material is ever persisted here.
   */
  byok?: boolean;
}

// ── Context block ───────────────────────────────────────────────────────────

/**
 * Free-form per-workspace context that the agent may surface in its prompt.
 *
 * IMPORTANT: custom instructions are UNTRUSTED input. They are rendered into
 * the agent context inside a clearly labeled untrusted block (see
 * context-packer.ts) and must never be allowed to override project rules,
 * safety rules, or approval policy.
 */
export interface CodingSettingsContext {
  /**
   * Optional natural-language guidance the user wants the agent to follow.
   * Capped in length; never executed as instructions to tooling.
   */
  customInstructions?: string;
}

// ── Limit overrides ─────────────────────────────────────────────────────────

/**
 * User-supplied limit overrides. Every field is optional and may only CLAMP
 * DOWN from DEFAULT_USAGE_LIMITS — the resolver rejects any value that would
 * raise a limit above the safe default.
 */
export type CodingSettingsLimits = Partial<UsageLimits>;

// ── Section shapes ──────────────────────────────────────────────────────────

export interface CodingSettingsGeneral {
  /** Default workflow the console opens with. */
  defaultWorkflow: CodingSettingsWorkflowMode;
  /** Whether the agent should stream token output. */
  streamOutput: boolean;
}

export interface CodingSettingsModelSection {
  pref: CodingSettingsModelPref;
}

export interface CodingSettingsPermissions {
  /** Default permission mode preference (server may clamp). */
  permissionMode: CodingDefaultPermissionMode;
  /** When/how patch proposals require approval. */
  patchApproval: PatchApprovalMode;
  /** When/how validation commands require approval. */
  validationApproval: ValidationApprovalMode;
}

export interface CodingSettingsExecution {
  /** Execution target preference (server may downgrade unimplemented targets). */
  target: ExecutionTarget;
}

export interface CodingSettingsTools {
  /** Whether browser/app QA tooling is surfaced (preview-gated). */
  browserQaEnabled: boolean;
}

export interface CodingSettingsWorkflows {
  /** Default workflow mirrored here for per-workflow overrides. */
  defaultWorkflow: CodingSettingsWorkflowMode;
  /** How user follow-up messages during a run are handled. */
  followUpBehavior: FollowUpBehavior;
}

export interface CodingSettingsContextSection {
  /** Per-workspace untrusted context block. */
  customInstructions: string;
}

export interface CodingSettingsValidationSection {
  /** Validation commands the runtime is permitted to run (subset of safe set). */
  commands: ReadonlyArray<string>;
}

export interface CodingSettingsLimitsSection {
  /** Overrides — only clamp down from defaults at resolve time. */
  overrides: CodingSettingsLimits;
}

export interface CodingSettingsDiagnostics {
  /** Whether verbose diagnostic logging is enabled. */
  verbose: boolean;
}

export interface CodingSettingsAdvanced {
  /** Subagent policy. "off" disables; "preview" surfaces a preview only. */
  subagents: SubagentPolicy;
}

// ── Top-level canonical settings object ─────────────────────────────────────

/**
 * The full canonical coding-agent settings document. This is the trusted spine
 * that UI and runtime wiring consume. Every section has safe defaults.
 */
export interface CodingAgentSettings {
  version: number;
  general: CodingSettingsGeneral;
  model: CodingSettingsModelSection;
  permissions: CodingSettingsPermissions;
  execution: CodingSettingsExecution;
  tools: CodingSettingsTools;
  workflows: CodingSettingsWorkflows;
  context: CodingSettingsContextSection;
  validation: CodingSettingsValidationSection;
  limits: CodingSettingsLimitsSection;
  diagnostics: CodingSettingsDiagnostics;
  advanced: CodingSettingsAdvanced;
}

// ── Backward-compatible immutable run snapshot ──────────────────────────────

/**
 * The immutable settings snapshot stored on a run at creation time.
 *
 * Backward compatible: all fields are optional so legacy runs (created before
 * this schema existed) remain valid — they simply have no snapshot and the
 * server resolver derives a safe fallback policy from their stored fields.
 */
export interface CodingSettingsSnapshot {
  schemaVersion: number;
  /** Permission mode the user requested for this run. */
  defaultPermissionMode: CodingDefaultPermissionMode;
  /** Execution target the user requested for this run. */
  executionTarget: ExecutionTarget;
  /** Whether the user opted into auto-approving patches in their settings. */
  autoApprovePatch: boolean;
  /** Whether the user opted into auto-approving validation commands. */
  autoApproveValidation: boolean;
  /** Per-workspace untrusted context block. */
  context?: CodingSettingsContext;
  /** ISO timestamp the snapshot was captured. */
  capturedAt: string;
}

/**
 * Input shape accepted by the run-creation route. The client may send a full
 * snapshot, partial settings, or nothing at all — the server resolves a safe
 * policy regardless.
 */
export interface CodingSettingsInput {
  defaultPermissionMode?: CodingDefaultPermissionMode;
  executionTarget?: ExecutionTarget;
  autoApprovePatch?: boolean;
  autoApproveValidation?: boolean;
  context?: CodingSettingsContext;
  /**
   * A complete pre-built snapshot (e.g. carried from a forked run). When
   * present, individual fields above are merged on top of it.
   */
  snapshot?: Partial<CodingSettingsSnapshot>;
}

// ── Safe defaults ──────────────────────────────────────────────────────────

/**
 * The most conservative valid permission mode. Used whenever no preference is
 * supplied or a supplied preference is rejected by the resolver. The audit
 * found the Code Console previously hardcoded new runs to this value; it
 * remains the safe fallback.
 */
export const SAFE_DEFAULT_PERMISSION_MODE: CodingDefaultPermissionMode = "plan_only";

/** Maximum length of custom instructions before truncation. */
export const MAX_CUSTOM_INSTRUCTIONS_LEN = 4000;

/**
 * The safe, fixed set of validation commands the runtime may ever run. Any
 * user-supplied validation command list is intersected with this set at
 * resolve time — arbitrary commands are never honored.
 */
export const SAFE_VALIDATION_COMMAND_SET: ReadonlySet<string> = new Set([
  "typecheck",
  "build",
  "test",
  "lint",
]);

/** Canonical safe defaults used when no settings are supplied. */
export const SAFE_DEFAULT_SETTINGS: Readonly<Omit<CodingSettingsSnapshot, "capturedAt">> = {
  schemaVersion: CODING_SETTINGS_SCHEMA_VERSION,
  defaultPermissionMode: SAFE_DEFAULT_PERMISSION_MODE,
  executionTarget: "local_direct",
  autoApprovePatch: false,
  autoApproveValidation: false,
};

/**
 * The canonical default `CodingAgentSettings` document. Every field is the most
 * conservative honest value. UI/runtime wiring should treat this as the base
 * and layer user overrides on top, then pass the result through the resolver.
 */
export const DEFAULT_CODING_AGENT_SETTINGS: CodingAgentSettings = {
  version: CODING_SETTINGS_SCHEMA_VERSION,
  general: {
    defaultWorkflow: "plan",
    streamOutput: true,
  },
  model: {
    pref: {},
  },
  permissions: {
    permissionMode: SAFE_DEFAULT_PERMISSION_MODE,
    patchApproval: "always_ask",
    validationApproval: "auto",
  },
  execution: {
    target: "local_direct",
  },
  tools: {
    browserQaEnabled: false,
  },
  workflows: {
    defaultWorkflow: "plan",
    followUpBehavior: "queue",
  },
  context: {
    customInstructions: "",
  },
  validation: {
    commands: ["typecheck", "build", "test", "lint"],
  },
  limits: {
    overrides: {},
  },
  diagnostics: {
    verbose: false,
  },
  advanced: {
    subagents: "off",
  },
};

// ── Validation / migration helpers ─────────────────────────────────────────

const VALID_PERMISSION_MODES: ReadonlySet<string> = new Set([
  "chat_only",
  "plan_only",
  "ask_before_editing",
  "workspace_write",
]);

const VALID_EXECUTION_TARGETS: ReadonlySet<string> = new Set([
  "local_direct",
  "local_sandbox",
  "cloud_sandbox",
  "remote_devbox",
]);

const VALID_WORKFLOW_MODES: ReadonlySet<string> = new Set([
  "chat",
  "plan",
  "build",
  "review",
  "debug",
  "fix_ci",
  "generate_tests",
  "explain_repo",
]);

const VALID_PATCH_APPROVAL = new Set<PatchApprovalMode>(["always_ask", "auto"]);
const VALID_VALIDATION_APPROVAL = new Set<ValidationApprovalMode>([
  "always_ask",
  "auto",
]);
const VALID_FOLLOW_UP = new Set<FollowUpBehavior>(["queue", "interrupt", "ignore"]);
const VALID_SUBAGENT = new Set<SubagentPolicy>(["off", "preview"]);

/**
 * Coerce an unknown value into a valid `CodingDefaultPermissionMode`, falling
 * back to the safe default. Accepts the runtime `CodingPermissionMode` values
 * except `full_access` (which is reserved/not implemented) — `full_access` is
 * normalized down to the safe default so a client can never escalate into it.
 *
 * Used by the snapshot builder, which must never persist `full_access`.
 */
export function coercePermissionMode(
  value: unknown,
): CodingDefaultPermissionMode {
  if (typeof value === "string" && VALID_PERMISSION_MODES.has(value)) {
    return value as CodingDefaultPermissionMode;
  }
  // `full_access` and anything else: safe default. Never escalate.
  return SAFE_DEFAULT_PERMISSION_MODE;
}

/**
 * Coerce a permission mode for the *migrator*. Unlike `coercePermissionMode`,
 * this PRESERVES `full_access` when it is requested, so the resolver (the
 * single safety authority) can observe it and record an explicit downgrade.
 * The migrator only normalizes shape; it never silently drops a requested
 * escalation — that is the resolver's job, recorded in `downgrades`.
 */
function migratePermissionMode(value: unknown): CodingDefaultPermissionMode {
  if (typeof value === "string" && VALID_PERMISSION_MODES.has(value)) {
    return value as CodingDefaultPermissionMode;
  }
  // Preserve full_access so the resolver records the downgrade honestly.
  if (value === "full_access") {
    return "full_access" as CodingDefaultPermissionMode;
  }
  return SAFE_DEFAULT_PERMISSION_MODE;
}

/**
 * Normalize a legacy settings access mode (which may include the historical
 * `read_only` UI label) into a canonical runtime permission mode.
 *
 * `read_only` is treated as a UI label / legacy alias for `plan_only` — it is
 * NOT a distinct runtime mode. The runtime permission mode union is the
 * canonical stored value; this helper only translates the legacy alias.
 */
export function normalizeLegacyAccessMode(
  value: unknown,
): CodingDefaultPermissionMode {
  if (value === "read_only") return "plan_only";
  return coercePermissionMode(value);
}

/**
 * Like {@link normalizeLegacyAccessMode} but preserves `full_access` so the
 * resolver can record an explicit downgrade. Used by the migrator only; the
 * snapshot builder uses the non-preserving variant (snapshots must never store
 * `full_access`).
 */
function normalizeLegacyAccessModePreservingFullAccess(
  value: unknown,
): CodingDefaultPermissionMode {
  if (value === "read_only") return "plan_only";
  return migratePermissionMode(value);
}

/** Coerce an unknown value into a valid `ExecutionTarget`, with fallback. */
export function coerceExecutionTarget(value: unknown): ExecutionTarget {
  if (typeof value === "string" && VALID_EXECUTION_TARGETS.has(value)) {
    return value as ExecutionTarget;
  }
  return "local_direct";
}

function coerceWorkflowMode(
  value: unknown,
): CodingSettingsWorkflowMode {
  if (typeof value === "string" && VALID_WORKFLOW_MODES.has(value)) {
    return value as CodingSettingsWorkflowMode;
  }
  return "plan";
}

function coercePatchApproval(value: unknown): PatchApprovalMode {
  if (typeof value === "string" && VALID_PATCH_APPROVAL.has(value as PatchApprovalMode)) {
    return value as PatchApprovalMode;
  }
  return "always_ask";
}

function coerceValidationApproval(value: unknown): ValidationApprovalMode {
  if (
    typeof value === "string" &&
    VALID_VALIDATION_APPROVAL.has(value as ValidationApprovalMode)
  ) {
    return value as ValidationApprovalMode;
  }
  return "auto";
}

function coerceFollowUp(value: unknown): FollowUpBehavior {
  if (typeof value === "string" && VALID_FOLLOW_UP.has(value as FollowUpBehavior)) {
    return value as FollowUpBehavior;
  }
  return "queue";
}

function coerceSubagents(value: unknown): SubagentPolicy {
  if (typeof value === "string" && VALID_SUBAGENT.has(value as SubagentPolicy)) {
    return value as SubagentPolicy;
  }
  return "off";
}

/**
 * Restrict a list of validation commands to the known safe set. Unknown or
 * unsafe commands are dropped — the runtime may never run arbitrary commands.
 */
export function restrictValidationCommands(
  value: unknown,
): ReadonlyArray<string> {
  if (!Array.isArray(value)) {
    return ["typecheck", "build", "test", "lint"];
  }
  const filtered = value
    .filter((c): c is string => typeof c === "string")
    .filter((c) => SAFE_VALIDATION_COMMAND_SET.has(c));
  // De-duplicate preserving order.
  return Array.from(new Set(filtered));
}

/** Truncate custom instructions to a safe bounded length. */
export function sanitizeCustomInstructions(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= MAX_CUSTOM_INSTRUCTIONS_LEN) return trimmed;
  return `${trimmed.slice(0, MAX_CUSTOM_INSTRUCTIONS_LEN - 3)}...`;
}

/**
 * Migrate an arbitrary (possibly garbage, possibly legacy) persisted settings
 * blob into a clean, canonical `CodingAgentSettings` document. Unknown or
 * invalid fields fall back to safe defaults — this never throws on malformed
 * input. This is the migrator for the canonical settings document.
 */
export function migrateCodingAgentSettings(
  raw: unknown,
): CodingAgentSettings {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const generalRaw = (src.general ?? {}) as Record<string, unknown>;
  const modelRaw = (src.model ?? {}) as Record<string, unknown>;
  const prefRaw = (modelRaw.pref ?? {}) as Record<string, unknown>;
  const permsRaw = (src.permissions ?? {}) as Record<string, unknown>;
  const execRaw = (src.execution ?? {}) as Record<string, unknown>;
  const toolsRaw = (src.tools ?? {}) as Record<string, unknown>;
  const workflowsRaw = (src.workflows ?? {}) as Record<string, unknown>;
  const contextRaw = (src.context ?? {}) as Record<string, unknown>;
  const validationRaw = (src.validation ?? {}) as Record<string, unknown>;
  const limitsRaw = (src.limits ?? {}) as Record<string, unknown>;
  const overridesRaw = (limitsRaw.overrides ?? {}) as Record<string, unknown>;
  const diagRaw = (src.diagnostics ?? {}) as Record<string, unknown>;
  const advRaw = (src.advanced ?? {}) as Record<string, unknown>;

  // Allow the legacy `read_only` access alias anywhere a permission mode is
  // accepted — it normalizes to `plan_only`. full_access is intentionally
  // PRESERVED here so the resolver records an explicit downgrade rather than
  // the migrator silently swallowing it.
  const rawPermissionMode = normalizeLegacyAccessModePreservingFullAccess(
    permsRaw.permissionMode ?? permsRaw.accessMode,
  );

  return {
    version: CODING_SETTINGS_SCHEMA_VERSION,
    general: {
      defaultWorkflow: coerceWorkflowMode(
        generalRaw.defaultWorkflow ?? src.defaultWorkflow,
      ),
      streamOutput:
        typeof generalRaw.streamOutput === "boolean"
          ? generalRaw.streamOutput
          : true,
    },
    model: {
      pref: {
        provider:
          typeof prefRaw.provider === "string" ? prefRaw.provider : undefined,
        model: typeof prefRaw.model === "string" ? prefRaw.model : undefined,
        byok: prefRaw.byok === true ? true : undefined,
      },
    },
    permissions: {
      permissionMode: rawPermissionMode,
      patchApproval: coercePatchApproval(permsRaw.patchApproval),
      validationApproval: coerceValidationApproval(
        permsRaw.validationApproval,
      ),
    },
    execution: {
      target: coerceExecutionTarget(execRaw.target ?? src.executionTarget),
    },
    tools: {
      browserQaEnabled: toolsRaw.browserQaEnabled === true,
    },
    workflows: {
      defaultWorkflow: coerceWorkflowMode(
        workflowsRaw.defaultWorkflow ?? src.defaultWorkflow,
      ),
      followUpBehavior: coerceFollowUp(workflowsRaw.followUpBehavior),
    },
    context: {
      customInstructions:
        sanitizeCustomInstructions(contextRaw.customInstructions) ?? "",
    },
    validation: {
      commands: restrictValidationCommands(validationRaw.commands),
    },
    limits: {
      overrides: isPlainObject(overridesRaw) ? { ...overridesRaw } : {},
    },
    diagnostics: {
      verbose: diagRaw.verbose === true,
    },
    advanced: {
      subagents: coerceSubagents(advRaw.subagents),
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate and migrate an arbitrary client-supplied settings input into a
 * clean `CodingSettingsSnapshot`. This is the ONLY constructor for snapshots
 * and is server-side only — clients build a `CodingSettingsInput`, never a
 * trusted snapshot directly.
 */
export function buildSettingsSnapshot(
  input: CodingSettingsInput | undefined | null,
): CodingSettingsSnapshot {
  const base = input?.snapshot ?? {};

  const contextInput = input?.context ?? base.context;
  const customInstructions = sanitizeCustomInstructions(contextInput?.customInstructions);

  return {
    schemaVersion: CODING_SETTINGS_SCHEMA_VERSION,
    defaultPermissionMode: coercePermissionMode(
      input?.defaultPermissionMode ?? base.defaultPermissionMode,
    ),
    executionTarget: coerceExecutionTarget(
      input?.executionTarget ?? base.executionTarget,
    ),
    autoApprovePatch: Boolean(input?.autoApprovePatch ?? base.autoApprovePatch ?? false),
    autoApproveValidation: Boolean(
      input?.autoApproveValidation ?? base.autoApproveValidation ?? false,
    ),
    context: customInstructions ? { customInstructions } : undefined,
    capturedAt: new Date().toISOString(),
  };
}
