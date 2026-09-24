// ── Ethen Cortex type definitions ──────────────────────────────────────────
// V1 scope: branded route profiles, deterministic routing, route receipts.
// These types are the source of truth for Cortex across the codebase.
// They extend the existing gateway/provider layer without replacing it.

// ── Core identifiers ──────────────────────────────────────────────────────

export type EthenMode =
  | "cortex-lite"
  | "cortex"
  | "cortex-pro"
  | "ultra-preview"
  | "code"
  | "research"
  | "writer"
  | "operator"
  | "auto";

export type EthenIntent =
  | "general.chat"
  | "general.reasoning"
  | "planning.product"
  | "planning.technical"
  | "coding.inspect"
  | "coding.implement"
  | "coding.debug"
  | "coding.review"
  | "research.web"
  | "research.competitor"
  | "research.technical"
  | "writing.draft"
  | "writing.rewrite"
  | "writing.edit"
  | "automation.plan"
  | "automation.execute"
  | "data.analyze"
  | "ops.workflow"
  | "browser.web"
  | "browser.automation"
  | "design.ui"
  | "design.brand"
  | "media.image"
  | "media.video"
  | "media.audio"
  | "business.startup"
  | "business.strategy"
  | "infrastructure.compute"
  | "infrastructure.deploy"
  | "unknown";

export type RouteClass =
  | "single_model"
  | "multi_model"
  | "tool_augmented"
  | "verified"
  | "agent_workflow";

export type ToolClass =
  | "search"
  | "retrieval"
  | "repo"
  | "browser"
  | "computer_use"
  | "file"
  | "api"
  | "connector"
  | "terminal"
  | "calendar"
  | "email"
  | "slack"
  | "github"
  | "drive";

export type RouteReasonCode =
  | "selected_by_user_mode"
  | "selected_by_intent"
  | "lowest_cost_candidate"
  | "lowest_latency_candidate"
  | "highest_quality_candidate"
  | "requires_tool_support"
  | "requires_long_context"
  | "requires_json_mode"
  | "requires_source_grounding"
  | "requires_repo_context"
  | "provider_preferred_by_workspace"
  | "provider_blocked_by_policy"
  | "provider_unavailable"
  | "fallback_after_error"
  | "fallback_after_rate_limit"
  | "fallback_after_timeout"
  | "degraded_due_to_budget"
  | "verifier_enabled_by_policy"
  | "verifier_skipped_by_budget";

// ── Route profile ─────────────────────────────────────────────────────────

export type QualityTier = "starter" | "balanced" | "premium" | "max";
export type CostTier = "low" | "medium" | "high" | "variable";
/** Coarse, repo-grounded sense of how much context a candidate model can hold, used only when an exact contextWindowTokens figure is not available. */
export type ContextTier = "short" | "standard" | "long" | "unknown";
/**
 * Truthful status of a cost figure: "estimated" means a real estimate was
 * computed from observed usage; "unknown" means a candidate/route was
 * selected but exact pricing isn't tracked (tier-only); "not_available"
 * means no provider/usage was selected at all, so there is nothing to cost.
 */
export type CostEstimateStatus = "estimated" | "unknown" | "not_available";
export type LatencyTarget = "fast" | "balanced" | "patient";
export type ToolPolicy = "none" | "optional" | "preferred" | "required";
export type VerifierPolicy = "off" | "optional" | "default" | "strict";
export type TraceVisibility = "basic" | "advanced" | "full";

export type ModelCandidatePolicy = {
  preferByok: boolean;
  allowedKinds: string[];
  maxCandidates: number;
};

export type FallbackPolicy = {
  enabled: boolean;
  maxAttempts: number;
  perAttemptTimeoutMs?: number;
  retryableStatusCodes?: number[];
  sameProviderRetries?: number;
  crossProviderFallbacks?: number;
  allowQualityDowngrade: boolean;
  allowCostUpgrade: boolean;
  allowToolDowngrade: boolean;
  degradedModeAllowed: boolean;
};

