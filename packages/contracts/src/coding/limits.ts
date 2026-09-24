// Central usage limits and budget guardrails for coding-agent runs.
// This module is the single source of truth for all runtime limits.
// Limit failures must be explicit, auditable, and fail-closed.

// ─── Limit definitions ────────────────────────────────────────────────────

export interface UsageLimits {
  /** Max total run duration in milliseconds */
  maxRunDurationMs: number;
  /** Max tool calls (repo reads, searches, etc.) per run */
  maxToolCallsPerRun: number;
  /** Max file reads per run */
  maxFileReadsPerRun: number;
  /** Max patch files across all proposals */
  maxPatchFilesPerRun: number;
  /** Max total bytes of patch content */
  maxPatchBytesPerRun: number;
  /** Max patch proposals per run */
  maxPatchProposalsPerRun: number;
  /** Max validation commands per run */
  maxValidationCommandsPerRun: number;
  /** Max repair attempts per run */
  maxRepairAttempts: number;
  /** Max terminal command output bytes */
  maxTerminalOutputBytesPerCommand: number;
  /** Max terminal commands per run */
  maxTerminalCommandsPerRun: number;
  /** Max provider warnings before coding mode is disabled */
  maxProviderWarnings: number;
  /** Max runs per day (enforced if storage supports it) */
  maxRunsPerDay: number;
  /** Max total provider tokens across all model calls. Soft cap when provider data is available. */
  maxProviderTokensPerRun: number;
}

export const DEFAULT_USAGE_LIMITS: UsageLimits = {
  maxRunDurationMs: 20 * 60 * 1000,       // 20 minutes
  maxToolCallsPerRun: 50,                   // generous for plan + build
  maxFileReadsPerRun: 200,                  // repo exploration ceiling
  maxPatchFilesPerRun: 20,                  // ~20 changed files
  maxPatchBytesPerRun: 500 * 1024,          // 500 KB
  maxPatchProposalsPerRun: 5,               // 5 proposal rounds
  maxValidationCommandsPerRun: 8,           // build + lint + typecheck + test
  maxRepairAttempts: 2,                     // repair loop ceiling
  maxTerminalOutputBytesPerCommand: 100 * 1024, // 100 KB per command
  maxTerminalCommandsPerRun: 16,
  maxProviderWarnings: 3,
  maxRunsPerDay: 20,
  maxProviderTokensPerRun: 200_000,
};

// ─── Usage tracking ───────────────────────────────────────────────────────

export interface RunUsage {
  /** When the run was created (ms epoch) */
  startedAt: number;
  /** Total tool calls executed */
  toolCallsUsed: number;
  /** Total file reads performed */
  fileReadsUsed: number;
  /** Total files changed via patches */
  patchFilesUsed: number;
  /** Total patch bytes written */
  patchBytesUsed: number;
  /** Total patch proposals created */
  patchProposalsUsed: number;
  /** Total validation commands executed */
  validationCommandsUsed: number;
  /** Total repair attempts made */
  repairAttemptsUsed: number;
  /** Total terminal commands executed */
  terminalCommandsUsed: number;
  /** Provider warnings issued */
  providerWarnings: number;
  /** Total provider tokens used across all model calls. Null when no adapter returned usage data. */
  providerTokensUsed: number | null;
  /** Prompt tokens from provider, accumulated across all calls. Null when no adapter returned usage data. */
  providerPromptTokens: number | null;
  /** Completion tokens from provider, accumulated across all calls. Null when no adapter returned usage data. */
  providerCompletionTokens: number | null;
  /** Estimated cost in USD. Always null — no pricing table is configured, so cost is never fabricated. */
  providerEstimatedCostUsd: number | null;
}

export function createRunUsage(): RunUsage {
  return {
    startedAt: Date.now(),
    toolCallsUsed: 0,
    fileReadsUsed: 0,
    patchFilesUsed: 0,
    patchBytesUsed: 0,
    patchProposalsUsed: 0,
    validationCommandsUsed: 0,
    repairAttemptsUsed: 0,
    terminalCommandsUsed: 0,
    providerWarnings: 0,
    providerTokensUsed: null,
    providerPromptTokens: null,
    providerCompletionTokens: null,
    providerEstimatedCostUsd: null,
  };
}

// ─── Violation reporting ──────────────────────────────────────────────────

export type LimitKind =
  | "run_duration"
  | "tool_calls"
  | "file_reads"
  | "patch_files"
  | "patch_bytes"
  | "patch_proposals"
  | "validation_commands"
  | "repair_attempts"
  | "terminal_commands"
  | "terminal_output_bytes"
  | "provider_warnings"
  | "provider_tokens"
  | "runs_per_day";

