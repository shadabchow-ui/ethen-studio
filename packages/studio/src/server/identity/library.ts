/** Studio V5 identity — My/Stock/Favorites/Recent selector model (STUDIO_10). Server-only. */
import "server-only";
import type { ProjectScope } from "../../contracts/scope";
import { serializeScope } from "../../contracts/scope";
import type {
  IdentityAliasRecord,
  IdentityFavoriteRecord,
  IdentityLibraryTab,
  IdentityRecentRecord,
  IdentityRecord,
} from "./types";

export interface LibraryRows {
  identities: readonly IdentityRecord[];
  favorites: readonly IdentityFavoriteRecord[];
  recents: readonly IdentityRecentRecord[];
  aliases: readonly IdentityAliasRecord[];
}

export interface LibrarySelectionInput {
  scope: ProjectScope;
  actorId: string;
  tab: IdentityLibraryTab;
  /** Optional kind filter: voice/character/product/brand. */
  kind?: string;
  query?: string;
}

/** Resolve a stored favorite/recent id through the alias map to a live identity id. */
export function resolveIdentityAlias(storedId: string, aliases: readonly IdentityAliasRecord[]): string {
  const alias = aliases.find((entry) => entry.alias === storedId);
  return alias ? alias.identityId : storedId;
}

function matchesScope(record: IdentityRecord, scope: ProjectScope): boolean {
  if (!record.scope) return false;
  return serializeScope(record.scope) === serializeScope(scope);
}

function matchesQuery(record: IdentityRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return record.name.toLowerCase().includes(needle) || record.identityId.toLowerCase().includes(needle);
}

/**
 * Select one library tab. Favorites hydrate independently of whatever
 * page is loaded: stored ids resolve through aliases to live rows, and
 * dangling ids are reported as missing rather than silently dropped.
 */
export function selectLibraryTab(
  rows: LibraryRows,
  input: LibrarySelectionInput,
): { identities: IdentityRecord[]; missingFavoriteIds: string[] } {
  const kind = input.kind?.trim() ?? "";
  const query = input.query ?? "";
  const live = rows.identities.filter(
    (record) => record.status === "active" && (kind === "" || record.kind === kind) && matchesQuery(record, query),
  );
  const byId = new Map(live.map((record) => [record.identityId, record]));
  switch (input.tab) {
    case "stock":
      return { identities: live.filter((record) => record.scope === null), missingFavoriteIds: [] };
    case "my":
      return { identities: live.filter((record) => matchesScope(record, input.scope)), missingFavoriteIds: [] };
    case "recent": {
      const ordered = rows.recents
        .filter((recent) => serializeScope(recent.scope) === serializeScope(input.scope) && recent.actorId === input.actorId)
        .slice()
        .sort((a, b) => (a.viewedAt < b.viewedAt ? 1 : -1));
      const identities: IdentityRecord[] = [];
      for (const recent of ordered) {
        const resolved = resolveIdentityAlias(recent.identityId, rows.aliases);
        const row = byId.get(resolved);
        if (row) identities.push(row);
      }
      return { identities, missingFavoriteIds: [] };
    }
    case "favorites": {
      const mine = rows.favorites.filter(
        (favorite) =>
          serializeScope(favorite.scope) === serializeScope(input.scope) && favorite.actorId === input.actorId,
      );
      const identities: IdentityRecord[] = [];
      const missingFavoriteIds: string[] = [];
      for (const favorite of mine) {
        const resolved = resolveIdentityAlias(favorite.identityId, rows.aliases);
        const row = byId.get(resolved);
        if (row) identities.push(row);
        else missingFavoriteIds.push(favorite.identityId);
      }
      return { identities, missingFavoriteIds };
    }
  }
}
