import "server-only";

/**
 * P05 — fixture-lane agent repository (RC-5 Option A, RC-3 agent).
 *
 * Mirrors the `supabase-agent.ts` row shapes the routes consume, backed
 * by `localStores().agent` (the untouched kernel `MemoryAgentStore`).
 * Routes branch onto these functions only when `isStudioFixtureLane()`
 * holds. Plan/patch/approval/stage validation stays in the kernel
 * (`createPlanRevision` / `proposePatch` / `requestApproval` /
 * `classifyTransition` / `enterExecute`); this lane validates wire
 * input with route parity, stores, and projects rows.
 */
import { asIcu } from "@ethen/studio-core/contracts";
import type { ProjectScope, VersionPins } from "@ethen/studio-core/contracts";
import {
  agentError,
  agentPolicyPortOver,
  assertApprovalUsable,
  checkPublishGate,
  enterExecute,
  isAgentStage,
  isAgentTerminal,
  isExecutionTier,
  raiseTier,
  realAgentCompilerPort,
  tierRank,
  type AgentEvent,
  type AgentPlanStep,
  type AgentRun,
  type ApprovalEnvelope,
  type CanvasPatch,
  type CanvasPatchOp,
  type MemoryAgentStore,
  type PlanRevision,
} from "@ethen/studio-core/server/agent";
import { createMemoryPolicyStore } from "@ethen/studio-core/server/policy";
import type {
  AgentApprovalRow,
  AgentEventRow,
  AgentPatchRow,
  AgentPlanRow,
  AgentRunRow,
} from "./supabase-agent";

/** Minimal scope the lane needs (routes pass their ResolvedScope). */
export interface FixtureScope {
  scope: ProjectScope;
  tenantId: string;
  projectId: string;
}

function scopeKeyOf(scope: FixtureScope): string {
  return `${scope.tenantId}/${scope.scope.workspaceId}/${scope.projectId}`;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

// ------------------------------------------------------------ projections

export function toRunRow(run: AgentRun): AgentRunRow {
  return {
    runId: run.runId,
    title: run.title,
    brief: run.brief,
    stage: run.stage,
    tier: run.tier,
    headRevision: run.headRevision,
    budget: { ...run.budget },
    backedges: { ...run.backedges },
    verify: { ...run.verify },
    workflowRunId: run.workflowRunId,
    jobIds: [...run.jobIds],
    workbenchTimelineId: run.workbenchTimelineId,
    compositeCampaignId: run.compositeCampaignId,
    origin: run.origin,
    legacyPlanId: run.legacyPlanId,
    stoppedBy: run.stoppedBy,
    updatedAt: run.updatedAt,
  };
}

export function toPlanRow(plan: PlanRevision): AgentPlanRow {
  return {
    planId: plan.planId,
    runId: plan.runId,
    revision: plan.revision,
    goal: plan.goal,
    constraints: [...plan.constraints],
    steps: plan.steps.map((step) => ({ ...step, deps: [...step.deps] })),
    pins: { ...plan.pins },
    estimatedIcu: plan.estimatedIcu,
    quoteId: plan.quoteId,
    planHash: plan.planHash,
    createdAt: plan.createdAt,
  };
}

export function toPatchRow(patch: CanvasPatch): AgentPatchRow {
  return {
    patchId: patch.patchId,
    runId: patch.runId,
    planRevision: patch.planRevision,
    baseGraphHash: patch.baseGraphHash,
    ops: patch.ops.map((op) => ({ ...op })),
    resultingHash: patch.resultingHash,
    diff: [...patch.diff],
    createdAt: patch.createdAt,
  };
}

export function toApprovalRow(envelope: ApprovalEnvelope): AgentApprovalRow {
  return {
    approvalId: envelope.approvalId,
    runId: envelope.runId,
    planRevision: envelope.planRevision,
    planHash: envelope.planHash,
    patchHash: envelope.patchHash,
    quoteId: envelope.quoteId,
    estimatedIcu: envelope.estimatedIcu,
    capIcu: envelope.capIcu,
    pins: { ...envelope.pins },
    policyDecisionId: envelope.policyDecisionId,
    tier: envelope.tier,
    kind: envelope.kind,
    state: envelope.state,
    requestedBy: envelope.requestedBy,
    requestedAt: envelope.requestedAt,
    grantedBy: envelope.grantedBy,
    grantedAt: envelope.grantedAt,
    expiresAt: envelope.expiresAt,
    staleReason: envelope.staleReason,
  };
}

export function toEventRow(event: AgentEvent): AgentEventRow {
  return {
    eventId: `${event.runId}:${event.seq}`,
    runId: event.runId,
    seq: event.seq,
    type: event.type,
    stage: event.stage,
    payload: { ...event.payload },
    createdAt: event.at,
  };
}

// ------------------------------------------------------------ wire parsing

/** Route-parity step validation (the kernel DAG check allows empty lists). */
export function parsePlanSteps(value: unknown): AgentPlanStep[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw agentError("BAD_REQUEST", "steps must be a non-empty validated list.");
  }
  const steps: AgentPlanStep[] = [];
  for (const entry of value) {
    const row = entry as Record<string, unknown>;
    const key = asString(row.key);
    const title = asString(row.title);
    const action = asString(row.action);
    const estimatedIcu = typeof row.estimatedIcu === "number" ? row.estimatedIcu : Number(row.estimatedIcu);
    const deps = Array.isArray(row.deps) ? row.deps.filter((d): d is string => typeof d === "string") : null;
    if (!key || !title || !action || deps === null || !Number.isInteger(estimatedIcu) || estimatedIcu < 0) {
      throw agentError("BAD_REQUEST", "steps must be a non-empty validated list.");
    }
    steps.push({ key, title, action, deps, estimatedIcu });
  }
  return steps;
}

