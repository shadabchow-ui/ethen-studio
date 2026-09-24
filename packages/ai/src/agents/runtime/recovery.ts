import type { AgentRunStatus, RuntimeTransitionContext } from "./types";
import { canTransitionRunStatus } from "./state-machine";

export interface RuntimeRecoveryDescriptor {
  targetStatus: "recovering";
  context: RuntimeTransitionContext;
}

export function buildRecoveryContext(
  reason: string,
  metadata?: Record<string, unknown> | null,
  evidence?: Record<string, unknown> | null,
): RuntimeTransitionContext {
  return {
    reason,
    metadata: metadata ?? { recovery: true },
    evidence: evidence ?? null,
  };
}

export function canEnterRecovery(
  fromStatus: AgentRunStatus,
  context?: RuntimeTransitionContext | null,
): boolean {
  return canTransitionRunStatus(fromStatus, "recovering", context).allowed;
}

export function createRecoveryDescriptor(
  reason: string,
  metadata?: Record<string, unknown> | null,
  evidence?: Record<string, unknown> | null,
): RuntimeRecoveryDescriptor {
  return {
    targetStatus: "recovering",
    context: buildRecoveryContext(reason, metadata, evidence),
  };
}
