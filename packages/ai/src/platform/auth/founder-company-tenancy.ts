import "server-only";

/**
 * P15 — Tenancy-guard reconciliation (P14 row: tenancy guards, ADAPT_P15).
 *
 * V5 lib/platform/auth/founder-company.ts contributed fail-closed roster
 * semantics (404 for non-members AND unknown companies). The canonical V4
 * guard (./founder-company.ts) already implements exactly that against the
 * canonical roster (founder_companies.user_id owner OR founder_company_members
 * membership). P15 therefore reconciles by layering, not rewriting:
 *
 *   P07 tenants/tenant_members/actors = platform authority (ONE EXECUTION =
 *     ONE EFFECTIVE TENANT). Founder company hierarchy is domain data.
 *
 * This module is the P07-aware membership check new P15 domain paths use:
 * the actor must BOTH satisfy the canonical company roster AND hold P07
 * tenant membership for the company tenant. Either check failing closes
 * (forbidden). No identity fork: company membership never mints actors or
 * tenants.
 */

export interface P15TenancyCheck {
  isCompanyMember: boolean;
  isTenantMember: boolean;
  tenantId: string | null;
}

export function evaluateP15Tenancy(check: P15TenancyCheck): "authorized" | "forbidden" {
  if (!check.isCompanyMember) return "forbidden";
  if (check.tenantId && !check.isTenantMember) return "forbidden";
  return "authorized";
}
