export type CanonicalAdminRole = "admin" | string | null | undefined;

export function parseAdminAllowlist(raw: string | null | undefined): ReadonlySet<string> {
  if (!raw?.trim()) return new Set();
  return new Set(raw.split(",").map((value) => value.trim()).filter(Boolean));
}

/**
 * Admin access requires both canonical profile membership and an explicit
 * deployment allowlist entry. Missing configuration or role data denies.
 */
export function hasAdminAccess(input: {
  actorId: string | null | undefined;
  role: CanonicalAdminRole;
  allowlistRaw?: string | null;
}): boolean {
  if (!input.actorId || input.role !== "admin") return false;
  return parseAdminAllowlist(input.allowlistRaw).has(input.actorId);
}
