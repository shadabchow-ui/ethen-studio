import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type {
  GitDiffResult,
  GitStatusResult,
  ReadFileResult,
  RepoMetadata,
  SearchMatch,
  TreeEntry,
} from "./types";
import {
  MAX_FILE_BYTES,
  MAX_TREE_ENTRIES,
  isIgnoredDir,
  looksLikeBinary,
  resolveRepoPath,
  isSymlink,
} from "./guards";
import { redactSecrets, redactSummary } from "@ethen/security/redact";
import { checkSensitivePath } from "@ethen/security/sensitive-paths";

// ── Repo metadata ──────────────────────────────────────────────────────────

export function repoGetMetadata(root: string): RepoMetadata {
  const name = path.basename(root);
  const { branch, headCommit } = readGitHead(root);
  return { root, name, branch, headCommit };
}

// ── File tree ──────────────────────────────────────────────────────────────

export function repoListTree(
  root: string,
  subPath: string = "."
): TreeEntry[] {
  const base = subPath === "." ? root : resolveRepoPath(root, subPath);
  const entries: TreeEntry[] = [];
  walkDir(root, base, entries);
  return entries;
}

// Breadth-first so a single large/deep subtree (e.g. a stale nested git
// worktree) can never starve sibling top-level entries out of the budget —
// every directory's immediate children are listed before any of them are
// recursed into.
function walkDir(root: string, startDir: string, out: TreeEntry[]): void {
  // Workspace walk is runtime-only against an explicit root. turbopackIgnore
  // keeps NFT from treating this as a project-wide recursive file trace.
  const queue: string[] = [/* turbopackIgnore: true */ startDir];
  while (queue.length > 0 && out.length < MAX_TREE_ENTRIES) {
    const dir = queue.shift()!;
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      if (out.length >= MAX_TREE_ENTRIES) break;
      // Reject symlinks so they never appear in tree listings and cannot
      // be used to escape the repo root.
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) {
        if (isIgnoredDir(item.name)) continue;
        const abs = path.join(/* turbopackIgnore: true */ dir, item.name);
        const rel = path.relative(/* turbopackIgnore: true */ root, abs);
        out.push({ path: rel, type: "dir" });
        queue.push(abs);
      } else if (item.isFile()) {
        const abs = path.join(/* turbopackIgnore: true */ dir, item.name);
        const rel = path.relative(/* turbopackIgnore: true */ root, abs);
        let size: number | undefined;
        try {
          size = fs.statSync(/* turbopackIgnore: true */ abs).size;
        } catch {
          // ignore
        }
        out.push({ path: rel, type: "file", size });
      }
    }
  }
}

// ── Read file ──────────────────────────────────────────────────────────────

export function repoReadFile(root: string, relPath: string): ReadFileResult {
  const abs = resolveRepoPath(root, relPath);

  const sensitive = checkSensitivePath(relPath);
  if (sensitive.blocked) {
    throw new Error(`Sensitive path blocked: ${sensitive.reason}`);
  }

  // Reject symlinks before any read — lstatSync does not follow symlinks,
  // so we catch them before statSync (which would follow and return a regular
  // file stat, hiding the symlink escape).
  if (isSymlink(abs)) {
    throw new Error("Symlinks are not accessible through the repo bridge.");
  }

  const stat = fs.statSync(abs);
  if (!stat.isFile()) throw new Error("Not a file.");

  const size = stat.size;
  const readSize = Math.min(size, MAX_FILE_BYTES);
  const fd = fs.openSync(abs, "r");
  const buf = Buffer.alloc(readSize);
  fs.readSync(fd, buf, 0, readSize, 0);
  fs.closeSync(fd);

  if (looksLikeBinary(buf)) throw new Error("Binary files are not supported.");

  const rawContent = buf.toString("utf8");
  const redacted = redactSecrets(rawContent);

  return {
    path: relPath,
    content: redacted.text,
    size,
    truncated: size > MAX_FILE_BYTES,
    redacted: redacted.redacted || undefined,
    redactedSecretsCount: redacted.count > 0 ? redacted.count : undefined,
    sensitivePathWarning: sensitive.warning && sensitive.reason ? sensitive.reason : undefined,
  };
}

// ── Search files ───────────────────────────────────────────────────────────

