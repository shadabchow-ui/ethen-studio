import "server-only";
import type { ReversibilityClass, SideEffectClass } from "./action-intent";

/**
 * P08-R2 — Capability & Authority Grants Contract
 *
 * Governs the classes of action an actor may legitimately execute
 * within an effective tenant perimeter.
 *
 * Invariant: Membership != Authority.
 *
 * P08-R2 resource-scope contract (fail-closed):
 * - `TENANT_WIDE_SCOPE` ("*") is the ONLY wildcard: explicit tenant-wide grant.
 * - `NO_RESOURCE_SCOPE` (null/undefined/"") means the grant carries NO resource
 *   dimension and matches ONLY resourceless intents. It is NEVER a wildcard.
 * - Every other scope string is an EXACT resource identifier (exact match only).
 * - The legacy ambiguous "all" alias is NOT a wildcard; it matches only the
 *   literal resource identifier "all".
 */

export interface CapabilityDefinition {
  id: string;
  actionCode: string;
  name: string;
  description?: string;
  sideEffectClass: SideEffectClass;
  reversibility: ReversibilityClass;
  requiresApproval: boolean;
  isActive: boolean;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export const RISK_RANKS: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** The only wildcard scope: an explicit tenant-wide grant. */
export const TENANT_WIDE_SCOPE = "*";

/**
 * Explicit marker for grants with no resource dimension. Stored as
 * null/undefined/"" in persistence; matched only against resourceless intents.
 */
export type NoResourceScope = null | undefined | "";

export interface CapabilityGrant {
  id: string;
  tenantId: string;
  actorId: string;
  capabilityId: string;
  resourceScope?: string | null;
  maxRisk: RiskLevel;
  status: "active" | "revoked" | "expired";
  delegatedByActorId?: string | null;
  /**
   * P08-R2: exact lineage to the parent grant that supplied delegated power.
   * Root (non-delegated) grants: null. Delegated grants: NOT NULL.
   */
  parentGrantId?: string | null;
  expiresAt?: string | null;
}

export function isGrantActive(
  grant: CapabilityGrant,
  nowIso: string = new Date().toISOString(),
): boolean {
  if (grant.status !== "active") return false;
  if (grant.expiresAt && grant.expiresAt < nowIso) return false;
  return true;
}

/** True only for the explicit tenant-wide wildcard "*". */
export function isTenantWideScope(scope: string | null | undefined): boolean {
  return (scope ?? "").trim() === TENANT_WIDE_SCOPE;
}

/** True when the scope carries no resource dimension (null/undefined/empty). */
export function isNoResourceScope(scope: string | null | undefined): boolean {
  return (scope ?? "").trim() === "";
}

export function describeResourceScope(
  scope: string | null | undefined,
): "TENANT_WIDE" | "NO_RESOURCE" | "EXACT" {
  if (isTenantWideScope(scope)) return "TENANT_WIDE";
  if (isNoResourceScope(scope)) return "NO_RESOURCE";
  return "EXACT";
}

/**
 * P08-R2 fail-closed resource scope matching.
 *
 * - Missing/empty grant scope matches ONLY resourceless targets (NO_RESOURCE).
 *   It NEVER acts as a wildcard: a resource-targeting intent against a
 *   missing scope is DENIED.
 * - "*" (TENANT_WIDE) matches any target including resourceless ones.
 * - All other scopes require an exact (trimmed) match. "all" is literal.
 */
export function matchesResourceScope(
  grantScope?: string | null,
  targetResourceId?: string | null,
): boolean {
  const grant = (grantScope ?? "").trim();
  const target = (targetResourceId ?? "").trim();
  if (grant === TENANT_WIDE_SCOPE) {
    return true;
  }
  if (grant === "") {
    return target === "";
  }
  if (target === "") {
    return false;
  }
  return grant === target;
}

/**
 * Delegation resource ceiling: the child scope must be equal to or narrower
 * than the parent scope. A tenant-wide parent may delegate any scope; a
 * scoped parent may only delegate its exact scope (or a resourceless child
 * when the parent itself is resourceless). A child wildcard under a scoped
 * parent is an escalation and is DENIED.
 */
export function isResourceScopeNarrowerOrEqual(
  childScope: string | null | undefined,
  parentScope: string | null | undefined,
): boolean {
  const parent = (parentScope ?? "").trim();
  const child = (childScope ?? "").trim();
  if (parent === TENANT_WIDE_SCOPE) {
    return true;
  }
  if (child === TENANT_WIDE_SCOPE) {
    return false;
  }
  if (parent === "") {
    return child === "";
  }
  if (child === "") {
    return false;
  }
  return child === parent;
}

export interface ValidateDelegationInput {
  parentGrant: CapabilityGrant;
  /** Explicit parent-grant binding. When supplied must equal parentGrant.id. */
  parentGrantId?: string | null;
  targetActorId: string;
  /** Actor performing the delegation; must own the parent grant. */
  delegatorActorId: string;
  tenantId: string;
  /** Requested capability for the child grant; must equal parent capability. */
  requestedCapabilityId: string;
  /** Requested resource scope for the child grant; must narrow parent scope. */
  requestedResourceScope?: string | null;
  maxRisk: RiskLevel;
  expiresAt?: string | null;
  /**
   * Required governance membership facts. Fail-closed: anything other than
   * an explicit `true` denies. Omission (undefined) is DENY, never pass.
   */
  targetActorMember: boolean;
  delegatorActorMember: boolean;
}

export function validateDelegation(
  input: ValidateDelegationInput,
  nowIso: string = new Date().toISOString(),
): { valid: true } | { valid: false; reason: string } {
  // 0. Required-fact omission fails closed (DELEGATION_FACT_OMISSION = DENY).
  if (!input.parentGrant) {
    return { valid: false, reason: "Parent grant fact is missing; omission denies delegation" };
  }
  if (typeof input.tenantId !== "string" || input.tenantId.trim() === "") {
    return { valid: false, reason: "Delegation tenant fact is missing; omission denies delegation" };
  }
  if (typeof input.targetActorId !== "string" || input.targetActorId.trim() === "") {
    return { valid: false, reason: "Delegation target actor fact is missing; omission denies delegation" };
  }
  if (typeof input.delegatorActorId !== "string" || input.delegatorActorId.trim() === "") {
    return { valid: false, reason: "Delegation delegator actor fact is missing; omission denies delegation" };
  }
  if (
    typeof input.requestedCapabilityId !== "string" ||
    input.requestedCapabilityId.trim() === ""
  ) {
    return {
      valid: false,
      reason: "Delegation requested capability fact is missing; omission denies delegation",
    };
  }
  if (!input.maxRisk || !(input.maxRisk in RISK_RANKS)) {
    return { valid: false, reason: "Delegation requested risk fact is missing; omission denies delegation" };
  }
  if (input.targetActorMember !== true) {
    return {
      valid: false,
      reason: "Target actor membership fact missing or inactive; omission denies delegation",
    };
  }
  if (input.delegatorActorMember !== true) {
    return {
      valid: false,
      reason: "Delegator membership fact missing or inactive; omission denies delegation",
    };
  }

  // 1. Parent must be active
  if (!isGrantActive(input.parentGrant, nowIso)) {
    return { valid: false, reason: "Parent grant is not active or has expired" };
  }

  // 1b. Explicit parent-grant binding
  if (
    input.parentGrantId !== undefined &&
    input.parentGrantId !== null &&
    input.parentGrantId !== input.parentGrant.id
  ) {
    return {
      valid: false,
      reason: "Delegation parent grant binding mismatch: supplied parent grant id does not match parent grant",
    };
  }

  // 2. Tenant containment: Delegation cannot cross tenant boundaries
  if (input.parentGrant.tenantId !== input.tenantId) {
    return {
      valid: false,
      reason: "Delegation across tenant boundaries is strictly forbidden",
    };
  }

  // 2b. Capability ceiling: child capability must equal parent capability
  if (input.requestedCapabilityId !== input.parentGrant.capabilityId) {
    return {
      valid: false,
      reason: `Delegated capability (${input.requestedCapabilityId}) does not match parent grant capability (${input.parentGrant.capabilityId}); capability escalation denied`,
    };
  }

  // 2c. Parent grant must belong to the delegating actor
  if (input.parentGrant.actorId !== input.delegatorActorId) {
    return {
      valid: false,
      reason: "Parent grant does not belong to the delegating actor; delegation denied",
    };
  }

  // 3. No self-escalation: Target cannot be delegator
  if (input.delegatorActorId === input.targetActorId) {
    return { valid: false, reason: "Self-escalation is forbidden" };
  }
  if (input.parentGrant.actorId === input.targetActorId) {
    return { valid: false, reason: "Self-escalation is forbidden" };
  }

  // 4-5. Membership facts already enforced fail-closed above (both must be true).

  // 6. Risk ceiling: Delegated risk cannot exceed parent risk
  if (RISK_RANKS[input.maxRisk] > RISK_RANKS[input.parentGrant.maxRisk]) {
    return {
      valid: false,
      reason: `Delegated risk (${input.maxRisk}) exceeds parent grant risk (${input.parentGrant.maxRisk})`,
    };
  }

  // 7. Expiration ceiling: Delegated expiry cannot exceed parent expiry
  if (input.parentGrant.expiresAt) {
    if (!input.expiresAt || input.expiresAt > input.parentGrant.expiresAt) {
      return {
        valid: false,
        reason: "Delegated expiration cannot exceed parent grant expiration",
      };
    }
  }

  // 8. Resource ceiling: child scope must narrow (or equal) parent scope
  if (
    !isResourceScopeNarrowerOrEqual(
      input.requestedResourceScope ?? null,
      input.parentGrant.resourceScope ?? null,
    )
  ) {
    return {
      valid: false,
      reason: `Delegated resource scope ('${input.requestedResourceScope ?? "none"}') is broader than parent grant scope ('${input.parentGrant.resourceScope ?? "none"}'); resource escalation denied`,
    };
  }

  return { valid: true };
}
