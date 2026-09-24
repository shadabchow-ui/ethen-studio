import type {
  ConfidenceLevel,
  CortexFallbackAttempt,
  CortexRouteProfile,
  EthenIntent,
  EthenMode,
  EthenRouteReceipt,
  FallbackFinalStatus,
  IntentClassification,
  ReceiptSource,
  RouteClass,
  RouteReasonCode,
  ToolClass,
  VerifierType,
} from "./types";
import type { RouterResult } from "./model-router";
import { verifyCortexOutput } from "./verifier";
import type { VerifierOutput } from "./verifier";
import type { GatewayResult, GatewayUsageMetadata } from "@ethen/models/gateway/types";

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveRouteClass(
  classification: IntentClassification,
  profile: CortexRouteProfile | null,
  toolsExecuted: boolean
): RouteClass {
  // routeClass must reflect what actually happened, not policy intent.
  // A profile having toolPolicy "required" only means tools *should* run;
  // it does not mean a tool call actually executed for this turn.
  if (toolsExecuted) {
    return "tool_augmented";
  }
  if (classification.requiresVerifier || classification.riskLevel === "high") {
    return "verified";
  }
  return "single_model";
}

function resolveReceiptSource(
  gatewaySource: "mock-mode" | "env-default" | "auto-detected",
  fallbackUsed: boolean
): ReceiptSource {
  if (gatewaySource === "mock-mode") return "mock";
  if (fallbackUsed) return "degraded";
  return "production";
}

function resolveFallbackFinalStatus(
  attempts: CortexFallbackAttempt[] | undefined,
  fallbackUsed: boolean | undefined
): FallbackFinalStatus {
  if (!attempts || attempts.length === 0) {
    return fallbackUsed ? "failed" : "primary_success";
  }
  const last = attempts[attempts.length - 1];
  if (last.succeeded) {
    const firstFailed = attempts.some((a) => !a.succeeded);
    return firstFailed ? "fallback_success" : "primary_success";
  }
  return "failed";
}

function resolveConfidence(
  classification: IntentClassification,
  _profile: CortexRouteProfile | null
): ConfidenceLevel {
  const c = classification.confidence;
  if (c >= 0.85) return "high";
  if (c >= 0.6) return "medium";
  if (c >= 0.3) return "low";
  return "unknown";
}

export interface BuildReceiptParams {
  classification: IntentClassification;
  cortexProfile: CortexRouteProfile | null;
  gatewayResult: GatewayResult;
  observedTimeToFirstTokenMs?: number;
  sessionId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
  routerResult?: {
    selected: { id: string; providerId: string; modelId: string; visibleName: string } | null;
    fallbacks: Array<{ id: string; providerId: string; modelId: string }>;
    rejected: Array<{ candidate: { id: string; providerId: string }; reason: RouteReasonCode }>;
    selectedRank: number;
    score: number;
    reasonCodes: RouteReasonCode[];
    warnings: string[];
  } | null;
  verifierResult?: VerifierOutput | null;
  verifierSkippedNote?: string;
  /**
   * Set when verification is deferred until streamed output is available
   * (e.g. mid-stream receipt creation), as opposed to a definitive skip.
   * Produces verifier.status "pending" instead of "skipped" so the UI/trace
   * does not claim verification was decided when it was only deferred.
   */
  verifierPendingNote?: string;
  /**
   * Real evidence that a tool actually executed for this turn (e.g. a
   * research search call completed). Must come from actual execution
   * results, never from policy/intent alone — toolPolicy "required" only
   * means a tool *should* run, not that it did.
   */
  toolsExecuted?: {
    used: boolean;
    classes?: ToolClass[];
    invocationCount?: number;
    redactedResults?: boolean;
  };
  /**
   * Truth-based source/citation status derived directly from an executed
   * research tool result (not from policy/intent). Takes precedence over
   * verifier-inferred grounding since it reflects the actual evidence
   * gathered for this turn.
   */
  researchTool?: {
    sourceGrounded: boolean;
    citationsAvailable: boolean;
  };
}

function resolveCostEstimate(
  creditCost: number | null | undefined,
  selectedProvider: string | undefined
): {
  estimatedCostUsd?: number;
  costEstimateStatus: import("./types").CostEstimateStatus;
  costEstimateReason?: string;
} {
  if (creditCost != null) {
    return { estimatedCostUsd: creditCost, costEstimateStatus: "estimated" };
  }
  if (!selectedProvider) {
    return {
      costEstimateStatus: "not_available",
      costEstimateReason: "No provider was selected for this route.",
    };
  }
  return {
    costEstimateStatus: "unknown",
    costEstimateReason: "Exact cost was not computed for this provider/model; only a cost tier is known.",
  };
}

