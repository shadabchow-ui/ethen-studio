/**
 * Studio V5 Creative Agent — in-memory store + dispatch orchestration (STUDIO_17).
 * Owns run/plan/patch/approval/event records and the EXECUTE entry gate:
 * tier, fresh approval, policy-before-dispatch, then link (never duplicate)
 * the workflow run / job ids. Routes persist the same shapes in SQL.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type { ProjectScope } from "../../contracts/scope";
import { ZERO_ICU, type IcuAmount } from "../../contracts/money";
import { DEFAULT_VERSION_PINS } from "../../contracts/versions";
import type { PolicyRequest } from "../policy/types";
import { classifyTransition, type StageNode } from "./stages";
import { createPlanRevision, type CreatePlanRevisionInput } from "./plans";
import { proposePatch, type ProposePatchInput } from "./patches";
import { assertApprovalUsable, denyApproval, grantApproval, invalidateApproval, requestApproval, type FreshnessWorld } from "./approvals";
import { assertTierAllows } from "./guards";
import {
  DEFAULT_MAX_VERIFY_REPAIRS,
  agentError,
  type AgentCompilerPort,
  type AgentEconomicsPort,
  type AgentEvent,
  type AgentEventType,
  type AgentPolicyPort,
  type AgentRun,
  type AgentStage,
  type AgentTerminal,
  type ApprovalEnvelope,
  type CanvasPatch,
  type ExecutionTier,
  type InvestigationBudget,
  type PlanRevision,
} from "./types";
import { createInvestigationBudget } from "./guards";

function scopeKey(scope: ProjectScope): string {
  return `${scope.tenantId}/${scope.workspaceId}/${scope.projectId}`;
}

function assertScope(recordScope: ProjectScope, scope: ProjectScope, what: string): void {
  if (recordScope.tenantId !== scope.tenantId || recordScope.projectId !== scope.projectId) {
    throw agentError("FORBIDDEN", `${what} is outside the current project scope.`);
  }
}

export interface CreateRunInput {
  scope: ProjectScope;
  title: string;
  brief: string;
  internalCeilingIcu: IcuAmount;
  now: string;
}

export class MemoryAgentStore {
  private readonly runs = new Map<string, AgentRun>();
  private readonly plans = new Map<string, PlanRevision[]>();
  private readonly patches = new Map<string, CanvasPatch[]>();
  private readonly approvals = new Map<string, ApprovalEnvelope>();
  private readonly events = new Map<string, AgentEvent[]>();
  private seq = 0;

  // -- runs ------------------------------------------------------------------

  createRun(input: CreateRunInput): AgentRun {
    if (!input.title.trim()) throw agentError("BAD_REQUEST", "Agent run title is required.");
    if (!input.brief.trim()) throw agentError("BAD_REQUEST", "Agent brief is required.");
    const run: AgentRun = {
      runId: randomUUID(),
      scope: input.scope,
      title: input.title,
      brief: input.brief,
      stage: "INVESTIGATE",
      tier: "plan-only",
      headRevision: 0,
      budget: createInvestigationBudget(input.internalCeilingIcu),
      backedges: { executeToPlan: 0, verifyToObserve: 0, verifyToPlan: 0 },
      verify: { checks: [], repairsUsed: 0, maxRepairs: DEFAULT_MAX_VERIFY_REPAIRS },
      workflowRunId: null,
      jobIds: [],
      workbenchTimelineId: null,
      compositeCampaignId: null,
      origin: "agent",
      legacyPlanId: null,
      stoppedBy: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.runs.set(run.runId, run);
    this.recordEvent(run.runId, "run.created", run.stage, { title: run.title }, input.now);
    return { ...run };
  }

  getRun(scope: ProjectScope, runId: string): AgentRun {
    const run = this.runs.get(runId);
    if (!run) throw agentError("NOT_FOUND", "Agent run was not found.");
    assertScope(run.scope, scope, "Agent run");
    return run;
  }

  listRuns(scope: ProjectScope): AgentRun[] {
    return [...this.runs.values()]
      .filter((r) => scopeKey(r.scope) === scopeKey(scope))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  /** Read-only legacy Director link: history stays in the legacy table. */
  linkLegacyPlan(scope: ProjectScope, runId: string, legacyPlanId: string, now: string): AgentRun {
    const run = this.getRun(scope, runId);
    run.origin = "legacy-director";
    run.legacyPlanId = legacyPlanId;
    run.updatedAt = now;
    return { ...run };
  }

  setTier(scope: ProjectScope, runId: string, tier: ExecutionTier, now: string): AgentRun {
    const run = this.getRun(scope, runId);
    run.tier = tier;
    run.updatedAt = now;
    return { ...run };
  }

  // -- plans -----------------------------------------------------------------

  appendPlanRevision(
    scope: ProjectScope,
    input: Omit<CreatePlanRevisionInput, "revision" | "scope" | "runId"> & { runId: string },
  ): PlanRevision {
    const run = this.getRun(scope, input.runId);
    const revision = createPlanRevision({
      ...input,
      scope: run.scope,
      revision: run.headRevision + 1,
    });
    const list = this.plans.get(run.runId) ?? [];
    list.push(revision);
    this.plans.set(run.runId, list);
    run.headRevision = revision.revision;
    run.updatedAt = input.now;
    // Any new revision invalidates live approvals pinned to older hashes.
    for (const approval of this.approvals.values()) {
      if (approval.runId !== run.runId) continue;
      if (approval.state !== "requested" && approval.state !== "granted") continue;
      if (approval.planRevision !== revision.revision || approval.planHash !== revision.planHash) {
        this.approvals.set(
          approval.approvalId,
          invalidateApproval(approval, `superseded by plan revision ${revision.revision}`),
        );
        this.recordEvent(
          run.runId,
          "approval.invalidated",
          run.stage,
          { approvalId: approval.approvalId, revision: revision.revision },
          input.now,
        );
      }
    }
    this.recordEvent(
      run.runId,
      "plan.revised",
      run.stage,
      { revision: revision.revision, planHash: revision.planHash },
      input.now,
    );
    return revision;
  }

  getPlan(scope: ProjectScope, runId: string, revision: number): PlanRevision {
    this.getRun(scope, runId);
    const found = (this.plans.get(runId) ?? []).find((p) => p.revision === revision);
    if (!found) throw agentError("NOT_FOUND", `Plan revision ${revision} was not found.`);
    return found;
  }

  headPlan(scope: ProjectScope, runId: string): PlanRevision | null {
    const run = this.getRun(scope, runId);
    if (run.headRevision === 0) return null;
    return this.getPlan(scope, runId, run.headRevision);
  }

  listPlans(scope: ProjectScope, runId: string): PlanRevision[] {
    this.getRun(scope, runId);
    return [...(this.plans.get(runId) ?? [])];
  }

  // -- patches ---------------------------------------------------------------

  proposeRunPatch(
    scope: ProjectScope,
    input: Omit<ProposePatchInput, "planRevision"> & { planRevision?: number },
  ): CanvasPatch {
    const run = this.getRun(scope, input.runId);
    const head = this.headPlan(scope, input.runId);
    if (!head) throw agentError("BAD_REQUEST", "A plan revision is required before proposing a Canvas patch.");
    const revision = input.planRevision ?? head.revision;
    if (revision !== head.revision) {
      throw agentError("STALE_REVISION", `Patch targets revision ${revision}; head is ${head.revision}.`);
    }
    const { patch } = proposePatch({ ...input, planRevision: revision });
    const list = this.patches.get(run.runId) ?? [];
    list.push(patch);
    this.patches.set(run.runId, list);
    run.updatedAt = input.now;
    this.recordEvent(
      run.runId,
      "patch.proposed",
      run.stage,
      { patchId: patch.patchId, ops: patch.ops.length, resultingHash: patch.resultingHash },
      input.now,
    );
    return patch;
  }

  listPatches(scope: ProjectScope, runId: string): CanvasPatch[] {
    this.getRun(scope, runId);
    return [...(this.patches.get(runId) ?? [])];
  }

  headPatch(scope: ProjectScope, runId: string): CanvasPatch | null {
    const list = this.listPatches(scope, runId);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  // -- approvals --------------------------------------------------------------

  requestRunApproval(
    scope: ProjectScope,
    runId: string,
    input: {
      kind: "execute" | "publish";
      capIcu: IcuAmount;
      policyDecisionId: string | null;
      requestedBy: string;
      now: string;
    },
  ): ApprovalEnvelope {
    const run = this.getRun(scope, runId);
    const head = this.headPlan(scope, runId);
    if (!head) throw agentError("BAD_REQUEST", "A plan revision is required before requesting approval.");
    const patch = this.headPatch(scope, runId);
    const envelope = requestApproval({
      runId: run.runId,
      scope: run.scope,
      planRevision: head.revision,
      planHash: head.planHash,
      patchHash: patch ? patch.resultingHash : null,
      quoteId: head.quoteId,
      estimatedIcu: head.estimatedIcu,
      capIcu: input.capIcu,
      pins: head.pins,
      policyDecisionId: input.policyDecisionId,
      tier: run.tier,
      kind: input.kind,
      requestedBy: input.requestedBy,
      now: input.now,
    });
    this.approvals.set(envelope.approvalId, envelope);
    run.updatedAt = input.now;
    this.recordEvent(
      run.runId,
      "approval.requested",
      run.stage,
      { approvalId: envelope.approvalId, kind: envelope.kind, capIcu: envelope.capIcu },
      input.now,
    );
    return { ...envelope };
  }

  getApproval(scope: ProjectScope, approvalId: string): ApprovalEnvelope {
    const envelope = this.approvals.get(approvalId);
    if (!envelope) throw agentError("NOT_FOUND", "Approval was not found.");
    assertScope(envelope.scope, scope, "Approval");
    return envelope;
  }

  listApprovals(scope: ProjectScope, runId: string): ApprovalEnvelope[] {
    this.getRun(scope, runId);
    return [...this.approvals.values()].filter((a) => a.runId === runId);
  }

  grantRunApproval(
    scope: ProjectScope,
    approvalId: string,
    grantedBy: string,
    isHuman: boolean,
    now: string,
  ): ApprovalEnvelope {
    const envelope = this.getApproval(scope, approvalId);
    const world = this.freshnessWorld(scope, envelope.runId);
    const next = grantApproval(envelope, world, grantedBy, isHuman, now);
    this.approvals.set(approvalId, next);
    const run = this.getRun(scope, envelope.runId);
    run.updatedAt = now;
    this.recordEvent(
      run.runId,
      next.state === "granted" ? "approval.granted" : "approval.invalidated",
      run.stage,
      { approvalId, state: next.state, staleReason: next.staleReason },
      now,
    );
    return { ...next };
  }

  denyRunApproval(scope: ProjectScope, approvalId: string, deniedBy: string, isHuman: boolean, now: string): ApprovalEnvelope {
    const envelope = this.getApproval(scope, approvalId);
    const next = denyApproval(envelope, deniedBy, isHuman);
    this.approvals.set(approvalId, next);
    const stored = this.getRun(scope, envelope.runId);
    stored.updatedAt = now;
    this.recordEvent(stored.runId, "approval.denied", stored.stage, { approvalId }, now);
    return { ...next };
  }

  /** Live world for freshness comparisons (head plan + head patch). */
  freshnessWorld(scope: ProjectScope, runId: string): FreshnessWorld {
    const head = this.headPlan(scope, runId);
    const patch = this.headPatch(scope, runId);
    return {
      planHash: head?.planHash ?? "",
      patchHash: patch ? patch.resultingHash : null,
      quoteId: head?.quoteId ?? null,
      estimatedIcu: head?.estimatedIcu ?? ZERO_ICU,
      pins: head?.pins ?? { ...DEFAULT_VERSION_PINS },
    };
  }

  // -- stages -----------------------------------------------------------------

  advance(
    scope: ProjectScope,
    runId: string,
    to: StageNode,
    now: string,
    skipReason?: string,
  ): AgentRun {
    const run = this.getRun(scope, runId);
    const outcome = classifyTransition({ from: run.stage, to, backedges: run.backedges, skipReason });
    if (outcome.counter) run.backedges[outcome.counter] += 1;
    const from = run.stage;
    run.stage = to;
    run.updatedAt = now;
    this.recordEvent(
      run.runId,
      outcome.kind === "backedge" ? "backedge.taken" : outcome.kind === "skip" ? "stage.skipped" : "stage.advanced",
      to,
      { from, to, skipReason: skipReason ?? null },
      now,
    );
    return { ...run };
  }

  stop(scope: ProjectScope, runId: string, stoppedBy: string, now: string): AgentRun {
    this.advance(scope, runId, "STOPPED", now);
    const stored = this.getRun(scope, runId);
    stored.stoppedBy = stoppedBy;
    this.recordEvent(runId, "run.stopped", "STOPPED", { stoppedBy }, now);
    return { ...stored };
  }

  linkExecution(
    scope: ProjectScope,
    runId: string,
    links: { workflowRunId?: string | null; jobIds?: readonly string[]; workbenchTimelineId?: string | null; compositeCampaignId?: string | null },
    now: string,
  ): AgentRun {
    const run = this.getRun(scope, runId);
    if (links.workflowRunId !== undefined) run.workflowRunId = links.workflowRunId;
    if (links.jobIds !== undefined) run.jobIds = [...links.jobIds];
    if (links.workbenchTimelineId !== undefined) run.workbenchTimelineId = links.workbenchTimelineId;
    if (links.compositeCampaignId !== undefined) run.compositeCampaignId = links.compositeCampaignId;
    run.updatedAt = now;
    return { ...run };
  }

  // -- events ------------------------------------------------------------------

  recordEvent(runId: string, type: AgentEventType, stage: StageNode | null, payload: Record<string, unknown>, at: string): AgentEvent {
    const event: AgentEvent = { runId, seq: (this.seq += 1), type, stage, payload, at };
    const list = this.events.get(runId) ?? [];
    list.push(event);
    this.events.set(runId, list);
    return event;
  }

  listEvents(scope: ProjectScope, runId: string): AgentEvent[] {
    this.getRun(scope, runId);
    return [...(this.events.get(runId) ?? [])];
  }

  readBudget(scope: ProjectScope, runId: string): InvestigationBudget {
    return { ...this.getRun(scope, runId).budget };
  }
}

