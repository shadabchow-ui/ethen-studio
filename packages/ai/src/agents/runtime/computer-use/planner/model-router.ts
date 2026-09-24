import { getServerEnv } from "@ethen/config/env";
import type { AgentDecision } from "../agent-loop/types";
import type { ComputerUsePlannerProvider, PlannerDecision, PlannerDecisionInput, PlannerProviderMode } from "./providers/types";
import { openaiComputerProvider } from "./providers/openai-computer";
import { anthropicComputerProvider } from "./providers/anthropic-computer";
import { deepseekComputerProvider } from "./providers/deepseek-computer";
import { requestFallbackDecision } from "../agent-loop/mock-planner";
import { addComputerUseEvent, getNowIso } from "../store";

/**
 * Optional run id used purely to attach diagnostic planner events
 * (planner.provider.selected / request.started / response.received /
 * response.parse_failed / provider.error) to the correct run timeline.
 * routePlannerDecision remains usable without a runId (e.g. in tests),
 * in which case no events are recorded.
 */
export interface RoutePlannerOptions {
  runId?: string;
}

const MAX_PLANNER_ERROR_LENGTH = 200;

/**
 * Bounds a planner-facing error/summary string before it is stored in an
 * event's metadata. Provider adapters never put raw API keys into these
 * messages, but this still caps length defensively and never reads
 * process.env directly.
 */
function sanitizePlannerErrorMessage(message: string | undefined | null): string | undefined {
  if (!message) return undefined;
  return message.length > MAX_PLANNER_ERROR_LENGTH
    ? `${message.slice(0, MAX_PLANNER_ERROR_LENGTH)}…`
    : message;
}

const ALL_PROVIDERS: ComputerUsePlannerProvider[] = [
  openaiComputerProvider,
  anthropicComputerProvider,
  deepseekComputerProvider,
];

function tryGetConfiguredProvider(): string | null {
  try {
    const provider = getServerEnv("COMPUTER_USE_PROVIDER")?.toLowerCase();
    if (provider === "openai" || provider === "anthropic" || provider === "deepseek") return provider;
    const defaultProvider = getServerEnv("ETHEN_DEFAULT_PROVIDER")?.toLowerCase();
    if (defaultProvider === "openai" || defaultProvider === "anthropic" || defaultProvider === "deepseek") return defaultProvider;
    return null;
  } catch {
    return null;
  }
}

function tryGetConfiguredModel(): string | null {
  try {
    const model = getServerEnv("COMPUTER_USE_MODEL");
    return model ?? null;
  } catch {
    return null;
  }
}

export interface RouterResult {
  decision: AgentDecision;
  sourceProvider: string;
  sourceModel: string;
  plannerMode:
    | "deterministic_fallback"
    | "llm_provider_not_wired"
    | "llm_provider_not_configured"
    | "llm_provider_live"
    | "text_dom_planner_live"
    | "llm_provider_error";
  plannerLabel: string;
}

function buildFallbackInput(input: PlannerDecisionInput): {
  goal: string;
  currentUrl: string;
  stepIndex: number;
  maxSteps: number;
} {
  return {
    goal: input.userTask,
    currentUrl: input.currentUrl ?? "",
    stepIndex: input.budget.maxSteps - input.budget.remainingSteps,
    maxSteps: input.budget.maxSteps,
  };
}

