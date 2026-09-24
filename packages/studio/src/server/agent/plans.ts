/**
 * Studio V5 Creative Agent — immutable plan revisions (STUDIO_17).
 * Recovered from Director plan concepts (task DAG, frozen envelopes):
 * steps form a validated DAG, revisions are append-only, and the plan
 * hash pins exactly what an approval envelope covers.
 */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { asIcu, type IcuAmount } from "../../contracts/money";
import type { ProjectScope } from "../../contracts/scope";
import type { VersionPins } from "../../contracts/versions";
import { agentError, type AgentPlanStep, type PlanRevision } from "./types";

/** Validate a step DAG: keys unique/non-empty, deps resolve, no cycles. Pure. */
export function validateStepDag(steps: readonly AgentPlanStep[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.key?.trim()) throw agentError("BAD_REQUEST", "Every plan step needs a key.");
    if (seen.has(step.key)) throw agentError("BAD_REQUEST", `Duplicate plan step ${step.key}.`);
    seen.add(step.key);
    if (!step.title?.trim()) throw agentError("BAD_REQUEST", `Plan step ${step.key} needs a title.`);
    if (!step.action?.trim()) throw agentError("BAD_REQUEST", `Plan step ${step.key} needs an action.`);
    if (!Number.isInteger(step.estimatedIcu) || step.estimatedIcu < 0) {
      throw agentError("BAD_REQUEST", `Plan step ${step.key} needs an integer ICU estimate.`);
    }
  }
  for (const step of steps) {
    for (const dep of step.deps) {
      if (!seen.has(dep)) throw agentError("BAD_REQUEST", `Plan step ${step.key} depends on unknown step ${dep}.`);
      if (dep === step.key) throw agentError("BAD_REQUEST", `Plan step ${step.key} depends on itself.`);
    }
  }
  // Deterministic topological order (Kahn's, lexicographic tie-break).
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const step of steps) {
    indegree.set(step.key, 0);
    outgoing.set(step.key, []);
  }
  for (const step of steps) {
    for (const dep of step.deps) {
      outgoing.get(dep)?.push(step.key);
      indegree.set(step.key, (indegree.get(step.key) ?? 0) + 1);
    }
  }
  const ready = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([key]) => key)
    .sort();
  while (ready.length > 0) {
    const key = ready.shift() as string;
    order.push(key);
    for (const next of (outgoing.get(key) ?? []).sort()) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  if (order.length !== steps.length) {
    throw agentError("BAD_REQUEST", "Plan steps contain a dependency cycle.");
  }
  return order;
}

export function canonicalPlanPayload(input: {
  goal: string;
  constraints: readonly string[];
  steps: readonly AgentPlanStep[];
  pins: VersionPins;
}): string {
  const steps = [...input.steps]
    .map((s) => ({
      key: s.key,
      title: s.title,
      action: s.action,
      deps: [...s.deps].sort(),
      estimatedIcu: s.estimatedIcu,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  return JSON.stringify({
    goal: input.goal,
    constraints: [...input.constraints].sort(),
    steps,
    pins: input.pins,
  });
}

export function hashPlanPayload(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface CreatePlanRevisionInput {
  runId: string;
  scope: ProjectScope;
  revision: number;
  goal: string;
  constraints: readonly string[];
  steps: readonly AgentPlanStep[];
  pins: VersionPins;
  quoteId?: string | null;
  now: string;
}

/** Build an immutable plan revision (frozen). Throws on invalid DAG. */
export function createPlanRevision(input: CreatePlanRevisionInput): PlanRevision {
  if (!input.goal?.trim()) throw agentError("BAD_REQUEST", "Plan goal is required.");
  if (input.revision <= 0 || !Number.isInteger(input.revision)) {
    throw agentError("BAD_REQUEST", "Plan revision must be a positive integer.");
  }
  validateStepDag(input.steps);
  const canonical = canonicalPlanPayload({
    goal: input.goal,
    constraints: input.constraints,
    steps: input.steps,
    pins: input.pins,
  });
  const total = input.steps.reduce((sum, step) => sum + step.estimatedIcu, 0);
  return Object.freeze({
    planId: randomUUID(),
    runId: input.runId,
    scope: input.scope,
    revision: input.revision,
    goal: input.goal,
    constraints: [...input.constraints],
    steps: input.steps.map((s) => ({ ...s, deps: [...s.deps] })),
    pins: { ...input.pins },
    estimatedIcu: asIcu(total),
    quoteId: input.quoteId ?? null,
    planHash: hashPlanPayload(canonical),
    origin: "agent",
    legacyPlanId: null,
    createdAt: input.now,
  }) as PlanRevision;
}

/** Sum of step estimates as integer ICU. */
export function planEstimateIcu(steps: readonly AgentPlanStep[]): IcuAmount {
  return asIcu(steps.reduce((sum, step) => sum + step.estimatedIcu, 0));
}
