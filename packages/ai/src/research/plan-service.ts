import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createServiceClient } from "@ethen/database/service";
import { SupabaseResearchPlanRepository } from "./plan-repository";

export type ResearchDepth = "standard" | "deep" | "max";
export type CostStatus = "unavailable" | "estimate" | "observed";

export interface ResearchPlanFields {
  objective: string;
  keyQuestions: string[];
  subtopics: string[];
  sourceClasses: string[];
  domainConstraints: string[];
  dateConstraints: string;
  requirePrimarySources: boolean;
  depth: ResearchDepth;
  resultCeiling: number;
  timeBudgetMinutes: number | null;
  tokenBudget: number | null;
  costBudgetUsd: number | null;
  exclusions: string[];
}

export interface ResearchPlanVersion extends ResearchPlanFields {
  id: string;
  version: number;
  hash: string;
  createdAt: string;
  createdBy: string;
  cost: { status: CostStatus; amountUsd: number | null; authority: string | null };
  approval: { actorId: string; scope: string; approvedAt: string; planVersion: number; planHash: string } | null;
}

// Durable plan store — Supabase-backed when configured, memory-fallback otherwise.
// R-P0-03: restart preserves exact approved version+hash. Memory fallback is
// ephemeral and must surface as unavailable when Supabase is not configured.
const plans = new Map<string, ResearchPlanVersion[]>();

let durableRepository: import("./plan-repository").ResearchPlanRepository | null = null;
let durableInitAttempted = false;

function getDurableRepository(): import("./plan-repository").ResearchPlanRepository | null {
  if (durableRepository) return durableRepository;
  if (durableInitAttempted) return null;
  durableInitAttempted = true;
  try {
    // Lazy service-role init for durable research plans (R-P0-03).
    // If Supabase is not configured, durable is unavailable and memory fallback applies.
    const client = createServiceClient();
    if (client) {
      durableRepository = new SupabaseResearchPlanRepository(client);
      return durableRepository;
    }
  } catch { /* durable unavailable — memory fallback */ }
  return null;
}

export function __setPlanRepositoryForTests(repo: import("./plan-repository").ResearchPlanRepository | null): void {
  durableRepository = repo;
}

async function persistPlan(projectId: string | null, plan: ResearchPlanVersion): Promise<void> {
  const repo = getDurableRepository();
  if (repo && projectId) {
    try { await repo.upsert(projectId, plan); } catch { /* durable write best-effort; memory remains */ }
  }
}

function memoryKey(actorId: string, id: string): string {
  return `${actorId}:${id}`;
}

function normalizedList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function canonicalFields(input: ResearchPlanFields): ResearchPlanFields {
  return {
    objective: input.objective.trim(),
    keyQuestions: normalizedList(input.keyQuestions),
    subtopics: normalizedList(input.subtopics),
    sourceClasses: normalizedList(input.sourceClasses),
    domainConstraints: normalizedList(input.domainConstraints),
    dateConstraints: input.dateConstraints.trim(),
    requirePrimarySources: Boolean(input.requirePrimarySources),
    depth: input.depth,
    resultCeiling: input.resultCeiling,
    timeBudgetMinutes: input.timeBudgetMinutes,
    tokenBudget: input.tokenBudget,
    costBudgetUsd: input.costBudgetUsd,
    exclusions: normalizedList(input.exclusions),
  };
}

function hashFields(fields: ResearchPlanFields): string {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

function validate(fields: ResearchPlanFields): string | null {
  if (!fields.objective) return "Objective is required.";
  if (!["standard", "deep", "max"].includes(fields.depth)) return "Depth is invalid.";
  if (!Number.isInteger(fields.resultCeiling) || fields.resultCeiling < 1) return "Result ceiling must be at least 1.";
  for (const budget of [fields.timeBudgetMinutes, fields.tokenBudget, fields.costBudgetUsd]) {
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) return "Budgets must be non-negative numbers or null.";
  }
  return null;
}

