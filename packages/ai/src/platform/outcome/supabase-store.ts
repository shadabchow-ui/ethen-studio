import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutcomePlaneStore } from "./store";
import type {
  ExperienceRecord,
  GroundTruthCandidate,
  GroundTruthEvent,
  GroundTruthEventKind,
  JudgmentRecord,
  OutcomeRecord,
  OutcomeScope,
} from "./types";

/**
 * Durable outcome-plane store (P30 Outcome / P31 Judgment / P32 Experience /
 * P33 Ground Truth) over the canonical `platform_*` tables.
 *
 * This is persistence only. Every rule — supersession, verification requiring
 * a sound judgment, correction clearing prior verification, cross-tenant
 * sharing defaulting off — stays in `OutcomeService`/`GroundTruthService`.
 * Adding policy here would create a second outcome authority.
 *
 * Scope fencing: reads filter on `tenant_id` (the canonical tenancy column)
 * plus `organization_id`. The one deliberate exception is
 * `listSharedCandidates`, which is the explicit cross-tenant surface and is
 * restricted to rows whose `shared_cross_tenant` flag is true.
 *
 * Fail closed: a driver error throws `OutcomePersistenceError`. Nothing is
 * swallowed and no write is reported successful unless the database
 * confirmed it.
 */
export class OutcomePersistenceError extends Error {
  constructor(readonly operation: string) {
    super("Outcome plane persistence failed.");
    this.name = "OutcomePersistenceError";
  }
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v ?? "");
const nstr = (v: unknown): string | null => (v == null ? null : String(v));
const nbool = (v: unknown): boolean | null => (v == null ? null : Boolean(v));
const nnum = (v: unknown): number | null => {
  if (v == null) return null;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
};
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

function one<T>(operation: string, result: { data: T[] | null; error: unknown }): T | null {
  if (result.error) throw new OutcomePersistenceError(operation);
  const rows = result.data ?? [];
  return rows.length > 0 ? rows[0] : null;
}

function many<T>(operation: string, result: { data: T[] | null; error: unknown }): T[] {
  if (result.error) throw new OutcomePersistenceError(operation);
  return result.data ?? [];
}

function written(operation: string, result: { error: unknown }): void {
  if (result.error) throw new OutcomePersistenceError(operation);
}

export class SupabaseOutcomePlaneStore implements OutcomePlaneStore {
  constructor(private readonly client: SupabaseClient) {}

  private scoped(table: string, scope: OutcomeScope) {
    return this.client
      .from(table)
      .select("*")
      .eq("organization_id", scope.organizationId)
      .eq("tenant_id", scope.tenantId);
  }

  private scopeColumns(scope: OutcomeScope): Row {
    return {
      organization_id: scope.organizationId,
      tenant_id: scope.tenantId,
      project_id: scope.projectId,
      actor_id: scope.actorId,
    };
  }

  // ── P30 outcomes ─────────────────────────────────────────────────

  private outcomeFrom(row: Row, scope: OutcomeScope): OutcomeRecord {
    return {
      id: str(row.id),
      scope,
      sourceRunId: nstr(row.source_run_id),
      sourceAttemptId: nstr(row.source_attempt_id),
      sourceTaskId: nstr(row.source_task_id),
      sourceActionId: nstr(row.source_action_id),
      resultState: row.result_state as OutcomeRecord["resultState"],
      executionSuccess: nbool(row.execution_success),
      taskSuccess: nbool(row.task_success),
      businessSuccess: nbool(row.business_success),
      evidenceRefId: nstr(row.evidence_ref_id),
      receiptRefId: nstr(row.receipt_ref_id),
      supersedesOutcomeId: nstr(row.supersedes_outcome_id),
      evaluationVersion: nnum(row.evaluation_version) ?? 1,
      idempotencyKey: str(row.idempotency_key),
      createdAt: str(row.created_at),
    };
  }

