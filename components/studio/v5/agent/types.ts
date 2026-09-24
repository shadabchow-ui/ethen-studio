/**
 * STUDIO_17 — agent UI types (client-safe: no server imports).
 * Brief/conversation beside plan, Canvas diff, cost, policy findings and
 * approval. The visible execute tier and stop are always present.
 */

export interface AgentRunView {
  runId: string;
  title: string;
  brief: string;
  stage: string;
  tier: string;
  headRevision: number;
  budget: Record<string, unknown>;
  backedges: Record<string, unknown>;
  verify: Record<string, unknown>;
  workflowRunId: string | null;
  jobIds: string[];
  workbenchTimelineId: string | null;
  compositeCampaignId: string | null;
  origin: string;
  legacyPlanId: string | null;
  stoppedBy: string | null;
  updatedAt: string;
}

export interface AgentPlanView {
  planId: string;
  runId: string;
  revision: number;
  goal: string;
  constraints: string[];
  steps: { key: string; title: string; action: string; deps: string[]; estimatedIcu: number }[];
  pins: Record<string, string>;
  estimatedIcu: number;
  quoteId: string | null;
  planHash: string;
  createdAt: string;
}

export interface AgentPatchView {
  patchId: string;
  runId: string;
  planRevision: number;
  baseGraphHash: string;
  ops: { kind: string; [key: string]: unknown }[];
  resultingHash: string;
  diff: string[];
  createdAt: string;
}

export interface AgentApprovalView {
  approvalId: string;
  runId: string;
  planRevision: number;
  planHash: string;
  patchHash: string | null;
  quoteId: string | null;
  estimatedIcu: number;
  capIcu: number;
  pins: Record<string, string>;
  policyDecisionId: string | null;
  tier: string;
  kind: string;
  state: string;
  requestedBy: string;
  requestedAt: string;
  grantedBy: string | null;
  grantedAt: string | null;
  expiresAt: string;
  staleReason: string | null;
}

export interface AgentEventView {
  eventId: string;
  runId: string;
  seq: number;
  type: string;
  stage: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type AgentUiState =
  | { state: "loading" }
  | { state: "setup"; message: string; dependency?: string | null }
  | { state: "empty"; message: string }
  | { state: "error"; message: string }
  | { state: "ready" };

export function agentStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    INVESTIGATE: "Investigating",
    PLAN: "Planning",
    AUTHOR: "Authoring Canvas edits",
    VALIDATE: "Validating",
    ESTIMATE: "Estimating",
    RESERVE: "Reserving",
    POLICY_CHECK: "Policy check",
    APPROVAL: "Waiting for approval",
    EXECUTE: "Executing",
    OBSERVE: "Observing",
    VERIFY: "Verifying",
    PRESENT: "Presenting results",
    PUBLISH_APPROVAL: "Waiting for publish approval",
    COMPLETED: "Completed",
    PUBLISHED: "Published",
    STOPPED: "Stopped",
    FAILED: "Failed",
    BLOCKED: "Blocked — needs you",
  };
  return labels[stage] ?? stage;
}

export function agentTierLabel(tier: string): string {
  return tier === "plan-only" ? "Plan only" : tier === "execute" ? "Execute" : tier === "publish" ? "Publish" : tier;
}
