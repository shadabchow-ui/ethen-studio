import type {
  ObservationPacket,
  ModelActionProposal,
  ModelAdapter,
} from "./types";
import type { ComputerAction } from "../types";

export type { ModelAdapter };

export function createNoOpModelAdapter(): ModelAdapter {
  return {
    providerId: "noop",

    async proposeNextAction(_packet: ObservationPacket): Promise<ModelActionProposal> {
      return {
        intent: "fail",
        summary: "No model adapter configured. Provide a real adapter implementation.",
        nextAction: null,
        confidence: 0,
        expectedOutcome: null,
        riskAssessment: null,
      };
    },

    async verifyAction(
      _action: ComputerAction,
      _observation: ObservationPacket,
    ): Promise<{
      verified: boolean;
      confidence: "high" | "medium" | "low";
      reasoning: string;
    }> {
      return {
        verified: false,
        confidence: "low",
        reasoning: "No model adapter configured — cannot verify action outcomes.",
      };
    },

    async summarizeRun(_packets: ObservationPacket[]): Promise<{
      summary: string;
      outcome: "success" | "partial" | "failed" | "blocked";
      keyFindings: string[];
    }> {
      return {
        summary: "No model adapter configured — cannot generate a run summary.",
        outcome: "failed",
        keyFindings: [],
      };
    },
  };
}

export function adapterSatisfiesContract(adapter: unknown): adapter is ModelAdapter {
  if (!adapter || typeof adapter !== "object") return false;
  const a = adapter as Record<string, unknown>;
  return (
    typeof a.providerId === "string" &&
    typeof a.proposeNextAction === "function"
  );
}
