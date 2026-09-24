/**
 * Studio V2 Job 09 — canvas workflow prototype with dependency-aware
 * incremental recomputation.
 * Workflow definitions reference canonical entities (briefs, assets,
 * takes, evaluations) and execute only canonical Studio commands —
 * never a parallel creative store. Cache identity binds exact inputs,
 * model, adapter, policy, consent, locks, and rubric versions: any move
 * misses honestly, and cross-scope reuse is impossible by construction
 * (cache rows are project-scoped, identity embeds scope + consent).
 */

import { createHash, randomUUID } from "node:crypto";
import type { StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";
import { enqueueWithReservation } from "./command-service";
import type { StudioQuotaPort } from "./durable-quota";
import type { ImageCreditLedger } from "./image-settlement";
import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { validateImageCommand, quoteImageCommand } from "./image-capability";
import { validateVideoCommand, resolveVideoRoute, quoteVideoCommand } from "./video-capability";

export const WORKFLOW_CODE_VERSION = "canvas-workflow-v1" as const;
export const WORKFLOW_MAX_NODES_PER_RUN = 10;

export type WorkflowOpKind = "image.generate" | "video.generate" | "brief.create" | "evaluate" | "export";

export interface WorkflowNodeDef {
  id: string;
  op: WorkflowOpKind;
  /** Upstream node ids whose outputs feed this node. */
  inputs: string[];
  params: Record<string, unknown>;
}

export interface WorkflowEdgeDef {
  from: string;
  to: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdgeDef[];
}

export interface CacheIdentity {
  workflowId: string;
  workflowRevision: number;
  nodeId: string;
  op: WorkflowOpKind;
  inputsHash: string;
  model: string | null;
  adapterVersion: string | null;
  policyVersion: string | null;
  consentIds: string[];
  lockDigests: string[];
  rubricVersions: Array<{ name: string; version: string }>;
  codeVersion: typeof WORKFLOW_CODE_VERSION;
  scope: { organizationId: string; projectId: string };
}

export function nodeCacheKey(identity: CacheIdentity): string {
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Create a workflow with a validated definition. Idempotent per project key. */
export async function createWorkflow(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: { name: string; definition: WorkflowDefinition; idempotencyKey?: string },
): Promise<string> {
  if (!input.name?.trim()) throw new Error("WORKFLOW_INVALID: name is required.");
  validateWorkflowDefinition(input.definition);
  const key = input.idempotencyKey?.trim() || `wf-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new Error("WORKFLOW_INVALID: idempotency key must be 8-128 chars.");
  const existing = (await repo.list(scope, "studio_workflows")).find(
    (row) => ((row.payload as Record<string, unknown>).idempotency_key as string) === key,
  );
  if (existing) return existing.id;
  const id = randomUUID();
  const at = nowIso();
  await repo.insert(scope, "studio_workflows", {
    id,
    payload: {
      name: input.name.trim(), definition: { nodes: input.definition.nodes, edges: input.definition.edges },
      revision: 1, idempotency_key: key,
    },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  return id;
}

/** Replace a definition, bumping the revision (cache identities shift with it). */
export async function updateWorkflowDefinition(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  workflowId: string,
  definition: WorkflowDefinition,
): Promise<number> {
  validateWorkflowDefinition(definition);
  const workflow = await repo.get(scope, "studio_workflows", workflowId);
  if (!workflow) throw new Error("WORKFLOW_NOT_FOUND: no such workflow in this project.");
  const data = workflow.payload as Record<string, unknown>;
  const revision = (typeof data.revision === "number" ? data.revision : 1) + 1;
  await repo.updateIfRevision(scope, "studio_workflows", workflowId, Number(data.revision ?? 1), {
    definition: { nodes: definition.nodes, edges: definition.edges },
  });
  return revision;
}

function payloadOf(row: { payload: unknown }): Record<string, unknown> {
  return row.payload as Record<string, unknown>;
}

/** Validate a definition: node ids unique, edges resolve, acyclic. Pure. */
export function validateWorkflowDefinition(definition: WorkflowDefinition): string[] {
  const ids = new Set<string>();
  for (const node of definition.nodes) {
    if (!node.id?.trim()) throw new Error("WORKFLOW_INVALID: every node needs an id.");
    if (ids.has(node.id)) throw new Error(`WORKFLOW_INVALID: duplicate node ${node.id}.`);
    ids.add(node.id);
    if (!["image.generate", "video.generate", "brief.create", "evaluate", "export"].includes(node.op)) {
      throw new Error(`WORKFLOW_INVALID: unknown op ${node.op}.`);
    }
  }
  for (const edge of definition.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new Error(`WORKFLOW_INVALID: edge ${edge.from} -> ${edge.to} dangles.`);
    }
    if (edge.from === edge.to) throw new Error("WORKFLOW_INVALID: self edge.");
  }
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const node of definition.nodes) outgoing.set(node.id, []);
  for (const edge of definition.edges) outgoing.get(edge.from)?.push(edge.to);
  const visit = (id: string, stack: string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`WORKFLOW_CYCLE: ${[...stack, id].join(" -> ")}.`);
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) visit(next, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const id of ids) visit(id, []);
  return order.reverse();
}

export interface WorkflowContext {
  model: string | null;
  adapterVersion: string | null;
  policyVersion: string | null;
  consentIds: string[];
  lockDigests: string[];
  rubricVersions: Array<{ name: string; version: string }>;
}

export interface RecomputePlan {
  order: string[];
  reuse: string[];
  recompute: string[];
  invalidated: string[];
}

/**
 * Plan an incremental run: nodes whose cache identity still resolves hit;
 * changed nodes and their descendants recompute; everything else reuses
 * preserved outputs. Pure given the cache map.
 */
export function planWorkflowRecompute(input: {
  definition: WorkflowDefinition;
  changedNodeIds: readonly string[];
  cacheHits: ReadonlySet<string>;
}): RecomputePlan {
  const order = validateWorkflowDefinition(input.definition);
  const downstream = new Map<string, Set<string>>();
  for (const node of input.definition.nodes) downstream.set(node.id, new Set());
  for (const edge of input.definition.edges) downstream.get(edge.from)?.add(edge.to);
  const dirty = new Set<string>(input.changedNodeIds);
  const queue = [...input.changedNodeIds];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const next of downstream.get(current) ?? []) {
      if (!dirty.has(next)) {
        dirty.add(next);
        queue.push(next);
      }
    }
  }
  const reuse: string[] = [];
  const recompute: string[] = [];
  for (const id of order) {
    if (dirty.has(id) || !input.cacheHits.has(id)) recompute.push(id);
    else reuse.push(id);
  }
  return { order, reuse, recompute, invalidated: [...dirty] };
}

export interface WorkflowCostEstimate {
  perNode: Record<string, number>;
  total: number;
  estimated: boolean;
}

/** Cost-estimate a run without executing: image/video quotes, briefs free. */
export async function estimateWorkflowRun(input: {
  definition: WorkflowDefinition;
  pricing: { lookup(providerId: string, modelId: string, capability: string): Promise<{ id: string; standard?: number; hd?: number; flat?: number } | null> };
}): Promise<WorkflowCostEstimate> {
  const perNode: Record<string, number> = {};
  for (const node of input.definition.nodes) {
    if (node.op === "image.generate") {
      const pricing = await input.pricing.lookup("openai", "gpt-image-1", "text-to-image");
      const quality = typeof node.params.quality === "string" ? node.params.quality : "standard";
      perNode[node.id] = pricing ? (quality === "hd" ? Number(pricing.hd ?? 10) : Number(pricing.standard ?? 6)) : 6;
    } else if (node.op === "video.generate") {
      const pricing = await input.pricing.lookup("fal", "fal-ai/wan-i2v", "image-to-video");
      perNode[node.id] = pricing ? Number(pricing.flat ?? 20) : 20;
    } else {
      perNode[node.id] = 0;
    }
  }
  return { perNode, total: Object.values(perNode).reduce((sum, cost) => sum + cost, 0), estimated: true };
}

export interface WorkflowRunResult {
  runId: string;
  nodeStates: Record<string, { status: string; outputRefs: Record<string, unknown>; cacheHit: boolean; cost: number }>;
  actualCost: number;
}

export interface WorkflowRunServices {
  ledger?: ImageCreditLedger;
  service?: DurableJobService;
  quota?: StudioQuotaPort;
  pricing?: { lookup(providerId: string, modelId: string, capability: string): Promise<{ id: string; version: string; standard?: number; hd?: number; flat?: number } | null> };
  fetchCache?: (nodeKey: string) => Promise<{ outputRefs: Record<string, unknown> } | null>;
  storeCache?: (nodeKey: string, identity: CacheIdentity, outputRefs: Record<string, unknown>) => Promise<void>;
}

/**
 * Execute a bounded workflow run: recompute set only, node cap enforced,
 * every generative node through canonical commands with its own
 * quote and reservation. Cache hits preserve outputs without re-spend.
 */
export async function executeWorkflowRun(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: {
    workflowId: string;
    definition: WorkflowDefinition;
    context: WorkflowContext;
    ceiling: number;
    changedNodeIds?: readonly string[];
    idempotencyPrefix?: string;
  },
  services: WorkflowRunServices = {},
): Promise<WorkflowRunResult> {
  const order = validateWorkflowDefinition(input.definition);
  if (order.length > WORKFLOW_MAX_NODES_PER_RUN) {
    throw new Error(`WORKFLOW_BOUND: ${order.length} nodes exceed the per-run cap ${WORKFLOW_MAX_NODES_PER_RUN}.`);
  }
  if (!Number.isFinite(input.ceiling) || input.ceiling < 0) {
    throw new Error("WORKFLOW_BUDGET: ceiling must be >= 0.");
  }
  const workflow = await repo.get(scope, "studio_workflows", input.workflowId);
  if (!workflow) throw new Error("WORKFLOW_NOT_FOUND: no such workflow in this project.");
  const workflowRevision = Number(payloadOf(workflow).revision ?? 1);

  const nodeById = new Map(input.definition.nodes.map((node) => [node.id, node]));
  const cacheHits = new Set<string>();
  if (services.fetchCache) {
    for (const id of order) {
      const identity = cacheIdentityFor(input.workflowId, workflowRevision, input.definition, id, input.context, scope);
      const hit = await services.fetchCache(nodeCacheKey(identity)).catch(() => null);
      if (hit) cacheHits.add(id);
    }
  } else {
    const rows = await repo.list(scope, "studio_workflow_cache").catch(() => []);
    for (const id of order) {
      const identity = cacheIdentityFor(input.workflowId, workflowRevision, input.definition, id, input.context, scope);
      const key = nodeCacheKey(identity);
      if (rows.some((row) => ((row.payload as Record<string, unknown>).node_key as string) === key)) cacheHits.add(id);
    }
  }
  const plan = planWorkflowRecompute({ definition: input.definition, changedNodeIds: input.changedNodeIds ?? [], cacheHits });
  const estimate = await estimateWorkflowRun({
    definition: { nodes: input.definition.nodes.filter((node) => plan.recompute.includes(node.id)), edges: [] },
    pricing: services.pricing ?? {
      lookup: async () => ({ id: "estimate", version: "v1", standard: 6, hd: 10, flat: 20 }),
    },
  });
  if (estimate.total > input.ceiling) {
    throw new Error(`WORKFLOW_BUDGET: recompute estimate ${estimate.total} exceeds ceiling ${input.ceiling}.`);
  }

  const runId = randomUUID();
  const startedAt = nowIso();
  await repo.insert(scope, "studio_workflow_runs", {
    id: runId,
    payload: {
      workflow_id: input.workflowId, workflow_revision: workflowRevision, status: "running",
      node_states: {}, cost_estimate: estimate.total, actual_cost: 0,
      started_at: startedAt, finished_at: null,
    },
    createdAt: startedAt,
    updatedAt: startedAt,
    deletedAt: null,
  });

  const nodeStates: WorkflowRunResult["nodeStates"] = {};
  let actualCost = 0;
  const outputs = new Map<string, Record<string, unknown>>();
  try {
    for (const id of plan.order) {
      const node = nodeById.get(id);
      if (!node) continue;
      if (plan.reuse.includes(id)) {
        const outputRefs = await readCachedOutputs(repo, scope, input.workflowId, workflowRevision, input.definition, id, input.context, services);
        nodeStates[id] = { status: "reused", outputRefs, cacheHit: true, cost: 0 };
        outputs.set(id, outputRefs);
        continue;
      }
      const started = Date.now();
      const outputRefs = await executeWorkflowNode(repo, scope, input.workflowId, node, input.definition, outputs, input.context, services);
      const cost = estimate.perNode[id] ?? 0;
      actualCost += cost;
      nodeStates[id] = { status: "completed", outputRefs, cacheHit: false, cost, startedAt: new Date(started).toISOString(), finishedAt: nowIso() } as WorkflowRunResult["nodeStates"][string];
      outputs.set(id, outputRefs);
      await writeCacheEntry(repo, scope, input.workflowId, workflowRevision, input.definition, id, input.context, outputRefs, services);
    }
  } catch (error) {
    await repo.patchSystemRecord(scope, "studio_workflow_runs", runId, { status: "failed", node_states: nodeStates, actual_cost: actualCost, finished_at: nowIso() }).catch(() => null);
    throw error;
  }
  await repo.patchSystemRecord(scope, "studio_workflow_runs", runId, { status: "completed", node_states: nodeStates, actual_cost: actualCost, finished_at: nowIso() }).catch(() => null);
  return { runId, nodeStates, actualCost };
}

export function cacheIdentityFor(
  workflowId: string,
  workflowRevision: number,
  definition: WorkflowDefinition,
  nodeId: string,
  context: WorkflowContext,
  scope: StudioPersistenceScope,
): CacheIdentity {
  const node = definition.nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new Error(`WORKFLOW_INVALID: unknown node ${nodeId}.`);
  const upstream = definition.edges.filter((edge) => edge.to === nodeId).map((edge) => edge.from).sort();
  const model = typeof node.params.model === "string" ? (node.params.model as string) : context.model;
  const adapterVersion = typeof node.params.adapterVersion === "string" ? (node.params.adapterVersion as string) : context.adapterVersion;
  return {
    workflowId,
    workflowRevision,
    nodeId,
    op: node.op,
    inputsHash: createHash("sha256").update(JSON.stringify({ params: node.params ?? {}, upstream })).digest("hex"),
    model,
    adapterVersion,
    policyVersion: context.policyVersion,
    consentIds: [...context.consentIds].sort(),
    lockDigests: [...context.lockDigests].sort(),
    rubricVersions: [...context.rubricVersions].sort((a, b) => a.name.localeCompare(b.name)),
    codeVersion: WORKFLOW_CODE_VERSION,
    scope: { organizationId: scope.organizationId, projectId: scope.projectId },
  };
}

async function readCachedOutputs(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  workflowId: string,
  workflowRevision: number,
  definition: WorkflowDefinition,
  nodeId: string,
  context: WorkflowContext,
  services: WorkflowRunServices,
): Promise<Record<string, unknown>> {
  const key = nodeCacheKey(cacheIdentityFor(workflowId, workflowRevision, definition, nodeId, context, scope));
  if (services.fetchCache) {
    const hit = await services.fetchCache(key).catch(() => null);
    if (hit) return { ...hit.outputRefs };
  }
  const rows = await repo.list(scope, "studio_workflow_cache").catch(() => []);
  const match = rows.find((row) => ((row.payload as Record<string, unknown>).node_key as string) === key);
  if (!match) throw new Error(`WORKFLOW_CACHE_MISS: no entry for ${nodeId}.`);
  return { ...(((match.payload as Record<string, unknown>).output_refs ?? {}) as Record<string, unknown>) };
}

async function writeCacheEntry(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  workflowId: string,
  workflowRevision: number,
  definition: WorkflowDefinition,
  nodeId: string,
  context: WorkflowContext,
  outputRefs: Record<string, unknown>,
  services: WorkflowRunServices,
): Promise<void> {
  const identity = cacheIdentityFor(workflowId, workflowRevision, definition, nodeId, context, scope);
  const key = nodeCacheKey(identity);
  if (services.storeCache) {
    await services.storeCache(key, identity, outputRefs).catch(() => null);
    return;
  }
  const at = nowIso();
  try {
    await repo.insert(scope, "studio_workflow_cache", {
      id: randomUUID(),
      payload: { node_key: key, cache_identity: { ...identity }, output_refs: { ...outputRefs } },
      createdAt: at,
      updatedAt: null,
      deletedAt: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/unique|duplicate|23505|already exists/i.test(message)) throw error;
  }
}

async function executeWorkflowNode(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  workflowId: string,
  node: WorkflowNodeDef,
  definition: WorkflowDefinition,
  outputs: ReadonlyMap<string, Record<string, unknown>>,
  context: WorkflowContext,
  services: WorkflowRunServices,
): Promise<Record<string, unknown>> {
  void definition;
  void context;
  const prefix = `wf-${workflowId.slice(0, 8)}-${node.id}`.slice(0, 60);
  if (node.op === "brief.create") {
    const { createDocument } = await import("./creative-graph/service");
    const created = await createDocument(repo, scope, "brief", {
      title: typeof node.params.title === "string" && node.params.title.trim() ? String(node.params.title) : `Workflow ${node.id}`,
      body: { ...(typeof node.params.body === "object" && node.params.body !== null ? (node.params.body as Record<string, unknown>) : {}), workflowNode: node.id },
    }, `${prefix}-brief`.slice(0, 120));
    return { documentId: created.record.id, replayed: created.replayed };
  }
  if (node.op === "image.generate" || node.op === "video.generate") {
    const isImage = node.op === "image.generate";
    const prompt = typeof node.params.prompt === "string" ? (node.params.prompt as string) : "";
    if (!prompt.trim()) throw new Error(`WORKFLOW_INVALID: node ${node.id} has no prompt.`);
    const normalized = isImage
      ? validateImageCommand({
        prompt, model: typeof node.params.model === "string" ? (node.params.model as string) : undefined,
        size: typeof node.params.size === "string" ? (node.params.size as string) : undefined,
        quality: typeof node.params.quality === "string" ? (node.params.quality as string) : undefined,
      })
      : validateVideoCommand({
        prompt,
        capability: typeof node.params.capability === "string" ? (node.params.capability as string) : "image-to-video",
        referenceUrl: typeof node.params.referenceUrl === "string" ? (node.params.referenceUrl as string) : undefined,
        referenceAssetId: typeof node.params.referenceAssetId === "string" ? (node.params.referenceAssetId as string) : undefined,
        resolution: typeof node.params.resolution === "string" ? (node.params.resolution as string) : undefined,
      });
    const pricing = services.pricing
      ? await services.pricing.lookup(
        isImage ? "openai" : "fal",
        isImage ? "gpt-image-1" : "fal-ai/wan-i2v",
        isImage ? "text-to-image" : "image-to-video",
      )
      : null;
    if (!pricing) throw new Error("WORKFLOW_PRICING: pricing unavailable for node quote.");
    const quote = isImage
      ? quoteImageCommand(normalized as Parameters<typeof quoteImageCommand>[0], {
        id: String(pricing.id), version: String(pricing.version),
        standardCredits: Number(pricing.standard ?? 6), hdCredits: Number(pricing.hd ?? 10),
      })
      : quoteVideoCommand(resolveVideoRoute({ prompt: (normalized as { prompt: string }).prompt, capability: (normalized as { capability: "image-to-video" }).capability }), {
        id: String(pricing.id), version: String(pricing.version), flatCredits: Number(pricing.flat ?? 20),
      });
    const issued = await enqueueWithReservation({
      scope, actorId: scope.actorId, idempotencyKey: `${prefix}-cmd`.slice(0, 120),
      payload: isImage
        ? {
          kind: "openai-image", prompt: (normalized as { prompt: string }).prompt,
          model: (normalized as { model: string }).model, size: (normalized as { size: string }).size,
          quality: (normalized as { quality: string }).quality, actorId: scope.actorId,
          reservationKey: `${prefix}-cmd`.slice(0, 120),
          quotedCredits: quote.credits, pricingVersionId: quote.pricingVersionId,
          receipt: { providerId: "openai", modelId: (normalized as { model: string }).model, capability: "text-to-image" as const },
          workflowNode: node.id,
        }
        : (() => {
          const receipt = resolveVideoRoute({ prompt: (normalized as { prompt: string }).prompt, capability: (normalized as { capability: "image-to-video" }).capability });
          const video = normalized as { prompt: string; referenceUrl: string | null; referenceAssetId: string | null; referenceRole: string; resolution: string };
          return {
            kind: "fal-video", mediaJobId: `media-video-${prefix}-cmd`.slice(0, 120),
            providerId: receipt.providerId, modelId: receipt.modelId, prompt: video.prompt,
            imageUrl: video.referenceUrl ?? "", referenceUrl: video.referenceUrl,
            referenceAssetId: video.referenceAssetId, referenceRole: video.referenceRole,
            resolution: video.resolution, actorId: scope.actorId,
            reservationKey: `${prefix}-cmd`.slice(0, 120),
            quotedCredits: quote.credits, pricingVersionId: quote.pricingVersionId,
            receipt: { ...receipt }, workflowNode: node.id,
          };
        })(),
      quote: { credits: quote.credits, pricingVersionId: quote.pricingVersionId },
      approvedCeiling: quote.credits, ledger: services.ledger, service: services.service, quota: services.quota,
    });
    return { jobId: issued.job.id, status: issued.job.status, replayed: issued.replayed };
  }
  if (node.op === "evaluate") {
    const { evaluateAndRecord } = await import("./evaluation-service");
    const jobId = upstreamJobId(node, outputs) ?? (typeof node.params.jobId === "string" ? (node.params.jobId as string) : "");
    if (!jobId) throw new Error(`WORKFLOW_INVALID: evaluate node ${node.id} has no job.`);
    const recorded = await evaluateAndRecord(repo, scope, {
      jobId, kind: (node.params.kind as "image" | "video" | undefined) ?? "image",
      requested: { size: typeof node.params.size === "string" ? (node.params.size as string) : null },
      request: { ...(typeof node.params.request === "object" && node.params.request !== null ? (node.params.request as Record<string, unknown>) : {}) },
      actual: {
        assetId: typeof node.params.assetId === "string" ? (node.params.assetId as string) : null,
        takeId: typeof node.params.takeId === "string" ? (node.params.takeId as string) : null,
        contentHash: typeof node.params.contentHash === "string" ? (node.params.contentHash as string) : null,
        width: typeof node.params.width === "number" ? (node.params.width as number) : null,
        height: typeof node.params.height === "number" ? (node.params.height as number) : null,
      },
      lockEntityId: typeof node.params.assetId === "string" ? (node.params.assetId as string) : null,
    });
    return { evidenceId: recorded.id, verdict: recorded.verdict };
  }
  if (node.op === "export") {
    const { executeExportJob } = await import("./export-jobs");
    const executed = await executeExportJob(repo, scope, `wf-${workflowId.slice(0, 8)}-${node.id}`.slice(0, 120), {
      preset: typeof node.params.preset === "string" ? (node.params.preset as string) : "handoff-zip",
      assetIds: upstreamAssetIds(node, outputs, paramsAssetIds(node)),
      takeId: typeof node.params.takeId === "string" ? (node.params.takeId as string) : null,
      title: typeof node.params.title === "string" ? (node.params.title as string) : `workflow-${node.id}`,
    });
    return { exportId: executed.exportId, manifestHash: executed.manifestHash };
  }
  throw new Error(`WORKFLOW_INVALID: unhandled op ${(node as { op: string }).op}.`);
}

function upstreamJobId(node: WorkflowNodeDef, outputs: ReadonlyMap<string, Record<string, unknown>>): string | null {
  for (const input of node.inputs) {
    const output = outputs.get(input);
    if (output && typeof output.jobId === "string") return output.jobId as string;
  }
  return null;
}

function paramsAssetIds(node: WorkflowNodeDef): string[] {
  const value = node.params.assetIds;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function upstreamAssetIds(
  node: WorkflowNodeDef,
  outputs: ReadonlyMap<string, Record<string, unknown>>,
  fallback: string[],
): string[] {
  const collected: string[] = [];
  for (const input of node.inputs) {
    const output = outputs.get(input);
    if (output) {
      if (typeof output.assetId === "string") collected.push(output.assetId as string);
      if (Array.isArray(output.assetIds)) {
        for (const entry of output.assetIds as unknown[]) {
          if (typeof entry === "string") collected.push(entry);
        }
      }
    }
  }
  return collected.length > 0 ? collected : fallback;
}
