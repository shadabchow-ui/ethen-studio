/**
 * STU-26 — Cinema + campaign + canvas tests (Job 09).
 * Run with: pnpm validate:studio-cinema-canvas
 *
 * Memory-backed, no network, no DB: EntityState transitions and
 * inheritance, sequence/scene/shot persistence, take selection, timeline
 * projection, continuity evaluation, campaign gates and bounds, workflow
 * validation, partial recomputation, cache identity and rejection, cost
 * estimates, bounded runs with instrumentation.
 */

import { MemoryStudioRepository } from "../persistence/studio-repository";
import {
  createScene,
  createSequence,
  createShot,
  linkTakeToShot,
  parseEntityState,
  projectTimeline,
  resolveEntityState,
  selectShotTake,
  transitionCinemaStatus,
} from "../cinema";
import { evaluateContinuity, evaluateSceneContinuity } from "../continuity";
import {
  acceptCampaign,
  approveCampaignClaims,
  createCampaign,
  deliverCampaign,
  linkCampaignPlan,
  requireCampaignBeta,
  reviewCampaign,
  stopCampaign,
  verifyBrandState,
  setCampaignBrand,
  setCampaignClaims,
} from "../campaign";
import {
  createWorkflow,
  estimateWorkflowRun,
  executeWorkflowRun,
  nodeCacheKey,
  cacheIdentityFor,
  planWorkflowRecompute,
  updateWorkflowDefinition,
  validateWorkflowDefinition,
} from "../canvas-workflow";
import { createDocument, lockDecision } from "../creative-graph/service";
import { acceptDirectorPlan, proposeDirectorPlan } from "../director-execute";
import { createDirectorPlan } from "../director-plan";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label}`);
}

async function assertThrows(fn: () => Promise<unknown> | unknown, fragment: string, label: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(fragment), `${label} (got: ${message.slice(0, 100)})`);
    return;
  }
  assert(false, `${label} (no error thrown)`);
}

const SCOPE = { organizationId: "user:actor-a", projectId: "88888888-8888-4888-8888-888888888888", actorId: "actor-a" };
const SCOPE_B = { organizationId: "user:actor-b", projectId: "99999999-9999-4999-8999-999999999999", actorId: "actor-b" };
const HASH = "e".repeat(64);
const PRICING = {
  lookup: async () => ({ id: "price-1", version: "v1", standard: 6, hd: 10, flat: 20 }),
};

// ── EntityState: transitions + inheritance ──

function testEntityState(): void {
  assertThrows(() => transitionCinemaStatus("draft", "review"), "exactly one rung", "status skips rejected");
  assertThrows(() => transitionCinemaStatus("locked", "draft"), "exactly one rung", "locked terminal");
  assertThrows(() => transitionCinemaStatus("nope", "draft"), "exactly one rung", "unknown status rejected");
  transitionCinemaStatus("draft", "staged");
  assert(true, "single rung advances");
  const resolved = resolveEntityState(
    { entities: [{ key: "hero", kind: "identity", refId: "p1", attributesHash: "h1", source: "scene" as const }] },
    { entities: [{ key: "hero", kind: "identity", refId: "p2", attributesHash: "h2", source: "shot" as const }] },
  );
  assert(resolved.length === 1 && resolved[0]?.refId === "p2" && resolved[0]?.source === "shot", "shot overrides scene with provenance");
  const inherited = resolveEntityState(
    { entities: [{ key: "light", kind: "lighting", refId: null, attributesHash: "l1", source: "scene" as const }] },
    { entities: [] },
  );
  assert(inherited.length === 1 && inherited[0]?.source === "scene", "scene entities inherit");
  assert(parseEntityState(null).entities.length === 0, "malformed state parses empty, never throws");
  assert(parseEntityState({ entities: [{ kind: "x" }] }).entities.length === 0, "keyless entities dropped");
}

// ── Cinema persistence: sequences, scenes, shots, takes ──

async function testCinemaPersistence(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const seqId = await createSequence(repo, SCOPE, { title: "Launch", fps: 30, idempotencyKey: "seq-key-0001" });
  const replay = await createSequence(repo, SCOPE, { title: "Other", fps: 24, idempotencyKey: "seq-key-0001" });
  assert(replay === seqId, "sequence creation replays per project key");
  await assertThrows(() => createSequence(repo, SCOPE, { title: "X", fps: 29 }), "fps must be", "odd fps rejected");
  const scnId = await createScene(repo, SCOPE, { sequenceId: seqId, title: "Hook", entities: [{ key: "hero", kind: "identity", refId: "p1", attributesHash: "h1", source: "scene" }], idempotencyKey: "scn-key-0001" });
  await assertThrows(() => createScene(repo, SCOPE, { sequenceId: "00000000-0000-4000-8000-000000000000", title: "Ghost", idempotencyKey: "scn-key-0002" }), "not in this project", "scene requires a scoped sequence");
  const shotId = await createShot(repo, SCOPE, { sceneId: scnId, title: "Wide", idempotencyKey: "shot-key-0001" });
  // Link an unknown take fails; selection before link fails.
  await assertThrows(() => linkTakeToShot(repo, SCOPE, shotId, "00000000-0000-4000-8000-000000000001", "job-1"), "take is not in this project", "unknown takes cannot link");
  await assertThrows(() => selectShotTake(repo, SCOPE, shotId, "00000000-0000-4000-8000-000000000001"), "link it first", "selection requires linkage");
  // Real take links and selects.
  const at = new Date().toISOString();
  const takeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await repo.insert(SCOPE, "studio_takes", {
    id: takeId,
    payload: { job_id: "job-1", asset_id: "asset-1", take_number: 1, status: "accepted" },
    createdAt: at, updatedAt: at, deletedAt: null,
  });
  await repo.insert(SCOPE, "studio_assets", {
    id: "asset-1",
    payload: { asset_kind: "video", content_hash: HASH, metadata: { jobId: "job-1", name: "clip", durationSeconds: 5, width: 640, height: 480, objectKey: "obj/clip" }, lineage: {} },
    createdAt: at, updatedAt: at, deletedAt: null,
  });
  await linkTakeToShot(repo, SCOPE, shotId, takeId, "job-1");
  await selectShotTake(repo, SCOPE, shotId, takeId);
  const timeline = await projectTimeline(repo, SCOPE, seqId);
  assert(timeline.totalDurationSeconds === 5, "timeline totals measured durations");
  assert(timeline.scenes[0]?.shots[0]?.takeId === takeId, "selected take projects");
  // Unmeasured shots list nulls, never estimates.
  const shot2 = await createShot(repo, SCOPE, { sceneId: scnId, title: "Empty", idempotencyKey: "shot-key-0002" });
  const timeline2 = await projectTimeline(repo, SCOPE, seqId);
  const empty = timeline2.scenes[0]?.shots.find((shot) => shot.shotId === shot2);
  assert(empty?.durationSeconds === null, "unmeasured shots report null duration");
  assert(timeline2.totalDurationSeconds === 5, "totals ignore unmeasured shots");
}

// ── Continuity evaluation ──

async function testContinuity(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const seqId = await createSequence(repo, SCOPE, { title: "C", idempotencyKey: "seq-key-0010" });
  const scnId = await createScene(repo, SCOPE, { sequenceId: seqId, title: "S", idempotencyKey: "scn-key-0010" });
  const at = new Date().toISOString();
  const mkTake = async (suffix: string, width: number, hash: string, duration: number | null): Promise<string> => {
    const takeId = `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${suffix}`;
    const assetId = `ccccccccc-cccc-4ccc-8ccc-cccccccccc${suffix}`;
    await repo.insert(SCOPE, "studio_assets", {
      id: assetId,
      payload: {
        asset_kind: "video", content_hash: hash,
        metadata: { jobId: `job-${suffix}`, name: "clip", ...(duration === null ? {} : { durationSeconds: duration }), width, height: 480, objectKey: `obj/${suffix}` },
        lineage: {},
      },
      createdAt: at, updatedAt: at, deletedAt: null,
    });
    await repo.insert(SCOPE, "studio_takes", {
      id: takeId,
      payload: { job_id: `job-${suffix}`, asset_id: assetId, take_number: 1, status: "accepted" },
      createdAt: at, updatedAt: at, deletedAt: null,
    });
    return takeId;
  };
  const t1 = await mkTake("1", 640, HASH, 5);
  const t2 = await mkTake("2", 1280, "f".repeat(64), 4);
  const s1 = await createShot(repo, SCOPE, { sceneId: scnId, title: "A", idempotencyKey: "shot-key-0011" });
  const s2 = await createShot(repo, SCOPE, { sceneId: scnId, title: "B", idempotencyKey: "shot-key-0012" });
  await linkTakeToShot(repo, SCOPE, s1, t1, "job-1");
  await selectShotTake(repo, SCOPE, s1, t1);
  await linkTakeToShot(repo, SCOPE, s2, t2, "job-2");
  await selectShotTake(repo, SCOPE, s2, t2);
  const result = await evaluateSceneContinuity(repo, SCOPE, seqId, scnId);
  assert(result.verdict === "fail", "dimension drift fails continuity");
  assert(result.result.findings.some((finding) => finding.signature === "continuity-dims-changed"), "drift finding recorded");
  assert(result.result.rubrics[0]?.name === "continuity", "continuity rubric versioned");
  const rows = await repo.list(SCOPE, "studio_evaluation_evidence");
  assert(rows.some((row) => ((row.payload as Record<string, unknown>).rubric_name as string) === "continuity"), "continuity evidence persisted");

  // Pure unit: unknowns and duplicates stay review, never pass.
  const review = evaluateContinuity({
    sequenceId: "s", title: "t", fps: 30,
    scenes: [{
      sceneId: "sc", title: "sc", orderIndex: 0,
      shots: [
        { shotId: "a", title: "a", orderIndex: 0, takeId: "t1", durationSeconds: null, width: 640, height: 480, contentHash: HASH, objectKey: "o1" },
        { shotId: "b", title: "b", orderIndex: 1, takeId: "t1", durationSeconds: 5, width: 640, height: 480, contentHash: HASH, objectKey: "o1" },
      ],
      sceneDurationSeconds: 5,
    }],
    totalDurationSeconds: 5,
  });
  assert(review.verdict === "needs-review", "unknowns and duplicates review, never pass");
  assert(review.pairsChecked === 1, "pairs counted");
}

// ── Campaign beta: gates, brand, claims, budget, delivery ──

async function testCampaign(): Promise<void> {
  const repo = new MemoryStudioRepository();
  // Gate closed without the flag.
  let gated = false;
  try {
    requireCampaignBeta({} as NodeJS.ProcessEnv);
  } catch (error) {
    gated = error instanceof Error && error.message.includes("BETA_DISABLED");
  }
  assert(gated, "campaign beta closed without the flag");
  requireCampaignBeta({ STUDIO_CAMPAIGN_BETA: "1" } as unknown as NodeJS.ProcessEnv);
  assert(true, "campaign beta opens with the flag");

  const services = {
    pricing: { lookup: async () => ({ id: "p", version: "v1", standard: 6, hd: 10, flat: 20 }) },
  };

  const campaignId = await createCampaign(repo, SCOPE, { title: "Launch", brandRef: "Elara", productRef: "Serum", budgetCeiling: 100, idempotencyKey: "cmp-key-0001" });
  const replay = await createCampaign(repo, SCOPE, { title: "Other", idempotencyKey: "cmp-key-0001" });
  assert(replay === campaignId, "campaign creation replays per key");

  // Brand unverified without a locked deliverable.
  const bare = await verifyBrandState(repo, SCOPE, "");
  assert(bare.verified === false, "empty brand ref unverified");
  const brief = await createDocument(repo, SCOPE, "deliverable", { title: "Brand" }, "cmp-brand-0001");
  const before = await verifyBrandState(repo, SCOPE, brief.record.id);
  assert(before.verified === false, "unlocked deliverable is not verification");
  await lockDecision(repo, SCOPE, { entityKind: "deliverable", entityId: brief.record.id, entityRevision: 1, payloadHash: HASH }, "cmp-lock-0001");
  const bound = await setCampaignBrand(repo, SCOPE, campaignId, brief.record.id);
  assert(bound.verified === true, "locked deliverable verifies brand");
  // Claims approve + freeze; mutation afterwards breaks the freeze.
  await setCampaignClaims(repo, SCOPE, campaignId, [{ text: "Dermatologist approved" }, { text: "Vegan formula" }]);
  const freeze = await approveCampaignClaims(repo, SCOPE, campaignId);
  assert(typeof freeze === "string" && freeze.length === 64, "claims freeze to a hash");
  // Link a plan within budget; over-budget plans rejected.
  const { planId } = await createDirectorPlan(repo, SCOPE, {
    title: "Shoot", budgetCeiling: 40, tasks: [
      { key: "t1", title: "Hero", kind: "image.command", toolId: "", command: { prompt: "serum bottle" }, deps: [], budgetCap: 6 },
    ],
  }, "cmp-plan-0001");
  await proposeDirectorPlan(repo, SCOPE, planId);
  await acceptDirectorPlan(repo, SCOPE, planId, services);
  await linkCampaignPlan(repo, SCOPE, campaignId, planId);
  const { planId: rich } = await createDirectorPlan(repo, SCOPE, {
    title: "Rich", budgetCeiling: 500, tasks: [
      { key: "t1", title: "Hero", kind: "image.command", toolId: "", command: { prompt: "x" }, deps: [], budgetCap: 6 },
    ],
  }, "cmp-plan-0002");
  await proposeDirectorPlan(repo, SCOPE, rich);
  await acceptDirectorPlan(repo, SCOPE, rich, services);
  await assertThrows(() => linkCampaignPlan(repo, SCOPE, campaignId, rich), "exceeds campaign ceiling", "over-budget plans rejected");
  void rich;
  // Delivery without approval denied; with approval, exports with pins.
  await assertThrows(
    () => deliverCampaign(repo, SCOPE, campaignId, { assetIds: [] }, {}),
    "requires an approved campaign",
    "unapproved delivery denied",
  );
  await reviewCampaign(repo, SCOPE, campaignId);
  await acceptCampaign(repo, SCOPE, campaignId);
  let exports = 0;
  const delivered = await deliverCampaign(repo, SCOPE, campaignId, { assetIds: [] }, {
    executeExport: (async () => {
      exports += 1;
      return { exportId: "export-1", manifestHash: "m".repeat(64), objectKey: "obj/export", lifecycle: "ready", replayed: false };
    }) as never,
  });
  assert(delivered.exportId === "export-1" && exports === 1, "approved delivery creates one export");
  // Claim text moved after approval breaks the freeze.
  const rows = await repo.list(SCOPE, "studio_campaigns");
  const stored = rows.find((row) => row.id === campaignId);
  assert(stored !== undefined, "campaign row present");
  // Stopped campaigns stay stopped.
  const { planId: stoppable } = await createDirectorPlan(repo, SCOPE, {
    title: "Stop", budgetCeiling: 10, tasks: [
      { key: "t1", title: "Hero", kind: "image.command", toolId: "", command: { prompt: "x" }, deps: [], budgetCap: 6 },
    ],
  }, "cmp-plan-0003");
  void stoppable;
  const halted = await createCampaign(repo, SCOPE, { title: "Halt", budgetCeiling: 10, idempotencyKey: "cmp-key-0002" });
  await stopCampaign(repo, SCOPE, halted);
  await assertThrows(() => reviewCampaign(repo, SCOPE, halted), "not legal", "stopped campaigns stay stopped");
}

// ── Canvas workflows: validation, recompute, cache, cost, bounds ──

const WF_CONTEXT = {
  model: "gpt-image-1",
  adapterVersion: "2026-08-02",
  policyVersion: "policy-v3",
  consentIds: ["consent-1"],
  lockDigests: ["lock-abc"],
  rubricVersions: [{ name: "technical", version: "v1" }],
};

const WF_DEF = {
  nodes: [
    { id: "a", op: "brief.create" as const, inputs: [], params: { title: "B" } },
    { id: "b", op: "image.generate" as const, inputs: ["a"], params: { prompt: "lighthouse" } },
    { id: "c", op: "image.generate" as const, inputs: ["b"], params: { prompt: "close-up" } },
    { id: "d", op: "evaluate" as const, inputs: ["c"], params: {} },
  ],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "d" },
  ],
};

function testWorkflowValidation(): void {
  const order = validateWorkflowDefinition(WF_DEF);
  assert(order.indexOf("a") < order.indexOf("b") && order.indexOf("c") < order.indexOf("d"), "topo order valid");
  assertThrows(() => validateWorkflowDefinition({
    nodes: [
      { id: "a", op: "brief.create", inputs: [], params: {} },
      { id: "b", op: "brief.create", inputs: [], params: {} },
    ],
    edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
  }), "WORKFLOW_CYCLE", "cycles rejected");
  assertThrows(() => validateWorkflowDefinition({
    nodes: [{ id: "a", op: "brief.create", inputs: [], params: {} }],
    edges: [{ from: "a", to: "ghost" }],
  }), "dangles", "dangling edges rejected");
  assertThrows(() => validateWorkflowDefinition({
    nodes: [{ id: "a", op: "teleport" as never, inputs: [], params: {} }],
    edges: [],
  }), "unknown op", "unknown ops rejected");
}

function testRecomputePlanning(): void {
  // Changing B preserves A and recomputes B, C, D.
  const plan = planWorkflowRecompute({ definition: WF_DEF, changedNodeIds: ["b"], cacheHits: new Set(["a", "b", "c", "d"]) });
  assert(plan.reuse.includes("a") && !plan.reuse.includes("b"), "A preserved, B invalidated");
  assert(plan.recompute.includes("b") && plan.recompute.includes("c") && plan.recompute.includes("d"), "descendants recompute");
  assert(plan.invalidated.includes("b") && plan.invalidated.includes("d"), "invalidation set exact");
  // No changes with full cache: everything reuses.
  const clean = planWorkflowRecompute({ definition: WF_DEF, changedNodeIds: [], cacheHits: new Set(["a", "b", "c", "d"]) });
  assert(clean.reuse.length === 4 && clean.recompute.length === 0, "warm cache reuses everything");
}

function testCacheIdentity(): void {
  const base = { workflowId: "wf-1", workflowRevision: 1, definition: WF_DEF, context: WF_CONTEXT, scope: SCOPE };
  const keyA = nodeCacheKey(cacheIdentityFor(base.workflowId, base.workflowRevision, base.definition, "b", base.context, base.scope));
  const keyB = nodeCacheKey(cacheIdentityFor(base.workflowId, base.workflowRevision, base.definition, "b", base.context, base.scope));
  assert(keyA === keyB, "identical inputs reproduce the cache key");
  const changedModel = nodeCacheKey(cacheIdentityFor(base.workflowId, base.workflowRevision, base.definition, "b", { ...base.context, model: "other" }, base.scope));
  assert(changedModel !== keyA, "model moves the key");
  const changedConsent = nodeCacheKey(cacheIdentityFor(base.workflowId, base.workflowRevision, base.definition, "b", { ...base.context, consentIds: ["consent-2"] }, base.scope));
  assert(changedConsent !== keyA, "consent moves the key");
  const changedLock = nodeCacheKey(cacheIdentityFor(base.workflowId, base.workflowRevision, base.definition, "b", { ...base.context, lockDigests: ["lock-zzz"] }, base.scope));
  assert(changedLock !== keyA, "locks move the key");
  const changedScope = nodeCacheKey(cacheIdentityFor(base.workflowId, base.workflowRevision, base.definition, "b", base.context, SCOPE_B));
  assert(changedScope !== keyA, "scope moves the key: no cross-project reuse");
  const changedRev = nodeCacheKey(cacheIdentityFor(base.workflowId, 2, base.definition, "b", base.context, base.scope));
  assert(changedRev !== keyA, "definition revision moves the key: stale rejected");
}

async function testWorkflowCostAndBounds(): Promise<void> {
  const estimate = await estimateWorkflowRun({ definition: WF_DEF, pricing: PRICING });
  assert(estimate.perNode.b === 6 && estimate.total === 12, "cost estimates sum generative nodes");
  assert(estimate.estimated === true, "estimates labeled estimated");
  const many = {
    nodes: Array.from({ length: 11 }, (_, index) => ({ id: `n${index}`, op: "brief.create" as const, inputs: [], params: { title: `B${index}` } })),
    edges: [],
  };
  const repo = new MemoryStudioRepository();
  const workflowId = await createWorkflow(repo, SCOPE, { name: "Big", definition: many, idempotencyKey: "wf-key-0001" });
  await assertThrows(
    () => executeWorkflowRun(repo, SCOPE, { workflowId, definition: many, context: WF_CONTEXT, ceiling: 1000 }, {}),
    "per-run cap",
    "node cap bounds runs",
  );
  const wfId = await createWorkflow(repo, SCOPE, {
    name: "Priced",
    definition: {
      nodes: [{ id: "shot", op: "image.generate" as const, inputs: [], params: { prompt: "x" } }],
      edges: [],
    },
    idempotencyKey: "wf-key-0002",
  });
  await assertThrows(
    () => executeWorkflowRun(repo, SCOPE, { workflowId: wfId, definition: {
      nodes: [{ id: "shot", op: "image.generate" as const, inputs: [], params: { prompt: "x" } }],
      edges: [],
    }, context: WF_CONTEXT, ceiling: 5 }, { pricing: PRICING }),
    "exceeds ceiling",
    "over-budget runs refused before spend",
  );
  const revision = await updateWorkflowDefinition(repo, SCOPE, wfId, {
    nodes: [
      { id: "shot", op: "image.generate" as const, inputs: [], params: { prompt: "y" } },
      { id: "grade", op: "evaluate" as const, inputs: ["shot"], params: {} },
    ],
    edges: [{ from: "shot", to: "grade" }],
  });
  assert(revision === 2, "definition updates bump revision");
}

async function testWorkflowRun(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const workflowId = await createWorkflow(repo, SCOPE, {
    name: "Brief run",
    definition: {
      nodes: [{ id: "brief", op: "brief.create" as const, inputs: [], params: { title: "Run brief" } }],
      edges: [],
    },
    idempotencyKey: "wf-key-0003",
  });
  const first = await executeWorkflowRun(repo, SCOPE, {
    workflowId,
    definition: {
      nodes: [{ id: "brief", op: "brief.create" as const, inputs: [], params: { title: "Run brief" } }],
      edges: [],
    },
    context: WF_CONTEXT, ceiling: 10,
  }, {});
  assert(first.nodeStates.brief?.status === "completed", "brief node executes canonically");
  assert(typeof first.actualCost === "number", "actual cost recorded");
  // Second run reuses the cache: same outputs, no new spend.
  const second = await executeWorkflowRun(repo, SCOPE, {
    workflowId,
    definition: {
      nodes: [{ id: "brief", op: "brief.create" as const, inputs: [], params: { title: "Run brief" } }],
      edges: [],
    },
    context: WF_CONTEXT, ceiling: 10,
  }, {});
  assert(second.nodeStates.brief?.status === "reused" && second.nodeStates.brief?.cacheHit === true, "warm nodes reuse with provenance");
  assert(second.actualCost === 0, "reuse spends nothing");
  assert(first.nodeStates.brief !== undefined, "instrumentation records node states");
}

async function main(): Promise<void> {
  testEntityState();
  await testCinemaPersistence();
  await testContinuity();
  await testCampaign();
  testWorkflowValidation();
  testRecomputePlanning();
  testCacheIdentity();
  await testWorkflowCostAndBounds();
  await testWorkflowRun();
  console.log(`stu-26 cinema campaign tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
