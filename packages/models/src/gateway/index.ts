import "server-only";

import { getCortexProfileForGatewayRoute } from "@ethen/ai/cortex/routes";
import type { CortexFallbackAttempt } from "@ethen/ai/cortex/types";
import {
  classifyFailure,
  isRetryableFailure,
  resolveCrossProviderFallbacks,
  resolveSameProviderRetries,
} from "@ethen/ai/cortex/fallback";
import {
  isProviderCircuitOpen,
  recordProviderFailure,
  recordProviderSuccess,
} from "@ethen/ai/cortex/circuit-breaker";
import { isMockMode } from "@ethen/config/runtime-flags";
import { DEFAULT_GATEWAY_PROVIDER_TIMEOUT_MS, getDefaultProvider } from "./env";
import { GatewayError } from "./errors";
import { getGatewayRouteProfile } from "./routes";
import { enforcePolicyDecision } from "@ethen/security/policies/enforcer";
import type {
  GatewayChatRequest,
  GatewayProviderId,
  GatewayProviderRoute,
  GatewayResult,
} from "./types";
import { filterAllowedProviders } from "./platform/provider-allowlist";
import { isEncryptionAvailable } from "./platform/encryption";
import { getDecryptedProviderKeyForProvider } from "./platform/provider-credentials";
import { anthropicProviderAdapter } from "../anthropic";
import { deepseekProviderAdapter } from "../deepseek";
import { mockProviderAdapter } from "../mock";
import { openAICompatibleProviderAdapter } from "../openai-compatible";
import { openAIProviderAdapter } from "../openai";
import type { ProviderAdapter, ProviderAvailability } from "../types";

import { vercelAIGatewayAdapter } from "../vercel-ai-gateway";
import { canExecute } from "../capabilities";
export { DEFAULT_GATEWAY_PROVIDER_TIMEOUT_MS };

const PROVIDER_ADAPTERS: Record<GatewayProviderId, ProviderAdapter> = {
  "vercel-ai-gateway": vercelAIGatewayAdapter,
  mock: mockProviderAdapter,
  openai: openAIProviderAdapter,
  anthropic: anthropicProviderAdapter,
  deepseek: deepseekProviderAdapter,
  "openai-compatible": openAICompatibleProviderAdapter,
};

type ProductionProviderId = Exclude<GatewayProviderId, "mock">;

const ALL_PRODUCTION_PROVIDERS: ProductionProviderId[] = ["openai", "anthropic", "deepseek", "openai-compatible", "vercel-ai-gateway"];

function buildProviderOrder(
  preferredProvider: ProductionProviderId | null,
  routerFallbackOrder?: GatewayProviderId[] | null
): ProductionProviderId[] {
  if (routerFallbackOrder && routerFallbackOrder.length > 0) {
    const ranked = routerFallbackOrder.filter(
      (providerId): providerId is ProductionProviderId => providerId !== "mock" && ALL_PRODUCTION_PROVIDERS.includes(providerId as ProductionProviderId)
    );
    const remaining = ALL_PRODUCTION_PROVIDERS.filter((providerId) => !ranked.includes(providerId));
    return [...ranked, ...remaining];
  }

  if (!preferredProvider) {
    return ALL_PRODUCTION_PROVIDERS;
  }

  return [
    preferredProvider,
    ...ALL_PRODUCTION_PROVIDERS.filter((providerId) => providerId !== preferredProvider),
  ];
}

function buildMissingProviderError(
  preferredProvider: Exclude<GatewayProviderId, "mock"> | null,
  availabilityByProvider: Record<string, ProviderAvailability>
) {
  return new GatewayError({
    code: "provider_env_missing",
    message:
      "No production AI provider is ready. Configure a supported server-side API key or enable mock mode.",
    status: 503,
    details: {
      preferredProvider,
      availability: availabilityByProvider,
    },
  });
}

async function resolveByokApiKey(
  providerId: ProductionProviderId,
  projectId?: string | null,
): Promise<string | null> {
  if (!projectId || !isEncryptionAvailable()) return null;
  try {
    return await getDecryptedProviderKeyForProvider(providerId, projectId);
  } catch {
    return null;
  }
}