  async findOutcome(scope: OutcomeScope, id: string): Promise<OutcomeRecord | null> {
    const row = one<Row>("findOutcome", await this.scoped("platform_outcomes", scope).eq("id", id).limit(1));
    return row ? this.outcomeFrom(row, scope) : null;
  }

  async findOutcomeByKey(scope: OutcomeScope, idempotencyKey: string): Promise<OutcomeRecord | null> {
    const row = one<Row>(
      "findOutcomeByKey",
      await this.scoped("platform_outcomes", scope).eq("idempotency_key", idempotencyKey).limit(1),
    );
    return row ? this.outcomeFrom(row, scope) : null;
  }

  async saveOutcome(outcome: OutcomeRecord): Promise<void> {
    written(
      "saveOutcome",
      await this.client.from("platform_outcomes").upsert(
        {
          id: outcome.id,
          ...this.scopeColumns(outcome.scope),
          source_run_id: outcome.sourceRunId,
          source_attempt_id: outcome.sourceAttemptId,
          source_task_id: outcome.sourceTaskId,
          source_action_id: outcome.sourceActionId,
          result_state: outcome.resultState,
          execution_success: outcome.executionSuccess,
          task_success: outcome.taskSuccess,
          business_success: outcome.businessSuccess,
          evidence_ref_id: outcome.evidenceRefId,
          receipt_ref_id: outcome.receiptRefId,
          supersedes_outcome_id: outcome.supersedesOutcomeId,
          evaluation_version: outcome.evaluationVersion,
          idempotency_key: outcome.idempotencyKey,
        },
        { onConflict: "id" },
      ),
    );
  }

  // ── P31 judgments ────────────────────────────────────────────────

  private judgmentFrom(row: Row, scope: OutcomeScope): JudgmentRecord {
    return {
      id: str(row.id),
      scope,
      outcomeId: nstr(row.outcome_id),
      evaluatorKind: row.evaluator_kind as JudgmentRecord["evaluatorKind"],
      evaluatorVersion: str(row.evaluator_version),
      conclusion: row.conclusion as JudgmentRecord["conclusion"],
      confidence: nnum(row.confidence),
      failureCategory: (row.failure_category as JudgmentRecord["failureCategory"]) ?? null,
      dissentRefs: arr(row.dissent_refs),
      supersedesJudgmentId: nstr(row.supersedes_judgment_id),
      evidenceRefs: arr(row.evidence_refs),
      criteriaRefId: nstr(row.criteria_ref_id),
      rationale: nstr(row.rationale),
      idempotencyKey: str(row.idempotency_key),
      createdAt: str(row.created_at),
    };
  }

  async findJudgment(scope: OutcomeScope, id: string): Promise<JudgmentRecord | null> {
    const row = one<Row>("findJudgment", await this.scoped("platform_judgments", scope).eq("id", id).limit(1));
    return row ? this.judgmentFrom(row, scope) : null;
  }

  async findJudgmentByKey(scope: OutcomeScope, idempotencyKey: string): Promise<JudgmentRecord | null> {
    const row = one<Row>(
      "findJudgmentByKey",
      await this.scoped("platform_judgments", scope).eq("idempotency_key", idempotencyKey).limit(1),
    );
    return row ? this.judgmentFrom(row, scope) : null;
  }

  async saveJudgment(judgment: JudgmentRecord): Promise<void> {
    written(
      "saveJudgment",
      await this.client.from("platform_judgments").upsert(
        {
          id: judgment.id,
          ...this.scopeColumns(judgment.scope),
          outcome_id: judgment.outcomeId,
          evaluator_kind: judgment.evaluatorKind,
          evaluator_version: judgment.evaluatorVersion,
          conclusion: judgment.conclusion,
          confidence: judgment.confidence,
          failure_category: judgment.failureCategory,
          dissent_refs: judgment.dissentRefs,
          supersedes_judgment_id: judgment.supersedesJudgmentId,
          evidence_refs: judgment.evidenceRefs,
          criteria_ref_id: judgment.criteriaRefId,
          rationale: judgment.rationale,
          idempotency_key: judgment.idempotencyKey,
        },
        { onConflict: "id" },
      ),
    );
  }

