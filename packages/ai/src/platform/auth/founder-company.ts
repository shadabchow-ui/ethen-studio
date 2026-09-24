import "server-only";

import { NextResponse } from "next/server";
import { requireUserSession } from "./guards";
import { createServiceClient } from "@ethen/database/service";
import { hasConfiguredSupabasePublicEnv } from "@ethen/config/env";

/**
 * FND-P0-07 / FND-P0-09 — Founder company-tenancy guard.
 *
 * Founder records are company-scoped. requireFounderSession authenticates the
 * actor but proves NO company membership; the company scope in Founder API
 * bodies/queries must be validated server-side against the company roster
 * (founder_companies.user_id owner OR founder_company_members membership)
 * before any record read/write.
 *
 * Non-members and unknown companies receive the SAME 404 — company existence
 * is not disclosed. Legacy/absent membership data fails closed.
 */

export interface FounderCompanyGuardOutcome {
  state: "authorized" | "unauthenticated" | "forbidden" | "setup_required";
  actorId: string | null;
  companyId: string | null;
  response: NextResponse | null;
}

export type FounderMembershipResolver = (
  companyId: string,
  actorId: string,
) => Promise<boolean>;

const notFound = (): NextResponse =>
  NextResponse.json({ ok: false, error: "not_found", code: "not_found" }, { status: 404 });

const unauthenticated = (): NextResponse =>
  NextResponse.json({ ok: false, error: "unauthenticated", code: "unauthenticated" }, { status: 401 });

const setupRequired = (): NextResponse =>
  NextResponse.json({ ok: false, error: "setup_required", code: "setup_required" }, { status: 503 });

/**
 * Production membership resolver: the actor is a member when they own the
 * company (founder_companies.user_id) or appear on the roster
 * (founder_company_members). Both checks are exact-equality against the
 * canonical company id; nothing is derived from request input.
 */
export async function resolveFounderCompanyMembership(
  companyId: string,
  actorId: string,
): Promise<boolean> {
  if (!hasConfiguredSupabasePublicEnv()) return false;
  const service = createServiceClient({
    reason: "founder_company_membership_lookup",
    actorId,
    tables: ["founder_companies", "founder_company_members"],
  });
  if (!service) return false;

  const { data: company, error: companyError } = await service
    .from("founder_companies")
    .select("user_id")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) return false;
  if (company && company.user_id === actorId) return true;

  const { data: membership, error: membershipError } = await service
    .from("founder_company_members")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", actorId)
    .maybeSingle();
  if (membershipError) return false;
  return Boolean(membership);
}

/** Deterministic boundary seam; production callers use the real resolvers. */
export async function requireFounderCompanyMemberWith(input: {
  companyId: string;
  resolveActor: () => Promise<string | null>;
  resolveMembership: FounderMembershipResolver;
}): Promise<FounderCompanyGuardOutcome> {
  const actorId = await input.resolveActor();
  if (!actorId) {
    return { state: "unauthenticated", actorId: null, companyId: null, response: unauthenticated() };
  }
  const isMember = await input.resolveMembership(input.companyId, actorId);
  if (!isMember) {
    return { state: "forbidden", actorId, companyId: null, response: notFound() };
  }
  return { state: "authorized", actorId, companyId: input.companyId, response: null };
}

/**
 * Require the session AND company membership. Both failures are explicit:
 * no session → 401; no company membership (or company unknown) → 404.
 */
export async function requireFounderCompanyMember(input: {
  companyId: string;
}): Promise<FounderCompanyGuardOutcome> {
  const session = await requireUserSession();
  if (session.response || !session.actorId) {
    return {
      state: session.state === "unauthenticated" ? "unauthenticated" : "setup_required",
      actorId: null,
      companyId: null,
      response: session.response ?? setupRequired(),
    };
  }
  return requireFounderCompanyMemberWith({
    companyId: input.companyId,
    resolveActor: async () => session.actorId,
    resolveMembership: resolveFounderCompanyMembership,
  });
}
