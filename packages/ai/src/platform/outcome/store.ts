import type {
  ExperienceRecord,
  GroundTruthCandidate,
  GroundTruthEvent,
  JudgmentRecord,
  OutcomeRecord,
  OutcomeScope,
} from "./types";

function sameScope(a: OutcomeScope, b: OutcomeScope): boolean {
  return (
    a.organizationId === b.organizationId &&
    a.tenantId === b.tenantId &&
    (a.projectId ?? null) === (b.projectId ?? null)
  );
}

/** Tenant isolation: cross-tenant rows are invisible, never an error. */
function guarded<T extends { scope: OutcomeScope }>(
  scope: OutcomeScope,
  item: T | undefined,
): T | null {
  if (!item) return null;
  if (item.scope.tenantId !== scope.tenantId) return null;
  return item;
}

export interface OutcomePlaneStore {
  findOutcome(scope: OutcomeScope, id: string): Promise<OutcomeRecord | null>;
  findOutcomeByKey(scope: OutcomeScope, idempotencyKey: string): Promise<OutcomeRecord | null>;
  saveOutcome(outcome: OutcomeRecord): Promise<void>;
  findJudgment(scope: OutcomeScope, id: string): Promise<JudgmentRecord | null>;
  findJudgmentByKey(scope: OutcomeScope, idempotencyKey: string): Promise<JudgmentRecord | null>;
  saveJudgment(judgment: JudgmentRecord): Promise<void>;
  findExperienceByKey(scope: OutcomeScope, idempotencyKey: string): Promise<ExperienceRecord | null>;
  saveExperience(experience: ExperienceRecord): Promise<void>;
  listExperiences(scope: OutcomeScope, limit: number): Promise<ExperienceRecord[]>;
  findCandidate(scope: OutcomeScope, id: string): Promise<GroundTruthCandidate | null>;
  findCandidateByKey(scope: OutcomeScope, idempotencyKey: string): Promise<GroundTruthCandidate | null>;
  saveCandidate(candidate: GroundTruthCandidate): Promise<void>;
  listCandidates(scope: OutcomeScope, states: GroundTruthCandidate["state"][] | null): Promise<GroundTruthCandidate[]>;
  /** Cross-tenant read surface: ONLY candidates explicitly shared. */
  listSharedCandidates(excludeTenantId: string, limit: number): Promise<GroundTruthCandidate[]>;
  appendGroundTruthEvent(event: GroundTruthEvent): Promise<void>;
  listGroundTruthEvents(scope: OutcomeScope, candidateId: string): Promise<GroundTruthEvent[]>;
}

export class InMemoryOutcomePlaneStore implements OutcomePlaneStore {
  private readonly outcomes = new Map<string, OutcomeRecord>();
  private readonly judgments = new Map<string, JudgmentRecord>();
  private readonly experiences = new Map<string, ExperienceRecord>();
  private readonly candidates = new Map<string, GroundTruthCandidate>();
  private readonly events: GroundTruthEvent[] = [];

  private byKey<V extends { scope: OutcomeScope; idempotencyKey: string }>(
    map: Map<string, V>,
    scope: OutcomeScope,
    key: string,
  ): V | null {
    for (const item of map.values()) {
      if (item.idempotencyKey === key && item.scope.tenantId === scope.tenantId) {
        return item;
      }
    }
    return null;
  }

  async findOutcome(scope: OutcomeScope, id: string): Promise<OutcomeRecord | null> {
    return guarded(scope, this.outcomes.get(id));
  }
  async findOutcomeByKey(scope: OutcomeScope, idempotencyKey: string): Promise<OutcomeRecord | null> {
    return this.byKey(this.outcomes, scope, idempotencyKey);
  }
  async saveOutcome(outcome: OutcomeRecord): Promise<void> {
    this.outcomes.set(outcome.id, outcome);
  }

  async findJudgment(scope: OutcomeScope, id: string): Promise<JudgmentRecord | null> {
    return guarded(scope, this.judgments.get(id));
  }
  async findJudgmentByKey(scope: OutcomeScope, idempotencyKey: string): Promise<JudgmentRecord | null> {
    return this.byKey(this.judgments, scope, idempotencyKey);
  }
  async saveJudgment(judgment: JudgmentRecord): Promise<void> {
    this.judgments.set(judgment.id, judgment);
  }

  async findExperienceByKey(scope: OutcomeScope, idempotencyKey: string): Promise<ExperienceRecord | null> {
    return this.byKey(this.experiences, scope, idempotencyKey);
  }
  async saveExperience(experience: ExperienceRecord): Promise<void> {
    this.experiences.set(experience.id, experience);
  }
  async listExperiences(scope: OutcomeScope, limit: number): Promise<ExperienceRecord[]> {
    return [...this.experiences.values()]
      .filter((e) => e.scope.tenantId === scope.tenantId)
      .slice(0, Math.max(0, limit));
  }

  async findCandidate(scope: OutcomeScope, id: string): Promise<GroundTruthCandidate | null> {
    return guarded(scope, this.candidates.get(id));
  }
  async findCandidateByKey(scope: OutcomeScope, idempotencyKey: string): Promise<GroundTruthCandidate | null> {
    return this.byKey(this.candidates, scope, idempotencyKey);
  }
  async saveCandidate(candidate: GroundTruthCandidate): Promise<void> {
    this.candidates.set(candidate.id, candidate);
  }
  async listCandidates(
    scope: OutcomeScope,
    states: GroundTruthCandidate["state"][] | null,
  ): Promise<GroundTruthCandidate[]> {
    return [...this.candidates.values()].filter(
      (c) =>
        c.scope.tenantId === scope.tenantId &&
        (!states || states.includes(c.state)),
    );
  }
  async listSharedCandidates(excludeTenantId: string, limit: number): Promise<GroundTruthCandidate[]> {
    return [...this.candidates.values()]
      .filter((c) => c.scope.tenantId !== excludeTenantId && c.sharedCrossTenant)
      .slice(0, Math.max(0, limit));
  }
  async appendGroundTruthEvent(event: GroundTruthEvent): Promise<void> {
    this.events.push(event);
  }
  async listGroundTruthEvents(scope: OutcomeScope, candidateId: string): Promise<GroundTruthEvent[]> {
    return this.events.filter(
      (e) => e.candidateId === candidateId && e.scope.tenantId === scope.tenantId,
    );
  }
}

export { sameScope };
