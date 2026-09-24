export type {
  MediaMode,
  MediaModality,
  MediaCapability,
  MediaApp,
  MediaAppCategory,
  MediaAppArchetype,
  MediaAppTrustState,
  MediaAppRiskLevel,
  MediaAppFlag,
  MediaAppSectionId,
  MediaAppLifecycleState,
  MediaStudioTabId,
  MediaModel,
  GenerationButtonState,
  MediaJob,
  MediaJobState,
  MediaJobStatus,
  MediaJobResult,
  MediaJobResultMetadata,
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaGenerationConfig,
  MediaParams,
  ImageParams,
  VideoParams,
  AudioParams,
  CanvasParams,
  MarketingParams,
  ProductParams,
  InfluencerParams,
  MotionParams,
  ProviderError,
  ProviderErrorCode,
  MediaProviderStatus,
  MediaAsset,
  MediaProject,
  MediaProjectKind,
  MediaProjectStatus,
  MediaSafetyCategory,
  MediaSafetyGateOutcome,
  MediaSafetyGateResult,
  MediaWorkflowId,
  MediaSafetyAuditTrace,
  MediaJobSafetyMeta,
  GenerateResponse,
  JobResponse,
  JobListResponse,
  AssetsResponse,
  ProjectsResponse,
  ProviderStatusResponse,
} from "./types";

export {
  TERMINAL_MEDIA_JOB_STATUSES,
  ACTIVE_MEDIA_JOB_STATUSES,
  CANCELABLE_MEDIA_JOB_STATUSES,
  RETRYABLE_MEDIA_JOB_STATUSES,
  GATE_OUTCOME_LABELS,
  MEDIA_SAFETY_CATEGORY_LABELS,
} from "./types";

export {
  MEDIA_APPS,
  MEDIA_APP_CATEGORY_ORDER,
  MEDIA_APP_CATEGORY_LABELS,
  MEDIA_APP_TRUST_LABELS,
  MEDIA_APP_SECTION_ORDER,
  MEDIA_APP_SECTION_LABELS,
  getMediaAppById,
  getFeaturedMediaApps,
  getMediaAppsByCategory,
  getMediaAppsBySection,
  searchMediaApps,
  filterMediaApps,
} from "./apps";

export {
  MEDIA_MODELS,
  getModelsForMode,
  getModelsByModality,
  getModelsForModality,
  getDefaultModel,
  getModelById,
  getDefaultCapability,
  VIDEO_CAPABILITIES,
  AUDIO_CAPABILITIES,
} from "./models";

export {
  createJob,
  getJob,
  setJobStatus,
  setJobProgress,
  setJobResult,
  advanceJob,
  failJob,
  cancelJob,
  retryJob,
  expireJob,
  expireOldJobs,
  listJobs,
  listJobsByModality,
  listJobsByStatus,
  getJobCount,
  resetMediaStore,
  listAssets,
  createProject,
  listProjects,
  clearStores,
} from "./jobs";

export {
  ACTION_ESTIMATES,
  CREDIT_ESTIMATES,
  getActionEstimate,
  getModeEstimate,
  formatCreditEstimate,
  isSetupRequiredEstimate,
  getModeDimensionEstimate,
  getRequestDimensionEstimate,
} from "./pricing";
export type { PricingEstimate, CreditEstimateResult } from "./pricing";

export {
  EVAL_SCORE_DEFINITIONS,
  getApplicableScores,
  generateMockScores,
  generateMockEvalMetadata,
  formatScore,
  scoreToPercent,
  scoreTone,
} from "./evaluation";
export type { EvalScoreDefinition } from "./evaluation";

export {
  MEDIA_STUDIO_READINESS,
  getReadinessSummary,
  getReadinessByState,
} from "./status";
export type { ReadinessState, ReadinessEntry } from "./status";

export { MEDIA_TOOL_CONTRACTS } from "./contracts";
export type { MediaOutputType, MediaToolContract } from "./contracts";

export {
  seedMockAssets,
  getAssets,
  getAssetById,
  getAssetsByProject,
  addAsset,
  toggleFavorite,
  saveJobResultAsAsset,
  clearAssets,
  ASSET_STORE_DURABILITY,
  assetBelongsToSession,
} from "./assets";
export type { MediaAssetKind, MediaAssetSource } from "./assets";

