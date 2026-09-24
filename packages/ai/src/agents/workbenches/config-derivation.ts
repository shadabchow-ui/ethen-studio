// Pure derivation functions that convert repaired seed WorkbenchRequirement
// entries into typed FunctionalAgentWorkbenchConfig objects.
// Side-effect-free. No I/O. No runtime execution.

import type { FunctionalAgentActionRiskLevel } from "../runtime/types";
import type { WorkbenchRequirement } from "./workbench-requirements";
import { WORKBENCH_REQUIREMENTS } from "./workbench-requirements";
import {
  deriveWorkbenchActionId,
  deriveToolId,
  isApprovalGatedAction,
} from "./normalization";
import type {
  WorkbenchToolConfig,
  WorkbenchActionConfig,
  WorkbenchApprovalRule,
  WorkbenchMockStep,
  WorkbenchResultPanelConfig,
  WorkbenchArtifactConfig,
  FunctionalAgentWorkbenchConfig,
  WorkbenchPanelType,
} from "./config-types";

const DEFAULT_PANEL_TYPE: WorkbenchPanelType = "markdown";
const DEFAULT_MIME_TYPE = "text/markdown" as const;

function resolveRiskLevel(
  actionLabel: string,
  approvalGatedActions: string[],
): FunctionalAgentActionRiskLevel {
  const matched = approvalGatedActions.some(
    (gated) =>
      actionLabel.toLowerCase().includes(gated.toLowerCase()) ||
      gated.toLowerCase().includes(actionLabel.toLowerCase()),
  );
  return matched ? "high" : "low";
}

function inferPanelType(title: string): WorkbenchPanelType {
  const lower = title.toLowerCase();
  if (lower.includes("chart") || lower.includes("graph")) return "chart";
  if (lower.includes("grid") || lower.includes("table")) return "table";
  if (lower.includes("timeline") || lower.includes("feed")) return "timeline";
  if (lower.includes("diff") || lower.includes("compare")) return "diff";
  if (lower.includes("map")) return "map";
  if (lower.includes("tree")) return "tree";
  if (lower.includes("dashboard") || lower.includes("scorecard")) return "dashboard";
  if (lower.includes("diagram")) return "diagram";
  return "markdown";
}

function inferMimeType(artifactType: string): "text/markdown" | "application/json" {
  if (artifactType === "export" || artifactType === "draft") return "application/json";
  return "text/markdown";
}

export function buildWorkbenchToolConfigs(
  requirement: WorkbenchRequirement,
): WorkbenchToolConfig[] {
  return requirement.coreTools.map((name) => ({
    id: deriveToolId(name),
    label: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    sourceName: name,
    description: "",
  }));
}

export function buildWorkbenchActionConfigs(
  requirement: WorkbenchRequirement,
): WorkbenchActionConfig[] {
  return requirement.primaryActions.map((label) => {
    const id = deriveWorkbenchActionId(label);
    const gated = isApprovalGatedAction(requirement, label);
    const riskLevel = resolveRiskLevel(label, requirement.approvalGatedActions);
    const behaviorIndex = requirement.primaryActions.indexOf(label);
    const mockBehavior =
      behaviorIndex >= 0 && behaviorIndex < requirement.mockRunBehaviors.length
        ? requirement.mockRunBehaviors[behaviorIndex]
        : null;
    return {
      id,
      label,
      riskLevel,
      requiresApproval: gated,
      matchedApprovalReason: gated ? "matched from approvalGatedActions" : undefined,
      mockBehavior,
      toolIds: [],
    };
  });
}

export function buildWorkbenchApprovalRules(
  requirement: WorkbenchRequirement,
): WorkbenchApprovalRule[] {
  const actionConfigs = buildWorkbenchActionConfigs(requirement);
  const gatedByAction = new Set(
    actionConfigs.filter((a) => a.requiresApproval).map((a) => a.id),
  );

  const rules: WorkbenchApprovalRule[] = [];

  // Rules for actions that match primary actions
  for (const action of actionConfigs) {
    if (!action.requiresApproval) continue;
    rules.push({
      id: `approve-${action.id}`,
      actionId: action.id,
      actionLabel: action.label,
      riskLevel: action.riskLevel,
      requiresApproval: true,
      approverRole: "user",
      timeoutMinutes: 5,
      fallbackBehavior: "deny",
    });
  }

  // Rules for approval-gated actions not in primary actions (external/live-only)
  for (const gated of requirement.approvalGatedActions) {
    const gatedId = deriveWorkbenchActionId(gated);
    if (gatedByAction.has(gatedId)) continue;
    rules.push({
      id: `approve-${gatedId}`,
      actionId: gatedId,
      actionLabel: gated,
      riskLevel: "high",
      requiresApproval: true,
      approverRole: "user",
      timeoutMinutes: 5,
      fallbackBehavior: "deny",
    });
  }

  return rules;
}