function inferSourceGrounded(verifierResult?: VerifierOutput | null): boolean | undefined {
  if (!verifierResult) return undefined;
  if (verifierResult.findings.some((finding) => finding.type === "source_grounded")) {
    return true;
  }
  if (verifierResult.findings.some((finding) => finding.type === "missing_sources")) {
    return false;
  }
  return undefined;
}

function inferCitationChecked(verifierResult?: VerifierOutput | null): boolean | undefined {
  if (!verifierResult) return undefined;
  if (
    verifierResult.findings.some(
      (finding) => finding.type === "citations_available" || finding.type === "missing_citations"
    )
  ) {
    return true;
  }
  return undefined;
}

export function buildCortexRouteReceipt(params: BuildReceiptParams): EthenRouteReceipt {
  const { classification, cortexProfile, gatewayResult, routerResult, verifierResult } = params;
  const { route, usage } = gatewayResult;

  const now = new Date().toISOString();
  const requestId = generateId("req");
  const runId = generateId("run");
  const toolsExecuted = params.toolsExecuted;
  const routeClass = resolveRouteClass(classification, cortexProfile, toolsExecuted?.used ?? false);
  const fallbackUsed = route.fallbackUsed ?? false;
  const attempts = route.attempts ?? [];
  const fallbackAttempted = route.attemptCount ? route.attemptCount > 1 : fallbackUsed;
  const fallbackAttempts: CortexFallbackAttempt[] = attempts.length > 0
    ? attempts
    : (fallbackUsed
      ? [{ attemptNumber: 1, providerId: "unknown", timestamp: now, succeeded: false, errorReason: route.fallbackReason }]
      : [{ attemptNumber: 1, providerId: route.providerId, timestamp: now, succeeded: true }]);

  const gatewaySelectionReasonCodes = route.cortexSelection?.reasonCodes ?? ["selected_by_intent"];
  const gatewayCandidateCount = route.cortexSelection?.candidateCount ?? 1;
  const gatewaySelectedRank = route.cortexSelection?.selectedCandidateRank ?? 1;
  const gatewayScore = route.cortexSelection?.score;

  const routerSelectionReasonCodes = routerResult?.reasonCodes ?? [];
  const routerCandidateCount = routerResult ? (routerResult.fallbacks.length + (routerResult.selected ? 1 : 0) + routerResult.rejected.length) : 0;
  const routerSelectedRank = routerResult?.selectedRank ?? 0;
  const routerScore = routerResult?.score;

  const selectionReasonCodes: RouteReasonCode[] =
    gatewaySelectionReasonCodes.length > 1 || routerResult === null || routerResult === undefined
      ? gatewaySelectionReasonCodes
      : [...new Set([...routerSelectionReasonCodes, ...gatewaySelectionReasonCodes])];

  const candidateCount = routerResult
    ? (routerCandidateCount > 0 ? routerCandidateCount : gatewayCandidateCount)
    : gatewayCandidateCount;

  const selectedCandidateRank = routerResult?.selected
    ? routerSelectedRank
    : gatewaySelectedRank;

  const selectionScore = routerScore != null && routerScore > 0 ? routerScore : gatewayScore;

  const effectiveMode: EthenMode = cortexProfile?.mode ?? "auto";
  const verifierRecommended = classification.requiresVerifier;

  const verifierUsed = verifierResult != null && verifierResult.status !== "skipped";
  const verifierStatus =
    verifierResult?.status ?? (params.verifierPendingNote ? "pending" : "skipped");
  const verifierType: VerifierType | undefined =
    verifierResult?.verifierType ?? (verifierRecommended ? "instruction_following" : undefined);
  const verifierScore = verifierResult?.score;
  const verifierWarnings = verifierResult?.warnings
    ?? (params.verifierPendingNote
      ? [params.verifierPendingNote]
      : params.verifierSkippedNote
        ? [params.verifierSkippedNote]
        : verifierUsed
          ? undefined
          : ["Verifier skipped: output not available for verification."]);

  return {
    receiptVersion: "ethen.route_receipt.v1",
    requestId,
    runId,
    timestamp: now,
    conversationId: params.conversationId ?? params.sessionId ?? undefined,
    projectId: params.projectId ?? undefined,

    source: resolveReceiptSource(route.source, fallbackUsed),
    mode: effectiveMode,
    intent: classification.primaryIntent,
    routeProfile: cortexProfile?.id ?? "unknown",
    routeClass,

    provider: {
      selectedProvider: route.selectedProvider ?? route.providerId,
      // Always reflect the model that actually executed (route.selectedModelAlias),
      // never the router's planned pick — those can diverge on fallback/unavailability.
      selectedModel: route.selectedModelAlias ?? routerResult?.selected?.visibleName ?? undefined,
      providerVisible: effectiveMode !== "auto",
      modelVisible: routerResult?.selected != null,
      isByok: false,
      regionClass: "default",
    },

    selection: {
      reasonCodes: selectionReasonCodes,
      candidateCount,
      selectedCandidateRank,
      score: selectionScore,
    },

    fallback: {
      attempted: fallbackAttempted,
      used: fallbackUsed,
      attempts: fallbackAttempts,
      finalStatus: resolveFallbackFinalStatus(attempts, fallbackUsed),
    },

    tools: {
      used: toolsExecuted?.used ?? false,
      classes: toolsExecuted?.classes,
      invocationCount: toolsExecuted?.invocationCount,
      redactedResults: toolsExecuted?.redactedResults,
    },

    verifier: {
      used: verifierUsed,
      verifierType,
      score: verifierScore,
      status: verifierStatus,
      warnings: verifierWarnings,
    },

    usage: {
      inputTokens: usage.inputTokens ?? undefined,
      outputTokens: usage.outputTokens ?? undefined,
      totalTokens:
        usage.inputTokens != null && usage.outputTokens != null
          ? usage.inputTokens + usage.outputTokens
          : undefined,
      ...resolveCostEstimate(usage.creditCost, route.selectedProvider ?? route.providerId),
      timeToFirstTokenMs: params.observedTimeToFirstTokenMs,
    },

    quality: {
      confidence: resolveConfidence(classification, cortexProfile),
      sourceGrounded: params.researchTool?.sourceGrounded ?? inferSourceGrounded(verifierResult),
      citationChecked: params.researchTool?.citationsAvailable ?? inferCitationChecked(verifierResult),
    },

    redactions: [],
  };
}

