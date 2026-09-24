const SPOOF_HEADER_NAMES = [
  "x-user-id",
  "x-tenant-id",
  "x-organization-id",
  "x-org-id",
  "x-project-id",
  "x-actor-id",
] as const;

export interface PrincipalRequestHints {
  headers?: Headers | { get(name: string): string | null };
  bodyUserId?: string | null;
  bodyTenantId?: string | null;
  bodyOrganizationId?: string | null;
  bodyProjectId?: string | null;
}

/**
 * Client-supplied user/tenant/org identifiers are evidence of spoofing,
 * never an identity source.
 */
export function rejectClientSuppliedIdentity(hints: PrincipalRequestHints = {}): {
  denied: boolean;
  reason: string | null;
} {
  for (const name of SPOOF_HEADER_NAMES) {
    const value = hints.headers?.get(name)?.trim();
    if (value) {
      return {
        denied: true,
        reason: `Client-supplied ${name} is not a trusted identity source.`,
      };
    }
  }
  if (hints.bodyUserId || hints.bodyTenantId || hints.bodyOrganizationId) {
    return {
      denied: true,
      reason: "Client-supplied user, tenant, or organization identifiers are not trusted.",
    };
  }
  return { denied: false, reason: null };
}
