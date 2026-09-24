import { OutcomePlaneError } from "./errors";
import type { OutcomePlaneStore } from "./store";
import type {
  AttemptOutcomeBinding,
  EvaluatorKind,
  ExperienceRecord,
  FailureCategory,
  GroundTruthCandidate,
  GroundTruthEvent,
  JudgmentConclusion,
  JudgmentRecord,
  OutcomeRecord,
  OutcomeResultState,
  OutcomeScope,
} from "./types";

function requireScope(scope: OutcomeScope): void {
  for (const [field, value] of Object.entries({
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    actorId: scope.actorId,
  })) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new OutcomePlaneError("INVALID_INPUT", `${field} is required.`);
    }
  }
}

function requireText(value: string, field: string): void {
  if (!value || value.trim() === "") {
    throw new OutcomePlaneError("INVALID_INPUT", `${field} is required.`);
  }
}

export interface OutcomePlanePorts {
  now?: () => string;
  newId?: (prefix: string) => string;
}

interface Clock {
  now: () => string;
  newId: (prefix: string) => string;
}

function clock(ports: OutcomePlanePorts = {}): Clock {
  let counter = 0;
  return {
    now: ports.now ?? (() => new Date().toISOString()),
    newId:
      ports.newId ??
      ((prefix: string) => {
        counter += 1;
        return `${prefix}_${Date.now().toString(36)}_${counter}`;
      }),
  };
}

/** P30 — canonical Outcome. Identity reuses the P10-reserved outcome seam. */
export class OutcomeService {
  constructor(
    private readonly store: OutcomePlaneStore,
    ports: OutcomePlanePorts = {},
    private readonly clockImpl: Clock = clock(ports),
  ) {}

  async recordOutcome(input: {
    scope: OutcomeScope;
    id?: string | null;
    sourceRunId?: string | null;
    sourceAttemptId?: string | null;
    sourceTaskId?: string | null;
    sourceActionId?: string | null;
    resultState: OutcomeResultState;
    executionSuccess?: boolean | null;
    taskSuccess?: boolean | null;
    businessSuccess?: boolean | null;
    evidenceRefId?: string | null;
    receiptRefId?: string | null;
    supersedesOutcomeId?: string | null;
    evaluationVersion?: number;
    idempotencyKey: string;
  }): Promise<OutcomeRecord> {
    requireScope(input.scope);
    requireText(input.idempotencyKey, "idempotencyKey");
    const existing = await this.store.findOutcomeByKey(input.scope, input.idempotencyKey);
    if (existing) return existing;
    if (!input.sourceRunId && !input.sourceTaskId) {
      throw new OutcomePlaneError(
        "INVALID_INPUT",
        "An outcome requires a source run or source task.",
      );
    }
    if (input.supersedesOutcomeId) {
      const prior = await this.store.findOutcome(input.scope, input.supersedesOutcomeId);
      if (!prior) {
        throw new OutcomePlaneError("NOT_FOUND", "Superseded outcome not in scope.");
      }
    }
    const id = input.id ?? this.clockImpl.newId("out");
    if (!/^out_[A-Za-z0-9_-]+$/.test(id)) {
      throw new OutcomePlaneError(
        "INVALID_INPUT",
        "Outcome id must live in the canonical out_ domain.",
      );
    }
    const outcome: OutcomeRecord = {
      id,
      scope: input.scope,
      sourceRunId: input.sourceRunId ?? null,
      sourceAttemptId: input.sourceAttemptId ?? null,
      sourceTaskId: input.sourceTaskId ?? null,
      sourceActionId: input.sourceActionId ?? null,
      resultState: input.resultState,
      executionSuccess: input.executionSuccess ?? null,
      taskSuccess: input.taskSuccess ?? null,
      businessSuccess: input.businessSuccess ?? null,
      evidenceRefId: input.evidenceRefId ?? null,
      receiptRefId: input.receiptRefId ?? null,
      supersedesOutcomeId: input.supersedesOutcomeId ?? null,
      evaluationVersion: input.evaluationVersion ?? 1,
      idempotencyKey: input.idempotencyKey,
      createdAt: this.clockImpl.now(),
    };
    await this.store.saveOutcome(outcome);
    return outcome;
  }