export interface FinalizeCortexReceiptParams {
  receipt: EthenRouteReceipt;
  cortexProfile: CortexRouteProfile | null;
  classification: IntentClassification;
  userRequest: string;
  outputText: string;
}

/**
 * Run verification against the final streamed assistant output and fold the
 * result back into the receipt. Must be called once the full output text is
 * known (after streaming completes) — it replaces the "pending" state set by
 * buildCortexRouteReceipt during streaming with a truthful final state:
 * passed/warned/failed when the verifier actually ran, or an explicit
 * skipped state with a reason when it could not or should not run. Never
 * silently leaves a route's strict verifier policy as a bare "skipped" —
 * the warning always names the reason.
 */
export function finalizeCortexReceiptVerification(
  params: FinalizeCortexReceiptParams
): EthenRouteReceipt {
  const { receipt, cortexProfile, classification, userRequest, outputText } = params;
  const verifierPolicy = cortexProfile?.verifierPolicy ?? "optional";

  if (verifierPolicy === "off") {
    return {
      ...receipt,
      verifier: {
        used: false,
        verifierType: receipt.verifier.verifierType,
        status: "skipped",
        warnings: ["Verifier skipped: disabled by route policy (verifierPolicy=off)."],
      },
    };
  }

  const hasOutput = outputText.trim().length > 0;
  if (!hasOutput) {
    const reason =
      verifierPolicy === "strict"
        ? "Verifier skipped: strict policy requires verification but no final output text was produced to verify."
        : "Verifier skipped: no final output text was produced to verify.";
    return {
      ...receipt,
      verifier: {
        used: false,
        verifierType: receipt.verifier.verifierType,
        status: "skipped",
        warnings: [reason],
      },
    };
  }

  const verifierResult = verifyCortexOutput({
    mode: receipt.mode,
    intent: classification.primaryIntent,
    userRequest,
    outputText,
    riskLevel: classification.riskLevel,
  });

  const verifierUsed = verifierResult.status !== "skipped";

  return {
    ...receipt,
    verifier: {
      used: verifierUsed,
      verifierType: verifierResult.verifierType,
      score: verifierUsed ? verifierResult.score : undefined,
      status: verifierResult.status,
      warnings: verifierResult.warnings.length > 0 ? verifierResult.warnings : undefined,
    },
    quality: {
      ...receipt.quality,
      sourceGrounded: inferSourceGrounded(verifierResult) ?? receipt.quality.sourceGrounded,
      citationChecked: inferCitationChecked(verifierResult) ?? receipt.quality.citationChecked,
    },
  };
}

