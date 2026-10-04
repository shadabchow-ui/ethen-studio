#!/usr/bin/env node
/**
 * Shared-drift gate (MUSE-026).
 *
 * Fails CI on undeclared divergence of vendored shared files. Every
 * `docs/shared/*.txt` list except `*-owned.txt` is a covered tier list:
 * tier files are vendored copies whose content must change only through a
 * declared baseline update. `*-owned.txt` lists this repo's own files and
 * is intentionally excluded.
 *
 * - Default mode verifies the working tree against
 *   `docs/shared/DRIFT_BASELINE.json` and exits nonzero on any undeclared
 *   drift (changed bytes, deleted file, reappeared file, added/removed
 *   tier list, or delisted path).
 * - `--regen` rewrites the baseline from the working tree. Run it only in
 *   a commit that declares the change; CI never runs regen.
 *
 * Per-repo CI cannot fetch sibling repos, so the gate enforces
 * declared-change-only against the committed hash baseline rather than a
 * live cross-repo comparison. Cross-repo divergence review stays a
 * periodic manual step. Never prints file hashes.
 *
 * Zero dependencies; runs on Node >= 22 (`node scripts/check-shared-drift.ts`).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHARED_DIR = join(ROOT, "docs", "shared");
const BASELINE_PATH = join(SHARED_DIR, "DRIFT_BASELINE.json");
const BASELINE_VERSION = 1;
const GENERATED_BY = "MUSE-026";

interface DriftBaseline {
  version: number;
  repo: string;
  baseCommit: string;
  generatedAt: string;
  generatedBy: string;
  tierLists: string[];
  files: Record<string, string>;
  absent: string[];
  divergences: Record<string, string>;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parseBaseline(raw: string): DriftBaseline | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate["version"] !== BASELINE_VERSION) return null;
  if (typeof candidate["repo"] !== "string") return null;
  if (typeof candidate["baseCommit"] !== "string") return null;
  if (typeof candidate["generatedAt"] !== "string") return null;
  if (typeof candidate["generatedBy"] !== "string") return null;
  if (!isStringArray(candidate["tierLists"])) return null;
  if (!isStringRecord(candidate["files"])) return null;
  if (!isStringArray(candidate["absent"])) return null;
  if (!isStringRecord(candidate["divergences"])) return null;
  return {
    version: BASELINE_VERSION,
    repo: candidate["repo"] as string,
    baseCommit: candidate["baseCommit"] as string,
    generatedAt: candidate["generatedAt"] as string,
    generatedBy: candidate["generatedBy"] as string,
    tierLists: candidate["tierLists"] as string[],
    files: candidate["files"] as Record<string, string>,
    absent: candidate["absent"] as string[],
    divergences: candidate["divergences"] as Record<string, string>,
  };
}

/** Covered tier lists: every docs/shared/*.txt except *-owned.txt. */
function listTierLists(): string[] {
  if (!existsSync(SHARED_DIR)) return [];
  return readdirSync(SHARED_DIR)
    .filter((name) => name.endsWith(".txt") && !name.endsWith("-owned.txt"))
    .sort();
}

function readTierEntries(listName: string): string[] {
  const raw = readFileSync(join(SHARED_DIR, listName), "utf8");
  const entries: string[] = [];
  for (const line of raw.split("\n")) {
    const entry = line.trim();
    if (entry === "" || entry.startsWith("#")) continue;
    entries.push(entry);
  }
  return entries;
}

function isSafeRelativePath(entry: string): boolean {
  if (entry === "") return false;
  if (entry.startsWith("/") || /^[A-Za-z]:[\\/]/.test(entry)) return false;
  const parts = entry.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") return false;
  }
  return true;
}