  /**
   * Code-side P09 linkage proof: validates that the outcome exists in scope
   * and returns the id-correlation binding. Writes nothing to P09 tables;
   * live attach of run_attempts.outcome_id is Slice F wiring.
   */
  async bindAttemptOutcome(
    scope: OutcomeScope,
    input: { runId: string; attemptId: string; outcomeId: string },
  ): Promise<AttemptOutcomeBinding> {
    requireScope(scope);
    requireText(input.runId, "runId");
    requireText(input.attemptId, "attemptId");
    const outcome = await this.store.findOutcome(scope, input.outcomeId);
    if (!outcome) {
      throw new OutcomePlaneError("NOT_FOUND", "Outcome not in scope.");
    }
    if (
      (outcome.sourceRunId !== null && outcome.sourceRunId !== input.runId) ||
      (outcome.sourceAttemptId !== null && outcome.sourceAttemptId !== input.attemptId)
    ) {
      throw new OutcomePlaneError("CONFLICT", "Outcome source does not match the requested run/attempt.");
    }
    return {
      runId: input.runId,
      attemptId: input.attemptId,
      outcomeId: outcome.id,
      boundAt: this.clockImpl.now(),
    };
  }
}

/** P31 — Judgment / attribution, distinct from Outcome. */
export class JudgmentService {
  constructor(
    private readonly store: OutcomePlaneStore,
    ports: OutcomePlanePorts = {},
    private readonly clockImpl: Clock = clock(ports),
  ) {}

  async recordJudgment(input: {
    scope: OutcomeScope;
    id?: string | null;
    outcomeId?: string | null;
    evaluatorKind: EvaluatorKind;
    evaluatorVersion: string;
    conclusion: JudgmentConclusion;
    confidence?: number | null;
    failureCategory?: FailureCategory | null;
    dissentRefs?: string[];
    supersedesJudgmentId?: string | null;
    evidenceRefs?: string[];
    criteriaRefId?: string | null;
    rationale?: string | null;
    idempotencyKey: string;
  }): Promise<JudgmentRecord> {
    requireScope(input.scope);
    requireText(input.evaluatorVersion, "evaluatorVersion");
    requireText(input.idempotencyKey, "idempotencyKey");
    const existing = await this.store.findJudgmentByKey(input.scope, input.idempotencyKey);
    if (existing) return existing;
    if (input.outcomeId) {
      const outcome = await this.store.findOutcome(input.scope, input.outcomeId);
      if (!outcome) {
        throw new OutcomePlaneError("NOT_FOUND", "Evaluated outcome not in scope.");
      }
    }
    if (input.confidence != null && (input.confidence < 0 || input.confidence > 1)) {
      throw new OutcomePlaneError("INVALID_INPUT", "Confidence must sit within [0, 1].");
    }
    for (const ref of input.dissentRefs ?? []) {
      const dissent = await this.store.findJudgment(input.scope, ref);
      if (!dissent) {
        throw new OutcomePlaneError("NOT_FOUND", `Dissenting judgment ${ref} not in scope.`);
      }
    }
    if (input.supersedesJudgmentId) {
      const prior = await this.store.findJudgment(input.scope, input.supersedesJudgmentId);
      if (!prior) {
        throw new OutcomePlaneError("NOT_FOUND", "Superseded judgment not in scope.");
      }
    }
    const id = input.id ?? this.clockImpl.newId("jdg");
    if (!/^jdg_[A-Za-z0-9_-]+$/.test(id)) {
      throw new OutcomePlaneError(
        "INVALID_INPUT",
        "Judgment id must live in the canonical jdg_ domain.",
      );
    }
    const judgment: JudgmentRecord = {
      id,
      scope: input.scope,
      outcomeId: input.outcomeId ?? null,
      evaluatorKind: input.evaluatorKind,
      evaluatorVersion: input.evaluatorVersion,
      conclusion: input.conclusion,
      confidence: input.confidence ?? null,
      failureCategory: input.failureCategory ?? null,
      dissentRefs: [...(input.dissentRefs ?? [])],
      supersedesJudgmentId: input.supersedesJudgmentId ?? null,
      evidenceRefs: [...(input.evidenceRefs ?? [])],
      criteriaRefId: input.criteriaRefId ?? null,
      rationale: input.rationale ?? null,
      idempotencyKey: input.idempotencyKey,
      createdAt: this.clockImpl.now(),
    };
    await this.store.saveJudgment(judgment);
    return judgment;
  }
}

