/**
 * Studio V5 M1 — canonical route map (Owner Lock O).
 *
 * One route per concept. Every legacy or duplicate Studio URL redirects in a
 * single hop to its canonical destination; Next's `redirects()` forwards the
 * incoming query string (projectId, category, …) unchanged. Pure data so the
 * config, tests and the M1 report share one table.
 */

export {
  STUDIO_CANONICAL_ROUTES,
  STUDIO_LEGACY_REDIRECTS,
  type StudioLegacyRedirect,
} from "../../next.config";

import { STUDIO_LEGACY_REDIRECTS } from "../../next.config";

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
