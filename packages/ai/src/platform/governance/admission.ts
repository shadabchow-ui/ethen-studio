import "server-only";
import type { AccessScope } from "../auth/canonical-tenant";
import { resolveKillSwitches, type ProductSwitchId } from "@ethen/contracts/launch/kill-switches";
import { verifyActionDigest, type ActionIntent } from "./action-intent";
import {
  isGrantActive,
  matchesResourceScope,
  RISK_RANKS,
  type CapabilityDefinition,
  type CapabilityGrant,
  type RiskLevel,
} from "./grants";

/**
 * P08-R2 — Canonical Fact-Driven Admission Engine
 *
 * Deterministic admission check order:
 * 1. AccessScope & Tenant Containment
 * 2. Emergency Kill Switches
 * 3. ActionIntent Parameter Integrity (Digest Verification)
 * 4. Capability Definition Integrity (Present, Active, Matching Action Code)
 * 5. Capability & Authority Grants (Exact Capability ID, Active, Risk Ceiling, Resource Scope)
 * 6. Explicit Policy Classification (omission = DENY, never inferred)
 * 7. Canonical Approval Binding (intent approvalId + normalized digest binding)
 * 8. Explicit Budget Classification (omission = DENY, never inferred)
 *
 * Fails closed on any missing required governance facts.
 */

export type AdmissionDecision =
  | "ALLOW"
  | "DENY"
  | "REQUIRES_APPROVAL"
  | "REQUIRES_BUDGET"
  | "BLOCKED_KILL_SWITCH"
  | "INVALID_STATE";

/**
 * Approval facts for admission. `actionIntentId` is a compatibility field:
 * canonical approvals do not natively contain it; the authoritative binding
 * is `intent.approvalId === approval.id` plus the normalized digest match.
 * `actionHash` MUST be present (normalized `sha256:<hex>`) for any
 * approval-required admission; omission denies.
 */
export interface ApprovalFact {
  id: string;
  status: "pending" | "approved" | "rejected" | "revoked" | "expired";
  tenantId: string;
  actionIntentId?: string | null;
  actionHash?: string | null;
  expiresAt: string;
  /** Optional originating project for canonical approvals (informational). */
  projectId?: string | null;
}

/** Approval facts with the required binding fields present (post-normalization). */
export interface RequiredApprovalFact extends ApprovalFact {
  actionHash: string;
}

export type BudgetClassification =
  | "NOT_REQUIRED"
  | "REQUIRED_UNRESERVED"
  | "REQUIRED_RESERVED";

export interface BudgetFact {
  /**
   * Explicit trusted classification. Omission denies admission; the engine
   * never infers NOT_REQUIRED from a missing fact.
   */
  classification: BudgetClassification;
  reserved?: boolean;
  reservationId?: string | null;
  estimatedCostUsd?: number | null;
  /** Legacy compat input; ignored by the admission engine. */
  required?: boolean;
}

export interface PolicyFact {
  /**
   * Explicit trusted state. Omission of the whole policy fact denies
   * admission; the engine never infers NOT_REQUIRED from absence.
   */
  state: "ALLOW" | "DENY" | "NOT_REQUIRED";
  reason?: string;
}

export interface AdmissionFacts {
  capabilityDefinition?: CapabilityDefinition | null;
  capabilityGrants?: readonly CapabilityGrant[];
  risk?: RiskLevel;
  policy?: PolicyFact | null;
  productSwitchId?: ProductSwitchId | null;
  approval?: ApprovalFact | null;
  budget?: BudgetFact | null;
  nowIso?: string;
  env?: Record<string, string | undefined>;
}

export interface AdmissionResult {
  decision: AdmissionDecision;
  wouldAllow: boolean;
  reasonCodes: readonly string[];
  issues: readonly string[];
  evaluatedAt: string;
}

const RAW_HASH_HEX = /^[0-9a-f]{64}$/;

/**
 * Normalize an approval hash to the canonical `sha256:<64 hex>` form.
 * Accepts raw canonical hex (`<64 hex>`) or already-prefixed
 * (`sha256:<64 hex>`). Rejects wrong algorithms, wrong lengths, and
 * malformed hashes by throwing. Historical canonical approval hashes are
 * never rewritten; normalization happens at comparison time only.
 */