export type CortexRouteProfileStatus = "active" | "not_implemented";

export interface CortexRouteProfile {
  id: string;
  mode: EthenMode;
  label: string;
  shortLabel: string;
  description: string;
  defaultIntent?: EthenIntent;
  qualityTier: QualityTier;
  costTier: CostTier;
  latencyTarget: LatencyTarget;
  toolPolicy: ToolPolicy;
  verifierPolicy: VerifierPolicy;
  fallbackPolicy: FallbackPolicy;
  traceVisibility: TraceVisibility;
  status: CortexRouteProfileStatus;
  providerLabels?: Record<string, string>;
  /** When true the route is only a forward-looking stub not wired into the gateway. */
  notImplemented?: boolean;
}

// ── Provider & candidate ──────────────────────────────────────────────────

export type ProviderKind =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "openai-compatible"
  | "local"
  | "custom";

export interface ModelCandidate {
  id: string;
  providerId: string;
  providerKind: ProviderKind;
  modelId: string;
  visibleName: string;
  qualityTier: QualityTier;
  costPerInputTokenUsd?: number;
  costPerOutputTokenUsd?: number;
  /** Coarse cost tier used by the router when exact per-token cost is not configured. Never implies a free/zero cost. */
  costTier?: CostTier;
  contextWindowTokens?: number;
  /** Coarse context tier used when exact contextWindowTokens is not configured. */
  contextTier?: ContextTier;
  maxOutputTokens?: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  supportsStreaming: boolean;
  latencyClass: "fast" | "balanced" | "slow" | "unknown";
  reliabilityScore?: number;
  qualityScore?: number;
  enabled: boolean;
  /** Canonical MI facts. Null preserves an unknown source fact; booleans above are executable Gateway adapter facts. */
  canonical?: {
    modelId: string;
    providerId: string;
    contextWindowTokens: number | null;
    maxOutputTokens: number | null;
    supportsTools: boolean | null;
    supportsVision: boolean | null;
    supportsStructuredOutput: boolean | null;
  };
}

// ── Fallback / attempt tracking ───────────────────────────────────────────

export interface CortexFallbackAttempt {
  attemptNumber: number;
  providerId: string;
  timestamp: string;
  succeeded: boolean;
  errorReason?: string;
  errorCode?: string;
}

export type FallbackFinalStatus =
  | "primary_success"
  | "fallback_success"
  | "degraded_success"
  | "failed";

// ── Selection metadata ────────────────────────────────────────────────────

export interface CortexSelectionMetadata {
  reasonCodes: RouteReasonCode[];
  candidateCount: number;
  selectedCandidateRank: number;
  score?: number;
}

// ── Intent classification ─────────────────────────────────────────────────

export interface IntentClassifierInput {
  message: string;
  attachments?: AttachmentSummary[];
  selectedMode: EthenMode | "auto";
  projectContext?: ProjectContextSummary;
  conversationState?: ConversationStateSummary;
  userPreferences?: UserRoutePreferences;
}

export interface AttachmentSummary {
  type: string;
  path?: string;
  name?: string;
  size?: number;
}

export interface ProjectContextSummary {
  projectId: string;
  title: string;
  goals: string[];
  activeArtifacts?: unknown[];
  connectedSources?: unknown[];
  recentRuns?: unknown[];
  pinnedFacts?: string[];
  constraints?: string[];
}

export interface ConversationStateSummary {
  turnCount: number;
  lastMode?: EthenMode;
  lastIntent?: EthenIntent;
  topicClusters?: string[];
}

export interface UserRoutePreferences {
  preferredMode?: EthenMode;
  maxCostTier?: CostTier;
  byokEnabled?: boolean;
}

export interface IntentClassification {
  primaryIntent: EthenIntent;
  secondaryIntents: EthenIntent[];
  confidence: number;
  reasonCodes: IntentReasonCode[];
  requiresFreshness: boolean;
  requiresTools: boolean;
  requiresRepoContext: boolean;
  requiresVerifier: boolean;
  riskLevel: "low" | "medium" | "high";
}

