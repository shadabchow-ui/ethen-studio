import { getBillablePriceRecord } from "@ethen/models/registry";
import type {
  AuditEvent,
  BudgetDecision,
  DeletionProof,
  GovernanceScope,
  PriceResolver,
  RecordUsageInput,
  UsageAttempt,
} from "./contract";
import { GovernanceError } from "./errors";
import type {
  GovernanceRepository,
  TenantObjectDeletionStore,
} from "./repository";

const usdMicros = (value: number) => Math.round(value * 1_000_000);

export class GovernanceService {
  private readonly repository: GovernanceRepository;
  private readonly objectStore: TenantObjectDeletionStore;
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly resolvePrice: PriceResolver;

  constructor(input: {
    repository: GovernanceRepository;
    objectStore: TenantObjectDeletionStore;
    now?: () => string;
    id?: () => string;
    resolvePrice?: PriceResolver;
  }) {
    this.repository = input.repository;
    this.objectStore = input.objectStore;
    this.now = input.now ?? (() => new Date().toISOString());
    this.id = input.id ?? (() => crypto.randomUUID());
    this.resolvePrice = input.resolvePrice ?? getBillablePriceRecord;
  }

  async admit(
    scope: GovernanceScope,
    requestedCostMicros: number,
    traceId: string,
  ): Promise<BudgetDecision> {
    const decision = await this.repository.admitBudget({
      projectId: scope.projectId,
      requestedMicros: requestedCostMicros,
      at: this.now(),
    });
    await this.audit(scope, "budget.admission", "project", scope.projectId,
      decision.allowed ? "allowed" : "denied", traceId, { ...decision });
    if (!decision.allowed) {
      throw new GovernanceError("BUDGET_DENIED", "Project budget limit reached.");
    }
    return decision;
  }

  async recordUsage(
    scope: GovernanceScope,
    input: RecordUsageInput,
  ): Promise<UsageAttempt> {
    const createdAt = this.now();
    const price = this.resolvePrice(input.modelId, new Date(createdAt));
    const costMicros = price
      ? usdMicros(
          (price.inputPricePerUnit ?? 0) * input.inputUnits +
          (price.outputPricePerUnit ?? 0) * input.outputUnits,
        )
      : null;
    const attempt: UsageAttempt = Object.freeze({
      id: this.id(),
      ...scope,
      runId: input.runId,
      attemptId: input.attemptId,
      providerId: input.providerId,
      modelId: input.modelId,
      inputUnits: input.inputUnits,
      outputUnits: input.outputUnits,
      currency: price?.currency ?? null,
      costMicros,
      costVerification: price ? "verified" : "unverified",
      priceSource: price?.source ?? null,
      priceRetrievedAt: price?.retrievedAt ?? null,
      priceExpiresAt: price?.expiresAt ?? null,
      createdAt,
    });
    await this.repository.insertUsageAttempt(attempt);
    await this.audit(scope, "usage.recorded", "usage_attempt", attempt.id,
      "succeeded", input.traceId, {
        attemptId: input.attemptId,
        costVerification: attempt.costVerification,
        priceSource: attempt.priceSource,
        priceRetrievedAt: attempt.priceRetrievedAt,
      });
    return attempt;
  }

  async deleteProjectData(
    scope: GovernanceScope,
    traceId: string,
  ): Promise<DeletionProof> {
    const policies = await this.repository.getRetentionPolicies(scope.projectId);
    if (!policies.some((policy) => policy.enabled)) {
      throw new GovernanceError("DELETION_DISABLED", "Retention and deletion are disabled by default.");
    }
    if (policies.some((policy) => policy.legalHold)) {
      throw new GovernanceError("LEGAL_HOLD", "A legal hold prevents project deletion.");
    }
    const keys = await this.objectStore.listProjectKeys(scope.projectId);
    await this.objectStore.remove(keys);
    const proof = await this.repository.deleteCanonicalProjectData(scope);
    const [remainingKeys, remainingRows] = await Promise.all([
      this.objectStore.listProjectKeys(scope.projectId),
      this.repository.countCanonicalProjectRows(scope.projectId),
    ]);
    if (remainingKeys.length || remainingRows) {
      throw new GovernanceError("DELETION_INCOMPLETE", "Deletion verification found remaining tenant data.");
    }
    await this.audit(scope, "project_data.deleted", "project", scope.projectId,
      "succeeded", traceId, { ...proof });
    return { ...proof, objectsDeleted: keys.length };
  }

  private async audit(
    scope: GovernanceScope,
    action: string,
    resourceType: string,
    resourceId: string | null,
    outcome: AuditEvent["outcome"],
    traceId: string,
    policy: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.repository.appendAudit({
      id: this.id(),
      ...scope,
      action,
      resourceType,
      resourceId,
      policy,
      outcome,
      traceId,
      createdAt: this.now(),
    });
  }
}
