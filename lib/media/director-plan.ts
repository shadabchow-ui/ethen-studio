/**
 * Studio V2 Job 06 — bounded director plan model.
 * Typed creative plans with a task DAG, frozen acceptance envelopes, and
 * guarded status transitions. Pure planning logic plus thin repository
 * writes; execution lives in director-execute.ts and only calls canonical
 * Studio command services — the Director holds no direct DB/SQL authority
 * beyond these typed rows.
 */

import { randomUUID } from "node:crypto";
import type { StudioPersistenceRecord, StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";

export type DirectorPlanStatus = "draft" | "proposed" | "accepted" | "rejected" | "running" | "completed" | "stopped";
export type DirectorTaskStatus = "pending" | "blocked" | "proposed" | "accepted" | "running" | "completed" | "failed" | "stopped" | "undone";
export type DirectorMode = "manual" | "automate";

export type DirectorTaskKind =
  | "image.command"
  | "video.command"
  | "brief.create"
  | "brief.update"
  | "deliverable.create"
  | "lock.create"
  | "evaluate.run";

/** Tools a plan may invoke: canonical media tools plus director document ops. */
export const DIRECTOR_STUDIO_TOOLS = Object.freeze([
  "studio.brief.create",
  "studio.brief.update",
  "studio.deliverable.create",
  "studio.lock.create",
  "studio.evaluate.run",
] as const);

export const DIRECTOR_MEDIA_TOOLS = Object.freeze([
  "media.generate_image",
  "media.image_to_video",
] as const);

export function assertDirectorTool(toolId: string): void {
  if (!(DIRECTOR_STUDIO_TOOLS as readonly string[]).includes(toolId) && !(DIRECTOR_MEDIA_TOOLS as readonly string[]).includes(toolId)) {
    throw new Error(`DIRECTOR_TOOL_DENIED: tool ${toolId} is outside every known contract.`);
  }
}

export interface DirectorTaskInput {
  key: string;
  title: string;
  kind: DirectorTaskKind;
  toolId: string;
  command: Record<string, unknown>;
  deps?: string[];
  budgetCap?: number;
}

export interface DirectorPlanInput {
  title: string;
  goal?: string;
  mode?: DirectorMode;
  budgetCeiling?: number;
  tools?: string[];
  models?: string[];
  tasks: DirectorTaskInput[];
}

export interface FrozenEnvelope {
  docRevisions: Record<string, number>;
  lockDigests: Record<string, string>;
  consentIds: string[];
  budgetCeiling: number;
  spentBaseline: number;
  tools: string[];
  models: string[];
  rubricVersions: Array<{ name: string; version: string }>;
  taskQuotes: Record<string, number>;
  acceptedBy: string;
  acceptedAt: string;
  expiresAt: string;
}

const TASK_KINDS: ReadonlySet<string> = new Set([
  "image.command", "video.command", "brief.create", "brief.update",
  "deliverable.create", "lock.create", "evaluate.run",
]);

const PLAN_TRANSITIONS: Readonly<Record<DirectorPlanStatus, readonly DirectorPlanStatus[]>> = {
  draft: ["proposed"],
  proposed: ["accepted", "rejected"],
  accepted: ["running", "stopped"],
  rejected: [],
  running: ["completed", "stopped"],
  completed: [],
  stopped: [],
};

const TASK_TRANSITIONS: Readonly<Record<DirectorTaskStatus, readonly DirectorTaskStatus[]>> = {
  pending: ["blocked", "proposed", "stopped"],
  blocked: ["pending", "proposed", "accepted", "stopped"],
  proposed: ["accepted", "stopped"],
  accepted: ["running", "blocked", "stopped"],
  running: ["completed", "failed", "blocked", "stopped"],
  completed: ["undone"],
  failed: ["pending", "stopped"],
  stopped: [],
  undone: [],
};

export function transitionPlanStatus(from: DirectorPlanStatus, to: DirectorPlanStatus): void {
  if (!PLAN_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`DIRECTOR_PLAN_TRANSITION: ${from} -> ${to} is not a legal plan transition.`);
  }
}

export function transitionTaskStatus(from: DirectorTaskStatus, to: DirectorTaskStatus): void {
  if (!TASK_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`DIRECTOR_TASK_TRANSITION: ${from} -> ${to} is not a legal task transition.`);
  }
}