/** P32 — Experience Graph (logical record, canonical-ID correlation only). */
export class ExperienceService {
  constructor(
    private readonly store: OutcomePlaneStore,
    ports: OutcomePlanePorts = {},
    private readonly clockImpl: Clock = clock(ports),
  ) {}

  async recordExperience(input: {
    scope: OutcomeScope;
    id?: string | null;
    label: string;
    contextSetId?: string | null;
    policySnapshotHash?: string | null;
    runRefId?: string | null;
    attemptRefId?: string | null;
    jobRefId?: string | null;
    toolTraceRefs?: string[];
    evidenceRefs?: string[];
    outcomeRefId?: string | null;
    judgmentRefId?: string | null;
    costCents?: number | null;
    latencyMs?: number | null;
    interventionRefId?: string | null;
    idempotencyKey: string;
  }): Promise<ExperienceRecord> {
    requireScope(input.scope);
    requireText(input.label, "label");
    requireText(input.idempotencyKey, "idempotencyKey");
    const existing = await this.store.findExperienceByKey(input.scope, input.idempotencyKey);
    if (existing) return existing;
    if (input.outcomeRefId) {
      const outcome = await this.store.findOutcome(input.scope, input.outcomeRefId);
      if (!outcome) {
        throw new OutcomePlaneError("NOT_FOUND", "Linked outcome not in scope.");
      }
    }
    if (input.judgmentRefId) {
      const judgment = await this.store.findJudgment(input.scope, input.judgmentRefId);
      if (!judgment) {
        throw new OutcomePlaneError("NOT_FOUND", "Linked judgment not in scope.");
      }
    }
    if (input.costCents != null && input.costCents < 0) {
      throw new OutcomePlaneError("INVALID_INPUT", "costCents must be >= 0.");
    }
    if (input.latencyMs != null && input.latencyMs < 0) {
      throw new OutcomePlaneError("INVALID_INPUT", "latencyMs must be >= 0.");
    }
    const id = input.id ?? this.clockImpl.newId("exp");
    if (!/^exp_[A-Za-z0-9_-]+$/.test(id)) {
      throw new OutcomePlaneError(
        "INVALID_INPUT",
        "Experience id must live in the canonical exp_ domain.",
      );
    }
    const experience: ExperienceRecord = {
      id,
      scope: input.scope,
      label: input.label,
      contextSetId: input.contextSetId ?? null,
      policySnapshotHash: input.policySnapshotHash ?? null,
      runRefId: input.runRefId ?? null,
      attemptRefId: input.attemptRefId ?? null,
      jobRefId: input.jobRefId ?? null,
      toolTraceRefs: [...(input.toolTraceRefs ?? [])],
      evidenceRefs: [...(input.evidenceRefs ?? [])],
      outcomeRefId: input.outcomeRefId ?? null,
      judgmentRefId: input.judgmentRefId ?? null,
      costCents: input.costCents ?? null,
      latencyMs: input.latencyMs ?? null,
      interventionRefId: input.interventionRefId ?? null,
      idempotencyKey: input.idempotencyKey,
      createdAt: this.clockImpl.now(),
    };
    await this.store.saveExperience(experience);
    return experience;
  }

  async listExperiences(scope: OutcomeScope, limit = 50): Promise<ExperienceRecord[]> {
    requireScope(scope);
    return this.store.listExperiences(scope, limit);
  }
}

