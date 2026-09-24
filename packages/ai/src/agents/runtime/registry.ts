import type { AgentRegistryEntry } from "./types";
import { WAVE1_REGISTRY } from "./wave1-registry";

/** All registered backend agent entries. Starts with Wave 1 placeholders. */
const registry = new Map<string, AgentRegistryEntry>();

WAVE1_REGISTRY.forEach((entry) => registry.set(entry.slug, entry));

/** Register a backend agent entry. Returns false if slug already exists. */
export function registerEntry(entry: AgentRegistryEntry): boolean {
  if (registry.has(entry.slug)) return false;
  registry.set(entry.slug, entry);
  return true;
}

/** Get a single registered entry by slug. */
export function getEntry(slug: string): AgentRegistryEntry | null {
  return registry.get(slug) ?? null;
}

/** List all registered entries, optionally filtered by build wave. */
export function listEntries(buildWave?: number): AgentRegistryEntry[] {
  const all = Array.from(registry.values());
  if (buildWave !== undefined) {
    return all.filter((e) => e.buildWave === buildWave).sort((a, b) => a.slug.localeCompare(b.slug));
  }
  return all.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Filter entries by implementation status. */
export function listEntriesByStatus(status: AgentRegistryEntry["implementationStatus"]): AgentRegistryEntry[] {
  return listEntries().filter((e) => e.implementationStatus === status);
}

/** List all implmented (active) agents. */
export function listActiveEntries(): AgentRegistryEntry[] {
  return listEntriesByStatus("active");
}

/** Check if an agent entry exists and is ready for runs (not "not_started"). */
export function isEntryRunnable(slug: string): boolean {
  const entry = getEntry(slug);
  if (!entry) return false;
  return entry.implementationStatus !== "not_started";
}