function sha256OfFile(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function repoName(): string {
  try {
    const pkgRaw = readFileSync(join(ROOT, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { name?: unknown };
    if (typeof pkg.name === "string" && pkg.name !== "") return pkg.name;
  } catch {
    /* fall through to directory name */
  }
  const parts = ROOT.split("/");
  return parts[parts.length - 1] ?? "unknown";
}

function headCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function verify(): number {
  if (!existsSync(BASELINE_PATH)) {
    console.log("SHARED_DRIFT=FAIL (docs/shared/DRIFT_BASELINE.json missing)");
    console.log("UNDECLARED_DRIFT=unknown");
    return 1;
  }
  const baseline = parseBaseline(readFileSync(BASELINE_PATH, "utf8"));
  if (baseline === null) {
    console.log("SHARED_DRIFT=FAIL (baseline malformed or wrong version; regen required)");
    console.log("UNDECLARED_DRIFT=unknown");
    return 1;
  }
  const failures: string[] = [];
  const tierLists = listTierLists();
  const baselineLists = [...baseline.tierLists].sort();
  const currentLists = [...tierLists].sort();
  if (baselineLists.join("\n") !== currentLists.join("\n")) {
    failures.push(
      `tier list set changed (baseline: [${baselineLists.join(", ")}], ` +
        `working tree: [${currentLists.join(", ")}])`,
    );
  }

  const listed = new Map<string, string>();
  for (const listName of tierLists) {
    for (const entry of readTierEntries(listName)) {
      if (!isSafeRelativePath(entry)) {
        failures.push(`tier list ${listName}: unsafe entry ${JSON.stringify(entry)}`);
        continue;
      }
      if (!listed.has(entry)) listed.set(entry, listName);
    }
  }

  let checked = 0;
  for (const [relPath, listName] of listed) {
    const expected = baseline.files[relPath];
    const absPath = join(ROOT, relPath);
    const exists = existsSync(absPath);
    if (expected === undefined) {
      if (baseline.absent.includes(relPath)) {
        if (exists) {
          failures.push(`${relPath} (from ${listName}): undeclared reappearance (absent at baseline)`);
        }
      } else {
        failures.push(`${relPath} (from ${listName}): undeclared tier entry (not in baseline)`);
      }
      continue;
    }
    checked += 1;
    if (!exists) {
      failures.push(`${relPath} (from ${listName}): missing (present at baseline)`);
      continue;
    }
    if (sha256OfFile(absPath) !== expected) {
      failures.push(`${relPath} (from ${listName}): content changed without baseline update`);
    }
  }

  for (const relPath of Object.keys(baseline.files)) {
    if (!listed.has(relPath)) {
      failures.push(`${relPath}: delisted from tier lists without baseline update`);
    }
  }

  for (const failure of failures) {
    console.log(`DRIFT ${failure}`);
  }
  if (failures.length === 0) {
    console.log(
      `SHARED_DRIFT=PASS (checked ${checked} files across ${tierLists.length} tier lists)`,
    );
    console.log("UNDECLARED_DRIFT=0");
    return 0;
  }
  console.log(`SHARED_DRIFT=FAIL (${failures.length} undeclared)`);
  console.log(`UNDECLARED_DRIFT=${failures.length}`);
  return 1;
}

function regen(): number {
  const previous = existsSync(BASELINE_PATH)
    ? parseBaseline(readFileSync(BASELINE_PATH, "utf8"))
    : null;
  const tierLists = listTierLists();
  const files: Record<string, string> = {};
  const absent: string[] = [];
  for (const listName of tierLists) {
    const entries = readTierEntries(listName);
    console.log(`TIER_LIST ${listName}: ${entries.length} entries`);
    for (const entry of entries) {
      if (!isSafeRelativePath(entry)) {
        console.log(`DRIFT_BASELINE=FAIL (unsafe entry ${JSON.stringify(entry)} in ${listName})`);
        return 1;
      }
      if (entry in files || absent.includes(entry)) continue;
      const absPath = join(ROOT, entry);
      if (existsSync(absPath)) {
        files[entry] = sha256OfFile(absPath);
      } else {
        absent.push(entry);
        console.log(`ABSENT_AT_BASELINE ${entry} (from ${listName})`);
      }
    }
  }
  absent.sort();
  const baseline: DriftBaseline = {
    version: BASELINE_VERSION,
    repo: repoName(),
    baseCommit: headCommit(),
    generatedAt: new Date().toISOString(),
    generatedBy: GENERATED_BY,
    tierLists,
    files,
    absent,
    divergences: previous?.divergences ?? {},
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  console.log(
    `DRIFT_BASELINE=WROTE (${Object.keys(files).length} files, ${absent.length} absent, ` +
      `${tierLists.length} tier lists)`,
  );
  return 0;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  process.exit(verify());
} else if (args.length === 1 && args[0] === "--regen") {
  process.exit(regen());
} else {
  console.log("usage: node scripts/check-shared-drift.ts [--regen]");
  process.exit(2);
}
