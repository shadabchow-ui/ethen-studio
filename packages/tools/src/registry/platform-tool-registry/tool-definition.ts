import type {
  ApprovalRequirement,
  ToolDefinition,
  ToolExecutionState,
  ToolRiskLevel,
} from "@ethen/contracts/tools/types";

export type ToolVisibilityScope =
  | "internal_only"
  | "workspace_scoped"
  | "agent_scoped";

export type ToolAuditVerbosity = "minimal" | "standard" | "verbose";

export interface ToolShapeMetadata {
  summary: string;
  fields: string[];
}

export interface ToolRiskDimensions {
  baseRiskLevel: ToolRiskLevel;
  touchesExternalSystems: boolean;
  handlesUserContent: boolean;
  stateChanging: boolean;
  destructive: boolean;
  privileged: boolean;
}

export interface ToolReviewMetadata {
  reviewRequired: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
}

export interface ToolFmeaMetadata {
  required: boolean;
  summary?: string;
  lastReviewedAt?: string;
  failureModes?: string[];
}

export interface ToolExecutionControls {
  dryRunSupported: boolean;
  readOnly: boolean;
  stateChanging: boolean;
  auditVerbosity: ToolAuditVerbosity;
  approvalGateMinimum: ApprovalRequirement;
}

export interface ToolExecutionStateHonesty {
  executionState: ToolExecutionState;
  executable: boolean;
  contractOnly: boolean;
  setupRequiredIndicator: boolean;
  approvalRequiredIndicator: boolean;
}

export interface GovernedToolDefinition {
  id: ToolDefinition["id"];
  name: string;
  semanticVersion: string;
  ownerTeam: string;
  visibilityScope: ToolVisibilityScope;
  inputSchema: ToolShapeMetadata;
  outputSchema: ToolShapeMetadata;
  riskDimensions: ToolRiskDimensions;
  reviewMetadata?: ToolReviewMetadata;
  fmeaMetadata?: ToolFmeaMetadata;
  executionControls: ToolExecutionControls;
  executionStateHonesty: ToolExecutionStateHonesty;
  source: ToolDefinition;
}

export interface GovernedToolDefinitionOverrides {
  semanticVersion?: string;
  ownerTeam?: string;
  visibilityScope?: ToolVisibilityScope;
  reviewMetadata?: ToolReviewMetadata;
  fmeaMetadata?: ToolFmeaMetadata;
  executionControls?: Partial<ToolExecutionControls>;
}

export interface GovernedToolAdaptationOptions {
  semanticVersion: string;
  overrides?: Partial<Record<ToolDefinition["id"], GovernedToolDefinitionOverrides>>;
}

export function buildShapeMetadata(summary: string): ToolShapeMetadata {
  const normalized = summary.trim();
  const compact = normalized.replace(/\.$/, "");
  const fields = compact
    .split(/,| and /g)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    summary: normalized,
    fields,
  };
}

export function inferOwnerTeam(tool: ToolDefinition): string {
  if (tool.category === "local_repo") {
    return "coding-platform";
  }

  if (
    tool.category === "business_ops" ||
    tool.category === "google_workspace" ||
    tool.category === "microsoft365"
  ) {
    return "integrations-platform";
  }

  if (tool.category === "media" || tool.category === "media_projects") {
    return "media-platform";
  }

  return `${tool.category.replace(/_/g, "-")}-platform`;
}

export function inferVisibilityScope(tool: ToolDefinition): ToolVisibilityScope {
  if (tool.category === "local_repo") {
    return "internal_only";
  }

  if (tool.allowedAgentSlugs.length > 0) {
    return "agent_scoped";
  }

  return "workspace_scoped";
}

export function inferAuditVerbosity(tool: ToolDefinition): ToolAuditVerbosity {
  if (tool.id === "shell.run" || tool.id === "file.apply_patch") {
    return "verbose";
  }

  if (tool.requiresApproval || !tool.readOnly) {
    return "standard";
  }

  return "minimal";
}

export function inferDryRunSupport(tool: ToolDefinition): boolean {
  return tool.id === "file.propose_patch" || tool.description.toLowerCase().includes("dry-run");
}

export function inferRiskDimensions(tool: ToolDefinition): ToolRiskDimensions {
  return {
    baseRiskLevel: tool.riskLevel,
    touchesExternalSystems: Boolean(tool.providerId && tool.providerId !== "local-repo-bridge"),
    handlesUserContent:
      tool.riskLevel === "write" ||
      tool.riskLevel === "writes_user_content" ||
      tool.category === "artifact" ||
      tool.category === "writing" ||
      tool.category === "media" ||
      tool.category === "media_projects",
    stateChanging: !tool.readOnly,
    destructive: tool.riskLevel === "destructive",
    privileged: tool.riskLevel === "privileged",
  };
}

export function inferExecutionStateHonesty(
  tool: ToolDefinition,
  executionControls: ToolExecutionControls,
): ToolExecutionStateHonesty {
  return {
    executionState: tool.executionState,
    executable: tool.executionState === "available",
    contractOnly: tool.executionState === "contract_only",
    setupRequiredIndicator: Boolean(tool.providerId && tool.providerId !== "local-repo-bridge"),
    approvalRequiredIndicator:
      tool.requiresApproval || tool.approvalRequirement !== "no_approval",
  };
}

export function adaptToolDefinition(
  tool: ToolDefinition,
  options: GovernedToolAdaptationOptions,
): GovernedToolDefinition {
  const override = options.overrides?.[tool.id];
  const executionControls: ToolExecutionControls = {
    dryRunSupported: inferDryRunSupport(tool),
    readOnly: tool.readOnly,
    stateChanging: !tool.readOnly,
    auditVerbosity: inferAuditVerbosity(tool),
    approvalGateMinimum: tool.approvalRequirement,
    ...override?.executionControls,
  };

  return {
    id: tool.id,
    name: tool.name,
    semanticVersion: override?.semanticVersion ?? options.semanticVersion,
    ownerTeam: override?.ownerTeam ?? inferOwnerTeam(tool),
    visibilityScope: override?.visibilityScope ?? inferVisibilityScope(tool),
    inputSchema: buildShapeMetadata(tool.inputSummary),
    outputSchema: buildShapeMetadata(tool.outputSummary),
    riskDimensions: inferRiskDimensions(tool),
    reviewMetadata: override?.reviewMetadata,
    fmeaMetadata: override?.fmeaMetadata,
    executionControls,
    executionStateHonesty: inferExecutionStateHonesty(tool, executionControls),
    source: tool,
  };
}