export function normalizeApprovalHash(value: string): string {
  if (typeof value !== "string") {
    throw new Error("Approval hash must be a string");
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("sha256:")) {
    const raw = trimmed.slice("sha256:".length);
    if (!RAW_HASH_HEX.test(raw)) {
      throw new Error("Malformed approval hash: sha256 payload must be 64 hex chars");
    }
    return `sha256:${raw}`;
  }
  if (RAW_HASH_HEX.test(trimmed)) {
    return `sha256:${trimmed}`;
  }
  throw new Error(
    "Malformed approval hash: expected raw 64-char hex or 'sha256:<64 hex>'",
  );
}

/** Non-throwing well-formedness check for approval hashes. */
export function isWellFormedApprovalHash(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    normalizeApprovalHash(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical approval record shape (persistence) for the admission adapter.
 * Canonical approvals store a RAW sha256 hex `action_hash`; ActionIntents
 * carry `sha256:<hex>` digests. The adapter normalizes at comparison time.
 */
export interface CanonicalApprovalRecord {
  id: string;
  status: "pending" | "approved" | "rejected" | "revoked" | "expired";
  /** Raw canonical action hash (64 hex chars, no prefix). */
  actionHash: string;
  expiresAt: string;
  /** Resolved effective tenant, or null when not yet resolved. */
  tenantId?: string | null;
  projectId?: string | null;
}

/**
 * Canonical adapter from CanonicalApproval persistence to admission
 * ApprovalFacts. Normalizes id, tenant/project scope, status, action hash,
 * and expiry. The caller MUST supply the resolved effective tenant id when
 * the record does not carry one (canonical approvals are project-scoped;
 * the server resolves project -> tenant through the trusted tenancy lookup).
 * Arbitrary callers must not manufacture incomplete ApprovalFact objects for
 * production admission; use this adapter.
 */
export function toApprovalFact(
  record: CanonicalApprovalRecord,
  resolvedTenantId?: string | null,
): ApprovalFact {
  const tenantId = record.tenantId ?? resolvedTenantId ?? null;
  if (!tenantId) {
    throw new Error(
      "Canonical approval tenant scope is unresolved; supply the resolved effective tenant",
    );
  }
  if (!record.id) {
    throw new Error("Canonical approval id is required");
  }
  return {
    id: record.id,
    status: record.status,
    tenantId,
    actionIntentId: null,
    actionHash: normalizeApprovalHash(record.actionHash),
    expiresAt: record.expiresAt,
    projectId: record.projectId ?? null,
  };
}

export function evaluateAdmission(
  intent: ActionIntent,
  accessScope: AccessScope,
  facts: AdmissionFacts,
): AdmissionResult {
  const evaluatedAt = facts.nowIso ?? new Date().toISOString();
  const reasonCodes: string[] = [];
  const issues: string[] = [];

  // 1. Tenant & AccessScope Containment (Strict Invariant)
  if (intent.tenantId !== accessScope.tenantId) {
    reasonCodes.push("CROSS_TENANT_INTENT_DENIED");
    issues.push(
      `Intent tenant (${intent.tenantId}) does not match effective access scope (${accessScope.tenantId})`,
    );
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  if (intent.actorId !== accessScope.actorId) {
    reasonCodes.push("CROSS_ACTOR_INTENT_DENIED");
    issues.push(
      `Intent actor (${intent.actorId}) does not match effective access scope actor (${accessScope.actorId})`,
    );
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  // 2. Emergency Kill Switches (Evaluated before any execution or budget reservation)
  if (facts.productSwitchId) {
    const switches = resolveKillSwitches(facts.env ?? process.env);
    const switchState = switches.products[facts.productSwitchId];
    if (switchState?.disabled) {
      reasonCodes.push("KILL_SWITCH_ACTIVE");
      issues.push(
        switchState.reason ??
          `Product '${facts.productSwitchId}' is disabled by kill switch`,
      );
      return {
        decision: "BLOCKED_KILL_SWITCH",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }
  }

  // 3. ActionIntent Integrity (Digest Verification)
  if (!verifyActionDigest(intent)) {
    reasonCodes.push("ACTION_DIGEST_MISMATCH");
    issues.push("ActionIntent parameters do not match computed action digest");
    return {
      decision: "INVALID_STATE",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  // 4. Capability Definition Integrity
  if (!facts.capabilityDefinition) {
    reasonCodes.push("CAPABILITY_DEFINITION_MISSING");
    issues.push("CapabilityDefinition is required for governed execution");
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  if (facts.capabilityDefinition.id !== intent.capabilityId) {
    reasonCodes.push("CAPABILITY_ID_MISMATCH");
    issues.push(
      `Capability definition id (${facts.capabilityDefinition.id}) does not match intent capabilityId (${intent.capabilityId})`,
    );
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  if (facts.capabilityDefinition.actionCode !== intent.actionCode) {
    reasonCodes.push("CAPABILITY_ACTION_MISMATCH");
    issues.push(
      `Capability definition actionCode (${facts.capabilityDefinition.actionCode}) does not match intent actionCode (${intent.actionCode})`,
    );
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  if (!facts.capabilityDefinition.isActive) {
    reasonCodes.push("CAPABILITY_DEFINITION_INACTIVE");
    issues.push(`Capability definition '${facts.capabilityDefinition.id}' is inactive`);
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  // 5. Capability Grants & Authority
  if (!intent.capabilityId) {
    reasonCodes.push("CAPABILITY_ID_REQUIRED");
    issues.push("ActionIntent.capabilityId is required for governed execution");
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  const matchingGrants = (facts.capabilityGrants ?? []).filter(
    (g) =>
      g.tenantId === intent.tenantId &&
      g.actorId === intent.actorId &&
      g.capabilityId === intent.capabilityId,
  );

  if (matchingGrants.length === 0) {
    reasonCodes.push("CAPABILITY_GRANT_MISSING");
    issues.push(
      `Actor ${intent.actorId} does not hold a grant for capability ${intent.capabilityId} in tenant ${intent.tenantId}`,
    );
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  const validGrant = matchingGrants.find((g) => isGrantActive(g, evaluatedAt));
  if (!validGrant) {
    const isExpired = matchingGrants.some(
      (g) => g.expiresAt && g.expiresAt < evaluatedAt,
    );
    const code = isExpired
      ? "CAPABILITY_GRANT_EXPIRED"
      : "CAPABILITY_GRANT_REVOKED";
    reasonCodes.push(code);
    issues.push(`Capability grant is ${isExpired ? "expired" : "revoked"}`);
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  // Risk classification check (fail-closed)
  if (!facts.risk) {
    reasonCodes.push("RISK_CLASSIFICATION_MISSING");
    issues.push("Action requires explicit risk classification; fail-closed");
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  if (RISK_RANKS[facts.risk] > RISK_RANKS[validGrant.maxRisk]) {
    reasonCodes.push("RISK_EXCEEDS_AUTHORITY");
    issues.push(
      `Requested risk level (${facts.risk}) exceeds granted authority ceiling (${validGrant.maxRisk})`,
    );
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  // Resource Scope Enforcement (fail-closed; missing scope is NOT a wildcard)
  if (!matchesResourceScope(validGrant.resourceScope, intent.resourceId)) {
    reasonCodes.push("RESOURCE_SCOPE_DENIED");
    issues.push(
      `Target resource '${intent.resourceId ?? "none"}' is not authorized by grant resource scope '${validGrant.resourceScope ?? "none"}'`,
    );
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  // 6. Explicit Policy Classification (omission = DENY, never inferred).
  if (!facts.policy) {
    reasonCodes.push("POLICY_CLASSIFICATION_MISSING");
    issues.push("Action requires an explicit policy classification fact; omission denies");
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }
  if (facts.policy.state === "DENY") {
    reasonCodes.push("POLICY_DENIED");
    issues.push(facts.policy.reason ?? "Action blocked by canonical platform policy");
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }
  if (facts.policy.state === "NOT_REQUIRED") {
    if (facts.capabilityDefinition.sideEffectClass !== "READ_ONLY") {
      reasonCodes.push("POLICY_NOT_REQUIRED_INVALID");
      issues.push("NOT_REQUIRED policy classification is valid only for READ_ONLY capabilities");
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }
  }

  // 7. Canonical Approval Binding (strict, fail-closed).
  const requiresApproval =
    facts.capabilityDefinition.requiresApproval ||
    facts.risk === "high" ||
    facts.risk === "critical";

  if (requiresApproval) {
    if (!facts.approval) {
      reasonCodes.push("APPROVAL_REQUIRED");
      issues.push("Action requires explicit authorized approval before dispatch");
      return {
        decision: "REQUIRES_APPROVAL",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }

    if (facts.approval.status !== "approved") {
      reasonCodes.push("APPROVAL_NOT_APPROVED");
      issues.push(`Approval status is '${facts.approval.status}'`);
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }

    if (facts.approval.tenantId !== intent.tenantId) {
      reasonCodes.push("APPROVAL_TENANT_MISMATCH");
      issues.push("Approval was granted in a different tenant");
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }

    // Intent approval-ID binding: the intent must name its approval and the
    // approval id must equal it. An unrelated approved approval never satisfies.
    if (!intent.approvalId) {
      reasonCodes.push("APPROVAL_ID_MISSING");
      issues.push("Intent does not bind an approval id; approval binding required");
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }

    if (facts.approval.id !== intent.approvalId) {
      reasonCodes.push("APPROVAL_ID_MISMATCH");
      issues.push(
        `Approval id (${facts.approval.id}) does not match intent approval binding (${intent.approvalId})`,
      );
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }

    // Compatibility: when the approval record carries an intent id it must match.
    if (
      facts.approval.actionIntentId &&
      facts.approval.actionIntentId !== intent.id
    ) {
      reasonCodes.push("APPROVAL_INTENT_MISMATCH");
      issues.push(
        `Approval was issued for a different intent (${facts.approval.actionIntentId})`,
      );
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }

    // Cryptographic digest binding (required, normalized comparison).
    if (!facts.approval.actionHash) {
      reasonCodes.push("APPROVAL_HASH_MISSING");
      issues.push("Approval action hash is required; omission denies");
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }

    let normalizedApprovalHash: string;
    try {
      normalizedApprovalHash = normalizeApprovalHash(facts.approval.actionHash);
    } catch (err) {
      reasonCodes.push("APPROVAL_HASH_MALFORMED");
      issues.push(
        err instanceof Error ? err.message : "Approval action hash is malformed",
      );
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }

    if (normalizedApprovalHash !== intent.actionDigest) {
      reasonCodes.push("APPROVAL_DIGEST_MISMATCH");
      issues.push("Approval action digest does not match current ActionIntent parameters");
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }

    if (facts.approval.expiresAt < evaluatedAt) {
      reasonCodes.push("APPROVAL_EXPIRED");
      issues.push("Approval has expired");
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }
  }

  // 8. Explicit Budget Classification (omission = DENY, never inferred).
  const budget = facts.budget ?? null;
  if (!budget || !budget.classification) {
    reasonCodes.push("BUDGET_CLASSIFICATION_MISSING");
    issues.push("Action requires an explicit budget classification fact; omission denies");
    return {
      decision: "DENY",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  }

  if (budget.classification === "NOT_REQUIRED") {
    if (facts.capabilityDefinition.sideEffectClass !== "READ_ONLY") {
      reasonCodes.push("BUDGET_NOT_REQUIRED_INVALID");
      issues.push("NOT_REQUIRED budget classification is valid only for READ_ONLY capabilities");
      return {
        decision: "DENY",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }
    if ((budget.estimatedCostUsd ?? 0) > 0) {
      reasonCodes.push("BUDGET_RESERVATION_REQUIRED");
      issues.push("Action has financial cost and requires an atomic budget reservation");
      return {
        decision: "REQUIRES_BUDGET",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }
  } else if (budget.classification === "REQUIRED_UNRESERVED") {
    reasonCodes.push("BUDGET_RESERVATION_REQUIRED");
    issues.push("Action requires an atomic budget reservation");
    return {
      decision: "REQUIRES_BUDGET",
      wouldAllow: false,
      reasonCodes,
      issues,
      evaluatedAt,
    };
  } else {
    // REQUIRED_RESERVED: reservation material is mandatory.
    if (!budget.reserved || !budget.reservationId) {
      reasonCodes.push("BUDGET_RESERVATION_REQUIRED");
      issues.push("Action requires an atomic budget reservation");
      return {
        decision: "REQUIRES_BUDGET",
        wouldAllow: false,
        reasonCodes,
        issues,
        evaluatedAt,
      };
    }
  }

  // All checks passed
  return {
    decision: "ALLOW",
    wouldAllow: true,
    reasonCodes: ["ADMITTED"],
    issues: [],
    evaluatedAt,
  };
}