export function baselinePlan(objective: string): ResearchPlanFields {
  const trimmed = objective.trim();
  return {
    objective: trimmed,
    keyQuestions: [`What is known about ${trimmed}?`, `Which primary sources support or challenge the key findings?`],
    subtopics: [trimmed],
    sourceClasses: ["primary sources", "official publications", "reputable reporting"],
    domainConstraints: [], dateConstraints: "", requirePrimarySources: true,
    depth: "standard", resultCeiling: 10, timeBudgetMinutes: null, tokenBudget: null, costBudgetUsd: null, exclusions: [],
  };
}

export function createResearchPlan(actorId: string, input: ResearchPlanFields, projectId?: string | null): ResearchPlanVersion | { error: string } {
  const fields = canonicalFields(input);
  const error = validate(fields); if (error) return { error };
  const now = new Date().toISOString(); const id = `research-plan-${randomUUID()}`;
  const plan: ResearchPlanVersion = { ...fields, id, version: 1, hash: hashFields(fields), createdAt: now, createdBy: actorId,
    cost: { status: "unavailable", amountUsd: null, authority: null }, approval: null };
  plans.set(memoryKey(actorId, id), [plan]);
  // Fire-and-forget durable persist (R-P0-03) — caller may await via flush helper in server construction
  void persistPlan(projectId ?? null, plan);
  return plan;
}

export function getResearchPlan(actorId: string, id: string): ResearchPlanVersion | null {
  const version = plans.get(memoryKey(actorId, id))?.at(-1) ?? plans.get(id)?.at(-1);
  return version?.createdBy === actorId ? version : null;
}

export async function getResearchPlanDurable(projectId: string, actorId: string, id: string): Promise<ResearchPlanVersion | null> {
  const repo = getDurableRepository();
  if (repo) {
    const durable = await repo.getLatest(projectId, actorId, id);
    if (durable) return durable;
  }
  return getResearchPlan(actorId, id);
}

export function updateResearchPlan(actorId: string, id: string, input: ResearchPlanFields, projectId?: string | null): ResearchPlanVersion | { error: string } | null {
  const current = getResearchPlan(actorId, id); if (!current) return null;
  const fields = canonicalFields(input); const error = validate(fields); if (error) return { error };
  const next: ResearchPlanVersion = { ...fields, id, version: current.version + 1, hash: hashFields(fields), createdAt: new Date().toISOString(), createdBy: actorId,
    cost: { status: "unavailable", amountUsd: null, authority: null }, approval: null };
  const bucket = plans.get(memoryKey(actorId, id)) ?? plans.get(id)!;
  bucket.push(next);
  plans.set(memoryKey(actorId, id), bucket);
  void persistPlan(projectId ?? null, next);
  return next;
}

export function approveResearchPlan(actorId: string, id: string, version: number, hash: string, projectId?: string | null): ResearchPlanVersion | { error: string } | null {
  const current = getResearchPlan(actorId, id); if (!current) return null;
  if (current.version !== version || current.hash !== hash) return { error: "Plan changed; review and approve the current version." };
  if (current.approval) return current;
  const approved = { ...current, approval: { actorId, scope: "research.execute", approvedAt: new Date().toISOString(), planVersion: version, planHash: hash } };
  const bucket = plans.get(memoryKey(actorId, id)) ?? plans.get(id)!;
  bucket.splice(-1, 1, approved);
  plans.set(memoryKey(actorId, id), bucket);
  void persistPlan(projectId ?? null, approved);
  return approved;
}

export function isApprovedResearchPlan(actorId: string, id: string, version: number, hash: string): boolean {
  const plan = getResearchPlan(actorId, id);
  return Boolean(plan && plan.version === version && plan.hash === hash && plan.approval?.actorId === actorId && plan.approval.planHash === hash && plan.approval.planVersion === version);
}