export {
  MEDIA_STUDIO_TRUST_LABELS,
  MEDIA_STUDIO_RISK_LABELS,
  deriveMediaTrustState,
  deriveMediaRiskLevels,
  buildMediaLibraryCollections,
  buildMediaProjectCollections,
  getDisabledActionReason,
} from "./studio";
export type {
  MediaStudioTrustState,
  MediaStudioRiskLevel,
  MediaLibraryCollection,
  MediaProjectCollection,
} from "./studio";

export {
  MEDIA_STUDIO_NAV_ITEMS,
  MEDIA_STUDIO_PLACEHOLDER_TABS,
  PLACEHOLDER_TAB_CONTENT,
  STUDIO_TAB_TO_SECTION,
  STUDIO_TAB_TO_CATEGORY,
  getAppsForStudioTab,
  getFeaturedAppIds,
  getAppById,
  evaluateAppById,
  getAppsByGateState,
  getRiskyAppIds,
  getBlockedAppIds,
  getConsentRequiredAppIds,
  getApprovalRequiredAppIds,
} from "./app-registry";
export type {
  MediaStudioNavItem,
} from "./app-registry";

export {
  MEDIA_STUDIO_CHAT_ACTION_LABELS,
  MEDIA_STUDIO_CHAT_ACTION_PREFILLS,
} from "./app-types";
export type {
  MediaStudioChatActionId,
  MediaStudioChatContext,
} from "./app-types";

// NOTE: getMediaProviderStatus (./provider-status) and the provider runtime
// adapters (./providers/index, ./providers/openai, ./providers/cortex) are
// server-only (they transitively import "server-only" / next/headers via
// lib/usage/server -> lib/supabase/server). This barrel is imported by
// client components (e.g. MediaWorkspace.tsx via lib/workspaces/registry.tsx),
// so they must NOT be re-exported here. Server code should import them
// directly from "./provider-status" / "@/lib/media/providers/index".

export {
  classifyMediaSafety,
  mergeGateOutcomes,
  isGateBlocking,
  isConsentRequired,
  getGateSummary,
  runSafetyPreflight,
  evaluateAppSafety,
  canExecuteApp,
  evaluateAppGate,
  isAppExecutable,
  APP_SAFETY_GATE_LABELS,
  APP_SAFETY_GATE_DESCRIPTIONS,
} from "./safety/index";
export type {
  SafetyClassifierInput,
  PreflightInput,
  PreflightResult,
  AppSafetyGateState,
  AppSafetyGateResult,
} from "./safety/index";

export {
  buildMediaAuditTrace,
  stampJobSafetyMeta,
  auditJobSafetyGate,
  auditJobConsent,
  auditJobExecution,
} from "./audit";

// ── Usage / credits ──────────────────────────────────────────────────────

export {
  DIMENSION_COST_REGISTRY,
  estimateCreditsForMode,
  estimateCreditsForRequest,
  buildMediaUsageEvent,
  PRICING_DIMENSION_LABELS,
  STORAGE_STATUS_NON_DURABLE,
  STORAGE_STATUS_BROWSER_LOCAL,
  STORAGE_STATUS_SUPABASE,
  STORAGE_STATUS_NOT_PROVIDED,
} from "./usage";
export type {
  PricingDimension,
  DimensionCostEntry,
  CreditEstimateStatus,
  CreditEstimateDimensionBreakdown,
  MediaUsageEvent,
  MediaUsageEventType,
  StorageDurability,
  StorageStatus,
} from "./usage";

// ── Persistence / ownership ──────────────────────────────────────────────
// recordMediaUsage / recordFailedJobUsage are server-only (see ./usage-recording)
// and intentionally not re-exported from this client-safe barrel.

export {
  MEDIA_JOB_STORE_DURABILITY,
  MEDIA_ASSET_STORE_DURABILITY,
} from "./jobs";

export {
  PROJECT_STORE_DURABILITY,
  projectBelongsToSession,
} from "./projects";

// ── Creative profiles ────────────────────────────────────────────────────

export type { CreativeProfileType } from "./profiles";

// ── Showcase (R2 homepage manifest — client-safe, data/types only) ───────

export {
  getStudioShowcaseBaseUrl,
  getShowcaseAssetUrl,
  STUDIO_SHOWCASE_ASSETS,
  getShowcaseAssetsBySection,
  getShowcaseAssetById,
  STUDIO_SHOWCASE_SECTIONS,
  getStudioShowcaseSections,
} from "./showcase";
export type {
  StudioShowcaseAssetType,
  StudioShowcaseSection,
  StudioShowcaseAspectRatio,
  StudioShowcaseStatus,
  StudioShowcaseAsset,
  StudioShowcasePageSectionId,
  StudioShowcaseSectionDefinition,
} from "./showcase";
