import type { ToolDefinition } from "@ethen/contracts/tools/types";
import type {
  GovernedToolDefinition,
  GovernedToolDefinitionOverrides,
} from "./tool-definition";
import { adaptToolDefinition } from "./tool-definition";

export interface ToolValidationIssue {
  toolId: ToolDefinition["id"];
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface ToolValidationSummary {
  totalToolsChecked: number;
  availableTools: number;
  contractOnlyTools: number;
  setupRequiredIndicators: number;
  approvalRequiredIndicators: number;
  validationErrors: number;
  validationWarnings: number;
}

export interface ValidateGovernedToolDefinitionsOptions {
  semanticVersion: string;
  overrides?: Partial<Record<ToolDefinition["id"], GovernedToolDefinitionOverrides>>;
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function needsReviewMetadata(definition: GovernedToolDefinition): boolean {
  return (
    definition.executionStateHonesty.executable &&
    (definition.executionControls.stateChanging ||
      definition.riskDimensions.destructive ||
      definition.riskDimensions.privileged)
  );
}

function needsFmeaMetadata(definition: GovernedToolDefinition): boolean {
  return (
    definition.executionStateHonesty.executable &&
    (definition.executionControls.stateChanging ||
      definition.riskDimensions.baseRiskLevel === "external_side_effect" ||
      definition.riskDimensions.destructive ||
      definition.riskDimensions.privileged)
  );
}

export function validateToolDefinition(
  definition: GovernedToolDefinition,
): ToolValidationIssue[] {
  const issues: ToolValidationIssue[] = [];

  if (!SEMVER_PATTERN.test(definition.semanticVersion)) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "invalid_semantic_version",
      message: `semanticVersion must be x.y.z; received "${definition.semanticVersion}".`,
    });
  }

  if (!definition.ownerTeam.trim()) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "missing_owner_team",
      message: "ownerTeam is required.",
    });
  }

  if (!definition.inputSchema.summary.trim() || definition.inputSchema.fields.length === 0) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "missing_input_schema_summary",
      message: "input schema summary/shape metadata is required.",
    });
  }

  if (!definition.outputSchema.summary.trim() || definition.outputSchema.fields.length === 0) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "missing_output_schema_summary",
      message: "output schema summary/shape metadata is required.",
    });
  }

  if (definition.executionControls.readOnly && definition.executionControls.stateChanging) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "read_only_state_changing_conflict",
      message: "readOnly and stateChanging cannot both be true.",
    });
  }

  if (
    definition.executionControls.stateChanging &&
    definition.executionControls.approvalGateMinimum === "no_approval"
  ) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "state_change_without_approval_gate",
      message: "state-changing tools must require approval metadata.",
    });
  }

  if (
    definition.executionStateHonesty.contractOnly &&
    definition.executionStateHonesty.executable
  ) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "contract_only_marked_executable",
      message: "contract-only tools must not be reported as executable.",
    });
  }

  if (
    definition.source.executionState !== "available" &&
    definition.executionStateHonesty.executable
  ) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "non_available_marked_executable",
      message: `tool source executionState is "${definition.source.executionState}" but executable=true.`,
    });
  }

  if (
    definition.source.executionState === "available" &&
    !definition.executionStateHonesty.executable
  ) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "available_marked_non_executable",
      message: 'available tools must be reported as executable in the honesty layer.',
    });
  }

  if (
    definition.executionStateHonesty.approvalRequiredIndicator !==
    (definition.source.requiresApproval ||
      definition.source.approvalRequirement !== "no_approval")
  ) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "approval_indicator_mismatch",
      message: "approvalRequired indicator does not match source approval metadata.",
    });
  }

  if (needsReviewMetadata(definition) && !definition.reviewMetadata?.reviewRequired) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "missing_review_metadata",
      message: "executable higher-risk tools require review metadata.",
    });
  }

  if (needsFmeaMetadata(definition) && !definition.fmeaMetadata?.required) {
    issues.push({
      toolId: definition.id,
      severity: "error",
      code: "missing_fmea_metadata",
      message: "executable higher-risk tools require FMEA metadata.",
    });
  }

  if (
    definition.executionControls.dryRunSupported &&
    definition.executionControls.stateChanging &&
    definition.executionStateHonesty.executable
  ) {
    issues.push({
      toolId: definition.id,
      severity: "warning",
      code: "state_changing_dry_run_review",
      message: "verify dry-run claims stay honest for executable state-changing tools.",
    });
  }

  return issues;
}

export function validateGovernedToolDefinitions(
  tools: ToolDefinition[],
  options: ValidateGovernedToolDefinitionsOptions,
): {
  definitions: GovernedToolDefinition[];
  issues: ToolValidationIssue[];
  summary: ToolValidationSummary;
} {
  const definitions = tools.map((tool) => adaptToolDefinition(tool, options));
  const issues = definitions.flatMap((definition) => validateToolDefinition(definition));
  const summary: ToolValidationSummary = {
    totalToolsChecked: definitions.length,
    availableTools: definitions.filter((definition) => definition.executionStateHonesty.executable)
      .length,
    contractOnlyTools: definitions.filter(
      (definition) => definition.executionStateHonesty.contractOnly,
    ).length,
    setupRequiredIndicators: definitions.filter(
      (definition) => definition.executionStateHonesty.setupRequiredIndicator,
    ).length,
    approvalRequiredIndicators: definitions.filter(
      (definition) => definition.executionStateHonesty.approvalRequiredIndicator,
    ).length,
    validationErrors: issues.filter((issue) => issue.severity === "error").length,
    validationWarnings: issues.filter((issue) => issue.severity === "warning").length,
  };

  return {
    definitions,
    issues,
    summary,
  };
}