export async function routePlannerDecision(
  input: PlannerDecisionInput,
  options?: RoutePlannerOptions,
): Promise<RouterResult> {
  const configuredProviderId = tryGetConfiguredProvider();
  const configuredModel = tryGetConfiguredModel();
  const runId = options?.runId;

  const recordEvent = (
    type:
      | "planner.provider.selected"
      | "planner.request.started"
      | "planner.response.received"
      | "planner.response.parse_failed"
      | "planner.provider.error",
    metadata: Record<string, unknown>,
  ) => {
    if (!runId) return;
    addComputerUseEvent(runId, {
      runId,
      type,
      timestamp: getNowIso(),
      actor: "runtime",
      metadata,
    });
  };

  if (configuredProviderId) {
    const matchedProvider = ALL_PROVIDERS.find((p) => p.providerId === configuredProviderId);

    if (matchedProvider) {
      recordEvent("planner.provider.selected", {
        provider: matchedProvider.providerId,
        model: configuredModel ?? matchedProvider.modelLabel,
        configured: matchedProvider.isConfigured(),
      });

      if (matchedProvider.isConfigured()) {
        const requestStartedAt = Date.now();
        recordEvent("planner.request.started", {
          provider: matchedProvider.providerId,
          model: configuredModel ?? matchedProvider.modelLabel,
          step: input.budget.maxSteps - input.budget.remainingSteps,
        });

        try {
          const result: PlannerDecision = await matchedProvider.planNextAction(input);
          const durationMs = Date.now() - requestStartedAt;

          if (result.decision.reason === "provider_not_configured") {
            recordEvent("planner.provider.error", {
              provider: matchedProvider.providerId,
              model: configuredModel ?? matchedProvider.modelLabel,
              failureCategory: "not_configured",
              durationMs,
            });
            const fallbackDecision = requestFallbackDecision(buildFallbackInput(input));
            return {
              decision: fallbackDecision,
              sourceProvider: matchedProvider.providerId,
              sourceModel: configuredModel ?? matchedProvider.modelLabel,
              plannerMode: "llm_provider_not_configured",
              plannerLabel: `${matchedProvider.modelLabel} — not configured`,
            };
          }

          if (result.decision.reason === "provider_not_wired") {
            recordEvent("planner.provider.error", {
              provider: matchedProvider.providerId,
              model: configuredModel ?? matchedProvider.modelLabel,
              failureCategory: "not_wired",
              durationMs,
            });
            const fallbackDecision = requestFallbackDecision(buildFallbackInput(input));
            return {
              decision: fallbackDecision,
              sourceProvider: matchedProvider.providerId,
              sourceModel: configuredModel ?? matchedProvider.modelLabel,
              plannerMode: "llm_provider_not_wired",
              plannerLabel: `${matchedProvider.modelLabel} — adapter not wired`,
            };
          }

          if (result.decision.reason === "provider_error" || result.decision.reason === "response_parse_failed") {
            const isParseFailure =
              result.decision.reason === "response_parse_failed" ||
              /schema validation|failed to parse|not a single strict JSON|did not contain message content/i.test(
                result.decision.summary ?? "",
              );
            recordEvent(isParseFailure ? "planner.response.parse_failed" : "planner.provider.error", {
              provider: matchedProvider.providerId,
              model: configuredModel ?? matchedProvider.modelLabel,
              failureCategory: isParseFailure ? "parse_error" : "provider_error",
              durationMs,
              shortError: sanitizePlannerErrorMessage(result.decision.summary),
            });
            return {
              decision: result.decision,
              sourceProvider: matchedProvider.providerId,
              sourceModel: configuredModel ?? matchedProvider.modelLabel,
              plannerMode: "llm_provider_error",
              plannerLabel: `${matchedProvider.modelLabel} — provider error`,
            };
          }

          // The provider returned a real decision (not a not-configured/not-wired/
          // error stub reason). This is a live text/DOM planner — no native
          // visual computer use is implied.
          recordEvent("planner.response.received", {
            provider: matchedProvider.providerId,
            model: configuredModel ?? matchedProvider.modelLabel,
            durationMs,
            intent: result.decision.intent,
          });
          return {
            decision: result.decision,
            sourceProvider: matchedProvider.providerId,
            sourceModel: configuredModel ?? matchedProvider.modelLabel,
            plannerMode: "text_dom_planner_live",
            plannerLabel: `${matchedProvider.modelLabel} — text/DOM planner (${configuredModel ?? "default"})`,
          };
        } catch (err) {
          recordEvent("planner.provider.error", {
            provider: matchedProvider.providerId,
            model: configuredModel ?? matchedProvider.modelLabel,
            failureCategory: "unhandled_exception",
            shortError: sanitizePlannerErrorMessage(err instanceof Error ? err.message : "Unknown planner error"),
          });
          const fallbackDecision = requestFallbackDecision(buildFallbackInput(input));
          return {
            decision: fallbackDecision,
            sourceProvider: matchedProvider.providerId,
            sourceModel: configuredModel ?? matchedProvider.modelLabel,
            plannerMode: "deterministic_fallback",
            plannerLabel: `${matchedProvider.modelLabel} — planning error, fell back`,
          };
        }
      }

      const fallbackDecision = requestFallbackDecision(buildFallbackInput(input));
      return {
        decision: fallbackDecision,
        sourceProvider: configuredProviderId,
        sourceModel: configuredModel ?? "not provided",
        plannerMode: "llm_provider_not_configured",
        plannerLabel: `${configuredProviderId} — not configured`,
      };
    }

    const fallbackDecision = requestFallbackDecision(buildFallbackInput(input));
    return {
      decision: fallbackDecision,
      sourceProvider: configuredProviderId,
      sourceModel: configuredModel ?? "not provided",
      plannerMode: "deterministic_fallback",
      plannerLabel: `Fallback — unknown provider "${configuredProviderId}"`,
    };
  }

  const fallbackDecision = requestFallbackDecision(buildFallbackInput(input));
  return {
    decision: fallbackDecision,
    sourceProvider: "fallback",
    sourceModel: "deterministic",
    plannerMode: "deterministic_fallback",
    plannerLabel: "Fallback planner — no LLM provider configured",
  };
}

export function getAvailablePlanningProviders(): Array<{
  providerId: string;
  modelLabel: string;
  mode: PlannerProviderMode;
  isConfigured: boolean;
}> {
  return ALL_PROVIDERS.map((p) => ({
    providerId: p.providerId,
    modelLabel: p.modelLabel,
    mode: p.mode,
    isConfigured: p.isConfigured(),
  }));
}
