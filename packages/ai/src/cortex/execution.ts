import { gatewayContentText } from "@ethen/models/gateway/types";
import { runCortexChat } from "./run-cortex-chat";
import type { RunCortexChatParams, RunCortexChatResult } from "./run-cortex-chat";
import { runUltraChat } from "../cortex-ultra/run-ultra-chat";
import type { RunUltraChatInput, RunUltraChatResult } from "../cortex-ultra/run-ultra-chat";
import type { GatewayAgentContext, GatewayChatMessage, GatewayResult } from "@ethen/models/gateway/types";
import type { TaskAttachment } from "@ethen/contracts/tasks/envelope";
import type { EthenMode, VerifierStatus } from "./types";

/** The three execution depths currently backed by live Cortex engines. */
export type CortexExecutionDepth = "fast" | "deep" | "ultra";

export interface CortexExecutionBudget {
  /** Supported by Fast and Deep through the gateway request. */
  maxOutputTokens?: number;
  /** Supported by Ultra only. */
  maxWorkers?: number;
  /** Supported by Ultra only. */
  costLimitUsd?: number;
  /** Supported by Ultra only. */
  timeLimitMs?: number;
}

export interface CortexExecutionUserSelection {
  /** Supported by the standard Cortex engine only. */
  agent?: GatewayAgentContext | null;
  /** No existing engine accepts an explicit model selection through this contract. */
  modelId?: string | null;
}

export interface CortexExecutionInput {
  depth: CortexExecutionDepth;
  messages: GatewayChatMessage[];
  sessionId?: string | null;
  projectId?: string | null;
  attachments?: TaskAttachment[];
  tools?: string[];
  userSelection?: CortexExecutionUserSelection;
  budget?: CortexExecutionBudget;
  /** Existing engines do not execute this policy; supplied values are rejected explicitly. */
  approvalPolicy?: "automatic" | "prompt";
  /** Metadata only until a current engine gains product-context support. */
  productContext?: Record<string, unknown> | null;
}

export type CortexExecutionErrorCode =
  | "invalid_input"
  | "unsupported_input"
  | "mode_substitution"
  | "engine_failure";

export interface CortexExecutionError {
  code: CortexExecutionErrorCode;
  message: string;
  fields?: string[];
}

export interface CortexExecutionMetadata {
  requestedDepth: CortexExecutionDepth;
  executedDepth: CortexExecutionDepth | null;
  requestedMode: EthenMode | "ultra";
  executedMode: EthenMode | "ultra" | null;
  verifierStatus: VerifierStatus | "unavailable";
  unsupportedInputs: string[];
}

export type CortexExecutionResult =
  | {
      status: "completed" | "degraded";
      metadata: CortexExecutionMetadata;
      output: { kind: "stream"; result: GatewayResult };
      standard: RunCortexChatResult;
    }
  | {
      status: "completed" | "degraded";
      metadata: CortexExecutionMetadata;
      output: { kind: "complete"; answer: string };
      ultra: RunUltraChatResult;
    }
  | {
      status: "error";
      metadata: CortexExecutionMetadata;
      error: CortexExecutionError;
    };

export interface CortexExecutionDependencies {
  runCortexChat: (params: RunCortexChatParams) => Promise<RunCortexChatResult>;
  runUltraChat: (input: RunUltraChatInput) => Promise<RunUltraChatResult>;
}

const STANDARD_MODE_BY_DEPTH: Record<"fast" | "deep", EthenMode> = {
  fast: "cortex-lite",
  deep: "cortex-pro",
};

function emptyMetadata(input: CortexExecutionInput, unsupportedInputs: string[] = []): CortexExecutionMetadata {
  return {
    requestedDepth: input.depth,
    executedDepth: null,
    requestedMode: input.depth === "ultra" ? "ultra" : STANDARD_MODE_BY_DEPTH[input.depth],
    executedMode: null,
    verifierStatus: "unavailable",
    unsupportedInputs,
  };
}

function errorResult(
  input: CortexExecutionInput,
  error: CortexExecutionError,
  unsupportedInputs: string[] = error.fields ?? []
): CortexExecutionResult {
  return { status: "error", metadata: emptyMetadata(input, unsupportedInputs), error };
}

