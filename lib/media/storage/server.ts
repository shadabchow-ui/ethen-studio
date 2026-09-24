import "server-only";

// ── Server-Side Durable Storage Sync (Private Beta) ──────────────────────────
// Loads persisted data from disk into in-memory stores on first import.
// After any mutation, persist stores back to disk.
// Import ONLY from server-side code (API routes, server components).
// Uses Node.js fs module — will fail if imported by client code.
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

import type { MediaJob, MediaAsset, MediaProject } from "@ethen/contracts/media/types";
import type { CreativeProfile } from "../profiles";
import type { GenerationTrace, ConsentRecord, ExportRecord, ModerationResult } from "../traces";
import type { UsageLedgerEntry } from "../usage-ledger";

const STORE_DIR = join(process.cwd(), ".local", "ethen-media-store");

type StoreName = string;

function pathFor(name: StoreName): string {
  return join(STORE_DIR, name);
}

function ensureDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function readJsonFile<T>(name: StoreName): T | null {
  const p = pathFor(name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    console.warn(`[media-storage] Malformed store file "${name}", starting fresh.`);
    return null;
  }
}

function writeJsonFileAtomic(name: StoreName, data: unknown): void {
  ensureDir();
  const p = pathFor(name);
  const tmp = p + ".tmp." + Date.now();
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    renameSync(tmp, p);
  } catch {
    try { unlinkSync(tmp); } catch { /* best effort */ }
  }
}

interface StoreSnapshot {
  jobs: MediaJob[];
  jobAssets: MediaAsset[];
  assets: MediaAsset[];
  assetNextId: number;
  projects: MediaProject[];
  projectNextId: number;
  profiles: CreativeProfile[];
  profileNextId: number;
  traces: GenerationTrace[];
  traceNextId: number;
  consent: ConsentRecord[];
  exports: ExportRecord[];
  moderation: ModerationResult[];
  ledger: UsageLedgerEntry[];
  ledgerNextId: number;
}

let initialized = false;

/**
 * Reset the initialization flag and in-memory caches.
 * Used for testing and smoke tests only.
 */
export function resetInit(): void {
  initialized = false;
}

/**
 * Load ALL stores from disk and hydrate in-memory state.
 * Safe to call multiple times — only hydrates once.
 */
export async function initAllStores(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Dynamic imports to avoid circular dependency issues
  const [
    jobsModule,
    assetsModule,
    projectsModule,
    profilesModule,
    tracesModule,
    ledgerModule,
  ] = await Promise.all([
    import("../jobs"),
    import("../assets"),
    import("../projects"),
    import("../profiles"),
    import("../traces"),
    import("../usage-ledger"),
  ]);

  const snapshot = readJsonFile<StoreSnapshot>("media_store_snapshot.json");

  if (snapshot) {
    // Hydrate jobs (job store + job asset store)
    if (snapshot.jobs) jobsModule.hydrateJobStore(snapshot.jobs);
    if (snapshot.jobAssets) jobsModule.hydrateJobAssetStore(snapshot.jobAssets);

    // Hydrate main asset store
    if (snapshot.assets) {
      assetsModule.hydrateAssetStore(snapshot.assets, snapshot.assetNextId ?? 1);
    }

    // Hydrate projects
    if (snapshot.projects) {
      projectsModule.hydrateProjectStore(snapshot.projects, snapshot.projectNextId ?? 1);
    }

    // Hydrate profiles
    if (snapshot.profiles) {
      profilesModule.hydrateProfileStore(snapshot.profiles, snapshot.profileNextId ?? 1);
    }

    // Hydrate traces/consent/exports/moderation
    if (snapshot.traces) tracesModule.hydrateTraceStore(snapshot.traces, snapshot.traceNextId ?? 1);
    if (snapshot.consent) tracesModule.hydrateConsentStore(snapshot.consent);
    if (snapshot.exports) tracesModule.hydrateExportStore(snapshot.exports);
    if (snapshot.moderation) tracesModule.hydrateModerationStore(snapshot.moderation);

    // Hydrate ledger
    if (snapshot.ledger) {
      ledgerModule.hydrateLedgerStore(snapshot.ledger, snapshot.ledgerNextId ?? 1);
    }

    console.log("[media-storage] Loaded persisted data from disk.");
  } else {
    // Empty state is authoritative; callers must explicitly request demo fixtures.
    console.log("[media-storage] No persisted data found. Starting with empty stores.");
  }
}

/**
 * Persist ALL in-memory stores to disk as a single atomic snapshot.
 * Call after any mutation in API routes.
 */
export async function persistAllStores(): Promise<void> {
  if (!initialized) {
    await initAllStores();
  }

  const [
    jobsModule,
    assetsModule,
    projectsModule,
    profilesModule,
    tracesModule,
    ledgerModule,
  ] = await Promise.all([
    import("../jobs"),
    import("../assets"),
    import("../projects"),
    import("../profiles"),
    import("../traces"),
    import("../usage-ledger"),
  ]);

  const snapshot: StoreSnapshot = {
    jobs: jobsModule.snapshotJobStore(),
    jobAssets: jobsModule.snapshotJobAssetStore(),
    assets: assetsModule.snapshotAssetStore(),
    assetNextId: assetsModule.snapshotAssetNextId(),
    projects: projectsModule.snapshotProjectStore(),
    projectNextId: projectsModule.snapshotProjectNextId(),
    profiles: profilesModule.snapshotProfileStore(),
    profileNextId: profilesModule.snapshotProfileNextId(),
    traces: tracesModule.snapshotTraceStore(),
    traceNextId: tracesModule.snapshotTraceNextId(),
    consent: tracesModule.snapshotConsentStore(),
    exports: tracesModule.snapshotExportStore(),
    moderation: tracesModule.snapshotModerationStore(),
    ledger: ledgerModule.snapshotLedgerStore(),
    ledgerNextId: ledgerModule.snapshotLedgerNextId(),
  };

  writeJsonFileAtomic("media_store_snapshot.json", snapshot);
}
