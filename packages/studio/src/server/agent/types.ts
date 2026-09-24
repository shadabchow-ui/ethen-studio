/**
 * Studio V5 Creative Agent — shared types and errors (STUDIO_17, server-only).
 *
 * Explicit stage machine over Canvas (authority §§13–14): the agent authors
 * typed CanvasPatch operations, never raw DAG or provider calls. Every
 * stage transition, skip, backedge, approval and verification outcome is a
 * recorded event. Tier escalation is human-only; untrusted reference /
 * transcript content can never raise authority.
 */
import "server-only";
import type { ApiErrorCode } from "../../contracts/errors";
import { studioError } from "../../contracts/errors";
import type { ProjectScope } from "../../contracts/scope";
import type { IcuAmount } from "../../contracts/money";
import type { VersionPins } from "../../contracts/versions";
import type { CanvasGraph } from "../../contracts/graph";
import type { PolicyRequest } from "../policy/types";
import type { PolicyEvaluation } from "../policy/decisions";
import type { VersionedQuote } from "../economics/types";
import type { QuoteInput } from "../economics/quotes";
import type { PriceCatalog } from "../economics/pricing";
import type { QuoteRepository } from "../economics/quotes";
import type { GraphValidation } from "../workflow/compiler/validate";

/** Typed agent-layer failure carrying a kernel API error code. */
export class AgentError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    retryable = false,
  ) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toApiError(requestId: string) {
    return studioError(this.code, this.message, requestId, this.retryable, this.details);
  }
}

export function agentError(
  code: ApiErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  retryable = false,
): AgentError {
  return new AgentError(code, message, details, retryable);
}

/** HTTP status projection for AgentError codes (route adapters). */
export const AGENT_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_REVISION: 409,
  QUOTE_EXPIRED: 410,
  APPROVAL_REQUIRED: 403,
  QUOTA_EXCEEDED: 429,
  POLICY_DENIED: 403,
  CONSENT_REQUIRED: 403,
  ENDPOINT_UNAVAILABLE: 503,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/**
 * Explicit agent stages (authority §14). INVESTIGATE is bounded pre-plan
 * exploration; PUBLISH_APPROVAL exists only when publish was requested.
 */
export const AGENT_STAGES = [
  "INVESTIGATE",
  "PLAN",
  "AUTHOR",
  "VALIDATE",
  "ESTIMATE",
  "RESERVE",
  "POLICY_CHECK",
  "APPROVAL",
  "EXECUTE",
  "OBSERVE",
  "VERIFY",
  "PRESENT",
  "PUBLISH_APPROVAL",
] as const;
export type AgentStage = (typeof AGENT_STAGES)[number];

export function isAgentStage(value: string): value is AgentStage {
  return (AGENT_STAGES as readonly string[]).includes(value);
}

/** Terminal run outcomes. BLOCKED = policy/budget/repair bound, human must act. */
export const AGENT_TERMINALS = ["COMPLETED", "PUBLISHED", "STOPPED", "FAILED", "BLOCKED"] as const;
export type AgentTerminal = (typeof AGENT_TERMINALS)[number];

export function isAgentTerminal(value: string): value is AgentTerminal {
  return (AGENT_TERMINALS as readonly string[]).includes(value);
}

/**
 * Visible execution tier. plan-only: investigate/plan/diff, no dispatch.
 * execute: dispatch within the approved envelope. publish: may request
 * public publish (still needs a fresh publish approval or live scoped
 * PublishAuthority). Only a human may raise the tier.
 */
export const EXECUTION_TIERS = ["plan-only", "execute", "publish"] as const;
export type ExecutionTier = (typeof EXECUTION_TIERS)[number];

export function isExecutionTier(value: string): value is ExecutionTier {
  return (EXECUTION_TIERS as readonly string[]).includes(value);
}

export function tierRank(tier: ExecutionTier): number {
  return EXECUTION_TIERS.indexOf(tier);
}