/** Route-parity pins validation (all four pins required). */
export function parsePlanPins(value: unknown): VersionPins {
  const pins = (value as Record<string, unknown> | undefined) ?? {};
  const pin = (key: string): string | null => (typeof pins[key] === "string" ? (pins[key] as string) : null);
  const taskSchemaVersion = pin("taskSchemaVersion");
  const endpointSchemaVersion = pin("endpointSchemaVersion");
  const priceVersion = pin("priceVersion");
  const adapterVersion = pin("adapterVersion");
  if (!taskSchemaVersion || !endpointSchemaVersion || !priceVersion || !adapterVersion) {
    throw agentError(
      "BAD_REQUEST",
      "pins.taskSchemaVersion/endpointSchemaVersion/priceVersion/adapterVersion are required.",
    );
  }
  return { taskSchemaVersion, endpointSchemaVersion, priceVersion, adapterVersion };
}

// ------------------------------------------------------------------- runs

export function fixtureListRuns(store: MemoryAgentStore, scope: FixtureScope): AgentRunRow[] {
  return store.listRuns(scope.scope).map(toRunRow);
}

export function fixtureGetRunDetail(
  store: MemoryAgentStore,
  scope: FixtureScope,
  runId: string,
): { run: AgentRunRow; plans: AgentPlanRow[]; patches: AgentPatchRow[]; approvals: AgentApprovalRow[]; events: AgentEventRow[] } {
  const run = store.getRun(scope.scope, runId);
  return {
    run: toRunRow(run),
    plans: store.listPlans(scope.scope, runId).map(toPlanRow),
    patches: store.listPatches(scope.scope, runId).map(toPatchRow),
    approvals: store.listApprovals(scope.scope, runId).map(toApprovalRow),
    events: store.listEvents(scope.scope, runId).map(toEventRow),
  };
}

/**
 * Create a plan-only run (first-write-wins on (scope, idempotencyKey),
 * mirroring the Supabase upsert).
 */
export function fixtureCreateRun(
  store: MemoryAgentStore,
  keys: Map<string, string>,
  scope: FixtureScope,
  input: { title: string; brief: string; internalCeilingIcu: number; idempotencyKey: string; now: string },
): { run: AgentRunRow; replayed: boolean } {
  const slot = `${scopeKeyOf(scope)}/${input.idempotencyKey}`;
  const existingId = keys.get(slot);
  if (existingId) {
    try {
      return { run: toRunRow(store.getRun(scope.scope, existingId)), replayed: true };
    } catch {
      keys.delete(slot);
    }
  }
  const run = store.createRun({
    scope: scope.scope,
    title: input.title,
    brief: input.brief,
    internalCeilingIcu: asIcu(input.internalCeilingIcu),
    now: input.now,
  });
  keys.set(slot, run.runId);
  return { run: toRunRow(run), replayed: false };
}

