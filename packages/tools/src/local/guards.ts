import path from "node:path";
import fs from "node:fs";
import { IGNORED_DIRS, MAX_FILE_BYTES, MAX_TREE_ENTRIES, isIgnoredDir } from "./guard-constants";

export { IGNORED_DIRS, MAX_FILE_BYTES, MAX_TREE_ENTRIES, isIgnoredDir };

/**
 * Returns the allowlisted repo root from env, or null if not configured.
 *
 * turbopackIgnore: the workspace root is an operator-supplied absolute path.
 * Without the ignore marker, Turbopack NFT would treat any resolve(env) + fs
 * walk as tracing the entire monorepo (including next.config and unrelated
 * server modules) into production route bundles that import this helper.
 */
export function getRepoRoot(): string | null {
  const val = process.env.ETHEN_LOCAL_REPO_PATH?.trim();
  if (!val) return null;
  try {
    const resolved = path.resolve(/* turbopackIgnore: true */ val);
    if (!fs.existsSync(/* turbopackIgnore: true */ resolved)) return null;
    return resolved;
  } catch {
    return null;
  }
}

/** Throws if not in development mode. */
export function assertDevOnly(): void {
  if (process.env.NODE_ENV !== "development") {
    throw new DevOnlyError();
  }
}

export class DevOnlyError extends Error {
  constructor() {
    super("Local repo bridge is only available in development mode.");
    this.name = "DevOnlyError";
  }
}

/**
 * Resolves a relative file path safely against root.
 * Throws if the result escapes root or if the input is absolute.
 *
 * Path joins are turbopackIgnore-marked so production bundles that import
 * coding-index helpers do not recursively NFT-trace arbitrary repo paths.
 */
export function resolveRepoPath(root: string, relPath: string): string {
  if (path.isAbsolute(relPath)) {
    throw new Error("Absolute paths are not accepted.");
  }
  const base = path.resolve(/* turbopackIgnore: true */ root);
  const resolved = path.resolve(/* turbopackIgnore: true */ base, relPath);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error("Path traversal detected.");
  }
  return resolved;
}

/** Returns true if the file looks binary (contains null bytes in first 8KB). */
export function looksLikeBinary(buf: Buffer): boolean {
  const sample = buf.slice(0, Math.min(buf.length, 8192));
  return sample.includes(0);
}

const SECRET_PATH_PATTERNS = [
  /\.env(\..*)?$/,
  /credentials/i,
  /secret/i,
  /\.pem$/,
  /\.key$/,
  /\.pfx$/,
  /\.p12$/,
  /id_rsa/,
  /id_ed25519/,
  /id_ecdsa/,
  /authorized_keys/,
  /known_hosts/,
  /\.htpasswd$/,
  /\.netrc$/,
  /\.npmrc$/,
  /\.dockercfg$/,
];

export function isSecretPath(filePath: string): boolean {
  const basename = filePath.split("/").pop() ?? filePath;
  return SECRET_PATH_PATTERNS.some((p) => p.test(basename));
}

export function isGitPath(filePath: string): boolean {
  const segments = filePath.split("/");
  return segments[0] === ".git" || segments.some((s) => s === ".git");
}

export function isSymlink(absPath: string): boolean {
  try {
    const stat = fs.lstatSync(absPath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Like `resolveRepoPath` but scoped inside a worktree sandbox.
 * Rejects paths that would resolve outside the sandbox directory.
 * The `sandboxPath` argument must be an absolute path to the worktree root.
 */
export function resolveWorktreePath(sandboxPath: string, relPath: string): string {
  if (path.isAbsolute(relPath)) {
    throw new Error("Absolute paths are not accepted in worktree-relative path resolution.");
  }
  const resolved = path.resolve(sandboxPath, relPath);
  if (!resolved.startsWith(sandboxPath + path.sep) && resolved !== sandboxPath) {
    throw new Error("Path traversal detected: would escape the worktree sandbox boundary.");
  }
  return resolved;
}
