import type {
  AuditEvent,
  BudgetDecision,
  DeletionProof,
  GovernanceScope,
  ProjectBudget,
  RetentionPolicy,
  UsageAttempt,
} from "./contract";

export interface GovernanceRepository {
  insertUsageAttempt(attempt: UsageAttempt): Promise<void>;
  listUsageAttempts(projectId: string, runId?: string): Promise<readonly UsageAttempt[]>;
  getBudget(projectId: string, at: string): Promise<ProjectBudget | null>;
  admitBudget(input: {
    projectId: string;
    requestedMicros: number;
    at: string;
  }): Promise<BudgetDecision>;
  appendAudit(event: AuditEvent): Promise<void>;
  getRetentionPolicies(projectId: string): Promise<readonly RetentionPolicy[]>;
  deleteCanonicalProjectData(scope: GovernanceScope): Promise<DeletionProof>;
  countCanonicalProjectRows(projectId: string): Promise<number>;
}

export interface TenantObjectDeletionStore {
  listProjectKeys(projectId: string): Promise<readonly string[]>;
  remove(keys: readonly string[]): Promise<void>;
}

