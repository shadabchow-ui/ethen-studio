/**
 * Studio V2 Job 06 — bounded director executor.
 * Plans are proposed/accepted/rejected/stopped by accountable actors;
 * tasks execute only through canonical Studio command services with frozen
 * envelopes, per-task budgets, idempotent invocation, and evidence-backed
 * completion. Agent prose can never complete work: completion requires
 * recorded evidence. Undo compensates where valid and records where not.
 */

import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { createPlatformJobRepository } from "@ethen/ai/platform/jobs/factory";
import { createServiceClient } from "@ethen/database/service";
import type { StudioPersistenceRecord, StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";
import { createDocument, lockDecision, updateDocument } from "./creative-graph/service";
import { enqueueWithReservation } from "./command-service";
import { SupabaseStudioQuotaService, tryReleaseQuota, type StudioQuotaPort } from "./durable-quota";
import { SupabaseImageCreditLedger, type ImageCreditLedger } from "./image-settlement";
import { admitImageQuote, quoteImageCommand, validateImageCommand } from "./image-capability";
import { admitVideoQuote, quoteVideoCommand, resolveVideoRoute, validateVideoCommand } from "./video-capability";
import { resolveDirectorContext, screenDirectorMaterial, snapshotDirectorContext } from "./director-context";
import {
  planStatusOf,
  readDirectorPlan,
  taskStatusOf,
  transitionPlanStatus,
  transitionTaskStatus,
  validateTaskDag,
  type DirectorTaskStatus,
  type FrozenEnvelope,
} from "./director-plan";
import { evaluateAndRecord } from "./evaluation-service";

export const PLAN_ACCEPT_TTL_MS = 30 * 60 * 1000;
export const ADVANCE_TASK_CAP = 10;

function nowIso(): string {
  return new Date().toISOString();
}

function payloadOf(row: StudioPersistenceRecord): Record<string, unknown> {
  return row.payload as Record<string, unknown>;
}

function revisionOf(row: StudioPersistenceRecord): number {
  const revision = payloadOf(row).revision;
  return typeof revision === "number" ? revision : 1;
}

export interface DirectorServices {
  ledger?: ImageCreditLedger;
  service?: DurableJobService;
  quota?: StudioQuotaPort;
  observer?: JobObserver;
  pricing?: PricingLookup;
}

export interface PricingRow {
  id: string;
  version: string;
  standard?: number;
  hd?: number;
  flat?: number;
}

export interface PricingLookup {
  lookup(providerId: string, modelId: string, capability: string): Promise<PricingRow | null>;
}

export interface ObservedJob {
  status: string;
  terminal: boolean;
  completed: boolean;
  outputs: number;
  settledCredits: number;
}

/** Minimal job observation for completion evidence (default: durable service + ledger). */
export interface JobObserver {
  readJob(jobId: string): Promise<ObservedJob | null>;
}

function defaultObserver(scope: StudioPersistenceScope, services: DirectorServices, repo: StudioRepository): JobObserver {
  if (services.observer) return services.observer;
  const service = services.service ?? new DurableJobService({ repository: createPlatformJobRepository() });
  const ledger = services.ledger ?? new SupabaseImageCreditLedger();
  return {
    readJob: async (jobId: string) => {
      const job = await service.getJob({ projectId: scope.projectId }, jobId).catch(() => null);
      if (!job || job.projectId !== scope.projectId) return null;
      const terminal = ["completed", "failed", "cancelled", "dead_letter", "timed_out", "indeterminate", "escalated", "halt_unsafe"].includes(job.status);
      const payload = job.payload as Record<string, unknown>;
      const key = typeof payload.reservationKey === "string" ? payload.reservationKey : null;
      const reservation = key ? await ledger.get(scope.projectId, key).catch(() => null) : null;
      const outputs = await findTaskOutputs(repo, scope, jobId).catch(() => 0);
      return {
        status: job.status, terminal, completed: job.status === "completed",
        outputs, settledCredits: reservation?.settledCredits ?? 0,
      };
    },
  };
}

async function recordAction(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: { planId: string; taskId: string | null; kind: string; status: string; input: Record<string, unknown>; output?: Record<string, unknown>; evidence?: Record<string, unknown> },
): Promise<string> {
  const id = randomUUID();
  await repo.insert(scope, "studio_director_actions", {
    id,
    payload: {
      plan_id: input.planId, task_id: input.taskId, kind: input.kind,
      // actor_id binds the column where present; `actor` survives payload
      // reservation on every adapter so attribution is always readable.
      actor_id: scope.actorId, actor: scope.actorId,
      status: input.status,
      input_hash: createHash("sha256").update(JSON.stringify(input.input ?? {})).digest("hex"),
      input: input.input, output: input.output ?? {}, evidence: input.evidence ?? {},
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
  });
  return id;
}

async function lookupPricing(providerId: string, modelId: string, capability: string, services?: DirectorServices): Promise<PricingRow | null> {
  if (services?.pricing) return services.pricing.lookup(providerId, modelId, capability);
  const client = createServiceClient();
  if (!client) return null;
  const { data, error } = await client.from("studio_pricing_versions")
    .select("id,version,pricing_input")
    .eq("organization_id", "global").eq("provider_id", providerId).eq("model_id", modelId)
    .eq("capability", capability).eq("version", "v1").is("retired_at", null).maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; version: string; pricing_input: Record<string, number> };
  return { id: String(row.id), version: String(row.version), ...row.pricing_input };
}

// ── Plan lifecycle ──────────────────────────────────────────────────────

export async function proposeDirectorPlan(repo: StudioRepository, scope: StudioPersistenceScope, planId: string): Promise<void> {
  const { plan, tasks } = await readDirectorPlan(repo, scope, planId);
  if (planStatusOf(plan) !== "draft") throw new Error("DIRECTOR_PLAN_TRANSITION: only draft plans can be proposed.");
  validateTaskDag(tasks.map((task) => {
    const data = payloadOf(task);
    return { key: String(data.task_key), deps: (data.deps ?? []) as string[] };
  }));
  transitionPlanStatus("draft", "proposed");
  await repo.updateIfRevision(scope, "studio_director_plans", planId, revisionOf(plan), { status: "proposed" });
  for (const task of tasks) {
    await repo.updateIfRevision(scope, "studio_director_tasks", task.id, revisionOf(task), { status: "proposed" });
  }
  await recordAction(repo, scope, { planId, taskId: null, kind: "plan.propose", status: "applied", input: { planId } });
}

export async function acceptDirectorPlan(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  planId: string,
  services: DirectorServices = {},
  ttlMs: number = PLAN_ACCEPT_TTL_MS,
): Promise<FrozenEnvelope> {
  const { plan, tasks } = await readDirectorPlan(repo, scope, planId);
  if (planStatusOf(plan) !== "proposed") throw new Error("DIRECTOR_PLAN_TRANSITION: only proposed plans can be accepted.");
  const data = payloadOf(plan);
  const snapshot = await snapshotDirectorContext(repo, scope);
  // Freeze per-task quotes so dispatch executes as quoted or blocks.
  const taskQuotes: Record<string, number> = {};
  for (const task of tasks) {
    const taskData = payloadOf(task);
    const kind = String(taskData.kind ?? "");
    const command = (taskData.command ?? {}) as Record<string, unknown>;
    if (kind === "image.command") {
      const pricing = await lookupPricing("openai", "gpt-image-1", "text-to-image", services);
      if (!pricing) throw new Error("DIRECTOR_ACCEPT_BLOCKED: image pricing unavailable.");
      const normalized = validateImageCommand({
        prompt: typeof command.prompt === "string" ? command.prompt : "",
        model: typeof command.model === "string" ? command.model : undefined,
        size: typeof command.size === "string" ? command.size : undefined,
        quality: typeof command.quality === "string" ? command.quality : undefined,
      });
      const quote = quoteImageCommand(normalized, {
        id: String(pricing.id), version: String(pricing.version),
        standardCredits: Number(pricing.standard ?? 6), hdCredits: Number(pricing.hd ?? 10),
      });
      admitImageQuote(quote, Number(taskData.budget_cap ?? 0) || quote.credits);
      taskQuotes[String(taskData.task_key)] = quote.credits;
    } else if (kind === "video.command") {
      const pricing = await lookupPricing("fal", "fal-ai/wan-i2v", "image-to-video", services);
      if (!pricing) throw new Error("DIRECTOR_ACCEPT_BLOCKED: video pricing unavailable.");
      const normalized = validateVideoCommand({
        prompt: typeof command.prompt === "string" ? command.prompt : "",
        capability: typeof command.capability === "string" ? command.capability : "image-to-video",
        referenceUrl: typeof command.referenceUrl === "string" ? command.referenceUrl : undefined,
        referenceAssetId: typeof command.referenceAssetId === "string" ? command.referenceAssetId : undefined,
        referenceRole: typeof command.referenceRole === "string" ? command.referenceRole : undefined,
        resolution: typeof command.resolution === "string" ? command.resolution : undefined,
      });
      const receipt = resolveVideoRoute({ prompt: normalized.prompt, capability: normalized.capability });
      const quote = quoteVideoCommand(receipt, { id: String(pricing.id), version: String(pricing.version), flatCredits: Number(pricing.flat ?? 20) });
      admitVideoQuote(quote, Number(taskData.budget_cap ?? 0) || quote.credits);
      taskQuotes[String(taskData.task_key)] = quote.credits;
    }
  }
  const acceptedAt = nowIso();
  const frozen: FrozenEnvelope = {
    docRevisions: snapshot.docRevisions,
    lockDigests: snapshot.lockDigests,
    consentIds: snapshot.consentIds,
    budgetCeiling: Number(data.budget_ceiling ?? 0),
    spentBaseline: snapshot.spentCredits,
    tools: [...((data.tools ?? []) as string[])],
    models: [...((data.models ?? []) as string[])],
    rubricVersions: [
      { name: "technical", version: "v1" },
      { name: "preservation", version: "v1" },
      { name: "subjective", version: "v1" },
    ],
    taskQuotes,
    acceptedBy: scope.actorId,
    acceptedAt,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  };
  transitionPlanStatus("proposed", "accepted");
  await repo.updateIfRevision(scope, "studio_director_plans", planId, revisionOf(plan), {
    status: "accepted", frozen_envelope: frozen,
    accepted_by: scope.actorId, accepted_at: acceptedAt, acceptance_expires_at: frozen.expiresAt,
  });
  await recordAction(repo, scope, { planId, taskId: null, kind: "plan.accept", status: "applied", input: { planId, frozen }, evidence: { acceptedBy: scope.actorId } });
  return frozen;
}

export async function rejectDirectorPlan(repo: StudioRepository, scope: StudioPersistenceScope, planId: string): Promise<void> {
  const { plan } = await readDirectorPlan(repo, scope, planId);
  transitionPlanStatus(planStatusOf(plan), "rejected");
  await repo.updateIfRevision(scope, "studio_director_plans", planId, revisionOf(plan), { status: "rejected" });
  await recordAction(repo, scope, { planId, taskId: null, kind: "plan.reject", status: "applied", input: { planId } });
}

/** Stop a plan: revokes dispatch authority. Further executes are denied. */
export async function stopDirectorPlan(repo: StudioRepository, scope: StudioPersistenceScope, planId: string): Promise<void> {
  const { plan, tasks } = await readDirectorPlan(repo, scope, planId);
  transitionPlanStatus(planStatusOf(plan), "stopped");
  await repo.updateIfRevision(scope, "studio_director_plans", planId, revisionOf(plan), { status: "stopped" });
  for (const task of tasks) {
    const status = taskStatusOf(task);
    if (["pending", "blocked", "proposed", "accepted", "failed"].includes(status)) {
      transitionTaskStatus(status, "stopped");
      await repo.updateIfRevision(scope, "studio_director_tasks", task.id, revisionOf(task), { status: "stopped" });
    }
  }
  await recordAction(repo, scope, { planId, taskId: null, kind: "plan.stop", status: "applied", input: { planId } });
}

function frozenOf(plan: StudioPersistenceRecord): FrozenEnvelope | null {
  const envelope = payloadOf(plan).frozen_envelope as FrozenEnvelope | null;
  return envelope && typeof envelope === "object" ? envelope : null;
}

/** Acceptance must be live: expiry or revocation blocks every dispatch. */
export function assertAcceptanceLive(plan: StudioPersistenceRecord, nowMs: number = Date.now()): FrozenEnvelope {
  const status = planStatusOf(plan);
  if (status !== "accepted" && status !== "running") {
    throw new Error(`DIRECTOR_ACCEPTANCE: plan is ${status}; dispatch requires an accepted plan.`);
  }
  const frozen = frozenOf(plan);
  if (!frozen) throw new Error("DIRECTOR_ACCEPTANCE: plan has no frozen envelope.");
  if (Date.parse(frozen.expiresAt) <= nowMs) {
    throw new Error("DIRECTOR_ACCEPTANCE_EXPIRED: plan acceptance expired; re-accept to continue.");
  }
  return frozen;
}

// ── Task lifecycle ──────────────────────────────────────────────────────

export async function acceptDirectorTask(repo: StudioRepository, scope: StudioPersistenceScope, planId: string, taskKey: string): Promise<void> {
  const { plan, tasks } = await readDirectorPlan(repo, scope, planId);
  assertAcceptanceLive(plan);
  const task = tasks.find((entry) => String(payloadOf(entry).task_key) === taskKey);
  if (!task) throw new Error(`DIRECTOR_NOT_FOUND: no task ${taskKey} in plan.`);
  const status = taskStatusOf(task);
  if (status === "accepted") return;
  transitionTaskStatus(status, "accepted");
  await repo.updateIfRevision(scope, "studio_director_tasks", task.id, revisionOf(task), { status: "accepted" });
  await recordAction(repo, scope, { planId, taskId: task.id, kind: "task.accept", status: "applied", input: { taskKey } });
}

interface TaskAccounts {
  quote: number;
  pricingVersionId: string;
}

async function quoteTask(kind: string, command: Record<string, unknown>, services: DirectorServices): Promise<TaskAccounts> {
  if (kind === "image.command") {
    const pricing = await lookupPricing("openai", "gpt-image-1", "text-to-image", services);
    if (!pricing) throw new Error("DIRECTOR_QUOTE_UNAVAILABLE: image pricing unavailable.");
    const normalized = validateImageCommand({
      prompt: typeof command.prompt === "string" ? command.prompt : "",
      model: typeof command.model === "string" ? command.model : undefined,
      size: typeof command.size === "string" ? command.size : undefined,
      quality: typeof command.quality === "string" ? command.quality : undefined,
    });
    const quote = quoteImageCommand(normalized, {
      id: String(pricing.id), version: String(pricing.version),
      standardCredits: Number(pricing.standard ?? 6), hdCredits: Number(pricing.hd ?? 10),
    });
    return { quote: quote.credits, pricingVersionId: quote.pricingVersionId };
  }
  if (kind === "video.command") {
    const pricing = await lookupPricing("fal", "fal-ai/wan-i2v", "image-to-video", services);
    if (!pricing) throw new Error("DIRECTOR_QUOTE_UNAVAILABLE: video pricing unavailable.");
    const normalized = validateVideoCommand({
      prompt: typeof command.prompt === "string" ? command.prompt : "",
      capability: typeof command.capability === "string" ? command.capability : "image-to-video",
      referenceUrl: typeof command.referenceUrl === "string" ? command.referenceUrl : undefined,
      referenceAssetId: typeof command.referenceAssetId === "string" ? command.referenceAssetId : undefined,
      referenceRole: typeof command.referenceRole === "string" ? command.referenceRole : undefined,
      resolution: typeof command.resolution === "string" ? command.resolution : undefined,
    });
    const receipt = resolveVideoRoute({ prompt: normalized.prompt, capability: normalized.capability });
    const quote = quoteVideoCommand(receipt, { id: String(pricing.id), version: String(pricing.version), flatCredits: Number(pricing.flat ?? 20) });
    return { quote: quote.credits, pricingVersionId: quote.pricingVersionId };
  }
  return { quote: 0, pricingVersionId: "" };
}

/**
 * Execute one bounded task through canonical Studio commands. Every gate
 * runs before any spend: acceptance, deps, tool scope, frozen context,
 * injection screen, budget, and duplicate replay.
 */
export async function executeDirectorTask(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  planId: string,
  taskKey: string,
  services: DirectorServices = {},
): Promise<{ taskId: string; replayed: boolean; evidence: Record<string, unknown> }> {
  const { plan, tasks } = await readDirectorPlan(repo, scope, planId);
  const frozen = assertAcceptanceLive(plan);
  const planData = payloadOf(plan);
  const task = tasks.find((entry) => String(payloadOf(entry).task_key) === taskKey);
  if (!task) throw new Error(`DIRECTOR_NOT_FOUND: no task ${taskKey} in plan.`);
  let status = taskStatusOf(task);
  const taskData = payloadOf(task);
  const kind = String(taskData.kind ?? "");
  const command = { ...((taskData.command ?? {}) as Record<string, unknown>) };
  const mode = String(planData.mode ?? "manual");
  const existingEvidence = (taskData.evidence ?? {}) as Record<string, unknown>;
  let current = task;
  const setTaskStatus = async (to: DirectorTaskStatus): Promise<void> => {
    const fresh = await repo.get(scope, "studio_director_tasks", task.id);
    if (!fresh) throw new Error("DIRECTOR_NOT_FOUND: task vanished mid-transition.");
    transitionTaskStatus(taskStatusOf(fresh), to);
    current = await repo.updateIfRevision(scope, "studio_director_tasks", task.id, revisionOf(fresh), { status: to });
  };

  // Duplicate invocation of an in-flight task replays its recorded state
  // instead of re-issuing: one logical execution per task.
  if (status === "running" && typeof existingEvidence.commandJobId === "string" && existingEvidence.commandJobId) {
    return { taskId: task.id, replayed: true, evidence: existingEvidence };
  }
  // Blocked-task recovery: a re-executed blocked task re-runs every gate
  // below; cleared blockers proceed, persisting ones re-block.
  if (status === "blocked") {
    await setTaskStatus("accepted");
    await recordAction(repo, scope, { planId, taskId: task.id, kind: "task.retry", status: "applied", input: { taskKey } });
    status = "accepted";
  }

  // Automate mode authorizes pending/proposed tasks under the accepted plan
  // envelope; manual mode requires explicit per-task acceptance first.
  if (status === "pending" && mode === "automate") {
    await setTaskStatus("proposed");
    await setTaskStatus("accepted");
    await recordAction(repo, scope, { planId, taskId: task.id, kind: "task.auto-accept", status: "applied", input: { taskKey } });
    status = "accepted";
  } else if (status === "proposed" && mode === "automate") {
    await setTaskStatus("accepted");
    await recordAction(repo, scope, { planId, taskId: task.id, kind: "task.auto-accept", status: "applied", input: { taskKey } });
    status = "accepted";
  }
  if (status !== "accepted") throw new Error(`DIRECTOR_TASK_NOT_ACCEPTED: task ${taskKey} is ${status}.`);

  // Dependencies: every dep must be completed, or this task blocks.
  const byKey = new Map(tasks.map((entry) => [String(payloadOf(entry).task_key), entry]));
  for (const dep of ((taskData.deps ?? []) as string[])) {
    const depTask = byKey.get(dep);
    if (!depTask || taskStatusOf(depTask) !== "completed") {
      return completeBlockedTask(repo, scope, planId, task, `blocked-dep: ${dep} is not completed`);
    }
  }

  // Tool scope: the task tool must be inside the frozen envelope.
  const toolId = String(taskData.tool_id ?? "");
  if (!(frozen.tools as string[]).includes(toolId)) {
    throw new Error(`DIRECTOR_TOOL_DENIED: tool ${toolId} is outside the frozen plan envelope.`);
  }

  // Frozen context re-check before any spend.
  const context = await resolveDirectorContext(repo, scope, frozen, {});
  if (context.blockers.length > 0) {
    return completeBlockedTask(repo, scope, planId, task, context.blockers[0] as string);
  }

  // Injection screen over task material.
  const material = [typeof command.prompt === "string" ? command.prompt : "", typeof command.title === "string" ? command.title : "", JSON.stringify(command.body ?? {})].join("\n");
  const screening = screenDirectorMaterial(material);
  if (screening.tainted) {
    await recordAction(repo, scope, { planId, taskId: task.id, kind: "task.screen", status: "applied", input: { taskKey }, evidence: { hits: screening.hits } });
    return completeBlockedTask(repo, scope, planId, task, `tainted-material: ${screening.hits.join(",")}`);
  }

  // Duplicate invocation replays instead of re-issuing.
  const evidence = (taskData.evidence ?? {}) as Record<string, unknown>;
  if (status === "accepted" && typeof evidence.commandJobId === "string" && evidence.commandJobId) {
    return { taskId: task.id, replayed: true, evidence };
  }
  // Budget: fresh quote must fit the task cap and the plan remainder, and
  // must not exceed the frozen quote (executed as quoted or blocked).
  const accounts = await quoteTask(kind, command, services);
  const cap = Number(taskData.budget_cap ?? 0);
  if (accounts.quote > cap) throw new Error(`DIRECTOR_BUDGET: task quote ${accounts.quote} exceeds cap ${cap}.`);
  const frozenQuote = Number((frozen.taskQuotes ?? {})[taskKey] ?? accounts.quote);
  if (accounts.quote > frozenQuote) {
    return completeBlockedTask(repo, scope, planId, task, `quote-changed: ${frozenQuote} -> ${accounts.quote}`);
  }
  const spent = Number(planData.spent_credits ?? 0);
  if (spent + accounts.quote > Number(planData.budget_ceiling ?? 0)) {
    return completeBlockedTask(repo, scope, planId, task, "budget-exhausted");
  }

  transitionTaskStatus("accepted", "running");
  const runningRow = await repo.updateIfRevision(scope, "studio_director_tasks", task.id, revisionOf(current), {
    status: "running", attempt_count: Number(taskData.attempt_count ?? 0) + 1,
  });
  const key = `director-${planId.slice(0, 8)}-${taskKey}`;
  const issued = await issueTaskCommand(repo, scope, kind, command, key, accounts, services);
  const nextEvidence: Record<string, unknown> = { ...evidence, ...issued.evidence };
  await repo.updateIfRevision(scope, "studio_director_tasks", task.id, revisionOf(runningRow), { evidence: nextEvidence });
  await recordAction(repo, scope, {
    planId, taskId: task.id, kind: "task.apply", status: "applied",
    input: { taskKey, kind, command }, output: issued.output, evidence: nextEvidence,
  });
  // Accepted plans start running on first dispatch.
  if (planStatusOf(plan) === "accepted") {
    transitionPlanStatus("accepted", "running");
    await repo.updateIfRevision(scope, "studio_director_plans", planId, revisionOf(plan), { status: "running" });
  }
  return { taskId: task.id, replayed: issued.replayed, evidence: nextEvidence };
}

async function completeBlockedTask(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  planId: string,
  task: StudioPersistenceRecord,
  reason: string,
): Promise<{ taskId: string; replayed: boolean; evidence: Record<string, unknown> }> {
  const current = (await repo.get(scope, "studio_director_tasks", task.id)) ?? task;
  const status = taskStatusOf(current);
  const target: DirectorTaskStatus = status === "accepted" || status === "running" ? "blocked" : status;
  if (target !== status) {
    transitionTaskStatus(status, target);
    await repo.updateIfRevision(scope, "studio_director_tasks", task.id, revisionOf(current), { status: target });
  }
  await recordAction(repo, scope, {
    planId, taskId: task.id, kind: "task.block", status: "applied",
    input: { taskKey: String(payloadOf(current).task_key) }, evidence: { reason },
  });
  return { taskId: task.id, replayed: false, evidence: { blocked: reason } };
}

async function issueTaskCommand(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  kind: string,
  command: Record<string, unknown>,
  key: string,
  accounts: { quote: number; pricingVersionId: string },
  services: DirectorServices,
): Promise<{ evidence: Record<string, unknown>; output: Record<string, unknown>; replayed: boolean }> {
  const ledger = services.ledger ?? new SupabaseImageCreditLedger();
  const service = services.service ?? new DurableJobService({ repository: createPlatformJobRepository() });
  if (kind === "image.command") {
    const normalized = validateImageCommand({
      prompt: typeof command.prompt === "string" ? command.prompt : "",
      model: typeof command.model === "string" ? command.model : undefined,
      size: typeof command.size === "string" ? command.size : undefined,
      quality: typeof command.quality === "string" ? command.quality : undefined,
    });
    admitImageQuote(quoteImageCommand(normalized, {
      id: accounts.pricingVersionId, version: "v1",
      standardCredits: accounts.quote, hdCredits: accounts.quote,
    }), accounts.quote);
    const issued = await enqueueWithReservation({
      scope, actorId: scope.actorId, idempotencyKey: key,
      payload: {
        kind: "openai-image", prompt: normalized.prompt, model: normalized.model,
        size: normalized.size, quality: normalized.quality, actorId: scope.actorId,
        reservationKey: key, quotedCredits: accounts.quote, pricingVersionId: accounts.pricingVersionId,
        receipt: { providerId: "openai", modelId: normalized.model, capability: "text-to-image" as const },
        directorOf: true,
      },
      quote: { credits: accounts.quote, pricingVersionId: accounts.pricingVersionId },
      approvedCeiling: accounts.quote, ledger, service, quota: services.quota,
    });
    return {
      evidence: { commandJobId: issued.job.id, reservationId: issued.reservation.id },
      output: { jobId: issued.job.id, status: issued.job.status },
      replayed: issued.replayed,
    };
  }
  if (kind === "video.command") {
    const normalized = validateVideoCommand({
      prompt: typeof command.prompt === "string" ? command.prompt : "",
      capability: typeof command.capability === "string" ? command.capability : "image-to-video",
      referenceUrl: typeof command.referenceUrl === "string" ? command.referenceUrl : undefined,
      referenceAssetId: typeof command.referenceAssetId === "string" ? command.referenceAssetId : undefined,
      referenceRole: typeof command.referenceRole === "string" ? command.referenceRole : undefined,
      resolution: typeof command.resolution === "string" ? command.resolution : undefined,
    });
    const receipt = resolveVideoRoute({ prompt: normalized.prompt, capability: normalized.capability });
    admitVideoQuote(quoteVideoCommand(receipt, {
      id: accounts.pricingVersionId, version: "v1", flatCredits: accounts.quote,
    }), accounts.quote);
    const issued = await enqueueWithReservation({
      scope, actorId: scope.actorId, idempotencyKey: key,
      payload: {
        kind: "fal-video", mediaJobId: `media-video-${key}`,
        providerId: receipt.providerId, modelId: receipt.modelId, prompt: normalized.prompt,
        imageUrl: normalized.referenceUrl ?? "", referenceUrl: normalized.referenceUrl,
        referenceAssetId: normalized.referenceAssetId, referenceRole: normalized.referenceRole,
        resolution: normalized.resolution, actorId: scope.actorId,
        reservationKey: key, quotedCredits: accounts.quote, pricingVersionId: accounts.pricingVersionId,
        receipt: { ...receipt }, directorOf: true,
      },
      quote: { credits: accounts.quote, pricingVersionId: accounts.pricingVersionId },
      approvedCeiling: accounts.quote, ledger, service, quota: services.quota,
    });
    return {
      evidence: { commandJobId: issued.job.id, reservationId: issued.reservation.id },
      output: { jobId: issued.job.id, status: issued.job.status },
      replayed: issued.replayed,
    };
  }
  if (kind === "brief.create" || kind === "deliverable.create") {
    const docKind = kind === "brief.create" ? "brief" : "deliverable";
    const created = await createDocument(repo, scope, docKind, {
      title: typeof command.title === "string" ? command.title : "",
      status: typeof command.status === "string" ? command.status : "draft",
      body: (command.body ?? {}) as Record<string, unknown>,
    }, key);
    return {
      evidence: { documentId: created.record.id },
      output: { documentId: created.record.id, revision: 1 },
      replayed: created.replayed,
    };
  }
  if (kind === "brief.update") {
    const updated = await updateDocument(repo, scope, "brief", String(command.documentId ?? ""), Number(command.expectedRevision ?? 0), {
      title: typeof command.title === "string" ? command.title : undefined,
      status: typeof command.status === "string" ? command.status : undefined,
      body: (command.body ?? undefined) as Record<string, unknown> | undefined,
    }, key);
    const data = updated.record.payload as Record<string, unknown>;
    return {
      evidence: { documentId: updated.record.id, revision: Number(data.revision ?? 1) },
      output: { documentId: updated.record.id },
      replayed: updated.replayed,
    };
  }
  if (kind === "lock.create") {
    const locked = await lockDecision(repo, scope, {
      entityKind: String(command.entityKind ?? "") as "brief",
      entityId: String(command.entityId ?? ""),
      entityRevision: Number(command.entityRevision ?? 0),
      payloadHash: String(command.payloadHash ?? ""),
    }, key);
    return {
      evidence: { lockId: locked.record.id },
      output: { lockId: locked.record.id },
      replayed: locked.replayed,
    };
  }
  if (kind === "evaluate.run") {
    const recorded = await evaluateAndRecord(repo, scope, {
      jobId: String(command.jobId ?? ""),
      kind: (command.kind ?? "image") as "image" | "video",
      requested: { size: typeof command.size === "string" ? command.size : null },
      request: (command.request ?? {}) as Record<string, unknown>,
      actual: {
        assetId: typeof command.assetId === "string" ? command.assetId : null,
        takeId: typeof command.takeId === "string" ? command.takeId : null,
        contentHash: typeof command.contentHash === "string" ? command.contentHash : null,
        width: typeof command.width === "number" ? command.width : null,
        height: typeof command.height === "number" ? command.height : null,
        durationSeconds: typeof command.durationSeconds === "number" ? command.durationSeconds : null,
      },
      lockEntityId: typeof command.assetId === "string" ? command.assetId : null,
    });
    return {
      evidence: { evidenceId: recorded.id, verdict: recorded.verdict },
      output: { evidenceId: recorded.id, verdict: recorded.verdict },
      replayed: false,
    };
  }
  throw new Error(`DIRECTOR_TOOL_DENIED: no canonical command implements task kind ${kind}.`);
}

// ── Completion, undo, advance, locks ────────────────────────────────────

/**
 * Complete a task from recorded evidence only. Prose, flags, and agent
 * narration are never sufficient: media tasks need terminal job success
 * plus an output, document tasks need the persisted row, locks need a
 * current lock, evaluations need their evidence row.
 */
export async function completeDirectorTask(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  planId: string,
  taskKey: string,
  services: DirectorServices = {},
): Promise<{ taskId: string; evidence: Record<string, unknown> }> {
  const { plan, tasks } = await readDirectorPlan(repo, scope, planId);
  assertAcceptanceLive(plan);
  const task = tasks.find((entry) => String(payloadOf(entry).task_key) === taskKey);
  if (!task) throw new Error(`DIRECTOR_NOT_FOUND: no task ${taskKey} in plan.`);
  if (taskStatusOf(task) !== "running") {
    throw new Error("DIRECTOR_COMPLETION_EVIDENCE: only running tasks complete, and only from recorded evidence.");
  }
  const data = payloadOf(task);
  const kind = String(data.kind ?? "");
  const evidence = { ...((data.evidence ?? {}) as Record<string, unknown>) };
  const observer = defaultObserver(scope, services, repo);

  if (kind === "image.command" || kind === "video.command") {
    const jobId = typeof evidence.commandJobId === "string" ? evidence.commandJobId : "";
    if (!jobId) throw new Error("DIRECTOR_COMPLETION_EVIDENCE: media task has no issued job to observe.");
    const observed = await observer.readJob(jobId);
    if (!observed || !observed.completed) {
      throw new Error(`DIRECTOR_COMPLETION_EVIDENCE: job ${jobId.slice(0, 8)}… is not terminally completed.`);
    }
    const outputs = await findTaskOutputs(repo, scope, jobId);
    if (outputs === 0) throw new Error("DIRECTOR_COMPLETION_EVIDENCE: completed job left no owned output.");
    evidence.outputs = outputs;
    evidence.settledCredits = observed.settledCredits;
    await addPlanSpend(repo, scope, plan, observed.settledCredits);
  } else if (kind === "brief.create" || kind === "deliverable.create" || kind === "brief.update") {
    const documentId = typeof evidence.documentId === "string" ? evidence.documentId : "";
    if (!documentId) throw new Error("DIRECTOR_COMPLETION_EVIDENCE: document task recorded no document.");
    const table = kind === "deliverable.create" ? "studio_deliverables" : "studio_briefs";
    const row = await repo.get(scope, table, documentId);
    if (!row) throw new Error("DIRECTOR_COMPLETION_EVIDENCE: recorded document is not persisted.");
  } else if (kind === "lock.create") {
    const lockId = typeof evidence.lockId === "string" ? evidence.lockId : "";
    if (!lockId) throw new Error("DIRECTOR_COMPLETION_EVIDENCE: lock task recorded no lock.");
    const row = await repo.get(scope, "studio_decision_locks", lockId);
    if (!row || ((row.payload as Record<string, unknown>).superseded_by ?? null) !== null) {
      throw new Error("DIRECTOR_COMPLETION_EVIDENCE: recorded lock is not current.");
    }
  } else if (kind === "evaluate.run") {
    const evidenceId = typeof evidence.evidenceId === "string" ? evidence.evidenceId : "";
    if (!evidenceId) throw new Error("DIRECTOR_COMPLETION_EVIDENCE: evaluation recorded no evidence.");
    const row = await repo.get(scope, "studio_evaluation_evidence", evidenceId);
    if (!row) throw new Error("DIRECTOR_COMPLETION_EVIDENCE: recorded evaluation is not persisted.");
  } else {
    throw new Error(`DIRECTOR_TOOL_DENIED: unknown task kind ${kind}.`);
  }

  transitionTaskStatus("running", "completed");
  await repo.updateIfRevision(scope, "studio_director_tasks", task.id, revisionOf(task), { status: "completed", evidence });
  await recordAction(repo, scope, { planId, taskId: task.id, kind: "task.complete", status: "applied", input: { taskKey }, evidence });
  await maybeCompletePlan(repo, scope, planId);
  return { taskId: task.id, evidence };
}

async function findTaskOutputs(repo: StudioRepository, scope: StudioPersistenceScope, jobId: string): Promise<number> {
  const rows = await repo.list(scope, "studio_assets");
  return rows.filter((row) => (((row.payload as Record<string, unknown>).metadata ?? {}) as Record<string, unknown>).jobId === jobId).length;
}

async function addPlanSpend(repo: StudioRepository, scope: StudioPersistenceScope, plan: StudioPersistenceRecord, settled: number): Promise<void> {
  if (!Number.isFinite(settled) || settled <= 0) return;
  const data = payloadOf(plan);
  const spent = Number(data.spent_credits ?? 0) + settled;
  await repo.updateIfRevision(scope, "studio_director_plans", plan.id, revisionOf(plan), { spent_credits: spent }).catch(() => null);
}

async function maybeCompletePlan(repo: StudioRepository, scope: StudioPersistenceScope, planId: string): Promise<void> {
  const { plan, tasks } = await readDirectorPlan(repo, scope, planId);
  if (planStatusOf(plan) !== "running") return;
  if (tasks.length > 0 && tasks.every((task) => taskStatusOf(task) === "completed")) {
    transitionPlanStatus("running", "completed");
    await repo.updateIfRevision(scope, "studio_director_plans", planId, revisionOf(plan), { status: "completed" });
    await recordAction(repo, scope, { planId, taskId: null, kind: "plan.complete", status: "applied", input: { planId } });
  }
}

/**
 * Compensating undo. Queued work cancels; running work requests cancel;
 * completed provider spend is unrecoverable and recorded truthfully —
 * never pretended away. The task lands undone either way.
 */
export async function undoDirectorTask(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  planId: string,
  taskKey: string,
  services: DirectorServices = {},
): Promise<{ taskId: string; compensation: Record<string, unknown> }> {
  // Undo compensates past effects; it never dispatches new spend, so it
  // stays available on completed or stopped plans (cleanup after revocation).
  // Only draft/proposed plans have nothing to compensate.
  // Undo compensates past effects; it never dispatches new spend, so it
  // stays available on completed or stopped plans (cleanup after revocation).
  // Only draft/proposed plans have nothing to compensate.
  const { tasks } = await readDirectorPlan(repo, scope, planId);
  const task = tasks.find((entry) => String(payloadOf(entry).task_key) === taskKey);
  if (!task) throw new Error(`DIRECTOR_NOT_FOUND: no task ${taskKey} in plan.`);
  const status = taskStatusOf(task);
  if (status !== "completed" && status !== "failed" && status !== "running") {
    throw new Error(`DIRECTOR_UNDO: task ${taskKey} is ${status}; nothing to compensate.`);
  }
  const data = payloadOf(task);
  const kind = String(data.kind ?? "");
  const evidence = (data.evidence ?? {}) as Record<string, unknown>;
  const compensation: Record<string, unknown> = { taskKey, priorStatus: status };
  if ((kind === "image.command" || kind === "video.command") && typeof evidence.commandJobId === "string" && evidence.commandJobId) {
    const service = services.service ?? new DurableJobService({ repository: createPlatformJobRepository() });
    const job = await service.getJob({ projectId: scope.projectId }, evidence.commandJobId as string).catch(() => null);
    if (job && job.status === "queued") {
      const cancelled = await service.cancelJob({ projectId: scope.projectId }, job.id, "director-undo").catch(() => false);
      compensation.cancelledQueuedJob = cancelled;
      // Job 12B: a queued job that undo actually cancels will never
      // execute, so its admission claim is freed — but only when the job
      // is still cancelled on re-read (a worker that claimed the job in
      // the meantime owns the slot until its terminal settle/release).
      if (cancelled) {
        const reread = await service.getJob({ projectId: scope.projectId }, job.id).catch(() => null);
        if (reread && reread.status === "cancelled") {
          const quota = services.quota ?? new SupabaseStudioQuotaService();
          compensation.quotaReleased = await tryReleaseQuota(quota, scope.projectId);
        }
      }
    } else if (job && (job.status === "claimed" || job.status === "running")) {
      const requested = await service.cancelJob({ projectId: scope.projectId }, job.id, "director-undo").catch(() => false);
      compensation.cancelRequested = requested;
    } else if (job && job.status === "completed") {
      compensation.unrecoverableSpend = true;
      compensation.note = "Provider spend already executed; recorded, not reversed.";
    } else {
      compensation.noJobFound = true;
    }
  } else if (kind === "brief.create" || kind === "deliverable.create") {
    const documentId = typeof evidence.documentId === "string" ? evidence.documentId : "";
    if (documentId) {
      const table = kind === "deliverable.create" ? "studio_deliverables" : "studio_briefs";
      compensation.documentDeleted = await repo.softDelete(scope, table, documentId);
    }
  } else {
    compensation.noInverse = true;
    compensation.note = "No valid inverse for this task kind; recorded without mutation.";
  }
  if (status === "completed") {
    transitionTaskStatus("completed", "undone");
    await repo.updateIfRevision(scope, "studio_director_tasks", task.id, revisionOf(task), { status: "undone" });
  } else {
    transitionTaskStatus(status, "stopped");
    await repo.updateIfRevision(scope, "studio_director_tasks", task.id, revisionOf(task), { status: "stopped" });
  }
  await recordAction(repo, scope, {
    planId, taskId: task.id, kind: "task.undo", status: "compensated", input: { taskKey }, evidence: compensation,
  });
  return { taskId: task.id, compensation };
}

/**
 * Advance an automate plan: run ready tasks in DAG order, bounded per call.
 * Independent branches proceed; blocked tasks stop their dependents only.
 */
export async function advanceDirectorPlan(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  planId: string,
  services: DirectorServices = {},
): Promise<{ advanced: string[]; blocked: Array<{ key: string; reason: string }>; completed: boolean }> {
  const { plan } = await readDirectorPlan(repo, scope, planId);
  const frozen = assertAcceptanceLive(plan);
  void frozen;
  const data = payloadOf(plan);
  if (String(data.mode ?? "manual") !== "automate") {
    throw new Error("DIRECTOR_ADVANCE: only automate plans advance without per-task acceptance.");
  }
  if (planStatusOf(plan) === "accepted") {
    transitionPlanStatus("accepted", "running");
    const fresh = await repo.get(scope, "studio_director_plans", planId);
    if (fresh) await repo.updateIfRevision(scope, "studio_director_plans", planId, revisionOf(fresh), { status: "running" });
  }
  const advanced: string[] = [];
  const blocked: Array<{ key: string; reason: string }> = [];
  for (let step = 0; step < ADVANCE_TASK_CAP; step += 1) {
    const { tasks } = await readDirectorPlan(repo, scope, planId);
    const byKey = new Map(tasks.map((entry) => [String(payloadOf(entry).task_key), entry]));
    const ready = tasks.filter((entry) => {
      const entryData = payloadOf(entry);
      const entryStatus = taskStatusOf(entry);
      // Proposed tasks are runnable under an accepted automate plan
      // (proposal + acceptance already authorized them); pending tasks
      // auto-accept on dispatch; failed tasks retry bounded.
      if (entryStatus !== "pending" && entryStatus !== "failed" && entryStatus !== "proposed") return false;
      // Bounded recovery: a twice-attempted failed task stays failed until an
      // operator retries it explicitly.
      if (entryStatus === "failed" && Number(entryData.attempt_count ?? 0) >= 2) return false;
      return ((entryData.deps ?? []) as string[]).every((dep) => {
        const depTask = byKey.get(dep);
        return depTask !== undefined && taskStatusOf(depTask) === "completed";
      });
    });
    if (ready.length === 0) break;
    let progressed = false;
    for (const entry of ready) {
      const key = String(payloadOf(entry).task_key);
      try {
        const outcome = await executeDirectorTask(repo, scope, planId, key, services);
        advanced.push(key);
        progressed = true;
        void outcome;
      } catch (error) {
        blocked.push({ key, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    if (!progressed) break;
  }
  const { plan: finalPlan, tasks: finalTasks } = await readDirectorPlan(repo, scope, planId);
  const completed = planStatusOf(finalPlan) === "completed"
    || (finalTasks.length > 0 && finalTasks.every((task) => ["completed", "undone"].includes(taskStatusOf(task))));
  if (completed && planStatusOf(finalPlan) === "running") {
    transitionPlanStatus("running", "completed");
    await repo.updateIfRevision(scope, "studio_director_plans", planId, revisionOf(finalPlan), { status: "completed" });
  }
  return { advanced, blocked, completed };
}

/** Lock every completed media task output of a plan. Spend-free and
 * idempotent, so it stays available on completed plans: locking is how
 * finished work is preserved, not new dispatch. */
export async function lockPlanOutputs(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  planId: string,
  idempotencyPrefix: string,
): Promise<Array<{ taskKey: string; lockId: string; replayed: boolean }>> {
  const { tasks } = await readDirectorPlan(repo, scope, planId);
  const locked: Array<{ taskKey: string; lockId: string; replayed: boolean }> = [];
  for (const task of tasks) {
    if (taskStatusOf(task) !== "completed") continue;
    const data = payloadOf(task);
    const kind = String(data.kind ?? "");
    if (kind !== "image.command" && kind !== "video.command") continue;
    const evidence = (data.evidence ?? {}) as Record<string, unknown>;
    const assetRows = await repo.list(scope, "studio_assets");
    const jobId = typeof evidence.commandJobId === "string" ? evidence.commandJobId : "";
    const asset = assetRows.find((row) => (((row.payload as Record<string, unknown>).metadata ?? {}) as Record<string, unknown>).jobId === jobId);
    if (!asset) continue;
    const contentHash = String((asset.payload as Record<string, unknown>).content_hash ?? "");
    if (!/^[0-9a-f]{64}$/i.test(contentHash)) continue;
    const key = String(data.task_key);
    const result = await lockDecision(repo, scope, {
      entityKind: "asset", entityId: asset.id, entityRevision: 1, payloadHash: contentHash,
    }, `${idempotencyPrefix}-${key}`.slice(0, 120));
    locked.push({ taskKey: key, lockId: result.record.id, replayed: result.replayed });
  }
  return locked;
}
