import { gatewayContentText } from "@ethen/models/gateway/types";
import type { RunUltraChatResult } from "../cortex-ultra/run-ultra-chat";
import { runCortexExecution } from "./execution";
import { runCortexChat, type RunCortexChatParams, type RunCortexChatResult } from "./run-cortex-chat";
import type { EthenMode } from "./types";
import type { GatewayChatMessage } from "@ethen/models/gateway/types";

export const ULTRA_PREVIEW_MODE = "ultra-preview" as const;
const MAX_ULTRA_WORKERS = 2;

export type UnifiedCortexExecution =
  | { kind: "cortex"; result: RunCortexChatResult }
  | { kind: "ultra"; result: RunUltraChatResult; mode: typeof ULTRA_PREVIEW_MODE };

export interface ExecuteCortexChatParams extends RunCortexChatParams {
  ultra?: { costLimitUsd?: number; timeLimitMs?: number };
}

function lastUserMessage(messages: GatewayChatMessage[]): string {
  return gatewayContentText([...messages].reverse().find((message) => message.role === "user")?.content ?? "").trim();
}

/**
 * The single server-side execution entry point for Cortex chat transports.
 * The deprecated Ultra JSON route and the streaming chat route both call this
 * function. Transport adapters may shape output, but never orchestrate runs.
 */
export async function executeCortexChat(params: ExecuteCortexChatParams): Promise<UnifiedCortexExecution> {
  if (params.selectedMode !== ULTRA_PREVIEW_MODE) {
    return { kind: "cortex", result: await runCortexChat(params) };
  }

  const task = lastUserMessage(params.messages);
  if (!task) throw new Error("Ultra Preview requires a non-empty user message.");

  const execution = await runCortexExecution({
    depth: "ultra",
    messages: params.messages,
    budget: {
      maxWorkers: MAX_ULTRA_WORKERS,
      costLimitUsd: params.ultra?.costLimitUsd,
      timeLimitMs: params.ultra?.timeLimitMs,
    },
  });
  if (execution.status === "error") throw new Error(execution.error.message);
  if (!("ultra" in execution)) throw new Error("Ultra Preview execution returned an incompatible result.");

  const result = execution.ultra;
  return { kind: "ultra", result, mode: ULTRA_PREVIEW_MODE };
}

export function isCanonicalCortexMode(value: string): value is EthenMode | "auto" {
  return ["cortex-lite", "cortex", "cortex-pro", ULTRA_PREVIEW_MODE, "code", "research", "writer", "operator", "auto"].includes(value);
}