export interface UsageLimitViolation {
  kind: LimitKind;
  used: number;
  limit: number;
  message: string;
}

export const LIMIT_KIND_LABELS: Record<LimitKind, string> = {
  run_duration: "Run duration",
  tool_calls: "Tool calls",
  file_reads: "File reads",
  patch_files: "Patch files",
  patch_bytes: "Patch bytes",
  patch_proposals: "Patch proposals",
  validation_commands: "Validation commands",
  repair_attempts: "Repair attempts",
  terminal_commands: "Terminal commands",
  terminal_output_bytes: "Terminal output",
  provider_warnings: "Provider warnings",
  provider_tokens: "Provider tokens",
  runs_per_day: "Run limit",
};

// ─── Enforcement ───────────────────────────────────────────────────────────

export interface LimitCheckResult {
  allowed: boolean;
  violation?: UsageLimitViolation;
}

function violation(
  kind: LimitKind,
  used: number,
  limit: number,
): UsageLimitViolation {
  return {
    kind,
    used,
    limit,
    message: `${LIMIT_KIND_LABELS[kind]} limit reached: ${used}/${limit}`,
  };
}

/**
 * Check whether a proposed action fits within the run's current usage against limits.
 * Returns { allowed: false, violation } if the limit would be exceeded.
 */
export function checkToolCallLimit(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const next = usage.toolCallsUsed + 1;
  if (next > limits.maxToolCallsPerRun) {
    return {
      allowed: false,
      violation: violation("tool_calls", next - 1, limits.maxToolCallsPerRun),
    };
  }
  return { allowed: true };
}

export function checkFileReadLimit(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const next = usage.fileReadsUsed + 1;
  if (next > limits.maxFileReadsPerRun) {
    return {
      allowed: false,
      violation: violation("file_reads", next - 1, limits.maxFileReadsPerRun),
    };
  }
  return { allowed: true };
}

export function checkPatchFilesLimit(
  usage: RunUsage,
  limits: UsageLimits,
  additionalFiles: number,
): LimitCheckResult {
  const next = usage.patchFilesUsed + additionalFiles;
  if (next > limits.maxPatchFilesPerRun) {
    return {
      allowed: false,
      violation: violation(
        "patch_files",
        usage.patchFilesUsed,
        limits.maxPatchFilesPerRun,
      ),
    };
  }
  return { allowed: true };
}

export function checkPatchBytesLimit(
  usage: RunUsage,
  limits: UsageLimits,
  additionalBytes: number,
): LimitCheckResult {
  const next = usage.patchBytesUsed + additionalBytes;
  if (next > limits.maxPatchBytesPerRun) {
    return {
      allowed: false,
      violation: violation(
        "patch_bytes",
        usage.patchBytesUsed,
        limits.maxPatchBytesPerRun,
      ),
    };
  }
  return { allowed: true };
}

export function checkPatchProposalsLimit(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const next = usage.patchProposalsUsed + 1;
  if (next > limits.maxPatchProposalsPerRun) {
    return {
      allowed: false,
      violation: violation(
        "patch_proposals",
        next - 1,
        limits.maxPatchProposalsPerRun,
      ),
    };
  }
  return { allowed: true };
}

export function checkValidationCommandsLimit(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const next = usage.validationCommandsUsed + 1;
  if (next > limits.maxValidationCommandsPerRun) {
    return {
      allowed: false,
      violation: violation(
        "validation_commands",
        next - 1,
        limits.maxValidationCommandsPerRun,
      ),
    };
  }
  return { allowed: true };
}

export function checkRepairAttemptsLimit(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const next = usage.repairAttemptsUsed + 1;
  if (next > limits.maxRepairAttempts) {
    return {
      allowed: false,
      violation: violation(
        "repair_attempts",
        next - 1,
        limits.maxRepairAttempts,
      ),
    };
  }
  return { allowed: true };
}

export function checkTerminalCommandsLimit(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const next = usage.terminalCommandsUsed + 1;
  if (next > limits.maxTerminalCommandsPerRun) {
    return {
      allowed: false,
      violation: violation(
        "terminal_commands",
        next - 1,
        limits.maxTerminalCommandsPerRun,
      ),
    };
  }
  return { allowed: true };
}

export function checkTerminalOutputBytesLimit(
  limits: UsageLimits,
  outputBytes: number,
): LimitCheckResult {
  if (outputBytes > limits.maxTerminalOutputBytesPerCommand) {
    return {
      allowed: false,
      violation: violation(
        "terminal_output_bytes",
        outputBytes,
        limits.maxTerminalOutputBytesPerCommand,
      ),
    };
  }
  return { allowed: true };
}

