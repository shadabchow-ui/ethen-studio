import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditEvent,
  BudgetDecision,
  DeletionProof,
  GovernanceScope,
  ProjectBudget,
  RetentionPolicy,
  UsageAttempt,
} from "./contract";
import { GovernanceError } from "./errors";
import type { GovernanceRepository } from "./repository";

type Row = Record<string, unknown>;
const fail = (operation: string, error: { message: string } | null) => {
  if (error) throw new GovernanceError("PERSISTENCE_ERROR", `${operation}: ${error.message}`);
};
const usage = (row: Row): UsageAttempt => ({
  id: String(row.id), organizationId: String(row.organization_id),
  projectId: String(row.project_id), actorId: String(row.actor_id),
  runId: String(row.run_id), attemptId: String(row.attempt_id),
  providerId: String(row.provider_id), modelId: String(row.model_id),
  inputUnits: Number(row.input_units), outputUnits: Number(row.output_units),
  currency: row.currency as string | null, costMicros: row.cost_micros == null ? null : Number(row.cost_micros),
  costVerification: row.cost_verification as UsageAttempt["costVerification"],
  priceSource: row.price_source as string | null,
  priceRetrievedAt: row.price_retrieved_at as string | null,
  priceExpiresAt: row.price_expires_at as string | null, createdAt: String(row.created_at),
});

export class SupabaseGovernanceRepository implements GovernanceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async insertUsageAttempt(value: UsageAttempt): Promise<void> {
    const { error } = await this.client.from("governance_usage_attempts").insert({
      id: value.id, organization_id: value.organizationId, project_id: value.projectId,
      actor_id: value.actorId, run_id: value.runId, attempt_id: value.attemptId,
      provider_id: value.providerId, model_id: value.modelId,
      input_units: value.inputUnits, output_units: value.outputUnits,
      currency: value.currency, cost_micros: value.costMicros,
      cost_verification: value.costVerification, price_source: value.priceSource,
      price_retrieved_at: value.priceRetrievedAt, price_expires_at: value.priceExpiresAt,
      created_at: value.createdAt,
    });
    fail("insert_usage_attempt", error);
  }

  async listUsageAttempts(projectId: string, runId?: string): Promise<readonly UsageAttempt[]> {
    let query = this.client.from("governance_usage_attempts").select("*").eq("project_id", projectId);
    if (runId) query = query.eq("run_id", runId);
    const { data, error } = await query.order("created_at");
    fail("list_usage_attempts", error);
    return (data ?? []).map((row) => usage(row as Row));
  }

  async getBudget(projectId: string, at: string): Promise<ProjectBudget | null> {
    const { data, error } = await this.client.from("governance_project_budgets").select("*")
      .eq("project_id", projectId).lte("period_starts_at", at).gt("period_ends_at", at).maybeSingle();
    fail("get_budget", error);
    return data ? {
      projectId, limitMicros: Number(data.limit_micros),
      periodStartsAt: String(data.period_starts_at), periodEndsAt: String(data.period_ends_at),
      enabled: Boolean(data.enabled),
    } : null;
  }

  async admitBudget(input: { projectId: string; requestedMicros: number; at: string }): Promise<BudgetDecision> {
    const { data, error } = await this.client.rpc("admit_governance_budget", {
      p_project_id: input.projectId, p_requested_micros: input.requestedMicros, p_at: input.at,
    });
    fail("admit_budget", error);
    const row = (Array.isArray(data) ? data[0] : data) as Row;
    return {
      allowed: Boolean(row.allowed), reason: String(row.reason) as BudgetDecision["reason"],
      spentMicros: Number(row.spent_micros), requestedMicros: input.requestedMicros,
      limitMicros: row.limit_micros == null ? null : Number(row.limit_micros),
    };
  }

  async appendAudit(value: AuditEvent): Promise<void> {
    const { error } = await this.client.from("governance_audit_events").insert({
      id: value.id, organization_id: value.organizationId, project_id: value.projectId,
      actor_id: value.actorId, action: value.action, resource_type: value.resourceType,
      resource_id: value.resourceId, policy: value.policy, outcome: value.outcome,
      trace_id: value.traceId, created_at: value.createdAt,
    });
    fail("append_audit", error);
  }

  async getRetentionPolicies(projectId: string): Promise<readonly RetentionPolicy[]> {
    const { data, error } = await this.client.from("governance_retention_policies")
      .select("*").eq("project_id", projectId);
    fail("get_retention_policies", error);
    return (data ?? []).map((row) => ({
      projectId, enabled: Boolean(row.enabled), dataClass: String(row.data_class),
      retainDays: Number(row.retain_days), legalHold: Boolean(row.legal_hold),
    }));
  }

  async deleteCanonicalProjectData(scope: GovernanceScope): Promise<DeletionProof> {
    const { data, error } = await this.client.rpc("delete_canonical_project_data", {
      p_project_id: scope.projectId, p_actor_id: scope.actorId,
    });
    fail("delete_project_data", error);
    const row = (Array.isArray(data) ? data[0] : data) as Row;
    return {
      id: String(row.id), organizationId: scope.organizationId, projectId: scope.projectId,
      requestedBy: scope.actorId, rowsDeleted: Number(row.rows_deleted), objectsDeleted: 0,
      verification: "verified", completedAt: String(row.completed_at),
    };
  }

  async countCanonicalProjectRows(projectId: string): Promise<number> {
    const { data, error } = await this.client.rpc("count_canonical_project_rows", {
      p_project_id: projectId,
    });
    fail("count_project_rows", error);
    return Number(data);
  }
}