export type ReceiptVisibility = "basic" | "advanced" | "full";

function redactValue(value: string | undefined, visible: boolean): string | undefined {
  if (!value) return value;
  return visible ? value : "redacted";
}

export function redactCortexRouteReceipt(
  receipt: EthenRouteReceipt,
  level: ReceiptVisibility
): EthenRouteReceipt {
  const redacted = { ...receipt, redactions: [...receipt.redactions] };

  if (level === "basic") {
    redacted.provider = {
      ...redacted.provider,
      selectedProvider: "redacted",
      selectedModel: "redacted",
      providerVisible: false,
      modelVisible: false,
    };
    redacted.selection = {
      ...redacted.selection,
      score: undefined,
    };
    redacted.usage = {
      ...redacted.usage,
      estimatedCostUsd: undefined,
    };
    redacted.redactions.push({ field: "provider.selectedProvider", reason: "privacy" });
    redacted.redactions.push({ field: "provider.selectedModel", reason: "privacy" });
    redacted.redactions.push({ field: "usage.estimatedCostUsd", reason: "privacy" });
  } else if (level === "advanced") {
    redacted.provider = {
      ...redacted.provider,
      selectedModel: redactValue(redacted.provider.selectedModel, false),
      modelVisible: false,
    };
    redacted.redactions.push({ field: "provider.selectedModel", reason: "provider_policy" });
  }

  return redacted;
}

export function summarizeCortexRouteReceipt(receipt: EthenRouteReceipt): string {
  const parts: string[] = [];

  const profileLabel =
    receipt.mode !== "auto"
      ? receipt.mode
      : receipt.routeProfile;
  parts.push(`Ethen ${profileLabel}`);

  if (receipt.source === "mock") {
    parts.push("Mock");
  } else if (receipt.source === "degraded") {
    parts.push("Degraded");
  }

  if (receipt.fallback.used) {
    parts.push("Fallback used");
  } else {
    parts.push("No fallback");
  }

  if (receipt.verifier.status === "passed") {
    parts.push("Verified");
  } else if (receipt.verifier.status === "warned") {
    parts.push("Verifier warning");
  } else if (receipt.verifier.status === "skipped") {
    parts.push("Verifier skipped");
  } else if (receipt.verifier.status === "pending") {
    parts.push("Verifier pending");
  }

  if (receipt.usage.estimatedCostUsd != null) {
    parts.push(`$${receipt.usage.estimatedCostUsd.toFixed(2)}`);
  }

  return parts.join(" · ");
}

export function mergeGatewayMetadataIntoReceipt(
  receipt: EthenRouteReceipt,
  metadata: {
    usage?: Partial<GatewayUsageMetadata>;
    latencyMs?: number;
  }
): EthenRouteReceipt {
  const updated = { ...receipt };

  if (metadata.latencyMs != null) {
    updated.usage = { ...updated.usage, latencyMs: metadata.latencyMs };
  }

  if (metadata.usage) {
    const u = metadata.usage;
    const costEstimate =
      u.creditCost != null
        ? { estimatedCostUsd: u.creditCost, costEstimateStatus: "estimated" as const }
        : {
            estimatedCostUsd: updated.usage.estimatedCostUsd,
            costEstimateStatus: updated.usage.costEstimateStatus,
            costEstimateReason: updated.usage.costEstimateReason,
          };
    updated.usage = {
      ...updated.usage,
      inputTokens: u.inputTokens ?? updated.usage.inputTokens,
      outputTokens: u.outputTokens ?? updated.usage.outputTokens,
      totalTokens:
        (u.inputTokens ?? updated.usage.inputTokens) != null &&
        (u.outputTokens ?? updated.usage.outputTokens) != null
          ? (u.inputTokens ?? updated.usage.inputTokens ?? 0) + (u.outputTokens ?? updated.usage.outputTokens ?? 0)
          : updated.usage.totalTokens,
      ...costEstimate,
      timeToFirstTokenMs: updated.usage.timeToFirstTokenMs,
    };
  }

  return updated;
}
