export {
  type CortexRouteProfile,
  type CortexFallbackAttempt,
  type CortexSelectionMetadata,
  type FallbackFinalStatus,
  type EthenMode,
  type EthenIntent,
  type RouteClass,
  type ToolClass,
  type RouteReasonCode,
  type QualityTier,
  type CostTier,
  type LatencyTarget,
  type ToolPolicy,
  type VerifierPolicy,
  type TraceVisibility,
  type FallbackPolicy,
  type ModelCandidate,
  type ProviderKind,
  type IntentClassifierInput,
  type IntentClassification,
  type AttachmentSummary,
  type ProjectContextSummary,
  type ConversationStateSummary,
  type UserRoutePreferences,
  type EthenRouteReceipt,
  type VerifierType,
  type VerifierStatus,
  type ConfidenceLevel,
  type CortexTrace,
  type CortexSpan,
  type CortexSpanType,
  type CortexSpanStatus,
  type CortexRunStatus,
  type CortexTraceError,
  type CortexRouteState,
  type CortexRouteProfileStatus,
} from "./types";

export {
  getAllCortexRouteProfiles,
  getCortexRouteProfile,
  getCortexProfileForGatewayRoute,
} from "./routes";

export type {
  CortexResearchSource,
  CortexResearchEvidence,
  CortexResearchInput,
  CortexResearchReceipt,
} from "./research";

export {
  getResearchRouteProfile,
  buildResearchCortexReceipt,
} from "./research";

export {
  classifyIntent,
  getDefaultModeForIntent,
} from "./intent-classifier";

export {
  selectCandidates,
  getRouterWeightsForRoute,
  type RouterWeights,
  type RouterOptions,
  type RouterResult,
  type RejectedCandidate,
  ROUTER_WEIGHTS,
} from "./model-router";

export {
  buildCortexRouteReceipt,
  redactCortexRouteReceipt,
  summarizeCortexRouteReceipt,
  mergeGatewayMetadataIntoReceipt,
} from "./route-receipt";
export type {
  BuildReceiptParams,
  ReceiptVisibility,
} from "./route-receipt";

export {
  runCortexChat,
} from "./run-cortex-chat";
export type {
  RunCortexChatParams,
  RunCortexChatResult,
} from "./run-cortex-chat";

export type {
  VerifierInput,
  VerifierConstraints,
  VerifierOutput,
  VerifierFinding,
} from "./verifier";

export {
  verifyCortexOutput,
} from "./verifier";

export {
  resolveIntentWorkspaceRoute,
  resolveIntentWorkspaceRoutes,
  staysInCortex,
} from "./intent-workspace-router";
export type {
  IntentWorkspaceRoute,
  IntentWorkspaceRoutingResult,
} from "./intent-workspace-router";

// Note: server-only persistence (./persistence) and trace span building
// (./trace-spans) are intentionally NOT re-exported here. This barrel file
// is imported by client components (e.g. components/cortex/CortexLandingPage.tsx),
// and persistence.ts uses the "server-only" guard plus next/headers cookies —
// bundling it into client code would break the build. Import those modules
// directly: "./persistence" and "./trace-spans".
