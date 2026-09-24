// ── Ethen Gateway — GW-R6 — Smart Routing (public surface) ──────────────
// The intelligent model execution layer: smart aliases, requirements
// extraction, capability-safe filtering, explainable scoring, live
// telemetry, routing receipts, and canary routing.

export {
  SMART_ALIAS_IDS,
  isSmartAlias,
  LONG_CONTEXT_MIN_TOKENS,
  CODING_CONTEXT_MIN_TOKENS,
} from "./types";
export type {
  SmartAliasId,
  SmartRoutingRequirements,
  SmartRoutingCandidate,
  RejectedCandidate,
  GatewayOutcomeEvent,
  GatewayOutcomeErrorClass,
  TelemetryStats,
  CanaryTarget,
  CanaryGateResult,
  ScoredCandidate,
  SmartRoutingDecision,
  SmartRoutingReceipt,
} from "./types";

export {
  ROUTING_POLICY_VERSION,
  ROUTING_WEIGHT_PROFILES,
  SMART_ALIASES,
  getSmartAlias,
  mergeAliasGates,
} from "./aliases";
export type { RoutingWeights, SmartAliasDefinition } from "./aliases";

export {
  extractSmartRoutingRequirements,
  normalizeProviderRestrictions,
} from "./requirements";
export type {
  RawChatCompletionsBody,
  RawChatMessage,
  RawChatPart,
  RawToolSpec,
} from "./requirements";

export {
  filterCandidates,
  estimatedRequestCostUsd,
} from "./capability-filter";
export type { CapabilityFilterContext, CapabilityFilterResult } from "./capability-filter";

export {
  scoreCandidates,
  deriveReliabilitySignal,
} from "./scorer";
export type { ScoreCandidatesInput, ScoreCandidatesResult, ReliabilitySignal } from "./scorer";

export {
  getModelIntelligenceEnrichment,
  buildSmartCandidates,
  parseContextWindowTokens,
} from "./model-intelligence";
export type { ModelIntelligenceEnrichment } from "./model-intelligence";

export {
  recordGatewayTelemetry,
  getTelemetryStats,
  getTelemetrySnapshot,
  resetGatewayTelemetry,
  seedGatewayTelemetry,
} from "./telemetry";

export {
  canaryBucket,
  setCanaryConfig,
  getCanaryConfig,
  resetCanaryConfig,
  applyCanaryGate,
  CANARY_ROLLOUT_STEPS,
} from "./canary";

export { buildSmartRoutingReceipt } from "./receipts";

export { resolveSmartRoute, resetSmartRouteAllowlistCache } from "./router";
export type { ResolveSmartRouteInput, ResolveSmartRouteResult } from "./router";
