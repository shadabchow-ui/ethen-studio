/**
 * STUDIO_20 — legacy drain ledger.
 *
 * Expand/backfill/verify/cutover accounting: per-route hit counts with
 * checksums during the drain window, orphan report (legacy IDs with no
 * V5 mapping), and ledger conservation (migrated + orphaned ==
 * legacy total). Removal requires a zero-hit window plus an empty
 * orphan report; this module records that proof but never deletes.
 */

/** FNV-1a 32-bit hex; deterministic, dependency-free. */
export function checksum(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface DrainLedgerEntry {
  legacyRoute: string;
  windowStart: string;
  hits: number;
  lastHitAt: string | null;
  checksum: string;
}

export function createDrainLedger(): Map<string, DrainLedgerEntry> {
  return new Map();
}

export function recordLegacyHit(
  ledger: Map<string, DrainLedgerEntry>,
  input: { legacyRoute: string; at: string; windowStart: string },
): DrainLedgerEntry {
  const prior = ledger.get(input.legacyRoute);
  const hits = (prior?.hits ?? 0) + 1;
  const entry: DrainLedgerEntry = {
    legacyRoute: input.legacyRoute,
    windowStart: prior?.windowStart ?? input.windowStart,
    hits,
    lastHitAt: input.at,
    checksum: checksum(`${input.legacyRoute}:${hits}:${input.at}`),
  };
  ledger.set(input.legacyRoute, entry);
  return entry;
}

export interface DrainSummary {
  routes: number;
  totalHits: number;
  zeroHitRoutes: string[];
  checksum: string;
}

export function summarizeDrain(ledger: ReadonlyMap<string, DrainLedgerEntry>, knownRoutes: readonly string[]): DrainSummary {
  let totalHits = 0;
  for (const entry of ledger.values()) totalHits += entry.hits;
  const zeroHitRoutes = knownRoutes.filter((r) => (ledger.get(r)?.hits ?? 0) === 0);
  const material = [...ledger.values()]
    .map((e) => `${e.legacyRoute}:${e.hits}:${e.checksum}`)
    .sort()
    .join("|");
  return { routes: knownRoutes.length, totalHits, zeroHitRoutes, checksum: checksum(material) };
}

export interface OrphanReport {
  legacyTotal: number;
  migrated: number;
  orphans: string[];
}

/** Conservation: every legacy ID is either migrated or a named orphan. */
export function buildOrphanReport(legacyIds: readonly string[], migratedIds: ReadonlySet<string>): OrphanReport {
  const orphans = legacyIds.filter((id) => !migratedIds.has(id));
  return { legacyTotal: legacyIds.length, migrated: legacyIds.length - orphans.length, orphans };
}

export function isConserved(report: OrphanReport): boolean {
  return report.migrated + report.orphans.length === report.legacyTotal;
}

/** Drain is complete only with zero hits AND zero orphans. */
export function isDrainComplete(summary: DrainSummary, report: OrphanReport): boolean {
  return summary.totalHits === 0 && report.orphans.length === 0 && isConserved(report);
}