  // ── P32 experiences ──────────────────────────────────────────────

  private experienceFrom(row: Row, scope: OutcomeScope): ExperienceRecord {
    return {
      id: str(row.id),
      scope,
      label: str(row.label),
      contextSetId: nstr(row.context_set_id),
      policySnapshotHash: nstr(row.policy_snapshot_hash),
      runRefId: nstr(row.run_ref_id),
      attemptRefId: nstr(row.attempt_ref_id),
      jobRefId: nstr(row.job_ref_id),
      toolTraceRefs: arr(row.tool_trace_refs),
      evidenceRefs: arr(row.evidence_refs),
      outcomeRefId: nstr(row.outcome_ref_id),
      judgmentRefId: nstr(row.judgment_ref_id),
      costCents: nnum(row.cost_cents),
      latencyMs: nnum(row.latency_ms),
      interventionRefId: nstr(row.intervention_ref_id),
      idempotencyKey: str(row.idempotency_key),
      createdAt: str(row.created_at),
    };
  }

  async findExperienceByKey(scope: OutcomeScope, idempotencyKey: string): Promise<ExperienceRecord | null> {
    const row = one<Row>(
      "findExperienceByKey",
      await this.scoped("platform_experiences", scope).eq("idempotency_key", idempotencyKey).limit(1),
    );
    return row ? this.experienceFrom(row, scope) : null;
  }

  async saveExperience(experience: ExperienceRecord): Promise<void> {
    written(
      "saveExperience",
      await this.client.from("platform_experiences").upsert(
        {
          id: experience.id,
          ...this.scopeColumns(experience.scope),
          label: experience.label,
          context_set_id: experience.contextSetId,
          policy_snapshot_hash: experience.policySnapshotHash,
          run_ref_id: experience.runRefId,
          attempt_ref_id: experience.attemptRefId,
          job_ref_id: experience.jobRefId,
          tool_trace_refs: experience.toolTraceRefs,
          evidence_refs: experience.evidenceRefs,
          outcome_ref_id: experience.outcomeRefId,
          judgment_ref_id: experience.judgmentRefId,
          cost_cents: experience.costCents,
          latency_ms: experience.latencyMs,
          intervention_ref_id: experience.interventionRefId,
          idempotency_key: experience.idempotencyKey,
        },
        { onConflict: "id" },
      ),
    );
  }

  async listExperiences(scope: OutcomeScope, limit: number): Promise<ExperienceRecord[]> {
    const rows = many<Row>(
      "listExperiences",
      await this.scoped("platform_experiences", scope).order("created_at", { ascending: false }).limit(limit),
    );
    return rows.map((row) => this.experienceFrom(row, scope));
  }

  // ── P33 ground truth ─────────────────────────────────────────────

