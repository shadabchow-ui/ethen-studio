/**
 * Studio V5 M1 — canonical route map (Owner Lock O).
 *
 * One route per concept. Every legacy or duplicate Studio URL redirects in a
 * single hop to its canonical destination; Next's `redirects()` forwards the
 * incoming query string (projectId, category, …) unchanged. Pure data so the
 * config, tests and the M1 report share one table.
 *
 * RC5 — app URL scheme decision (P3-026). The three shapes are intentional,
 * not drift:
 *
 * - `/studio/pro/[tool]` — pro workbench tools (image, video, audio,
 *   dubbing, cinema): the same tool runtimes with timeline/editorial
 *   chrome. One family, one prefix.
 * - `/studio/marketing`, `/studio/influencer`, `/studio/voice-agents` —
 *   standalone Studio products. Each is a full experience with its own
 *   information architecture (not a tool variant), so each owns a
 *   top-level route instead of nesting under `/studio/apps/` or `/studio/pro/`.
 * - `/studio/apps` — the app directory (canonical). `/studio/apps/<panel>`
 *   deep links are legacy aliases that converge one hop onto the create
 *   runtimes, products, or pro tools above; internal links never target
 *   them (enforced by the route-authority suite).
 *
 * Project scope rides `?projectId=` on canonical routes. The retired
 * `/studio/projects/[id]/<generator|library>` shapes redirect one hop to
 * the same canonical routes; only the project overview
 * (`/studio/projects/[id]`) and export stay nested.
 */

export {
  STUDIO_CANONICAL_ROUTES,
  STUDIO_LEGACY_REDIRECTS,
  type StudioLegacyRedirect,
} from "../../next.config";

import { STUDIO_CANONICAL_ROUTES, STUDIO_LEGACY_REDIRECTS } from "../../next.config";

/** Canonical destination for a legacy path, or null when the path is canonical. */
export function canonicalStudioDestination(pathname: string): string | null {
  for (const entry of STUDIO_LEGACY_REDIRECTS) {
    const pattern = new RegExp(`^${entry.source.replace(/:[A-Za-z]+/g, "([^/]+)")}$`);
    const match = pathname.match(pattern);
    if (!match) continue;
    let index = 1;
    return entry.destination.replace(/:[A-Za-z]+/g, () => match[index++] ?? "");
  }
  return null;
}

/** True when the pathname is a legacy redirect source (never a link target). */
export function isLegacyStudioPath(pathname: string): boolean {
  return canonicalStudioDestination(pathname) !== null;
}

/** Canonical settings href, optionally deep-linked to a section. */
export function studioSettingsHref(section?: string): string {
  if (!section) return STUDIO_CANONICAL_ROUTES.settings;
  return `${STUDIO_CANONICAL_ROUTES.settings}?section=${encodeURIComponent(section)}`;
}

/**
 * RC5 — legacy settings-section aliases. Old deep links (`?section=plan`)
 * resolve to their canonical registry id; unknown ids fall back to
 * `general` (never a blank section).
 */
export const STUDIO_SETTINGS_SECTION_ALIASES: Readonly<Record<string, string>> = {
  plan: "billing",
};

/** Resolve a requested settings section to a valid registry id. */
export function resolveSettingsSectionId(
  requested: string | null | undefined,
  validIds: readonly string[],
  fallback = "general",
): string {
  const normalized = (requested ?? "").trim().toLowerCase();
  const aliased = STUDIO_SETTINGS_SECTION_ALIASES[normalized] ?? normalized;
  if ((validIds as readonly string[]).includes(aliased)) return aliased;
  return fallback;
}