export function buildWorkbenchMockSteps(
  requirement: WorkbenchRequirement,
): WorkbenchMockStep[] {
  const actionConfigs = buildWorkbenchActionConfigs(requirement);
  return requirement.mockRunBehaviors.map((behavior, index) => {
    const action = index < actionConfigs.length ? actionConfigs[index] : null;
    return {
      id: `mock-${requirement.slug}-step-${index + 1}`,
      stepIndex: index,
      actionId: action?.id ?? `unknown-action-${index}`,
      actionLabel: action?.label ?? `Step ${index + 1}`,
      toolIds: action?.toolIds ?? [],
      mockBehavior: behavior,
      fixtureRefs: requirement.demoDataNeeded,
      durationMs: 500,
    };
  });
}

export function buildWorkbenchResultPanels(
  requirement: WorkbenchRequirement,
): WorkbenchResultPanelConfig[] {
  if (requirement.resultPanels.length > 0) {
    return requirement.resultPanels.map((title, index) => ({
      id: `panel-${requirement.slug}-${index + 1}`,
      title,
      sourceModule:
        index < requirement.workspaceModules.length
          ? requirement.workspaceModules[index]
          : title,
      panelType: inferPanelType(title),
    }));
  }
  // Fallback: derive from workspaceModules if resultPanels is empty
  return requirement.workspaceModules.map((module, index) => ({
    id: `panel-${requirement.slug}-${index + 1}`,
    title: module,
    sourceModule: module,
    panelType: inferPanelType(module),
  }));
}

export function buildWorkbenchArtifactTemplates(
  requirement: WorkbenchRequirement,
): WorkbenchArtifactConfig[] {
  return requirement.artifactTypes.map((artifactType, index) => ({
    id: `artifact-${requirement.slug}-${index + 1}`,
    artifactType,
    title: `${requirement.name} ${artifactType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
    mimeType: inferMimeType(artifactType),
  }));
}

export function buildWorkbenchConfig(
  requirement: WorkbenchRequirement,
): FunctionalAgentWorkbenchConfig {
  const tools = buildWorkbenchToolConfigs(requirement);
  const actions = buildWorkbenchActionConfigs(requirement);
  const approvalRules = buildWorkbenchApprovalRules(requirement);
  const mockSteps = buildWorkbenchMockSteps(requirement);
  const resultPanels = buildWorkbenchResultPanels(requirement);
  const artifactTemplates = buildWorkbenchArtifactTemplates(requirement);

  // Assign toolIds to actions based on index proximity
  const actionsWithToolIds: WorkbenchActionConfig[] = actions.map((action, index) => ({
    ...action,
    toolIds:
      index < tools.length
        ? [tools[index].id]
        : tools.length > 0
          ? [tools[tools.length - 1].id]
          : [],
  }));

  return {
    slug: requirement.slug,
    name: requirement.name,
    category: requirement.category,
    templateFamily: requirement.templateFamily,
    primaryWorkflowObject: requirement.primaryWorkflowObject,
    coreJobToBeDone: requirement.workflowSteps.join("; "),
    tools,
    actions: actionsWithToolIds,
    approvalRules,
    mockSteps,
    workspaceModules: requirement.workspaceModules,
    resultPanels,
    artifactTemplates,
    requiredInputs: requirement.requiredInputs,
    demoDataNeeded: requirement.demoDataNeeded,
    integrationTargets: requirement.integrationTargets,
    approvalGatedActions: requirement.approvalGatedActions,
    nonScopeLimits: requirement.nonScopeLimits,
    evalCaseIds: requirement.evalCaseIds,
  };
}

export function buildAllWorkbenchConfigs(): FunctionalAgentWorkbenchConfig[] {
  return WORKBENCH_REQUIREMENTS.map(buildWorkbenchConfig);
}
