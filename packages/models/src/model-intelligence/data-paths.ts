/**
 * Single committed data authority for Model Intelligence source data.
 *
 * SOL-02: all loaders under lib/model-intelligence/** and
 * lib/model-library-intelligence/** must resolve paths through this module.
 * There is exactly one authoritative on-disk root:
 *   data/model-intelligence/normalized
 *
 * The legacy md/scrape/model_intelligence_normalized tree is retired and must
 * not be used as a silent fallback.
 */

import fs from "node:fs";
import path from "node:path";

/** Relative path of the committed authority (repo-root relative). */
export const MODEL_INTELLIGENCE_DATA_RELATIVE_ROOT =
  "data/model-intelligence/normalized";

/** Legacy path retained only for reconciliation / rollback documentation. */
export const MODEL_INTELLIGENCE_LEGACY_RELATIVE_ROOT =
  "md/scrape/model_intelligence_normalized";

export interface ModelIntelligenceDataPaths {
  /** Absolute root of the normalized dataset. */
  root: string;
  indexJson: string;
  profilesDir: string;
  pagesDir: string;
  chartsDir: string;
  /** Repo-root relative root (for error messages and manifests). */
  relativeRoot: string;
}

/**
 * Resolve the committed data paths under `cwd` (defaults to process.cwd()).
 * Pure path construction — does not touch the filesystem.
 */
export function getModelIntelligenceDataPaths(
  cwd: string = process.cwd(),
): ModelIntelligenceDataPaths {
  const relativeRoot = MODEL_INTELLIGENCE_DATA_RELATIVE_ROOT;
  const root = path.resolve(cwd, relativeRoot);
  return {
    root,
    indexJson: path.join(root, "index.json"),
    profilesDir: path.join(root, "profiles"),
    pagesDir: path.join(root, "pages"),
    chartsDir: path.join(root, "charts"),
    relativeRoot,
  };
}

export interface ModelIntelligenceDataPresence {
  indexExists: boolean;
  profilesDirExists: boolean;
  rootExists: boolean;
  present: boolean;
}

export function inspectModelIntelligenceDataPresence(
  paths: ModelIntelligenceDataPaths,
): ModelIntelligenceDataPresence {
  const indexExists = fs.existsSync(paths.indexJson);
  const profilesDirExists = fs.existsSync(paths.profilesDir);
  const rootExists = fs.existsSync(paths.root);
  return {
    indexExists,
    profilesDirExists,
    rootExists,
    present: indexExists && profilesDirExists,
  };
}

/**
 * Fail loudly when the committed Model Intelligence data authority is missing
 * or structurally unusable. Never returns empty / mock data.
 */
export function assertModelIntelligenceDataPresent(
  cwd: string = process.cwd(),
): ModelIntelligenceDataPaths {
  const paths = getModelIntelligenceDataPaths(cwd);
  const presence = inspectModelIntelligenceDataPresence(paths);

  if (!presence.present) {
    const missing: string[] = [];
    if (!presence.rootExists) missing.push(paths.relativeRoot);
    else {
      if (!presence.indexExists) missing.push(path.join(paths.relativeRoot, "index.json"));
      if (!presence.profilesDirExists)
        missing.push(path.join(paths.relativeRoot, "profiles"));
    }
    throw new Error(
      [
        "Model Intelligence committed data authority is missing or incomplete.",
        `Expected: ${paths.relativeRoot}`,
        `Missing: ${missing.join(", ")}`,
        "This is not a soft degradation: build and pages must fail rather than render empty.",
        `Legacy path (retired, not a fallback): ${MODEL_INTELLIGENCE_LEGACY_RELATIVE_ROOT}`,
      ].join(" "),
    );
  }

  return paths;
}

/**
 * Read and parse index.json from the committed authority.
 * Throws on missing file or malformed JSON (never returns empty).
 */
export function readModelIntelligenceIndexRaw(
  cwd: string = process.cwd(),
): unknown {
  const paths = assertModelIntelligenceDataPresent(cwd);
  let raw: string;
  try {
    raw = fs.readFileSync(paths.indexJson, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to read Model Intelligence index at ${paths.indexJson}: ${message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Model Intelligence index is malformed JSON at ${paths.indexJson}: ${message}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Model Intelligence index must be a JSON object at ${paths.indexJson}`,
    );
  }

  const profiles = (parsed as { profiles?: unknown }).profiles;
  if (!Array.isArray(profiles)) {
    throw new Error(
      `Model Intelligence index missing profiles[] array at ${paths.indexJson}`,
    );
  }
  if (profiles.length === 0) {
    throw new Error(
      `Model Intelligence index has zero profiles at ${paths.indexJson} — refusing empty authority`,
    );
  }

  return parsed;
}