// ------------------------------------------------------------------ plans

export function fixtureAppendPlan(
  store: MemoryAgentStore,
  scope: FixtureScope,
  input: {
    runId: string;
    goal: string;
    constraints: string[];
    steps: AgentPlanStep[];
    pins: VersionPins;
    quoteId: string | null;
    patch?: { baseGraph: unknown; ops: unknown } | null;
    now: string;
  },
): { plan: AgentPlanRow; patch: AgentPatchRow | null } {
  const plan = store.appendPlanRevision(scope.scope, {
    runId: input.runId,
    goal: input.goal,
    constraints: input.constraints,
    steps: input.steps,
    pins: input.pins,
    quoteId: input.quoteId,
    now: input.now,
  });
  let patch: AgentPatchRow | null = null;
  if (input.patch) {
    const baseGraph = input.patch.baseGraph as { nodes?: unknown; edges?: unknown };
    const ops = input.patch.ops as CanvasPatchOp[] | undefined;
    if (!baseGraph || !Array.isArray(baseGraph.nodes) || !Array.isArray(baseGraph.edges) || !Array.isArray(ops)) {
      throw agentError("BAD_REQUEST", "patch needs baseGraph {nodes, edges} and ops[].");
    }
    const proposed = store.proposeRunPatch(scope.scope, {
      runId: input.runId,
      base: baseGraph as Parameters<typeof store.proposeRunPatch>[1]["base"],
      ops,
      compiler: realAgentCompilerPort,
      now: input.now,
    });
    patch = toPatchRow(proposed);
  }
  return { plan: toPlanRow(plan), patch };
}

// -------------------------------------------------------------- approvals

export function fixtureRequestApproval(
  store: MemoryAgentStore,
  scope: FixtureScope,
  input: { runId: string; kind: "execute" | "publish"; capIcu: number; policyDecisionId: string | null; requestedBy: string; now: string },
): AgentApprovalRow {
  const envelope = store.requestRunApproval(scope.scope, input.runId, {
    kind: input.kind,
    capIcu: asIcu(input.capIcu),
    policyDecisionId: input.policyDecisionId,
    requestedBy: input.requestedBy,
    now: input.now,
  });
  return toApprovalRow(envelope);
}

export function fixtureDecideApproval(
  store: MemoryAgentStore,
  scope: FixtureScope,
  input: { approvalId: string; decision: "granted" | "denied"; actorId: string; now: string },
): AgentApprovalRow {
  const envelope =
    input.decision === "granted"
      ? store.grantRunApproval(scope.scope, input.approvalId, input.actorId, true, input.now)
      : store.denyRunApproval(scope.scope, input.approvalId, input.actorId, true, input.now);
  return toApprovalRow(envelope);
}

// ---------------------------------------------------------------- advance

/** Human-only tier raise (the session actor is the human). */
export function fixtureRaiseTier(
  store: MemoryAgentStore,
  scope: FixtureScope,
  runId: string,
  tier: string,
  actorId: string,
  now: string,
): AgentRunRow {
  if (!isExecutionTier(tier)) throw agentError("BAD_REQUEST", "raiseTier must be plan-only, execute or publish.");
  const run = store.getRun(scope.scope, runId);
  const runShape = { tier: run.tier } as Parameters<typeof raiseTier>[0];
  const next = raiseTier(runShape, tier, { actorId, isHuman: true });
  if (tierRank(next) <= tierRank(run.tier)) {
    throw agentError("BAD_REQUEST", `Tier ${next} is not above the current tier ${run.tier}.`);
  }
  const updated = store.setTier(scope.scope, runId, next, now);
  store.recordEvent(runId, "tier.raised", updated.stage, { from: run.tier, to: next, raisedBy: actorId }, now);
  return toRunRow(updated);
}

/**
 * Stage advance. Entering EXECUTE runs the kernel EXECUTE entry gate
 * (tier + fresh granted approval + policy-before-dispatch over a memory
 * policy store) — advance itself dispatches nothing paid.
 */