async function resolveApiKey(
  providerId: ProductionProviderId,
  projectId?: string | null,
): Promise<string | null> {
  return resolveByokApiKey(providerId, projectId ?? null);
}

function runPolicyPreflight(
  request: GatewayChatRequest,
  resolvedProviderId: string,
) {
  try {
    return enforcePolicyDecision(buildGatewayPolicyPreflightContext(request, resolvedProviderId));
  } catch (error) {
    throw new GatewayError({
      code: "provider_unavailable",
      message: "Gateway policy preflight failed closed.",
      status: 503,
      details: {
        provider: resolvedProviderId,
        cause: error instanceof Error ? error.message : "policy_preflight_failed",
      },
    });
  }
}

/**
 * Build the policy-enforcement context for a gateway request. Exported for
 * tests: the preflight MUST receive the canonical persisted Project context
 * (GW-#08) — server-derived from the API key record, never client-supplied.
 */
export function buildGatewayPolicyPreflightContext(
  request: GatewayChatRequest,
  resolvedProviderId: string,
): Parameters<typeof enforcePolicyDecision>[0] {
  return {
    // GW-#08: policy preflight receives the canonical persisted Project
    // context (server-derived from the API key record by the v1 route),
    // never a client-supplied identifier.
    projectId: request.projectId ?? null,
    targetKind: "gateway_request",
    action: resolvedProviderId,
    toolName: request.selectedModelId ?? "chat-completions",
    subjectType: "api_key",
    subjectId: request.sessionId ?? "unknown",
    arguments: {
      model: request.selectedModelId,
      messageCount: request.messages.length,
    },
    traceId: `trace_gw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    profile: null,
    riskTier: "low",
    sessionId: request.sessionId,
  };
}

function buildErrorReason(error: unknown): string {
  if (error instanceof GatewayError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function buildErrorCode(error: unknown): string | undefined {
  if (error instanceof GatewayError) {
    return error.code;
  }
  return undefined;
}

function makeAttempt(
  attemptNumber: number,
  providerId: string,
  succeeded: boolean,
  error?: unknown
): CortexFallbackAttempt {
  return {
    attemptNumber,
    providerId,
    timestamp: new Date().toISOString(),
    succeeded,
    errorReason: succeeded ? undefined : buildErrorReason(error),
    errorCode: succeeded ? undefined : buildErrorCode(error) ?? classifyFailure(error),
  };
}

function resolveModelAlias(
  route: GatewayProviderRoute,
  selectedModelId?: string | null
): string | null {
  if (selectedModelId && route.routingApplied) {
    return selectedModelId;
  }
  const models = route.profile.models as Record<string, string | undefined> | undefined;
  return models?.[route.providerId] ?? null;
}

function buildBaseRoute(
  routeProfile: ReturnType<typeof getGatewayRouteProfile>,
  providerId: GatewayProviderId,
  fallbackProviderId: GatewayProviderId | null,
  source: "mock-mode" | "env-default" | "auto-detected",
  routerSelection?: { providerId: GatewayProviderId; modelId: string; candidateCount: number } | null
): GatewayProviderRoute {
  const cortexProfile = getCortexProfileForGatewayRoute(routeProfile.routeId);
  const routingApplied = routerSelection != null && routerSelection.providerId === providerId;

  const route: GatewayProviderRoute = {
    routeId: routeProfile.routeId,
    profile: routeProfile,
    providerId,
    fallbackProviderId,
    mode: providerId === "mock" ? "mock" : "production",
    source,
    cortexProfile,
    selectedProvider: PROVIDER_ADAPTERS[providerId]?.label ?? providerId,
    attemptCount: 1,
    attempts: [],
    routingApplied,
    cortexSelection: cortexProfile
      ? {
          reasonCodes: ["selected_by_intent"],
          candidateCount: routerSelection?.candidateCount ?? 1,
          selectedCandidateRank: 1,
        }
      : null,
  };
  route.selectedModelAlias = resolveModelAlias(
    route,
    routingApplied ? routerSelection?.modelId : null
  );
  return route;
}

export async function runGatewayChat(
  request: GatewayChatRequest
): Promise<GatewayResult> {
  if (request.messages.length === 0) {
    throw new GatewayError({
      code: "messages_required",
      message: "At least one chat message is required.",
      status: 400,
    });
  }

  const routeId = request.agent?.routeId ?? request.routeId ?? null;
  const routeProfile = getGatewayRouteProfile(routeId);

  if (isMockMode) {
    const route = buildBaseRoute(routeProfile, "mock", null, "mock-mode");
    route.attempts = [makeAttempt(1, "mock", true)];

    const result = await mockProviderAdapter.streamChat({ request, route });

    return {
      ...result,
      route,
      warnings: [],
    };
  }

  const routerSelection =
    request.selectedProviderId &&
    request.selectedProviderId !== "mock" &&
    request.selectedModelId
      ? {
          providerId: request.selectedProviderId,
          modelId: request.selectedModelId,
          candidateCount: request.fallbackProviderOrder?.length ?? 1,
        }
      : null;

  const preferredProvider = routerSelection?.providerId ?? getDefaultProvider();
  const providerOrder = buildProviderOrder(preferredProvider, request.fallbackProviderOrder);
  const availabilityByProvider = Object.fromEntries(
    providerOrder.map((providerId) => [
      providerId,
      PROVIDER_ADAPTERS[providerId].getAvailability(),
    ])
  );

  const availableProviders = providerOrder.filter(
    (providerId) =>
      availabilityByProvider[providerId]?.available && !isProviderCircuitOpen(providerId)
  );

  // Apply request-level provider allow-list (providerOptions.gateway.only).
  // Intersected with available/configured providers; never bypasses catalog,
  // policy, or circuit-breaker gating applied above and below.
  const onlyProviders = (request.onlyProviders ?? []).filter(
    (providerId): providerId is ProductionProviderId =>
      providerId !== "mock" && ALL_PRODUCTION_PROVIDERS.includes(providerId as ProductionProviderId)
  );
  const filteredByOnly =
    onlyProviders.length > 0
      ? availableProviders.filter((providerId) => onlyProviders.includes(providerId))
      : availableProviders;

  const projectId = request.projectId ?? null;
  const allowedProviders = projectId
    ? await filterAllowedProviders(filteredByOnly, projectId)
    : filteredByOnly;

  if (allowedProviders.length === 0) {
    throw buildMissingProviderError(preferredProvider, availabilityByProvider);
  }

  const executable = allowedProviders.filter((provider): provider is ProductionProviderId => ALL_PRODUCTION_PROVIDERS.includes(provider as ProductionProviderId) && canExecute(provider as ProductionProviderId, request));
  if (executable.length === 0) throw new GatewayError({code:"capability_not_executable",status:422,message:"No available adapter can execute this request."});
  const [primaryProvider, ...fallbackProviders] = executable;

  const policyResult = runPolicyPreflight(request, primaryProvider);
  if (policyResult?.denied) {
    throw new GatewayError({
      code: "blocked_by_policy",
      message: `Gateway request blocked by policy: ${policyResult.decision.reason}`,
      status: 403,
      details: {
        policyDecisionId: policyResult.decision.id,
        policyState: policyResult.decision.state,
        policyReason: policyResult.decision.reason,
      },
    });
  }

  const cortexProfile = getCortexProfileForGatewayRoute(routeProfile.routeId);
  const sameProviderRetries = resolveSameProviderRetries(cortexProfile?.fallbackPolicy);
  const crossProviderFallbacksAllowed = resolveCrossProviderFallbacks(cortexProfile?.fallbackPolicy);
  const providersToTry = [primaryProvider, ...fallbackProviders.slice(0, crossProviderFallbacksAllowed)];

  const warnings: string[] = [];
  const attempts: CortexFallbackAttempt[] = [];
  let attemptNumber = 0;
  let lastError: unknown;

  for (let providerIndex = 0; providerIndex < providersToTry.length; providerIndex++) {
    const providerId = providersToTry[providerIndex] as ProductionProviderId;
    const nextProvider = providersToTry[providerIndex + 1] as ProductionProviderId | undefined;
    const isPrimary = providerIndex === 0;
    const retriesForProvider = isPrimary ? sameProviderRetries : 0;

    const routingApplied = routerSelection != null && routerSelection.providerId === providerId;
    const route = buildBaseRoute(
      routeProfile,
      providerId,
      nextProvider ?? null,
      preferredProvider ? "env-default" : "auto-detected",
      routerSelection
    );
    route.cortexProfile = cortexProfile;
    route.fallbackUsed = !isPrimary;
    route.routingApplied = routingApplied;
    route.selectedModelAlias = resolveModelAlias(route, routingApplied ? routerSelection?.modelId : null);
    // Request-level per-provider model alias override (providerOptions.gateway.models).
    // Wins over route profile default but is still subject to the route's provider id.
    const aliasOverride = request.modelAliasOverride?.[providerId];
    if (aliasOverride) {
      route.selectedModelAlias = aliasOverride;
      route.routingApplied = true;
    }

    if (!isPrimary) {
      route.fallbackReason = buildErrorReason(lastError);
    } else if (routerSelection && !routingApplied) {
      warnings.push(
        `Cortex selected provider "${routerSelection.providerId}" was unavailable; fell back to "${providerId}".`
      );
    }

    for (let attemptOnProvider = 0; attemptOnProvider <= retriesForProvider; attemptOnProvider++) {
      attemptNumber += 1;

      try {
        const apiKeyOverride = await resolveApiKey(providerId, projectId);
        // Request-level per-provider timeout (providerOptions.gateway.providerTimeouts).
        // Enforced via AbortController; a timeout is treated as a provider
        // failure and triggers the normal fallback path.
        const timeoutMs = request.providerTimeouts?.[providerId] ?? DEFAULT_GATEWAY_PROVIDER_TIMEOUT_MS;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController();

        // Propagate client disconnect to the provider call.
        // When the client drops the connection, abort the upstream provider
        // request so we don't keep burning tokens for a discarded response.
        const clientSignal = request.clientSignal;
        if (clientSignal) {
          if (clientSignal.aborted) {
            controller.abort();
          } else {
            const onAbort = () => controller.abort();
            clientSignal.addEventListener("abort", onAbort, { once: true });
          }
        }

        const timeoutPromise =
          timeoutMs && timeoutMs > 0
            ? new Promise<never>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                  controller.abort();
                  reject(
                    new GatewayError({
                      code: "provider_timeout",
                      message: `Provider ${providerId} exceeded the configured timeout of ${timeoutMs}ms.`,
                      status: 504,
                      details: { provider: providerId, timeoutMs },
                    }),
                  );
                }, timeoutMs);
              })
            : null;

        const streamPromise = PROVIDER_ADAPTERS[providerId].streamChat({
          request,
          route,
          apiKeyOverride,
          signal: controller.signal,
        });

        const result = timeoutPromise
          ? (await Promise.race([streamPromise, timeoutPromise]))
          : await streamPromise;
        if (timeoutHandle) clearTimeout(timeoutHandle);

        attempts.push(makeAttempt(attemptNumber, providerId, true));
        route.attempts = attempts;
        route.attemptCount = attempts.length;
        recordProviderSuccess(providerId);

        if (!isPrimary) {
          warnings.push(`Primary provider failed. Fallback to ${providerId} succeeded.`);
        } else if (fallbackProviders.length > 0) {
          warnings.push(`Fallback provider available: ${fallbackProviders[0]}.`);
        }

        return { ...result, route, warnings };
      } catch (error) {
        lastError = error;
        const failureClass = classifyFailure(error);
        attempts.push(makeAttempt(attemptNumber, providerId, false, error));
        recordProviderFailure(providerId);

        const hasRetriesLeft = attemptOnProvider < retriesForProvider;
        if (hasRetriesLeft && isRetryableFailure(failureClass)) {
          continue;
        }
        break;
      }
    }
  }

  throw lastError;
}
