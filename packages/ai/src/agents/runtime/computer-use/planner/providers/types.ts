import type { ObservationPacket, AgentDecision } from "../../agent-loop/types";

export type PlannerProviderMode = "llm" | "fallback";

export interface PlannerProviderConfig {
  providerId: string;
  modelLabel: string;
  mode: PlannerProviderMode;
  isConfigured: boolean;
}

export interface PlannerDecisionInput {
  userTask: string;
  observation: ObservationPacket;
  recentDecisions: AgentDecision[];
  budget: {
    remainingSteps: number;
    maxSteps: number;
    remainingTimeMs: number;
    maxTimeMs: number;
  };
  currentUrl: string | null;
  pageTitle: string | null;
  allowedActions: string[];
  policyNote: string;
}

export interface PlannerDecision {
  decision: AgentDecision;
  providerMeta: {
    providerId: string;
    modelLabel: string;
    mode: PlannerProviderMode;
  };
}

export interface ComputerUsePlannerProvider {
  providerId: string;
  modelLabel: string;
  mode: PlannerProviderMode;
  isConfigured(): boolean;
  planNextAction(input: PlannerDecisionInput): Promise<PlannerDecision>;
}

export function createProviderNotConfiguredDecision(providerId: string): PlannerDecision {
  return {
    decision: {
      intent: "fail",
      summary: `Provider "${providerId}" is not configured for Computer Use planning. Set COMPUTER_USE_PROVIDER and the appropriate API key.`,
      confidence: "low",
      reason: "provider_not_configured",
    },
    providerMeta: {
      providerId,
      modelLabel: "Provider not configured",
      mode: "fallback",
    },
  };
}