export function repoSearchFiles(
  root: string,
  query: string,
  opts: { maxMatches?: number; caseSensitive?: boolean } = {}
): SearchMatch[] {
  const maxMatches = opts.maxMatches ?? 100;
  const caseSensitive = opts.caseSensitive ?? false;
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: SearchMatch[] = [];

  const allFiles: TreeEntry[] = [];
  walkDir(root, root, allFiles);

  for (const entry of allFiles) {
    if (entry.type !== "file") continue;
    if (matches.length >= maxMatches) break;
    if ((entry.size ?? 0) > MAX_FILE_BYTES) continue;

    const abs = path.join(root, entry.path);

    // Skip symlinks — they cannot be used to escape the repo root
    // or point to files outside the repo boundary.
    if (isSymlink(abs)) continue;

    let buf: Buffer;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      continue;
    }
    if (looksLikeBinary(buf)) continue;

    const text = buf.toString("utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
      const haystack = caseSensitive ? lines[i] : lines[i].toLowerCase();
      if (haystack.includes(needle)) {
        matches.push({ path: entry.path, line: i + 1, text: lines[i].trim() });
      }
    }
  }

  return matches;
}

// ── Git execution helper (safe: no shell, fixed cwd, fixed args, capped) ──

const GIT_TIMEOUT_MS = 15_000;
const MAX_GIT_OUTPUT_BYTES = 256 * 1024; // 256 KB

function execGit(root: string, args: string[], timeoutMs: number): string {
  const result = execFileSync("git", args, {
    cwd: root,
    timeout: timeoutMs,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    windowsHide: true,
  });
  return result.toString("utf8");
}

// ── Git status (read-only, real subprocess) ───────────────────────────────

export function gitStatus(root: string): { result: GitStatusResult; gitAvailable: boolean } {
  const { branch } = readGitHead(root);

  try {
    const stdout = execGit(root, ["status", "--porcelain=v1", "--branch"], GIT_TIMEOUT_MS);
    const lines = stdout.trim().split("\n").filter(Boolean);

    // Parse porcelain v1 output
    const entries: GitStatusResult["entries"] = [];
    for (const line of lines) {
      if (line.startsWith("## ")) {
        // Branch header line already handled by readGitHead
        continue;
      }
      // Porcelain v1 format: XY PATH (two status chars, space, path)
      // For renamed: "R  old.txt\0new.txt" -> we take the new path
      if (line.length < 4) continue;
      const status = line.slice(0, 2);
      let filePath = line.slice(3);
      // Handle renamed files (status starts with R and there's a null separator)
      if (status.startsWith("R") && filePath.includes("\0")) {
        filePath = filePath.split("\0")[1] ?? filePath;
      }
      entries.push({
        path: filePath,
        status: status.replace(/\s/g, ""),
      });
    }

    return {
      result: {
        branch,
        entries,
        note: entries.length === 0 ? "Working tree is clean." : `${entries.length} changed file(s).`,
      },
      gitAvailable: true,
    };
  } catch {
    // execGit failed — fall back to read-only head metadata
    return {
      result: {
        branch,
        entries: [],
        note: "Git is not available in this environment. Branch read from .git/HEAD.",
      },
      gitAvailable: false,
    };
  }
}

// ── Git diff (read-only, real subprocess) ──────────────────────────────────

export function gitDiff(root: string, staged = false): GitDiffResult {
  const args = staged
    ? ["diff", "--cached", "--no-ext-diff", "--"]
    : ["diff", "--no-ext-diff", "--"];

  try {
    const stdout = execGit(root, args, GIT_TIMEOUT_MS);
    const truncated = stdout.length >= MAX_GIT_OUTPUT_BYTES;
    return {
      diff: truncated ? stdout.slice(0, MAX_GIT_OUTPUT_BYTES) + "\n... (truncated)" : stdout,
      truncated,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    return { diff: `Error: ${error}`, truncated: false };
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

function readGitHead(root: string): {
  branch: string | "unknown";
  headCommit: string | "unknown";
} {
  try {
    const headPath = path.join(root, ".git", "HEAD");
    if (!fs.existsSync(headPath)) return { branch: "unknown", headCommit: "unknown" };

    const head = fs.readFileSync(headPath, "utf8").trim();
    let branch: string | "unknown" = "unknown";
    let headCommit: string | "unknown" = "unknown";

    if (head.startsWith("ref: refs/heads/")) {
      branch = head.slice("ref: refs/heads/".length);
      const refPath = path.join(root, ".git", "refs", "heads", branch);
      try {
        headCommit = fs.readFileSync(refPath, "utf8").trim();
      } catch {
        // packed-refs fallback
        headCommit = readPackedRef(root, `refs/heads/${branch}`);
      }
    } else if (/^[0-9a-f]{40}$/i.test(head)) {
      // detached HEAD
      headCommit = head;
    }

    return { branch, headCommit };
  } catch {
    return { branch: "unknown", headCommit: "unknown" };
  }
}

function readPackedRef(root: string, refName: string): string | "unknown" {
  try {
    const packedPath = path.join(root, ".git", "packed-refs");
    const content = fs.readFileSync(packedPath, "utf8");
    for (const line of content.split("\n")) {
      if (line.endsWith(refName)) {
        return line.split(" ")[0];
      }
    }
  } catch {
    // ignore
  }
  return "unknown";
}