export async function fixtureAdvance(
  store: MemoryAgentStore,
  scope: FixtureScope,
  input: { runId: string; to: string; skipReason?: string | null; approvalId?: string | null; actorId: string; now: string },
): Promise<{ run: AgentRunRow; decisionId: string | null }> {
  if (!isAgentStage(input.to) && !isAgentTerminal(input.to)) {
    throw agentError("BAD_REQUEST", "to must be a valid agent stage or terminal.");
  }
  if (input.to === "EXECUTE") {
    if (!input.approvalId) throw agentError("APPROVAL_REQUIRED", "approvalId is required to enter EXECUTE.");
    const approvalId = input.approvalId;
    const envelope = store.getApproval(scope.scope, approvalId);
    const policy = agentPolicyPortOver(createMemoryPolicyStore());
    const { decisionId } = await enterExecute(store, policy, {
      scope: scope.scope,
      runId: input.runId,
      approvalId,
      policyRequest: () => ({
        scope: scope.scope,
        actor: { actorId: input.actorId, roles: ["creator"] },
        task: "agent.invoke",
        action: "generate",
        identityId: null,
        identityVersion: null,
        assetId: null,
        assetVersion: null,
        assetClass: null,
        destination: null,
        contentReview: null,
        spendApproval: { approved: true, approvalId, capIcu: envelope.capIcu },
        now: input.now,
      }),
      now: input.now,
    });
    return { run: toRunRow(store.getRun(scope.scope, input.runId)), decisionId };
  }
  const updated = store.advance(
    scope.scope,
    input.runId,
    input.to as Parameters<typeof store.advance>[2],
    input.now,
    input.skipReason ?? undefined,
  );
  return { run: toRunRow(updated), decisionId: null };
}

/** Visible stop from any live stage (terminals reject, mirroring the route). */
export function fixtureStop(
  store: MemoryAgentStore,
  scope: FixtureScope,
  runId: string,
  actorId: string,
  now: string,
): AgentRunRow {
  const run = store.getRun(scope.scope, runId);
  if (["COMPLETED", "PUBLISHED", "STOPPED", "FAILED", "BLOCKED"].includes(run.stage)) {
    throw agentError("CONFLICT", `Agent run is terminal (${run.stage}); no further transitions.`);
  }
  return toRunRow(store.stop(scope.scope, runId, actorId, now));
}

/**
 * Publish gate over a memory lane with no authorities: a fresh granted
 * publish approval allows (via approval); without one the run keeps its
 * results and the caller gets APPROVAL_REQUIRED (never a false publish).
 */
export async function fixturePublish(
  store: MemoryAgentStore,
  scope: FixtureScope,
  input: { runId: string; channel: string; assetClass: string; approvalId: string | null; now: string },
): Promise<{ run: AgentRunRow; via: string }> {
  let publishApprovalGranted = false;
  if (input.approvalId) {
    const envelope = store.getApproval(scope.scope, input.approvalId);
    if (envelope.runId !== input.runId) throw agentError("BAD_REQUEST", "Approval belongs to a different run.");
    if (envelope.kind !== "publish") throw agentError("BAD_REQUEST", "Approval is not a publish approval.");
    assertApprovalUsable(envelope, store.freshnessWorld(scope.scope, input.runId), input.now);
    publishApprovalGranted = true;
  }
  const gate = await checkPublishGate(
    {
      getAuthority: async () => null,
      consumeAuthority: async () => false,
    },
    { channel: input.channel, assetClass: input.assetClass, authorityId: null, publishApprovalGranted, now: input.now },
  );
  if (!gate.allowed) {
    const run = store.getRun(scope.scope, input.runId);
    store.recordEvent(
      input.runId,
      "publish.denied",
      run.stage,
      { channel: input.channel, assetClass: input.assetClass, reason: gate.reason },
      input.now,
    );
    throw agentError("APPROVAL_REQUIRED", gate.reason);
  }
  const updated = store.advance(scope.scope, input.runId, "PUBLISHED", input.now);
  store.recordEvent(
    input.runId,
    "publish.approved",
    "PUBLISHED",
    { channel: input.channel, assetClass: input.assetClass, via: gate.via, authorityId: gate.authorityId },
    input.now,
  );
  return { run: toRunRow(updated), via: gate.via };
}
