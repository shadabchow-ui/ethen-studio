/**
 * Studio V5 M1 — canonical active-project contract (pure).
 *
 * One rule for every Studio surface:
 *   1. a valid URL `projectId` overrides the saved selection;
 *   2. otherwise the saved selection (cookie) applies when still valid;
 *   3. otherwise, when exactly one project exists, it is auto-selected;
 *   4. otherwise no project is active.
 * Invalid URL or cookie selections are reported so callers can clear them.
 *
 * Browser-safe and framework-free: the server helper, the API route and the
 * client provider all call this one resolver.
 */

export const STUDIO_ACTIVE_PROJECT_COOKIE = "ethen_studio_project";
/** One year; the selection is a preference, not a credential. */
export const STUDIO_ACTIVE_PROJECT_MAX_AGE = 60 * 60 * 24 * 365;

export type ActiveProjectSource = "url" | "cookie" | "auto" | "none";

export interface ActiveProjectResolution {
  projectId: string | null;
  source: ActiveProjectSource;
  /** Selections that were supplied but are not visible to the actor. */
  rejected: Array<"url" | "cookie">;
  /** True when the persisted selection should be rewritten to `projectId`. */
  persist: boolean;
  /** True when the persisted selection must be removed. */
  clear: boolean;
}

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Normalise a raw project id; malformed input is treated as absent. */
export function normalizeProjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return PROJECT_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function resolveActiveProject(input: {
  urlProjectId?: unknown;
  cookieProjectId?: unknown;
  /** Project ids visible to the actor. */
  memberships: readonly string[];
}): ActiveProjectResolution {
  const visible = new Set(input.memberships);
  const url = normalizeProjectId(input.urlProjectId);
  const cookie = normalizeProjectId(input.cookieProjectId);
  const rejected: Array<"url" | "cookie"> = [];

  if (url) {
    if (visible.has(url)) {
      return { projectId: url, source: "url", rejected, persist: url !== cookie, clear: false };
    }
    rejected.push("url");
  }
  if (cookie) {
    if (visible.has(cookie)) {
      return { projectId: cookie, source: "cookie", rejected, persist: false, clear: false };
    }
    rejected.push("cookie");
  }
  if (input.memberships.length === 1) {
    const only = input.memberships[0]!;
    return { projectId: only, source: "auto", rejected, persist: true, clear: false };
  }
  return { projectId: null, source: "none", rejected, persist: false, clear: rejected.includes("cookie") };
}

/**
 * Server-render hint without a membership read: URL override, else cookie.
 * Membership is enforced by every data route (`requireProject`) and the
 * client provider re-validates through `/api/studio/v1/projects/active`.
 */
export function preferredProjectId(input: { urlProjectId?: unknown; cookieProjectId?: unknown }): string | null {
  return normalizeProjectId(input.urlProjectId) ?? normalizeProjectId(input.cookieProjectId);
}

/** Append or replace `projectId` on an in-app href, preserving other query state. */
export function withProjectQuery(href: string, projectId: string | null): string {
  if (!projectId) return href;
  const [pathAndQuery, hash = ""] = href.split("#");
  const [path, query = ""] = pathAndQuery!.split("?");
  const params = new URLSearchParams(query);
  params.set("projectId", projectId);
  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}
