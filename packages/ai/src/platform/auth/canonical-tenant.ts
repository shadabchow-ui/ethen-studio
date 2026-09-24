import "server-only";

/**
 * P07 / P07-R — Canonical Tenancy & Access Scope Contract
 *
 * Defines the authoritative Security Boundary for Ethen M1.
 * Governs Core, Founder, and Bot executions under the invariant:
 * ONE EXECUTION = ONE EFFECTIVE TENANT SCOPE.
 *
 * Separates stable Actor Identity (who/what acts) from Tenant Membership
 * (which tenant perimeters that actor may legitimately participate in).
 */

export type TenantType = "personal" | "organization";

export interface CanonicalTenant {
  id: string;
  type: TenantType;
  name: string;
  slug?: string | null;
  ownerUserId?: string | null;
  clerkOrgId?: string | null;
  metadata?: Record<string, unknown>;
}

export type ActorKind = "human" | "agent" | "service" | "connector";

export interface CanonicalActor {
  id: string;
  kind: ActorKind;
  profileId: string | null;
  identifier: string;
  displayName: string;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  homeTenantId?: string | null;
  tenantId?: string | null; // Optional compatibility alias for homeTenantId
}

export interface ActorTenantMembership {
  id?: string;
  actorId: string;
  tenantId: string;
  membershipKind?: "owner" | "admin" | "member" | "service" | "guest" | string;
  isActive?: boolean;
}

export interface AccessScope {
  tenantId: string;
  tenantType: TenantType;
  actorId: string;
  actorKind: ActorKind;
  principalId: string; // auth.uid() for humans; unique actor identifier for non-humans
  roles: readonly string[];
  permissions: readonly string[];
}

export interface ResolveAccessScopeInput {
  tenant: CanonicalTenant;
  actor: CanonicalActor;
  memberships?: readonly ActorTenantMembership[];
  roles?: readonly string[];
  permissions?: readonly string[];
}

/**
 * Creates a validated AccessScope ensuring legitimate tenant membership.
 * Fails closed if the actor is not a member of the target tenant.
 */
export function createAccessScope(input: ResolveAccessScopeInput): AccessScope {
  if (!input.actor.isActive) {
    throw new Error(`AccessScope violation: Actor ${input.actor.id} is inactive`);
  }

  // Check tenant membership:
  // 1. Explicit membership record provided in memberships array
  // 2. Or fallback to actor's direct home tenant when memberships list is omitted
  const hasExplicitMembership = input.memberships?.some(
    (m) =>
      m.actorId === input.actor.id &&
      m.tenantId === input.tenant.id &&
      m.isActive !== false,
  );

  const isHomeTenant =
    !input.memberships &&
    (input.actor.homeTenantId === input.tenant.id ||
      input.actor.tenantId === input.tenant.id);

  if (!hasExplicitMembership && !isHomeTenant) {
    throw new Error(
      `AccessScope violation: Actor ${input.actor.id} is not an active member of tenant ${input.tenant.id}`,
    );
  }

  const principalId =
    input.actor.kind === "human" && input.actor.profileId
      ? input.actor.profileId
      : input.actor.identifier;

  return {
    tenantId: input.tenant.id,
    tenantType: input.tenant.type,
    actorId: input.actor.id,
    actorKind: input.actor.kind,
    principalId,
    roles: input.roles ?? ["member"],
    permissions: input.permissions ?? [],
  };
}