export type IntentReasonCode =
  | "mode_override"
  | "keyword_match"
  | "attachment_signal"
  | "conversation_context"
  | "default_fallback";

// ── Route receipt (blueprint §6.2) ────────────────────────────────────────

export type VerifierType =
  | "instruction_following"
  | "source"
  | "citation"
  | "code"
  | "writing"
  | "policy_risk";

export type VerifierStatus = "passed" | "warned" | "failed" | "skipped" | "pending";

export type ConfidenceLevel = "low" | "medium" | "high" | "unknown";

export type ReceiptSource = "mock" | "production" | "degraded" | "error" | "unknown";

export interface EthenRouteReceipt {
  receiptVersion: "ethen.route_receipt.v1";
  requestId: string;
  runId: string;
  conversationId?: string;
  projectId?: string;
  timestamp: string;

  source?: ReceiptSource;
  mode: EthenMode;
  intent: EthenIntent;
  routeProfile: string;
  routeClass: RouteClass;

  provider: {
    selectedProvider: string;
    selectedModel?: string;
    providerVisible: boolean;
    modelVisible: boolean;
    isByok: boolean;
    regionClass?: "default" | "us" | "eu" | "local" | "custom" | "redacted";
  };

  selection: {
    reasonCodes: RouteReasonCode[];
    candidateCount: number;
    selectedCandidateRank: number;
    score?: number;
  };

  fallback: {
    attempted: boolean;
    used: boolean;
    attempts: CortexFallbackAttempt[];
    finalStatus: FallbackFinalStatus;
  };

  tools: {
    used?: boolean;
    classes?: ToolClass[];
    invocationCount?: number;
    redactedResults?: boolean;
  };

  verifier: {
    used: boolean;
    verifierType?: VerifierType;
    score?: number;
    status?: VerifierStatus;
    warnings?: string[];
  };

  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    /** Only set when costEstimateStatus is "estimated" — never a guessed figure. */
    estimatedCostUsd?: number;
    costEstimateStatus: CostEstimateStatus;
    /** Human-readable reason when costEstimateStatus is not "estimated". */
    costEstimateReason?: string;
    latencyMs?: number;
    timeToFirstTokenMs?: number;
  };

  quality: {
    confidence: ConfidenceLevel;
    sourceGrounded?: boolean;
    citationChecked?: boolean;
    instructionFollowed?: boolean;
  };

  redactions: Array<{
    field: string;
    reason: "privacy" | "security" | "provider_policy" | "proprietary_router_logic";
  }>;
}

// ── Trace / observability ─────────────────────────────────────────────────

export type CortexSpanType =
  | "classification"
  | "routing"
  | "provider_call"
  | "tool_call"
  | "agent_step"
  | "verification"
  | "synthesis"
  | "artifact_write";

export type CortexSpanStatus =
  | "pending"
  | "running"
  | "success"
  | "warning"
  | "failed"
  | "skipped";

export interface CortexSpan {
  spanId: string;
  parentSpanId?: string;
  type: CortexSpanType;
  label: string;
  startedAt: string;
  endedAt?: string;
  status: CortexSpanStatus;
  metadata: Record<string, unknown>;
  usage?: Record<string, unknown>;
}

export type CortexRunStatus = CortexSpanStatus;

export interface CortexTrace {
  traceId: string;
  runId: string;
  requestId: string;
  routeReceiptId: string;
  startedAt: string;
  endedAt?: string;
  status: CortexRunStatus;
  spans: CortexSpan[];
  errors: CortexTraceError[];
}

export interface CortexTraceError {
  code: string;
  message: string;
  spanId?: string;
  timestamp: string;
}

// ── Route state lifecycle (blueprint §5.5) ────────────────────────────────

export type CortexRouteState =
  | "idle"
  | "classifying"
  | "routing"
  | "queued"
  | "running"
  | "tooling"
  | "verifying"
  | "fallback"
  | "degraded"
  | "completed"
  | "failed"
  | "needs_approval";
