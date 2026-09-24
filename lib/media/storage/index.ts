import "server-only";

// ── Local File-Backed Durable Storage (Private Beta) ──────────────────────────
// Swappable file-backed JSON store for Ethen Studio media records.
// Replaces in-memory-only Maps/arrays so jobs, assets, projects, profiles,
// traces, ledger entries, consent records, moderation results, and export
// records survive local server restarts.
//
// This is NOT a production database. It is local/private-beta durable storage
// that lives at .local/ethen-media-store/ (git-ignored). Replace with
// Supabase/Postgres/SQLite/R2 metadata for public launch.
//
// Import ONLY from server-side code — uses Node.js fs module.
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

const STORE_DIR = join(process.cwd(), ".local", "ethen-media-store");

const STORE_FILES = {
  media_jobs: "media_jobs.json",
  media_assets: "media_assets.json",
  media_projects: "media_projects.json",
  media_usage_ledger: "media_usage_ledger.json",
  media_profiles: "media_profiles.json",
  media_generation_traces: "media_generation_traces.json",
  media_consent_records: "media_consent_records.json",
  media_moderation_results: "media_moderation_results.json",
  media_exports: "media_exports.json",
  designer_artifact_versions: "designer_artifact_versions.json",
  designer_lineage_manifests: "designer_lineage_manifests.json",
  designer_asset_placements: "designer_asset_placements.json",
  designer_objects: "designer_objects.json",
  designer_tombstones: "designer_tombstones.json",
} as const;

export type StoreName = keyof typeof STORE_FILES;

// ── In-memory cache (write-through) ──────────────────────────────────────────

const caches = new Map<StoreName, unknown[]>();

// ── Internal helpers ─────────────────────────────────────────────────────────

function storePath(name: StoreName): string {
  return join(STORE_DIR, STORE_FILES[name]);
}

function ensureDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function readStore<T>(name: StoreName): T[] {
  const path = storePath(name);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as T[];
  } catch {
    console.warn(`[media-storage] Malformed store file "${STORE_FILES[name]}", starting fresh.`);
    return [];
  }
}

function writeStoreAtomic<T>(name: StoreName, data: T[]): void {
  ensureDir();
  const path = storePath(name);
  const tmp = path + ".tmp." + Date.now();
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    renameSync(tmp, path);
  } catch {
    try { unlinkSync(tmp); } catch { /* best effort */ }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Load a store from disk (or cache). Returns the full array of records.
 * Feeds it through a seed function on first load if the store is empty.
 */
export function loadStore<T>(
  name: StoreName,
  seedFn?: () => T[],
): T[] {
  const cached = caches.get(name);
  if (cached !== undefined) return cached as T[];

  let data = readStore<T>(name);

  // Only seed if file was truly empty/missing AND a seed function is provided
  if (data.length === 0 && seedFn) {
    const seeded = seedFn();
    data = seeded;
    writeStoreAtomic(name, data);
  }

  caches.set(name, data);
  return data;
}

/**
 * Persist the current in-memory cache for a store to disk.
 */
export function persistStore(name: StoreName): void {
  const data = caches.get(name);
  if (data === undefined) return;
  writeStoreAtomic(name, data);
}

/**
 * Add a record to the store (prepends). Auto-persists.
 */
export function addRecord<T>(name: StoreName, record: T): void {
  const data = loadStore<T>(name);
  data.unshift(record);
  persistStore(name);
}

/**
 * Update a record in the store by a predicate. Returns the updated record or null.
 */
export function updateRecord<T>(
  name: StoreName,
  predicate: (record: T) => boolean,
  patch: Partial<T> | ((record: T) => T),
): T | null {
  const data = loadStore<T>(name);
  const idx = data.findIndex(predicate);
  if (idx === -1) return null;

  const updated = typeof patch === "function"
    ? (patch as (record: T) => T)({ ...data[idx] })
    : { ...data[idx], ...patch };

  data[idx] = updated;
  persistStore(name);
  return updated;
}

/**
 * Delete a record from the store by a predicate. Returns true if deleted.
 */
export function deleteRecord<T>(name: StoreName, predicate: (record: T) => boolean): boolean {
  const data = loadStore<T>(name);
  const idx = data.findIndex(predicate);
  if (idx === -1) return false;
  data.splice(idx, 1);
  persistStore(name);
  return true;
}

/**
 * Find a single record matching a predicate.
 */
export function findRecord<T>(name: StoreName, predicate: (record: T) => boolean): T | undefined {
  const data = loadStore<T>(name);
  return data.find(predicate) as T | undefined;
}

/**
 * Filter records matching a predicate.
 */
export function filterRecords<T>(name: StoreName, predicate?: (record: T) => boolean): T[] {
  const data = loadStore<T>(name);
  if (!predicate) return [...data] as T[];
  return data.filter(predicate) as T[];
}

/**
 * Clear a store (removes all records and persists empty array).
 */
export function clearStore(name: StoreName): void {
  caches.set(name, []);
  persistStore(name);
}

/**
 * Check if a store has been loaded / has data.
 */
export function storeSize(name: StoreName): number {
  return loadStore(name).length;
}

/**
 * Reset in-memory cache (forces re-read from disk on next access).
 * Useful for testing / developer debugging.
 */
export function resetStoreCache(name?: StoreName): void {
  if (name) {
    caches.delete(name);
  } else {
    caches.clear();
  }
}

// ── Durability metadata ─────────────────────────────────────────────────────

export const LOCAL_FS_DURABILITY_LABEL = "Local file storage (private-beta durable)";
export const LOCAL_FS_DURABILITY_DESCRIPTION =
  "Data is persisted to local disk in .local/ethen-media-store/ and survives server restarts. " +
  "This is private-beta storage — not production database persistence.";