  private candidateFrom(row: Row, scope: OutcomeScope): GroundTruthCandidate {
    return {
      id: str(row.id),
      scope,
      statement: str(row.statement),
      provenance: (row.provenance as Record<string, unknown>) ?? {},
      state: row.state as GroundTruthCandidate["state"],
      verifiedByJudgmentId: nstr(row.verified_by_judgment_id),
      verificationEvidenceRefId: nstr(row.verification_evidence_ref_id),
      supersedesCandidateId: nstr(row.supersedes_candidate_id),
      derivedFromCandidateIds: arr(row.derived_from_candidate_ids),
      appliedPolicy: nstr(row.applied_policy),
      sharedCrossTenant: row.shared_cross_tenant === true,
      idempotencyKey: str(row.idempotency_key),
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at),
    };
  }

  async findCandidate(scope: OutcomeScope, id: string): Promise<GroundTruthCandidate | null> {
    const row = one<Row>("findCandidate", await this.scoped("platform_ground_truth", scope).eq("id", id).limit(1));
    return row ? this.candidateFrom(row, scope) : null;
  }

  async findCandidateByKey(scope: OutcomeScope, idempotencyKey: string): Promise<GroundTruthCandidate | null> {
    const row = one<Row>(
      "findCandidateByKey",
      await this.scoped("platform_ground_truth", scope).eq("idempotency_key", idempotencyKey).limit(1),
    );
    return row ? this.candidateFrom(row, scope) : null;
  }

  async saveCandidate(candidate: GroundTruthCandidate): Promise<void> {
    written(
      "saveCandidate",
      await this.client.from("platform_ground_truth").upsert(
        {
          id: candidate.id,
          ...this.scopeColumns(candidate.scope),
          statement: candidate.statement,
          provenance: candidate.provenance,
          state: candidate.state,
          verified_by_judgment_id: candidate.verifiedByJudgmentId,
          verification_evidence_ref_id: candidate.verificationEvidenceRefId,
          supersedes_candidate_id: candidate.supersedesCandidateId,
          derived_from_candidate_ids: candidate.derivedFromCandidateIds,
          applied_policy: candidate.appliedPolicy,
          shared_cross_tenant: candidate.sharedCrossTenant,
          idempotency_key: candidate.idempotencyKey,
          updated_at: candidate.updatedAt,
        },
        { onConflict: "id" },
      ),
    );
  }

  async listCandidates(
    scope: OutcomeScope,
    states: GroundTruthCandidate["state"][] | null,
  ): Promise<GroundTruthCandidate[]> {
    let query = this.scoped("platform_ground_truth", scope);
    if (states && states.length > 0) query = query.in("state", states);
    const rows = many<Row>("listCandidates", await query.order("created_at"));
    return rows.map((row) => this.candidateFrom(row, scope));
  }

  /**
   * The ONLY cross-tenant read. Restricted to rows explicitly marked shared
   * and excluding the caller's own tenant; sharing itself is a policy
   * decision made in the service, never inferred here.
   */
  async listSharedCandidates(excludeTenantId: string, limit: number): Promise<GroundTruthCandidate[]> {
    const rows = many<Row>(
      "listSharedCandidates",
      await this.client
        .from("platform_ground_truth")
        .select("*")
        .eq("shared_cross_tenant", true)
        .neq("tenant_id", excludeTenantId)
        .order("created_at", { ascending: false })
        .limit(limit),
    );
    return rows.map((row) =>
      this.candidateFrom(row, {
        organizationId: str(row.organization_id),
        tenantId: str(row.tenant_id),
        projectId: nstr(row.project_id),
        actorId: str(row.actor_id),
      }),
    );
  }

  async appendGroundTruthEvent(event: GroundTruthEvent): Promise<void> {
    written(
      "appendGroundTruthEvent",
      await this.client.from("platform_ground_truth_events").insert({
        organization_id: event.scope.organizationId,
        tenant_id: event.scope.tenantId,
        candidate_id: event.candidateId,
        actor_id: event.actorId,
        event: event.event,
        detail: event.detail,
        created_at: event.createdAt,
      }),
    );
  }

  async listGroundTruthEvents(scope: OutcomeScope, candidateId: string): Promise<GroundTruthEvent[]> {
    const rows = many<Row>(
      "listGroundTruthEvents",
      await this.scoped("platform_ground_truth_events", scope).eq("candidate_id", candidateId).order("created_at"),
    );
    return rows.map((row) => ({
      candidateId: str(row.candidate_id),
      scope,
      actorId: str(row.actor_id),
      event: row.event as GroundTruthEventKind,
      detail: (row.detail as Record<string, unknown>) ?? {},
      createdAt: str(row.created_at),
    }));
  }
}
