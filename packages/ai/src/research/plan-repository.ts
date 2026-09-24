import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResearchPlanVersion } from "./plan-service";

export interface ResearchPlanRepository {
  getLatest(projectId: string, actorId: string, planId: string): Promise<ResearchPlanVersion | null>;
  listVersions(projectId: string, planId: string): Promise<ResearchPlanVersion[]>;
  upsert(projectId: string, plan: ResearchPlanVersion): Promise<void>;
}

export class SupabaseResearchPlanRepository implements ResearchPlanRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getLatest(projectId: string, actorId: string, planId: string): Promise<ResearchPlanVersion | null> {
    const { data, error } = await this.client
      .from("research_plans")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", planId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    // Enforce owner check at application layer (RLS is service-role bypassed)
    if (data.actor_id !== actorId) return null;
    return this.rowToVersion(data);
  }

  async listVersions(projectId: string, planId: string): Promise<ResearchPlanVersion[]> {
    const { data, error } = await this.client
      .from("research_plans")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", planId)
      .order("version", { ascending: true });
    if (error || !data) return [];
    return data.map((row) => this.rowToVersion(row));
  }

  async upsert(projectId: string, plan: ResearchPlanVersion): Promise<void> {
    const row = {
      id: plan.id,
      project_id: projectId,
      actor_id: plan.createdBy,
      version: plan.version,
      hash: plan.hash,
      fields: {
        objective: plan.objective,
        keyQuestions: plan.keyQuestions,
        subtopics: plan.subtopics,
        sourceClasses: plan.sourceClasses,
        domainConstraints: plan.domainConstraints,
        dateConstraints: plan.dateConstraints,
        requirePrimarySources: plan.requirePrimarySources,
        depth: plan.depth,
        resultCeiling: plan.resultCeiling,
        timeBudgetMinutes: plan.timeBudgetMinutes,
        tokenBudget: plan.tokenBudget,
        costBudgetUsd: plan.costBudgetUsd,
        exclusions: plan.exclusions,
      },
      cost: plan.cost,
      approval: plan.approval,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.client.from("research_plans").upsert(row, { onConflict: "id,project_id,version" } as never);
    if (error) throw error;
  }

  private rowToVersion(row: Record<string, unknown>): ResearchPlanVersion {
    const fields = row.fields as Record<string, unknown>;
    const cost = row.cost as ResearchPlanVersion["cost"];
    return {
      objective: String(fields.objective ?? ""),
      keyQuestions: Array.isArray(fields.keyQuestions) ? (fields.keyQuestions as string[]) : [],
      subtopics: Array.isArray(fields.subtopics) ? (fields.subtopics as string[]) : [],
      sourceClasses: Array.isArray(fields.sourceClasses) ? (fields.sourceClasses as string[]) : [],
      domainConstraints: Array.isArray(fields.domainConstraints) ? (fields.domainConstraints as string[]) : [],
      dateConstraints: String(fields.dateConstraints ?? ""),
      requirePrimarySources: Boolean(fields.requirePrimarySources),
      depth: (fields.depth as ResearchPlanVersion["depth"]) ?? "standard",
      resultCeiling: Number(fields.resultCeiling ?? 10),
      timeBudgetMinutes: (fields.timeBudgetMinutes as number | null) ?? null,
      tokenBudget: (fields.tokenBudget as number | null) ?? null,
      costBudgetUsd: (fields.costBudgetUsd as number | null) ?? null,
      exclusions: Array.isArray(fields.exclusions) ? (fields.exclusions as string[]) : [],
      id: String(row.id),
      version: Number(row.version),
      hash: String(row.hash),
      createdAt: String(row.created_at),
      createdBy: String(row.actor_id),
      cost: cost ?? { status: "unavailable", amountUsd: null, authority: null },
      approval: (row.approval as ResearchPlanVersion["approval"]) ?? null,
    };
  }
}

export class InMemoryResearchPlanRepository implements ResearchPlanRepository {
  private readonly store = new Map<string, ResearchPlanVersion[]>();

  private key(projectId: string, planId: string): string {
    return `${projectId}:${planId}`;
  }

  async getLatest(projectId: string, actorId: string, planId: string): Promise<ResearchPlanVersion | null> {
    const versions = this.store.get(this.key(projectId, planId)) ?? [];
    const latest = versions.at(-1) ?? null;
    if (!latest || latest.createdBy !== actorId) return null;
    return structuredClone(latest);
  }

  async listVersions(projectId: string, planId: string): Promise<ResearchPlanVersion[]> {
    return structuredClone(this.store.get(this.key(projectId, planId)) ?? []);
  }

  async upsert(projectId: string, plan: ResearchPlanVersion): Promise<void> {
    const k = this.key(projectId, plan.id);
    const existing = this.store.get(k) ?? [];
    const idx = existing.findIndex((v) => v.version === plan.version);
    if (idx >= 0) existing.splice(idx, 1, structuredClone(plan));
    else existing.push(structuredClone(plan));
    existing.sort((a, b) => a.version - b.version);
    this.store.set(k, existing);
  }
}