/**
 * P33 — Verified Feedback / Ground Truth.
 *
 * Only verified evidence produces verified feedback: verify() requires a
 * judgment id plus an evidence ref. Feedback carries no execution
 * authority by construction — this service holds no admission, run, or
 * approval ports and cannot grant any. Cross-tenant learning defaults OFF.
 */
export class GroundTruthService {
  constructor(
    private readonly store: OutcomePlaneStore,
    ports: OutcomePlanePorts = {},
    private readonly clockImpl: Clock = clock(ports),
  ) {}

  private async event(
    scope: OutcomeScope,
    candidateId: string,
    event: GroundTruthEvent["event"],
    detail: Record<string, unknown> = {},
  ): Promise<void> {
    await this.store.appendGroundTruthEvent({
      candidateId,
      scope,
      actorId: scope.actorId,
      event,
      detail,
      createdAt: this.clockImpl.now(),
    });
  }

  async propose(input: {
    scope: OutcomeScope;
    id?: string | null;
    statement: string;
    provenance?: Record<string, unknown>;
    derivedFromCandidateIds?: string[];
    idempotencyKey: string;
  }): Promise<GroundTruthCandidate> {
    requireScope(input.scope);
    requireText(input.statement, "statement");
    requireText(input.idempotencyKey, "idempotencyKey");
    const existing = await this.store.findCandidateByKey(input.scope, input.idempotencyKey);
    if (existing) return existing;
    for (const ref of input.derivedFromCandidateIds ?? []) {
      const source = await this.store.findCandidate(input.scope, ref);
      if (!source) {
        throw new OutcomePlaneError("NOT_FOUND", `Derivation source ${ref} not in scope.`);
      }
      if (["retracted", "superseded", "invalid"].includes(source.state)) {
        throw new OutcomePlaneError("CONFLICT", "Derivation source is no longer valid.");
      }
    }
    const id = input.id ?? this.clockImpl.newId("gt");
    if (!/^gt_[A-Za-z0-9_-]+$/.test(id)) {
      throw new OutcomePlaneError(
        "INVALID_INPUT",
        "Candidate id must live in the canonical gt_ domain.",
      );
    }
    const candidate: GroundTruthCandidate = {
      id,
      scope: input.scope,
      statement: input.statement,
      provenance: input.provenance ?? {},
      state: "proposed",
      verifiedByJudgmentId: null,
      verificationEvidenceRefId: null,
      supersedesCandidateId: null,
      derivedFromCandidateIds: [...(input.derivedFromCandidateIds ?? [])],
      appliedPolicy: null,
      sharedCrossTenant: false,
      idempotencyKey: input.idempotencyKey,
      createdAt: this.clockImpl.now(),
      updatedAt: this.clockImpl.now(),
    };
    await this.store.saveCandidate(candidate);
    await this.event(input.scope, id, "proposed");
    return candidate;
  }

  async verify(
    scope: OutcomeScope,
    idempotencyKey: string,
    input: { judgmentId: string; evidenceRefId: string },
  ): Promise<GroundTruthCandidate> {
    requireScope(scope);
    const candidate = await this.store.findCandidateByKey(scope, idempotencyKey);
    if (!candidate) throw new OutcomePlaneError("NOT_FOUND", "Candidate not in scope.");
    if (candidate.state !== "proposed") {
      throw new OutcomePlaneError("CONFLICT", "Only proposed candidates verify.");
    }
    requireText(input.judgmentId, "judgmentId");
    requireText(input.evidenceRefId, "evidenceRefId");
    const judgment = await this.store.findJudgment(scope, input.judgmentId);
    if (!judgment || judgment.conclusion !== "sound") {
      throw new OutcomePlaneError(
        "UNVERIFIED",
        "Verification requires a sound judgment in scope; unverified evidence never verifies.",
      );
    }
    const next: GroundTruthCandidate = {
      ...candidate,
      state: "verified",
      verifiedByJudgmentId: judgment.id,
      verificationEvidenceRefId: input.evidenceRefId,
      updatedAt: this.clockImpl.now(),
    };
    await this.store.saveCandidate(next);
    await this.event(scope, candidate.id, "verified", { judgmentId: judgment.id });
    return next;
  }