export function checkRunDurationLimit(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const elapsed = Date.now() - usage.startedAt;
  if (elapsed >= limits.maxRunDurationMs) {
    return {
      allowed: false,
      violation: violation(
        "run_duration",
        Math.floor(elapsed / 1000),
        Math.floor(limits.maxRunDurationMs / 1000),
      ),
    };
  }
  return { allowed: true };
}

export function checkProviderWarningsLimit(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  if (usage.providerWarnings >= limits.maxProviderWarnings) {
    return {
      allowed: false,
      violation: violation(
        "provider_warnings",
        usage.providerWarnings,
        limits.maxProviderWarnings,
      ),
    };
  }
  return { allowed: true };
}

export function checkTokenLimit(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  if (usage.providerTokensUsed === null) return { allowed: true };
  if (usage.providerTokensUsed >= limits.maxProviderTokensPerRun) {
    return {
      allowed: false,
      violation: violation(
        "provider_tokens",
        usage.providerTokensUsed,
        limits.maxProviderTokensPerRun,
      ),
    };
  }
  return { allowed: true };
}

// ─── Convenience: apply check and record if allowed ────────────────────────

export function tryRecordToolCall(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const check = checkToolCallLimit(usage, limits);
  if (check.allowed) usage.toolCallsUsed++;
  return check;
}

export function tryRecordFileRead(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const check = checkFileReadLimit(usage, limits);
  if (check.allowed) usage.fileReadsUsed++;
  return check;
}

export function tryRecordPatchProposal(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const check = checkPatchProposalsLimit(usage, limits);
  if (check.allowed) usage.patchProposalsUsed++;
  return check;
}

export function tryRecordValidationCommand(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const check = checkValidationCommandsLimit(usage, limits);
  if (check.allowed) usage.validationCommandsUsed++;
  return check;
}

export function tryRecordRepairAttempt(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const check = checkRepairAttemptsLimit(usage, limits);
  if (check.allowed) usage.repairAttemptsUsed++;
  return check;
}

export function tryRecordTerminalCommand(
  usage: RunUsage,
  limits: UsageLimits,
): LimitCheckResult {
  const check = checkTerminalCommandsLimit(usage, limits);
  if (check.allowed) usage.terminalCommandsUsed++;
  return check;
}

// ─── Run-scoped helper ─────────────────────────────────────────────────────

/**
 * Validates whether a new run can be created given existing runs in a period.
 * Currently checks against maxRunsPerDay using simple count.
 * If no storage backend for run listing is available, always allows.
 */
export function checkCanCreateRun(
  existingRunsInPeriod: number,
  limits: UsageLimits,
): LimitCheckResult {
  if (existingRunsInPeriod >= limits.maxRunsPerDay) {
    return {
      allowed: false,
      violation: violation(
        "runs_per_day",
        existingRunsInPeriod,
        limits.maxRunsPerDay,
      ),
    };
  }
  return { allowed: true };
}

// ─── Token accumulation ────────────────────────────────────────────────────

export interface ProbeUsageData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Accumulate real provider token usage into the run's usage counters.
 * When usage data is absent, this is a no-op — no fabricated values are stored.
 * Returns the new limit check result after accumulation.
 */
export function accumulateProviderTokens(
  usage: RunUsage,
  limits: UsageLimits,
  callUsage: ProbeUsageData | null | undefined,
): LimitCheckResult {
  if (!callUsage) return { allowed: true };
  usage.providerPromptTokens = (usage.providerPromptTokens ?? 0) + callUsage.promptTokens;
  usage.providerCompletionTokens = (usage.providerCompletionTokens ?? 0) + callUsage.completionTokens;
  usage.providerTokensUsed = (usage.providerPromptTokens ?? 0) + (usage.providerCompletionTokens ?? 0);
  return checkTokenLimit(usage, limits);
}

// ─── Budget status ──────────────────────────────────────────────────────────

export type BudgetStatus = "within_limit" | "warning" | "blocked" | "not_applicable";

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  within_limit: "Within limit",
  warning: "Warning",
  blocked: "Blocked",
  not_applicable: "Not applicable",
};

export const BUDGET_STATUS_COLORS: Record<BudgetStatus, string> = {
  within_limit: "var(--ethen-accent-green, #8fa888)",
  warning: "var(--ethen-accent-orange, #c8a56a)",
  blocked: "var(--ethen-accent-red, #c2554a)",
  not_applicable: "var(--ethen-text-muted, #9a9892)",
};

export function computeBudgetStatus(usage: RunUsage, limits: UsageLimits): BudgetStatus {
  const violations = getActiveViolations(usage, limits);
  if (violations.length > 0) return "blocked";
  const summary = computeUsageSummary(usage, limits);
  const hasWarning = summary.some((s) => s.warning === "warn" || s.warning === "critical");
  if (hasWarning) return "warning";
  return "within_limit";
}