function lastUserMessage(messages: GatewayChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && gatewayContentText(message.content).trim()) return gatewayContentText(message.content);
  }
  return null;
}

function unsupportedInputs(input: CortexExecutionInput): string[] {
  const unsupported: string[] = [];
  if (input.attachments?.length) unsupported.push("attachments");
  if (input.tools?.length) unsupported.push("tools");
  if (input.approvalPolicy !== undefined) unsupported.push("approvalPolicy");
  if (input.productContext !== undefined && input.productContext !== null) unsupported.push("productContext");
  if (input.userSelection?.modelId) unsupported.push("userSelection.modelId");

  if (input.depth === "ultra") {
    if (input.sessionId) unsupported.push("sessionId");
    if (input.projectId) unsupported.push("projectId");
    if (input.userSelection?.agent) unsupported.push("userSelection.agent");
    if (input.budget?.maxOutputTokens !== undefined) unsupported.push("budget.maxOutputTokens");
  } else if (
    input.budget?.maxWorkers !== undefined ||
    input.budget?.costLimitUsd !== undefined ||
    input.budget?.timeLimitMs !== undefined
  ) {
    unsupported.push("budget.ultraOnly");
  }
  return unsupported;
}

/**
 * Builds a typed entry point over the existing engines. Injection is limited
 * to the engine boundary so tests can prove dispatch without duplicating
 * routing, receipts, gateway calls, or Ultra orchestration.
 */
export function createCortexExecutionRunner(
  dependencies: CortexExecutionDependencies = { runCortexChat, runUltraChat }
): (input: CortexExecutionInput) => Promise<CortexExecutionResult> {
  return async (input) => {
    if (!Array.isArray(input.messages) || !lastUserMessage(input.messages)) {
      return errorResult(input, {
        code: "invalid_input",
        message: "Cortex execution requires a non-empty user message.",
        fields: ["messages"],
      });
    }

    const unsupported = unsupportedInputs(input);
    if (unsupported.length) {
      return errorResult(input, {
        code: "unsupported_input",
        message: `The selected ${input.depth} execution engine does not support: ${unsupported.join(", ")}.`,
        fields: unsupported,
      }, unsupported);
    }

    try {
      if (input.depth === "ultra") {
        const ultra = await dependencies.runUltraChat({
          task: lastUserMessage(input.messages)!,
          maxWorkers: input.budget?.maxWorkers,
          costLimitUsd: input.budget?.costLimitUsd,
          timeLimitMs: input.budget?.timeLimitMs,
        });
        return {
          status: ultra.run.state === "DEGRADED_COMPLETE" ? "degraded" : "completed",
          metadata: {
            ...emptyMetadata(input),
            executedDepth: "ultra",
            executedMode: "ultra",
            verifierStatus: ultra.verifierReports[0]?.status ?? "unavailable",
          },
          output: { kind: "complete", answer: ultra.answer },
          ultra,
        };
      }

      const expectedMode = STANDARD_MODE_BY_DEPTH[input.depth];
      const standard = await dependencies.runCortexChat({
        messages: input.messages,
        sessionId: input.sessionId,
        projectId: input.projectId,
        agent: input.userSelection?.agent,
        selectedMode: expectedMode,
        maxOutputTokens: input.budget?.maxOutputTokens,
      });
      if (standard.effectiveMode !== expectedMode) {
        return errorResult(input, {
          code: "mode_substitution",
          message: `Requested ${input.depth} requires ${expectedMode}, but the engine reported ${standard.effectiveMode}.`,
        });
      }
      return {
        status: standard.receipt.source === "degraded" ? "degraded" : "completed",
        metadata: {
          ...emptyMetadata(input),
          executedDepth: input.depth,
          executedMode: standard.effectiveMode,
          verifierStatus: standard.receipt.verifier.status ?? "unavailable",
        },
        output: { kind: "stream", result: standard.result },
        standard,
      };
    } catch (cause) {
      return errorResult(input, {
        code: "engine_failure",
        message: cause instanceof Error ? cause.message : "Cortex execution engine failed.",
      });
    }
  };
}

/** Default unified server-side Cortex execution entry point. */
export const runCortexExecution = createCortexExecutionRunner();
