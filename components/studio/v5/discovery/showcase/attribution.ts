import type { StudioShowcaseItem } from "../../../../../lib/studio-v5/showcase-feed";
import { curatedEntries } from "../AppsLibrary";

/** Curated app titles by id — the only app names discovery may display. */
const APP_TITLES: ReadonlyMap<string, string> = new Map(curatedEntries().map((app) => [app.id, app.title]));

export function appTitle(appId: string | null): string | null {
  return appId ? (APP_TITLES.get(appId) ?? null) : null;
}

export function appHref(appId: string | null): string | null {
  if (!appId) return null;
  return curatedEntries().find((app) => app.id === appId)?.href ?? null;
}

/**
 * Attribution line for a tile. Final media names its app ("Created with
 * Marketing Studio"); a placeholder slot only names the app it sits in,
 * never claiming the sample was created there.
 */
export function showcaseAttribution(item: StudioShowcaseItem): string | null {
  const title = appTitle(item.appId);
  if (!title) return null;
  return item.placeholder ? title : `Created with ${title}`;
}