export function createMemoryAgentStore(): MemoryAgentStore {
  return new MemoryAgentStore();
}

export interface ExecuteEntryInput {
  scope: ProjectScope;
  runId: string;
  approvalId: string;
  /** Fresh policy request bound to the current plan/patch/quote. */
  policyRequest: (world: FreshnessWorld) => PolicyRequest;
  now: string;
}

/**
 * EXECUTE entry gate: plan-only tier can never dispatch; the approval must
 * be granted + live + fresh; policy is evaluated immediately before
 * dispatch and a denial blocks the run. Returns the policy decision id
 * the dispatch was authorized under.
 */
export async function enterExecute(
  store: MemoryAgentStore,
  policy: AgentPolicyPort,
  input: ExecuteEntryInput,
): Promise<{ decisionId: string }> {
  const run = store.getRun(input.scope, input.runId);
  assertTierAllows(run, "execute", "Dispatch");
  const envelope = store.getApproval(input.scope, input.approvalId);
  if (envelope.runId !== run.runId) {
    throw agentError("BAD_REQUEST", "Approval belongs to a different run.");
  }
  const world = store.freshnessWorld(input.scope, input.runId);
  assertApprovalUsable(envelope, world, input.now);
  const evaluation = await policy.evaluate(input.policyRequest(world));
  if (!evaluation.decision.allowed) {
    store.advance(input.scope, input.runId, "BLOCKED", input.now);
    store.recordEvent(
      input.runId,
      "run.blocked",
      "BLOCKED",
      {
        reasonCode: evaluation.reasonCode,
        remediation: evaluation.decision.remediation,
        decisionId: evaluation.decision.decisionId,
      },
      input.now,
    );
    throw agentError("POLICY_DENIED", `Dispatch blocked by policy: ${evaluation.reasonCode}.`, {
      decisionId: evaluation.decision.decisionId,
      reasonCode: evaluation.reasonCode,
    });
  }
  store.advance(input.scope, input.runId, "EXECUTE", input.now);
  store.recordEvent(
    input.runId,
    "execute.dispatched",
    "EXECUTE",
    { approvalId: envelope.approvalId, decisionId: evaluation.decision.decisionId },
    input.now,
  );
  return { decisionId: evaluation.decision.decisionId };
}

export type { AgentCompilerPort, AgentEconomicsPort, AgentPolicyPort, AgentRun, AgentStage, AgentTerminal };