/** Actor raising a tier or granting approval. `isHuman=false` can never raise. */
export interface TierActor {
  actorId: string;
  isHuman: boolean;
}

/** One inspectable plan step. Deps form a DAG over step keys. */
export interface AgentPlanStep {
  key: string;
  title: string;
  /** Canonical `<family>.<verb>` task, Canvas edit, or composition action. */
  action: string;
  deps: readonly string[];
  /** Integer ICU estimate for this step (measured inputs only). */
  estimatedIcu: number;
}

/**
 * Immutable plan revision. Any new revision supersedes prior ones and
 * invalidates approvals pinned to older hashes.
 */
export interface PlanRevision {
  planId: string;
  runId: string;
  scope: ProjectScope;
  revision: number;
  goal: string;
  constraints: readonly string[];
  steps: readonly AgentPlanStep[];
  /** Pinned version tuple this revision was estimated against. */
  pins: VersionPins;
  /** Total integer ICU estimate across steps. */
  estimatedIcu: IcuAmount;
  /** Quote id when an immutable quote backs this revision. */
  quoteId: string | null;
  /** SHA-256 over the canonical plan payload. */
  planHash: string;
  origin: "agent" | "legacy-director";
  /** Legacy Director plan id when origin is legacy-director (read-only link). */
  legacyPlanId: string | null;
  createdAt: string;
}

/** Typed Canvas edit operations. No raw graph replacement, no code nodes. */
export type CanvasPatchOp =
  | { kind: "add-node"; node: CanvasGraph["nodes"][number] }
  | { kind: "remove-node"; nodeId: string }
  | { kind: "set-params"; nodeId: string; params: Record<string, unknown> }
  | { kind: "add-edge"; from: string; fromPort: string; to: string; toPort: string }
  | { kind: "remove-edge"; from: string; fromPort: string; to: string; toPort: string };

/**
 * Typed Canvas patch proposal. Applied to the exact base graph hash, then
 * compiled before execution. The diff summary is shown before execution.
 */
export interface CanvasPatch {
  patchId: string;
  runId: string;
  planRevision: number;
  /** Canonical SHA-256 of the base graph this patch applies to. */
  baseGraphHash: string;
  ops: readonly CanvasPatchOp[];
  /** Canonical SHA-256 of the graph after applying ops. */
  resultingHash: string;
  /** Human-readable per-op diff lines (before → after). */
  diff: readonly string[];
  createdAt: string;
}

export type ApprovalState =
  | "requested"
  | "granted"
  | "denied"
  | "expired"
  | "invalidated";

/**
 * Approval envelope. Pins plan + patch + quote + cost + pins + policy
 * decision + tier. ANY change to plan, pins or cost invalidates it.
 */
export interface ApprovalEnvelope {
  approvalId: string;
  runId: string;
  scope: ProjectScope;
  planRevision: number;
  planHash: string;
  patchHash: string | null;
  quoteId: string | null;
  estimatedIcu: IcuAmount;
  capIcu: IcuAmount;
  pins: VersionPins;
  policyDecisionId: string | null;
  tier: ExecutionTier;
  kind: "execute" | "publish";
  state: ApprovalState;
  requestedBy: string;
  requestedAt: string;
  grantedBy: string | null;
  grantedAt: string | null;
  expiresAt: string;
  staleReason: string | null;
}

/**
 * Bounded pre-plan platform allowance (authority §14, OD-35): at most two
 * planning passes and five tool calls per request under a configured
 * internal cost ceiling. The platform absorbs this; exhaustion presents
 * plan-so-far for user action — never a hidden customer debit.
 */
export interface InvestigationBudget {
  maxPlanningPasses: number;
  maxToolCalls: number;
  /** Platform-absorbed internal ceiling in integer ICU. */
  internalCeilingIcu: IcuAmount;
  planningPassesUsed: number;
  toolCallsUsed: number;
  internalSpentIcu: IcuAmount;
}

