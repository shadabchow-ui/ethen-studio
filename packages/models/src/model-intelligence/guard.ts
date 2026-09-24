/**
 * ETHEN-READY-039 — Cleanup Guard.
 *
 * Protects Model Intelligence data directories from accidental cleanup
 * by automated scripts and bulk operations.
 *
 * Any cleanup/build script must call protectFromCleanup() before
 * operating on MI-related paths. The function throws if the target
 * path is within the protected Model Intelligence data area.
 */

import path from "node:path";

import { getModelIntelligenceDataPaths } from "./data-paths";

// ─── Protected Paths ────────────────────────────────────────────────────────

/**
 * List of all Model Intelligence data directories that must not be cleaned.
 * Each path is resolved through data-paths.ts for consistency.
 */
export function getProtectedPaths(cwd?: string): string[] {
  const paths = getModelIntelligenceDataPaths(cwd);
  return [
    paths.root,
    paths.indexJson,
    paths.profilesDir,
    paths.pagesDir,
    paths.chartsDir,
    // Also protect the data directory one level up for rollback snapshots
    path.resolve(paths.root, ".."),
    path.resolve(paths.root, "..", "snapshots"),
  ];
}

// ─── Path Check ─────────────────────────────────────────────────────────────

/**
 * Check whether a given absolute or relative path falls under any of the
 * protected Model Intelligence data directories.
 *
 * @param targetPath The path to check (absolute or relative)
 * @param cwd Working directory for resolving relative paths and data paths
 * @returns True if the path is within the Model Intelligence data area
 */
export function isModelIntelligencePath(
  targetPath: string,
  cwd: string = process.cwd(),
): boolean {
  const absTarget = path.resolve(cwd, targetPath);
  const protectedPaths = getProtectedPaths(cwd);

  for (const protectedPath of protectedPaths) {
    const absProtected = path.resolve(protectedPath);
    // Check if the target is within this protected directory
    const relative = path.relative(absProtected, absTarget);
    if (
      relative === "" ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    ) {
      return true;
    }
  }

  return false;
}

// ─── Guard Function ─────────────────────────────────────────────────────────

/**
 * Gate function that cleanup/build scripts MUST call before operating on
 * any path that might be under data/model-intelligence/.
 *
 * Throws an error with a clear message if the target path is protected.
 * This prevents accidental deletion or modification of MI data by
 * bulk cleanup operations.
 *
 * @param targetPath The path the caller intends to clean or modify
 * @param operation Optional description of the operation being gated
 * @param cwd Working directory for path resolution
 * @returns void — throws if the path is protected
 */
export function protectFromCleanup(
  targetPath: string,
  operation?: string,
  cwd?: string,
): void {
  const resolvedCwd = cwd ?? process.cwd();
  const isProtected = isModelIntelligencePath(targetPath, resolvedCwd);

  if (isProtected) {
    const absTarget = path.resolve(resolvedCwd, targetPath);
    const opDesc = operation ? ` during "${operation}"` : "";
    throw new Error(
      [
        `Cleanup blocked: "${targetPath}" (resolved: ${absTarget}) is within the Model Intelligence data area${opDesc}.`,
        `Model Intelligence data at data/model-intelligence/normalized/ is protected from automatic cleanup.`,
        `If you intentionally need to modify this data, use the dedicated MI management scripts.`,
        `Protected paths:`,
        ...getProtectedPaths(resolvedCwd).map((p) => `  - ${p}`),
      ].join("\n"),
    );
  }
}
