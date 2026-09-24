import type { PriceRecord } from "@ethen/models/registry";

export type CostVerification = "verified" | "unverified";
export type AuditOutcome = "allowed" | "denied" | "succeeded" | "failed";

export interface GovernanceScope {
  organizationId: string;
  projectId: string;
  actorId: string;
}

export interface UsageAttempt {
  id: string;
  organizationId: string;
  projectId: string;
  actorId: string;
  runId: string;
  attemptId: string;
  providerId: string;
  modelId: string;
  inputUnits: number;
  outputUnits: number;
  currency: string | null;
  costMicros: number | null;
  costVerification: CostVerification;
  priceSource: string | null;
  priceRetrievedAt: string | null;
  priceExpiresAt: string | null;
  createdAt: string;
}

export interface ProjectBudget {
  projectId: string;
  limitMicros: number;
  periodStartsAt: string;
  periodEndsAt: string;
  enabled: boolean;
}

export interface BudgetDecision {
  allowed: boolean;
  reason: "within_budget" | "budget_missing" | "limit_reached";
  spentMicros: number;
  requestedMicros: number;
  limitMicros: number | null;
}

export interface AuditEvent {
  id: string;
  organizationId: string;
  projectId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  policy: Readonly<Record<string, unknown>>;
  outcome: AuditOutcome;
  traceId: string;
  createdAt: string;
}

export interface RetentionPolicy {
  projectId: string;
  enabled: boolean;
  dataClass: string;
  retainDays: number;
  legalHold: boolean;
}

export interface DeletionProof {
  id: string;
  organizationId: string;
  projectId: string;
  requestedBy: string;
  rowsDeleted: number;
  objectsDeleted: number;
  verification: "verified";
  completedAt: string;
}

export type PriceResolver = (modelId: string, now: Date) => PriceRecord | null;

export interface RecordUsageInput {
  runId: string;
  attemptId: string;
  providerId: string;
  modelId: string;
  inputUnits: number;
  outputUnits: number;
  traceId: string;
}