export const DEFAULT_INVESTIGATION_BUDGET: Readonly<
  Pick<InvestigationBudget, "maxPlanningPasses" | "maxToolCalls">
> = { maxPlanningPasses: 2, maxToolCalls: 5 };

/** Backedge usage counters (caps enforced by the stage machine). */
export interface BackedgeUsage {
  executeToPlan: number;
  verifyToObserve: number;
  verifyToPlan: number;
}

export const BACKEDGE_CAPS: Readonly<BackedgeUsage> = {
  executeToPlan: 2,
  verifyToObserve: 3,
  verifyToPlan: 3,
};

/** Inspectable verification checklist entry. */
export interface VerifyCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/** Bounded verify→repair accounting. */
export interface VerifyState {
  checks: readonly VerifyCheck[];
  repairsUsed: number;
  maxRepairs: number;
}

export const DEFAULT_MAX_VERIFY_REPAIRS = 2;

/** Agent run head: stage, tier, budget, links. Jobs are linked, never duplicated. */
export interface AgentRun {
  runId: string;
  scope: ProjectScope;
  title: string;
  brief: string;
  stage: AgentStage | AgentTerminal;
  tier: ExecutionTier;
  headRevision: number;
  budget: InvestigationBudget;
  backedges: BackedgeUsage;
  verify: VerifyState;
  /** Linked workflow run / job ids (references into j05/j13, never copies). */
  workflowRunId: string | null;
  jobIds: readonly string[];
  /** Linked workbench timeline / composite campaign for result handoff. */
  workbenchTimelineId: string | null;
  compositeCampaignId: string | null;
  origin: "agent" | "legacy-director";
  legacyPlanId: string | null;
  stoppedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentEventType =
  | "run.created"
  | "stage.advanced"
  | "stage.skipped"
  | "backedge.taken"
  | "tier.raise_requested"
  | "tier.raised"
  | "tier.raise_denied"
  | "plan.revised"
  | "patch.proposed"
  | "budget.exhausted"
  | "approval.requested"
  | "approval.granted"
  | "approval.denied"
  | "approval.invalidated"
  | "execute.dispatched"
  | "verify.recorded"
  | "verify.repair_started"
  | "publish.approved"
  | "publish.denied"
  | "run.stopped"
  | "run.blocked"
  | "run.completed";

/** Append-only agent event. */
export interface AgentEvent {
  runId: string;
  seq: number;
  type: AgentEventType;
  stage: AgentStage | AgentTerminal | null;
  payload: Readonly<Record<string, unknown>>;
  at: string;
}

/** Compiler port: the agent compiles patches, never executes raw graphs. */
export interface AgentCompilerPort {
  validateGraph(graph: CanvasGraph): GraphValidation;
  hashGraph(graph: CanvasGraph): { canonical: string; sha256: string };
}

/** Policy port: policy-before-dispatch on every EXECUTE entry. */
export interface AgentPolicyPort {
  evaluate(request: PolicyRequest): Promise<PolicyEvaluation>;
}

/** Economics port: immutable quotes back plan estimates. */
export interface AgentEconomicsPort {
  catalog: PriceCatalog;
  quotes: QuoteRepository;
  quote(input: QuoteInput): Promise<VersionedQuote>;
}

/** Publish authority port: live scoped authority check + consume. */
export interface AgentPublishPort {
  getAuthority(authorityId: string): Promise<{
    authorityId: string;
    channel: string;
    assetClass: string;
    expiresAt: string;
    maxUses: number | null;
    usedCount: number;
    revokedAt: string | null;
  } | null>;
  consumeAuthority(authorityId: string): Promise<boolean>;
}

/** Accessible labels for stage/tier rendering. */
export function agentStageLabel(stage: AgentStage | AgentTerminal): string {
  const labels: Record<AgentStage | AgentTerminal, string> = {
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
  return labels[stage];
}

export function executionTierLabel(tier: ExecutionTier): string {
  return tier === "plan-only" ? "Plan only" : tier === "execute" ? "Execute" : "Publish";
}
