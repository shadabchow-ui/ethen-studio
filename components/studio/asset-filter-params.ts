/**
 * IE-M6B M6B-04 — asset kind-filter URL param helpers (framework-free).
 *
 * The canonical asset filter lives in the URL (`?kind=`) so reload and
 * share preserve it (RSR filter gate). Unknown/missing values fall back
 * to "all" — never a broken filter state.
 */

export const KIND_FILTERS = ["all", "import", "image", "video", "audio", "reference"] as const;

export type KindFilter = (typeof KIND_FILTERS)[number];

export function parseKindFilter(value: unknown): KindFilter {
  return typeof value === "string" && (KIND_FILTERS as readonly string[]).includes(value)
    ? (value as KindFilter)
    : "all";
}

export function serializeKindFilter(kind: KindFilter): string {
  return `kind=${encodeURIComponent(kind)}`;
}

/**
 * Remediation Pass 3 — selected project as URL view state (V2 FINAL §15.2,
 * RSR). Reload, Back/Forward and share restore the asset library's project.
 *
 * Recovery contract: the URL value is only a request. It restores ONLY when
 * the server's authorization-scoped project list contains it; anything else
 * (deleted, another user's, malformed) is rejected and removed from the URL —
 * never silently mapped to a different project. Restoration goes through the
 * same LatestRequestGate ticket as a user selection, so a later click still
 * supersedes it (Pass 1 F3 stays intact).
 */
export const PROJECT_PARAM = "project";
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type ProjectRestore =
  | { kind: "none" }
  | { kind: "pending" }
  | { kind: "restore"; projectId: string }
  | { kind: "reject"; reason: "malformed" | "not-in-authorized-list" };

export function resolveProjectRestore(
  urlValue: string | null,
  projectState: "loading" | "ready" | "error",
  authorizedProjectIds: readonly string[],
): ProjectRestore {
  if (urlValue === null || urlValue === "") return { kind: "none" };
  if (!PROJECT_ID_PATTERN.test(urlValue)) return { kind: "reject", reason: "malformed" };
  if (projectState === "loading") return { kind: "pending" };
  // Listing failed: nothing is authorized to restore; keep the URL untouched
  // so a later successful load can still honor it.
  if (projectState === "error") return { kind: "pending" };
  return authorizedProjectIds.includes(urlValue)
    ? { kind: "restore", projectId: urlValue }
    : { kind: "reject", reason: "not-in-authorized-list" };
}

/** Query for the asset library, preserving both view-state params. */
export function serializeAssetView(view: { kind: KindFilter; projectId: string | null }): string {
  const params = new URLSearchParams();
  if (view.projectId) params.set(PROJECT_PARAM, view.projectId);
  params.set("kind", view.kind);
  return params.toString();
}
