// Barrel exports for all workbench layers.
// Order matters: seed → normalization → config → registry.

export {
  type WorkbenchRequirement,
  type TemplateFamily,
  WORKBENCH_REQUIREMENTS,
  getWorkbenchRequirement,
  listWorkbenchRequirements,
} from "./workbench-requirements";

export {
  hasWorkbenchRequirement,
  deriveWorkbenchActionId,
  deriveToolId,
  isApprovalGatedAction,
  normalizeWorkbenchActionLabels,
  normalizeCoreTools,
} from "./normalization";

export {
  type WorkbenchToolConfig,
  type WorkbenchActionConfig,
  type WorkbenchApprovalRule,
  type WorkbenchMockStep,
  type WorkbenchResultPanelConfig,
  type WorkbenchArtifactConfig,
  type FunctionalAgentWorkbenchConfig,
  type WorkbenchPanelType,
} from "./config-types";

export {
  buildWorkbenchToolConfigs,
  buildWorkbenchActionConfigs,
  buildWorkbenchApprovalRules,
  buildWorkbenchMockSteps,
  buildWorkbenchResultPanels,
  buildWorkbenchArtifactTemplates,
  buildWorkbenchConfig,
  buildAllWorkbenchConfigs,
} from "./config-derivation";

export {
  WORKBENCH_CONFIGS,
  listWorkbenchConfigs,
  getWorkbenchConfig,
  hasWorkbenchConfig,
  listWorkbenchConfigsByCategory,
  listWorkbenchConfigsByTemplateFamily,
  getWorkbenchAction,
  listWorkbenchActions,
} from "./registry";

export {
  createInitialWorkbenchRunState,
  loadDemoWorkbenchObject,
  runWorkbenchAction,
  approveWorkbenchAction,
  rejectWorkbenchAction,
  type WorkbenchRunTraceEvent,
  type WorkbenchGeneratedResult,
  type WorkbenchGeneratedArtifact,
  type WorkbenchPendingApproval,
  type WorkbenchRunState,
} from "./mock-runner";
