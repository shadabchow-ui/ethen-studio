/**
 * ETHEN-READY-039 — Rollback / Versioning.
 *
 * Provides point-in-time snapshots of all Model Intelligence data files
 * with SHA-256 hashes for integrity verification and rollback readiness.
 *
 * Uses the existing data-paths.ts infrastructure for path resolution.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  getModelIntelligenceDataPaths,
} from "./data-paths";

// ─── Public Types ───────────────────────────────────────────────────────────

export interface DataEntry {
  /** Relative path from the data root (e.g., "profiles/gpt-4o.profile.json") */
  relativePath: string;
  /** SHA-256 hex digest of the file content */
  sha256: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Last modification time (ISO string) */
  mtime: string;
}

export interface DataSnapshot {
  /** ISO timestamp when the snapshot was taken */
  takenAt: string;
  /** Human-readable label for this snapshot */
  label: string;
  /** Absolute root path at the time of snapshot */
  rootPath: string;
  /** Relative root (repo-relative) */
  relativeRoot: string;
  /** All data files in the snapshot */
  entries: DataEntry[];
  /** Index file entry (separate for quick access) */
  indexEntry: DataEntry | null;
  /** Summary */
  summary: {
    totalFiles: number;
    totalSizeBytes: number;
    profileCount: number;
    pageCount: number;
    chartFileCount: number;
  };
}

// ─── SHA-256 Helpers ────────────────────────────────────────────────────────

function sha256File(filePath: string): string {
  const h = createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex");
}

// ─── File Listing ───────────────────────────────────────────────────────────

/**
 * List all files in a directory recursively, returning relative paths.
 */
function listFilesRecursive(dir: string, root: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(absPath, root));
    } else if (entry.isFile()) {
      results.push(path.relative(root, absPath));
    }
  }

  return results;
}

/**
 * Count files of a specific type in a directory.
 */
function countFiles(dir: string, ext: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
}

/**
 * Count files recursively in a directory tree.
 */
function countFilesRecursive(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(absPath);
    } else if (entry.isFile()) {
      count++;
    }
  }
  return count;
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

/**
 * Take a point-in-time snapshot of all Model Intelligence data files.
 *
 * Scans the committed authority directory and records SHA-256 hashes,
 * file sizes, and modification timestamps for every file.
 *
 * @param label Optional human-readable label for the snapshot
 * @param cwd Working directory for path resolution (defaults to process.cwd())
 * @returns A DataSnapshot containing all file entries and summary
 */
export function takeSnapshot(
  label?: string,
  cwd?: string,
): DataSnapshot {
  const paths = getModelIntelligenceDataPaths(cwd);
  const root = paths.root;
  const takenAt = new Date().toISOString();

  // List all files
  const profileFiles = listFilesRecursive(paths.profilesDir, root);
  const pageFiles = listFilesRecursive(paths.pagesDir, root);
  const chartFiles = listFilesRecursive(paths.chartsDir, root);

  const allFiles = [
    "index.json",
    ...profileFiles,
    ...pageFiles,
    ...chartFiles,
  ].sort();

  const entries: DataEntry[] = [];
  let indexEntry: DataEntry | null = null;

  for (const relPath of allFiles) {
    const absPath = path.join(root, relPath);

    try {
      const stat = fs.statSync(absPath);
      const sha256 = sha256File(absPath);

      const entry: DataEntry = {
        relativePath: relPath,
        sha256,
        sizeBytes: stat.size,
        mtime: stat.mtime.toISOString(),
      };

      if (relPath === "index.json") {
        indexEntry = entry;
      }

      entries.push(entry);
    } catch {
      // Skip files that can't be read
    }
  }

  const totalSizeBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);

  return {
    takenAt,
    label: label ?? `Snapshot ${takenAt}`,
    rootPath: root,
    relativeRoot: paths.relativeRoot,
    entries,
    indexEntry,
    summary: {
      totalFiles: entries.length,
      totalSizeBytes,
      profileCount: profileFiles.length,
      pageCount: pageFiles.length,
      chartFileCount: countFilesRecursive(paths.chartsDir),
    },
  };
}

// ─── Snapshot Report ─────────────────────────────────────────────────────────

/**
 * Write a snapshot to a JSON file for rollback reference.
 *
 * @param snapshot The snapshot to write
 * @param outputPath Path to write the snapshot JSON to
 */
export function snapshotToReport(
  snapshot: DataSnapshot,
  outputPath?: string,
): string {
  const json = JSON.stringify(snapshot, null, 2);
  const resolvedPath = outputPath ?? `data/model-intelligence/snapshots/snapshot-${snapshot.takenAt.replace(/[:]/g, "-")}.json`;

  // Ensure the output directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, json, "utf-8");
  return resolvedPath;
}

// ─── Rollback Check ─────────────────────────────────────────────────────────

/**
 * Check whether rollback to a given snapshot is possible.
 *
 * Verifies that every file in the snapshot still exists at the same path
 * and has the same SHA-256 hash. Does NOT perform the rollback — use
 * restoreFromSnapshot() for that.
 *
 * @param snapshot The snapshot to check against
 * @param cwd Working directory for path resolution
 * @returns Object with rollback feasibility and any mismatches
 */
export function canRollback(
  snapshot: DataSnapshot,
  cwd?: string,
): {
  feasible: boolean;
  missingFiles: string[];
  hashMismatches: Array<{ path: string; expected: string; actual: string }>;
} {
  const paths = getModelIntelligenceDataPaths(cwd);
  const root = paths.root;

  const missingFiles: string[] = [];
  const hashMismatches: Array<{ path: string; expected: string; actual: string }> = [];

  for (const entry of snapshot.entries) {
    const absPath = path.join(root, entry.relativePath);

    // Check existence
    if (!fs.existsSync(absPath)) {
      missingFiles.push(entry.relativePath);
      continue;
    }

    // Check hash
    try {
      const actualHash = sha256File(absPath);
      if (actualHash !== entry.sha256) {
        hashMismatches.push({
          path: entry.relativePath,
          expected: entry.sha256,
          actual: actualHash,
        });
      }
    } catch {
      missingFiles.push(entry.relativePath);
    }
  }

  return {
    feasible: missingFiles.length === 0 && hashMismatches.length === 0,
    missingFiles,
    hashMismatches,
  };
}

/**
 * Get a list of all available snapshots in the snapshots directory.
 *
 * @returns Array of snapshot file paths, newest first
 */
export function listSnapshots(): string[] {
  const snapshotsDir = path.join(
    getModelIntelligenceDataPaths().root,
    "..",
    "snapshots",
  );

  if (!fs.existsSync(snapshotsDir)) return [];

  return fs
    .readdirSync(snapshotsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(snapshotsDir, f))
    .sort()
    .reverse();
}
