import { gatewayContentText } from "@ethen/models/gateway/types";
import { classifyIntent, getDefaultModeForIntent } from "./intent-classifier";
import { selectCandidates } from "./model-router";
import { buildCandidatesFromModelRegistry } from "./provider-registry";
import { getCortexRouteProfile } from "./routes";
import { buildCortexRouteReceipt } from "./route-receipt";
import {
  buildResearchInputFromResult,
  executeCortexResearchTool,
  getResearchToolClass,
} from "./research";
import type {
  CortexResearchSource,
  CortexResearchEvidence,
} from "./research";
import type {
  ConversationStateSummary,
  CortexRouteProfile,
  EthenMode,
  EthenRouteReceipt,
  IntentClassification,
  ToolClass,
} from "./types";
import type { VerifierOutput } from "./verifier";
import {
  runGatewayChat,
} from "@ethen/models/gateway/index";
import { getGatewayRouteProfile } from "@ethen/models/gateway/routes";
import type {
  GatewayAgentContext,
  GatewayChatMessage,
  GatewayChatRequest,
  GatewayProviderId,
  GatewayResult,
} from "@ethen/models/gateway/types";
import { runUltraChat } from "../cortex-ultra/run-ultra-chat";
import { createLiveWorkerExecutor } from "../cortex-ultra/live-worker-executor";
import { resolveCanonicalModelReference } from "@ethen/models/model-intelligence/registry-api";

export interface RunCortexChatParams {
  messages: GatewayChatMessage[];
  sessionId?: string | null;
  agent?: GatewayAgentContext | null;
  selectedMode?: EthenMode | "auto";
  conversationState?: ConversationStateSummary;
  projectId?: string | null;
  /** Optional Model Library slug/id explicitly selected by the user. */
  selectedModelId?: string | null;
  /** Optional gateway output limit. Omitted preserves the gateway default. */
  maxOutputTokens?: number;
}

export interface RunCortexChatResearchSummary {
  provider: "exa" | "mock";
  toolClass: ToolClass;
  sourceCount: number;
  evidenceCount: number;
  sourceGrounded: boolean;
  citationsAvailable: boolean;
  failed: boolean;
  errorMessage?: string;
}

export interface RunCortexChatResult {
  result: GatewayResult;
  receipt: EthenRouteReceipt;
  classification: IntentClassification;
  effectiveMode: EthenMode;
  cortexProfile: CortexRouteProfile | null;
  research?: RunCortexChatResearchSummary | null;
  researchSources?: CortexResearchSource[];
  researchEvidence?: CortexResearchEvidence[];
  ultra?: {
    workerCount: number;
    evidenceCount: number;
    status: string;
    degraded: boolean;
  };
}

const VERIFIER_PENDING_STREAMING =
  "Verifier pending: output text not available at receipt creation time (streaming mode). Finalized via finalizeCortexReceiptVerification after the stream completes.";

const VERIFIER_SKIPPED_POLICY_OFF =
  "Verifier skipped: disabled by route policy (verifierPolicy=off).";

const ROUTER_SKIPPED_NO_CANDIDATES =
  "Router skipped: no model candidate data available from gateway route profile.";

function extractLastUserMessage(messages: GatewayChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return gatewayContentText(messages[i].content);
    }
  }
  return "";
}

function resolveEffectiveMode(
  selectedMode: EthenMode | "auto" | undefined,
  classification: IntentClassification
): EthenMode {
  if (selectedMode && selectedMode !== "auto") {
    return selectedMode;
  }
  return getDefaultModeForIntent(classification.primaryIntent);
}

function buildUnsatisfiedRouterResult(reason: string) {
  return {
    selected: null,
    fallbacks: [],
    rejected: [],
    selectedRank: 0,
    score: 0,
    reasonCodes: [],
    warnings: [reason],
  };
}

function textStreamFromValue(value: string): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      if (value) controller.enqueue(value);
      controller.close();
    },
  });
}