  async apply(
    scope: OutcomeScope,
    idempotencyKey: string,
    appliedPolicy: string,
  ): Promise<GroundTruthCandidate> {
    requireScope(scope);
    requireText(appliedPolicy, "appliedPolicy");
    const candidate = await this.store.findCandidateByKey(scope, idempotencyKey);
    if (!candidate) throw new OutcomePlaneError("NOT_FOUND", "Candidate not in scope.");
    if (candidate.state !== "verified") {
      throw new OutcomePlaneError(
        "POLICY_DENIED",
        "Only verified candidates apply, under a named policy.",
      );
    }
    const next: GroundTruthCandidate = {
      ...candidate,
      state: "applied",
      appliedPolicy,
      updatedAt: this.clockImpl.now(),
    };
    await this.store.saveCandidate(next);
    await this.event(scope, candidate.id, "applied", { appliedPolicy });
    return next;
  }

  async correct(
    scope: OutcomeScope,
    idempotencyKey: string,
    statement: string,
  ): Promise<GroundTruthCandidate> {
    requireScope(scope);
    requireText(statement, "statement");
    const candidate = await this.store.findCandidateByKey(scope, idempotencyKey);
    if (!candidate) throw new OutcomePlaneError("NOT_FOUND", "Candidate not in scope.");
    if (["retracted", "superseded", "invalid"].includes(candidate.state)) {
      throw new OutcomePlaneError("CONFLICT", "Terminal candidates cannot be corrected in place.");
    }
    if (candidate.statement === statement) return candidate;
    const next: GroundTruthCandidate = {
      ...candidate,
      statement,
      state: "proposed",
      verifiedByJudgmentId: null,
      verificationEvidenceRefId: null,
      appliedPolicy: null,
      sharedCrossTenant: false,
      updatedAt: this.clockImpl.now(),
    };
    await this.store.saveCandidate(next);
    await this.event(scope, candidate.id, "corrected", {
      previousStatement: candidate.statement,
      previousState: candidate.state,
      previousJudgmentId: candidate.verifiedByJudgmentId,
      previousEvidenceRefId: candidate.verificationEvidenceRefId,
      previousAppliedPolicy: candidate.appliedPolicy,
      previousSharedCrossTenant: candidate.sharedCrossTenant,
    });
    await this.invalidateDerived(scope, candidate.id);
    return next;
  }

  async retract(scope: OutcomeScope, idempotencyKey: string): Promise<GroundTruthCandidate> {
    requireScope(scope);
    const candidate = await this.store.findCandidateByKey(scope, idempotencyKey);
    if (!candidate) throw new OutcomePlaneError("NOT_FOUND", "Candidate not in scope.");
    if (candidate.state === "retracted" || candidate.state === "invalid") return candidate;
    const next: GroundTruthCandidate = {
      ...candidate,
      state: "retracted",
      updatedAt: this.clockImpl.now(),
    };
    await this.store.saveCandidate(next);
    await this.event(scope, candidate.id, "retracted");
    await this.invalidateDerived(scope, candidate.id);
    return next;
  }

