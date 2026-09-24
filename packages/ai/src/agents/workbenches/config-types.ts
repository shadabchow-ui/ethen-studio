// Typed config interfaces for the functional agent workbench layer.
// Bridges repaired seed data (WorkbenchRequirement) into implementation-ready
// configs consumed by workbench UI, mock runner, and approval gates.

import type {
  FunctionalAgentArtifactType,
  FunctionalAgentActionRiskLevel,
} from "../runtime/types";

export interface WorkbenchToolConfig {
  id: string;
  label: string;
  sourceName: string;
  description: string;
}

export interface WorkbenchActionConfig {
  id: string;
  label: string;
  riskLevel: FunctionalAgentActionRiskLevel;
  requiresApproval: boolean;
  matchedApprovalReason?: string;
  mockBehavior: string | null;
  toolIds: string[];
}

export interface WorkbenchApprovalRule {
  id: string;
  actionId: string;
  actionLabel: string;
  riskLevel: FunctionalAgentActionRiskLevel;
  requiresApproval: boolean;
  approverRole: string;
  timeoutMinutes: number;
  fallbackBehavior: "deny" | "defer" | "escalate";
}

export interface WorkbenchMockStep {
  id: string;
  stepIndex: number;
  actionId: string;
  actionLabel: string;
  toolIds: string[];
  mockBehavior: string;
  fixtureRefs: string[];
  durationMs: number;
}

export type WorkbenchPanelType =
  | "table" | "chart" | "timeline" | "markdown" | "diff"
  | "map" | "tree" | "grid" | "dashboard" | "scorecard" | "diagram";

export interface WorkbenchResultPanelConfig {
  id: string;
  title: string;
  sourceModule: string;
  panelType: WorkbenchPanelType;
}

export interface WorkbenchArtifactConfig {
  id: string;
  artifactType: FunctionalAgentArtifactType;
  title: string;
  mimeType: "text/markdown" | "application/json";
}

export interface FunctionalAgentWorkbenchConfig {
  slug: string;
  name: string;
  category: string;
  templateFamily: string;
  primaryWorkflowObject: string;
  coreJobToBeDone: string;
  tools: WorkbenchToolConfig[];
  actions: WorkbenchActionConfig[];
  approvalRules: WorkbenchApprovalRule[];
  mockSteps: WorkbenchMockStep[];
  workspaceModules: string[];
  resultPanels: WorkbenchResultPanelConfig[];
  artifactTemplates: WorkbenchArtifactConfig[];
  requiredInputs: string[];
  demoDataNeeded: string[];
  integrationTargets: string[];
  approvalGatedActions: string[];
  nonScopeLimits: string[];
  evalCaseIds: string[];
}