export async function runCortexChat(
  params: RunCortexChatParams
): Promise<RunCortexChatResult> {
  const {
    messages,
    sessionId,
    agent,
    selectedMode = "auto",
    conversationState,
    projectId,
    selectedModelId: requestedModelId,
    maxOutputTokens,
  } = params;

  const userMessage = extractLastUserMessage(messages);

  const classification = classifyIntent({
    message: userMessage,
    selectedMode,
    conversationState,
  });

  const effectiveMode = resolveEffectiveMode(selectedMode, classification);
  const cortexProfile = getCortexRouteProfile(effectiveMode);
  const routeId = cortexProfile?.id ?? effectiveMode;

  // Ultra is a real, bounded execution path. It must never silently resolve
  // to Auto or a single-model gateway route.
  if (effectiveMode === "ultra-preview") {
    const ultra = await runUltraChat({
      task: userMessage,
      maxWorkers: 2,
      workerExecutor: createLiveWorkerExecutor({
        gatewayRouteId: "text-reasoning",
        cortexRouteId: "cortex-pro",
      }),
    });
    const gatewayResult: GatewayResult = {
      textStream: textStreamFromValue(ultra.answer),
      usage: {
        inputMessages: messages.length,
        inputCharacters: messages.reduce((total, message) => total + gatewayContentText(message.content).length, 0),
        outputCharacters: ultra.answer.length,
      },
      warnings: ultra.limitations,
      route: {
        routeId: "ultra-preview",
        profile: getGatewayRouteProfile("text-reasoning"),
        providerId: "openai",
        mode: "production",
        source: "auto-detected",
        selectedProvider: "Cortex Ultra",
        selectedModelAlias: null,
        attemptCount: 1,
        attempts: [{ attemptNumber: 1, providerId: "openai", timestamp: new Date().toISOString(), succeeded: true }],
      },
    };
    const receipt = buildCortexRouteReceipt({
      classification,
      cortexProfile,
      gatewayResult,
      sessionId,
      conversationId: sessionId ?? undefined,
      projectId: projectId ?? undefined,
      routerResult: buildUnsatisfiedRouterResult("Ultra uses its bounded worker execution contract, not single-model candidate selection."),
      verifierPendingNote: VERIFIER_PENDING_STREAMING,
      toolsExecuted: { used: ultra.evidence.total > 0, invocationCount: ultra.evidence.total, redactedResults: true },
    });
    return {
      result: gatewayResult,
      receipt,
      classification,
      effectiveMode,
      cortexProfile,
      ultra: {
        workerCount: ultra.workerResults.length,
        evidenceCount: ultra.evidence.total,
        status: ultra.run.state,
        degraded: ultra.run.state === "DEGRADED_COMPLETE",
      },
    };
  }

  // Research mode actually executes a research tool call here (reusing the
  // same Exa/mock provider code as the standalone research route) and feeds
  // the real evidence into generation. Other modes never run this — tools
  // must stay truth-based, not inferred from toolPolicy alone.
  let researchSummary: RunCortexChatResearchSummary | null = null;
  let researchSources: CortexResearchSource[] | undefined;
  let researchEvidence: CortexResearchEvidence[] | undefined;
  let gatewayMessages = messages;

  if (effectiveMode === "research" && userMessage.trim()) {
    const outcome = await executeCortexResearchTool(userMessage);
    const researchInput = buildResearchInputFromResult({
      query: userMessage,
      provider: outcome.provider,
      result: outcome.result,
    });
    const toolClass = getResearchToolClass(researchInput.mode);
    const hasSources = researchInput.sources.length > 0;
    const hasCitations = researchInput.evidence.some(
      (e) => e.sourceIndex !== undefined || e.sourceUrl
    );

    researchSources = researchInput.sources;
    researchEvidence = researchInput.evidence;

    researchSummary = {
      provider: outcome.provider,
      toolClass,
      sourceCount: researchInput.sources.length,
      evidenceCount: researchInput.evidence.length,
      sourceGrounded: hasSources,
      citationsAvailable: hasCitations,
      failed: outcome.failed,
      errorMessage: outcome.errorMessage,
    };

    if (hasSources) {
      const sourceLines = researchInput.sources
        .map((s) => `[${s.index}] ${s.title} — ${s.url}${s.snippet ? `\n    ${s.snippet}` : ""}`)
        .join("\n");
      const evidenceContext =
        `Research evidence gathered for this request (cite sources as [n] where relevant):\n${sourceLines}` +
        (researchInput.answerText ? `\n\nDraft research answer:\n${researchInput.answerText}` : "");
      gatewayMessages = [...messages, { role: "system", content: evidenceContext }];
    }
  }

  const gatewayRouteId = agent?.routeId ?? null;
  const gatewayProfile = getGatewayRouteProfile(gatewayRouteId);
  const candidates = buildCandidatesFromModelRegistry(gatewayProfile.models);

  let routerResult;
  if (candidates.length > 0) {
    routerResult = selectCandidates(routeId, candidates, {
      requiredCapabilities: {
        tools: classification.requiresTools || undefined,
      },
      estimatedContextTokens: undefined,
    });
  } else {
    routerResult = buildUnsatisfiedRouterResult(ROUTER_SKIPPED_NO_CANDIDATES);
  }

  const isGatewayProviderId = (id: string): id is GatewayProviderId =>
    id === "openai" || id === "anthropic" || id === "deepseek" || id === "openai-compatible";

  const requestedModel = requestedModelId
    ? resolveCanonicalModelReference(requestedModelId, null)
    : null;
  const explicitlySelectedCandidate = requestedModel?.status === "mapped" &&
    isGatewayProviderId(requestedModel.canonicalModel.profile.identity.providerId)
    ? {
        ...(routerResult.selected ?? candidates[0]),
        id: `${requestedModel.canonicalModel.profile.identity.providerId}:${requestedModel.canonicalModel.profile.identity.id}`,
        providerId: requestedModel.canonicalModel.profile.identity.providerId,
        modelId: requestedModel.canonicalModel.profile.identity.id,
        visibleName: requestedModel.canonicalModel.profile.identity.name,
      }
    : null;
  const selectedCandidate = explicitlySelectedCandidate ?? routerResult.selected;
  const fallbackProviderOrder = selectedCandidate
    ? [selectedCandidate.providerId, ...routerResult.fallbacks.map((c) => c.providerId)].filter(
        isGatewayProviderId
      )
    : null;

  const gatewayRequest: GatewayChatRequest = {
    sessionId,
    routeId: agent?.routeId ?? null,
    agent,
    messages: gatewayMessages,
    maxOutputTokens,
    selectedProviderId:
      selectedCandidate && isGatewayProviderId(selectedCandidate.providerId)
        ? selectedCandidate.providerId
        : null,
    selectedModelId: selectedCandidate?.modelId ?? null,
    fallbackProviderOrder,
  };

  const gatewayStartedAt = Date.now();
  const gatewayResult = await runGatewayChat(gatewayRequest);
  const observedTimeToFirstTokenMs = Date.now() - gatewayStartedAt;

  // Streamed text is not yet available when this receipt is built, so the
  // verifier cannot run here. Final verification happens after the stream
  // completes, via finalizeCortexReceiptVerification (route-receipt.ts),
  // called from the chat routes once the full assistantText is captured.
  const verifierResult: VerifierOutput | null = null;
  const verifierPolicy = cortexProfile?.verifierPolicy ?? "optional";
  const verifierSkippedNote =
    verifierPolicy === "off" ? VERIFIER_SKIPPED_POLICY_OFF : undefined;
  const verifierPendingNote =
    verifierPolicy === "off" ? undefined : VERIFIER_PENDING_STREAMING;

  // The gateway chat path itself has no tool-calling loop (runGatewayChat is
  // a plain text completion call). Outside of research mode, a profile's
  // toolPolicy only describes intent/policy — it must not be reported as
  // executed tool use in the receipt, so tools.used stays false. For
  // research mode, toolsExecuted reflects the real research call made above.
  const toolsExecuted = researchSummary
    ? {
        used: !researchSummary.failed,
        classes: !researchSummary.failed ? [researchSummary.toolClass] : undefined,
        invocationCount: !researchSummary.failed ? 1 : undefined,
      }
    : { used: false };

  const receipt = buildCortexRouteReceipt({
    classification,
    cortexProfile,
    gatewayResult,
    sessionId,
    conversationId: sessionId ?? undefined,
    projectId: projectId ?? undefined,
    observedTimeToFirstTokenMs,
    routerResult,
    verifierResult,
    verifierSkippedNote,
    verifierPendingNote,
    toolsExecuted,
    researchTool:
      researchSummary && !researchSummary.failed
        ? {
            sourceGrounded: researchSummary.sourceGrounded,
            citationsAvailable: researchSummary.citationsAvailable,
          }
        : undefined,
  });

  return {
    result: gatewayResult,
    receipt,
    classification,
    effectiveMode,
    cortexProfile,
    research: researchSummary,
    researchSources,
    researchEvidence,
  };
}