// ─── Summary helpers ───────────────────────────────────────────────────────

export function getUsageWarningLevel(
  used: number,
  limit: number,
): "ok" | "warn" | "critical" {
  const ratio = used / limit;
  if (ratio >= 0.9) return "critical";
  if (ratio >= 0.7) return "warn";
  return "ok";
}

export function computeUsageSummary(
  usage: RunUsage,
  limits: UsageLimits,
): Array<{
  kind: LimitKind;
  used: number;
  limit: number;
  warning: "ok" | "warn" | "critical";
}> {
  return [
    {
      kind: "tool_calls",
      used: usage.toolCallsUsed,
      limit: limits.maxToolCallsPerRun,
      warning: getUsageWarningLevel(usage.toolCallsUsed, limits.maxToolCallsPerRun),
    },
    {
      kind: "file_reads",
      used: usage.fileReadsUsed,
      limit: limits.maxFileReadsPerRun,
      warning: getUsageWarningLevel(usage.fileReadsUsed, limits.maxFileReadsPerRun),
    },
    {
      kind: "patch_proposals",
      used: usage.patchProposalsUsed,
      limit: limits.maxPatchProposalsPerRun,
      warning: getUsageWarningLevel(usage.patchProposalsUsed, limits.maxPatchProposalsPerRun),
    },
    {
      kind: "patch_files",
      used: usage.patchFilesUsed,
      limit: limits.maxPatchFilesPerRun,
      warning: getUsageWarningLevel(usage.patchFilesUsed, limits.maxPatchFilesPerRun),
    },
    {
      kind: "validation_commands",
      used: usage.validationCommandsUsed,
      limit: limits.maxValidationCommandsPerRun,
      warning: getUsageWarningLevel(usage.validationCommandsUsed, limits.maxValidationCommandsPerRun),
    },
    {
      kind: "repair_attempts",
      used: usage.repairAttemptsUsed,
      limit: limits.maxRepairAttempts,
      warning: getUsageWarningLevel(usage.repairAttemptsUsed, limits.maxRepairAttempts),
    },
    {
      kind: "terminal_commands",
      used: usage.terminalCommandsUsed,
      limit: limits.maxTerminalCommandsPerRun,
      warning: getUsageWarningLevel(usage.terminalCommandsUsed, limits.maxTerminalCommandsPerRun),
    },
    {
      kind: "provider_warnings",
      used: usage.providerWarnings,
      limit: limits.maxProviderWarnings,
      warning: getUsageWarningLevel(usage.providerWarnings, limits.maxProviderWarnings),
    },
    ...(usage.providerTokensUsed !== null
      ? [
          {
            kind: "provider_tokens" as LimitKind,
            used: usage.providerTokensUsed,
            limit: limits.maxProviderTokensPerRun,
            warning: getUsageWarningLevel(usage.providerTokensUsed, limits.maxProviderTokensPerRun),
          },
        ]
      : []),
  ];
}

export function getActiveViolations(
  usage: RunUsage,
  limits: UsageLimits,
): UsageLimitViolation[] {
  const violations: UsageLimitViolation[] = [];
  const runLimit = checkRunDurationLimit(usage, limits);
  if (!runLimit.allowed && runLimit.violation) violations.push(runLimit.violation);
  const toolLimit = checkToolCallLimit(usage, limits);
  if (!toolLimit.allowed && toolLimit.violation) violations.push(toolLimit.violation);
  const fileReadLimit = checkFileReadLimit(usage, limits);
  if (!fileReadLimit.allowed && fileReadLimit.violation) violations.push(fileReadLimit.violation);
  const terminalLimit = checkTerminalCommandsLimit(usage, limits);
  if (!terminalLimit.allowed && terminalLimit.violation) violations.push(terminalLimit.violation);
  const patchLimit = checkPatchProposalsLimit(usage, limits);
  if (!patchLimit.allowed && patchLimit.violation) violations.push(patchLimit.violation);
  const validationLimit = checkValidationCommandsLimit(usage, limits);
  if (!validationLimit.allowed && validationLimit.violation) violations.push(validationLimit.violation);
  const repairLimit = checkRepairAttemptsLimit(usage, limits);
  if (!repairLimit.allowed && repairLimit.violation) violations.push(repairLimit.violation);
  const warningLimit = checkProviderWarningsLimit(usage, limits);
  if (!warningLimit.allowed && warningLimit.violation) violations.push(warningLimit.violation);
  const tokenLimit = checkTokenLimit(usage, limits);
  if (!tokenLimit.allowed && tokenLimit.violation) violations.push(tokenLimit.violation);
  return violations;
}