  private async invalidateDerived(scope: OutcomeScope, sourceId: string): Promise<void> {
    const visited = new Set<string>([sourceId]);
    const queue = [sourceId];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      const all = await this.store.listCandidates(scope, null);
      for (const candidate of all) {
        if (visited.has(candidate.id)) continue;
        if (!candidate.derivedFromCandidateIds.includes(current)) continue;
        visited.add(candidate.id);
        if (
          candidate.state === "proposed" ||
          candidate.state === "verified" ||
          candidate.state === "applied"
        ) {
          await this.store.saveCandidate({
            ...candidate,
            state: "invalid",
            updatedAt: this.clockImpl.now(),
          });
          await this.event(scope, candidate.id, "invalidated", { sourceId: current });
        }
        queue.push(candidate.id);
      }
    }
  }

  async supersede(
    scope: OutcomeScope,
    idempotencyKey: string,
    byCandidateKey: string,
  ): Promise<GroundTruthCandidate> {
    requireScope(scope);
    const candidate = await this.store.findCandidateByKey(scope, idempotencyKey);
    if (!candidate) throw new OutcomePlaneError("NOT_FOUND", "Candidate not in scope.");
    const next = await this.store.findCandidateByKey(scope, byCandidateKey);
    if (!next) throw new OutcomePlaneError("NOT_FOUND", "Superseding candidate not in scope.");
    if (candidate.id === next.id || ["retracted", "superseded", "invalid"].includes(next.state)) {
      throw new OutcomePlaneError("CONFLICT", "Supersession requires a distinct valid replacement.");
    }
    if (candidate.state === "retracted" || candidate.state === "invalid") {
      throw new OutcomePlaneError("CONFLICT", "Retracted/invalid candidates do not supersede.");
    }
    const updated: GroundTruthCandidate = {
      ...candidate,
      state: "superseded",
      supersedesCandidateId: candidate.supersedesCandidateId,
      updatedAt: this.clockImpl.now(),
    };
    await this.store.saveCandidate({ ...updated, supersedesCandidateId: next.id });
    await this.event(scope, candidate.id, "superseded", { byCandidateId: next.id });
    await this.invalidateDerived(scope, candidate.id);
    return { ...updated, supersedesCandidateId: next.id };
  }

  async share(scope: OutcomeScope, idempotencyKey: string): Promise<GroundTruthCandidate> {
    requireScope(scope);
    const candidate = await this.store.findCandidateByKey(scope, idempotencyKey);
    if (!candidate) throw new OutcomePlaneError("NOT_FOUND", "Candidate not in scope.");
    if (!candidate.sharedCrossTenant) {
      await this.store.saveCandidate({ ...candidate, sharedCrossTenant: true });
      await this.event(scope, candidate.id, "shared");
    }
    return { ...candidate, sharedCrossTenant: true };
  }

  async unshare(scope: OutcomeScope, idempotencyKey: string): Promise<GroundTruthCandidate> {
    requireScope(scope);
    const candidate = await this.store.findCandidateByKey(scope, idempotencyKey);
    if (!candidate) throw new OutcomePlaneError("NOT_FOUND", "Candidate not in scope.");
    if (candidate.sharedCrossTenant) {
      await this.store.saveCandidate({ ...candidate, sharedCrossTenant: false });
      await this.event(scope, candidate.id, "unshared");
    }
    return { ...candidate, sharedCrossTenant: false };
  }

  /**
   * Adopt a shared foreign candidate as a LOCAL derived copy. Never mutates
   * the foreign row; the copy starts proposed in the adopting tenant.
   */
  async adoptShared(
    scope: OutcomeScope,
    sharedCandidateId: string,
    idempotencyKey: string,
  ): Promise<GroundTruthCandidate> {
    requireScope(scope);
    requireText(idempotencyKey, "idempotencyKey");
    const existing = await this.store.findCandidateByKey(scope, idempotencyKey);
    if (existing) return existing;
    const foreign = await this.store.listSharedCandidates(scope.tenantId, 1000);
    const source = foreign.find((c) => c.id === sharedCandidateId);
    if (!source) {
      throw new OutcomePlaneError(
        "FORBIDDEN",
        "Only explicitly shared cross-tenant candidates adopt; default is deny.",
      );
    }
    return this.propose({
      scope,
      statement: source.statement,
      provenance: { adoptedFrom: source.id, adoptedFromTenant: source.scope.tenantId },
      derivedFromCandidateIds: [],
      idempotencyKey,
    });
  }

  async history(scope: OutcomeScope, idempotencyKey: string) {
    requireScope(scope);
    const candidate = await this.store.findCandidateByKey(scope, idempotencyKey);
    if (!candidate) throw new OutcomePlaneError("NOT_FOUND", "Candidate not in scope.");
    return this.store.listGroundTruthEvents(scope, candidate.id);
  }
}
