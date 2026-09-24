import type { ResearchSource } from "./types";

export interface DeepResearchBudget { maxStages: number; maxQueries: number; maxSources: number; maxElapsedMs: number; maxNoProgressStages: number }
export interface DeepResearchPlan { objective: string; queries: string[]; sections: string[]; budget: DeepResearchBudget }
export type DeepResearchStopReason = "completed" | "query_budget" | "source_budget" | "time_budget" | "no_progress" | "cancelled" | "verification_failed";
export interface DeepResearchProgress { stage: number; kind: "retrieval" | "contradiction" | "verification" | "stopped"; completedQueries: number; sourceCount: number; message: string }
export interface DeepResearchReceipt { startedAt: string; finishedAt: string; stopReason: DeepResearchStopReason; queries: number; sources: number; elapsedMs: number; tokenUsage: null; costUsd: null; verificationPassed: boolean }
export interface DeepResearchState { plan: DeepResearchPlan; startedAt: number; completedQueries: string[]; sources: ResearchSource[]; noProgressStages: number; cancelled: boolean; progress: DeepResearchProgress[] }

const DEFAULT_BUDGET: DeepResearchBudget = { maxStages: 6, maxQueries: 8, maxSources: 24, maxElapsedMs: 120_000, maxNoProgressStages: 2 };

/** Builds a small, deterministic query graph. It never executes tools or treats source text as instructions. */
export function createDeepResearchPlan(objective: string, budget: Partial<DeepResearchBudget> = {}): DeepResearchPlan {
  const normalized = objective.trim(); if (!normalized) throw new Error("A Deep Research objective is required.");
  const limits = { ...DEFAULT_BUDGET, ...budget };
  if (Object.values(limits).some((value) => !Number.isInteger(value) || value < 1)) throw new Error("Deep Research budgets must be positive integers.");
  const queries = [normalized, `${normalized} primary sources`, `${normalized} contradiction evidence`].slice(0, limits.maxQueries);
  return { objective: normalized, queries, sections: ["Findings", "Evidence and contradictions"], budget: limits };
}

export function startDeepResearch(plan: DeepResearchPlan, now = Date.now()): DeepResearchState {
  return { plan, startedAt: now, completedQueries: [], sources: [], noProgressStages: 0, cancelled: false, progress: [] };
}

export function cancelDeepResearch(state: DeepResearchState): DeepResearchState { return { ...state, cancelled: true }; }

/** Applies one retrieval-only result set and returns a new state. Duplicate URLs make no progress. */
export function recordDeepResearchRetrieval(state: DeepResearchState, query: string, sources: ResearchSource[], now = Date.now()): DeepResearchState {
  if (state.cancelled || state.completedQueries.includes(query)) return state;
  const existing = new Set(state.sources.map((source) => source.url));
  const additions = sources.filter((source) => source.url && !existing.has(source.url)).slice(0, Math.max(0, state.plan.budget.maxSources - state.sources.length));
  const progress = additions.length > 0;
  const next: DeepResearchState = { ...state, completedQueries: [...state.completedQueries, query], sources: [...state.sources, ...additions], noProgressStages: progress ? 0 : state.noProgressStages + 1, progress: [...state.progress, { stage: state.completedQueries.length + 1, kind: query.includes("contradiction") ? "contradiction" : "retrieval", completedQueries: state.completedQueries.length + 1, sourceCount: state.sources.length + additions.length, message: progress ? "Retrieved new sources." : "No new sources were retrieved." }] };
  return next;
}

export function deepResearchStopReason(state: DeepResearchState, now = Date.now(), verificationPassed = false): DeepResearchStopReason | null {
  if (state.cancelled) return "cancelled";
  if (now - state.startedAt >= state.plan.budget.maxElapsedMs) return "time_budget";
  if (state.sources.length >= state.plan.budget.maxSources) return "source_budget";
  if (state.noProgressStages >= state.plan.budget.maxNoProgressStages) return "no_progress";
  if (state.completedQueries.length >= Math.min(state.plan.queries.length, state.plan.budget.maxQueries)) return verificationPassed ? "completed" : "verification_failed";
  if (state.completedQueries.length >= state.plan.budget.maxStages) return verificationPassed ? "completed" : "verification_failed";
  return null;
}

/** Produces a receipt with explicit unavailable token/cost accounting; callers must not infer it. */
export function finishDeepResearch(state: DeepResearchState, now = Date.now(), verificationPassed = false): DeepResearchReceipt {
  const stopReason = deepResearchStopReason(state, now, verificationPassed) ?? "verification_failed";
  return { startedAt: new Date(state.startedAt).toISOString(), finishedAt: new Date(now).toISOString(), stopReason, queries: state.completedQueries.length, sources: state.sources.length, elapsedMs: Math.max(0, now - state.startedAt), tokenUsage: null, costUsd: null, verificationPassed };
}