/** Validate a task DAG: keys unique, deps resolve, no cycles. Pure. */
export function validateTaskDag(tasks: readonly { key: string; deps?: readonly string[] }[]): string[] {
  const keys = new Set<string>();
  for (const task of tasks) {
    if (!task.key?.trim()) throw new Error("DIRECTOR_DAG_INVALID: every task needs a key.");
    if (keys.has(task.key)) throw new Error(`DIRECTOR_DAG_INVALID: duplicate task key ${task.key}.`);
    keys.add(task.key);
  }
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byKey = new Map(tasks.map((task) => [task.key, task]));
  const visit = (key: string, stack: string[]): void => {
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error(`DIRECTOR_DAG_CYCLE: ${[...stack, key].join(" -> ")}.`);
    visiting.add(key);
    for (const dep of byKey.get(key)?.deps ?? []) {
      if (!byKey.has(dep)) throw new Error(`DIRECTOR_DAG_INVALID: task ${key} depends on unknown task ${dep}.`);
      visit(dep, [...stack, key]);
    }
    visiting.delete(key);
    visited.add(key);
    order.push(key);
  };
  for (const key of keys) visit(key, []);
  return order;
}

function toolForKind(kind: DirectorTaskKind): string {
  switch (kind) {
    case "image.command": return "media.generate_image";
    case "video.command": return "media.image_to_video";
    case "brief.create": return "studio.brief.create";
    case "brief.update": return "studio.brief.update";
    case "deliverable.create": return "studio.deliverable.create";
    case "lock.create": return "studio.lock.create";
    case "evaluate.run": return "studio.evaluate.run";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CreatedPlan {
  planId: string;
  taskIds: Record<string, string>;
}

/** Create a draft plan with a validated DAG. Tools default to the task kinds' canonical tools. */
export async function createDirectorPlan(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: DirectorPlanInput,
  idempotencyKey: string,
): Promise<CreatedPlan> {
  if (!input.title?.trim()) throw new Error("DIRECTOR_PLAN_INVALID: title is required.");
  if (input.tasks.length === 0) throw new Error("DIRECTOR_PLAN_INVALID: a plan needs at least one task.");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) throw new Error("DIRECTOR_PLAN_INVALID: idempotency key must be 8-128 chars.");
  validateTaskDag(input.tasks);
  for (const task of input.tasks) {
    if (!TASK_KINDS.has(task.kind)) {
      throw new Error(`DIRECTOR_PLAN_INVALID: unknown task kind ${task.kind}.`);
    }
  }
  const tools = input.tools ?? [...new Set(input.tasks.map((task) => toolForKind(task.kind)))];
  for (const tool of tools) assertDirectorTool(tool);
  for (const task of input.tasks) {
    const toolId = task.toolId?.trim() || toolForKind(task.kind);
    assertDirectorTool(toolId);
    task.toolId = toolId;
    if (task.budgetCap !== undefined && (!Number.isFinite(task.budgetCap) || task.budgetCap < 0)) {
      throw new Error(`DIRECTOR_PLAN_INVALID: task ${task.key} has an invalid budget cap.`);
    }
  }
  const ceiling = input.budgetCeiling ?? 0;
  if (!Number.isFinite(ceiling) || ceiling < 0) throw new Error("DIRECTOR_PLAN_INVALID: budget ceiling must be >= 0.");
  const caps = input.tasks.reduce((sum, task) => sum + (task.budgetCap ?? 0), 0);
  if (caps > ceiling) throw new Error("DIRECTOR_PLAN_INVALID: task caps exceed the plan ceiling.");

  const existing = await repo.list(scope, "studio_director_plans");
  const replay = existing.find((row) => ((row.payload as Record<string, unknown>).idempotency_key as string) === idempotencyKey);
  if (replay) {
    const replayData = replay.payload as Record<string, unknown>;
    const sameTerms = replayData.title === input.title.trim()
      && Number(replayData.budget_ceiling ?? 0) === ceiling
      && String(replayData.mode ?? "manual") === (input.mode ?? "manual");
    if (!sameTerms) {
      throw new Error("DIRECTOR_PLAN_CONFLICT: idempotency key already used with different terms.");
    }
    const taskRows = await repo.list(scope, "studio_director_tasks");
    const ids: Record<string, string> = {};
    for (const row of taskRows.filter((row) => ((row.payload as Record<string, unknown>).plan_id as string) === replay.id)) {
      ids[String((row.payload as Record<string, unknown>).task_key)] = row.id;
    }
    return { planId: replay.id, taskIds: ids };
  }

  const at = nowIso();
  const planId = randomUUID();
  await repo.insert(scope, "studio_director_plans", {
    id: planId,
    payload: {
      title: input.title.trim(), goal: input.goal?.trim() ?? "", status: "draft",
      mode: input.mode ?? "manual", revision: 1,
      budget_ceiling: ceiling, spent_credits: 0, idempotency_key: idempotencyKey,
      tools, models: input.models ?? [], frozen_envelope: null, parent_plan_id: null,
    },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  const taskIds: Record<string, string> = {};
  for (const task of input.tasks) {
    const taskId = randomUUID();
    await repo.insert(scope, "studio_director_tasks", {
      id: taskId,
      payload: {
        plan_id: planId, task_key: task.key, title: task.title.trim(), kind: task.kind,
        tool_id: task.toolId, command: { ...(task.command ?? {}) }, deps: [...(task.deps ?? [])],
        status: "pending", revision: 1, budget_cap: task.budgetCap ?? 0,
        attempt_count: 0, evidence: {}, idempotency_key: `director-${planId.slice(0, 8)}-${task.key}`,
      },
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
    taskIds[task.key] = taskId;
  }
  return { planId, taskIds };
}

/** Read a plan row with its tasks. */
export async function readDirectorPlan(repo: StudioRepository, scope: StudioPersistenceScope, planId: string): Promise<{
  plan: StudioPersistenceRecord;
  tasks: StudioPersistenceRecord[];
}> {
  const plan = await repo.get(scope, "studio_director_plans", planId);
  if (!plan) throw new Error("DIRECTOR_NOT_FOUND: no such plan in this project.");
  const tasks = (await repo.list(scope, "studio_director_tasks")).filter(
    (row) => ((row.payload as Record<string, unknown>).plan_id as string) === planId,
  );
  return { plan, tasks };
}

export function planStatusOf(plan: StudioPersistenceRecord): DirectorPlanStatus {
  return ((plan.payload as Record<string, unknown>).status as DirectorPlanStatus) ?? "draft";
}

export function taskStatusOf(task: StudioPersistenceRecord): DirectorTaskStatus {
  return ((task.payload as Record<string, unknown>).status as DirectorTaskStatus) ?? "pending";
}

/** Branch a plan: copy with a parent link, tasks reset to pending, draft status. */
export async function branchDirectorPlan(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  planId: string,
  idempotencyKey: string,
): Promise<CreatedPlan> {
  const { plan, tasks } = await readDirectorPlan(repo, scope, planId);
  const data = plan.payload as Record<string, unknown>;
  const at = nowIso();
  const nextId = randomUUID();
  await repo.insert(scope, "studio_director_plans", {
    id: nextId,
    payload: {
      title: `${String(data.title ?? "Untitled")} (branch)`, goal: String(data.goal ?? ""),
      status: "draft", mode: String(data.mode ?? "manual"), revision: 1,
      budget_ceiling: Number(data.budget_ceiling ?? 0), spent_credits: 0,
      idempotency_key: idempotencyKey, tools: [...((data.tools ?? []) as string[])],
      models: [...((data.models ?? []) as string[])], frozen_envelope: null, parent_plan_id: planId,
    },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  const taskIds: Record<string, string> = {};
  for (const task of tasks) {
    const taskData = task.payload as Record<string, unknown>;
    const taskId = randomUUID();
    await repo.insert(scope, "studio_director_tasks", {
      id: taskId,
      payload: {
        plan_id: nextId, task_key: String(taskData.task_key), title: String(taskData.title ?? ""),
        kind: String(taskData.kind ?? "brief.create"), tool_id: String(taskData.tool_id ?? ""),
        command: { ...((taskData.command ?? {}) as Record<string, unknown>) },
        deps: [...((taskData.deps ?? []) as string[])],
        status: "pending", revision: 1, budget_cap: Number(taskData.budget_cap ?? 0),
        attempt_count: 0, evidence: {}, idempotency_key: `director-${nextId.slice(0, 8)}-${String(taskData.task_key)}`,
      },
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
    taskIds[String(taskData.task_key)] = taskId;
  }
  return { planId: nextId, taskIds };
}
