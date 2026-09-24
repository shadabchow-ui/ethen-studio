import "server-only";

import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const GIT_TIMEOUT_MS = 30_000;
const MAX_GIT_OUTPUT_BYTES = 256 * 1024;

function runGit(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    windowsHide: true,
  }).toString("utf8");
}

function readHeadCommit(repoRoot: string): string | null {
  try {
    return runGit(repoRoot, ["rev-parse", "HEAD"]).trim();
  } catch {
    return null;
  }
}

export function getSandboxRoot(): string | null {
  const val = process.env.ETHEN_LOCAL_SANDBOX_ROOT?.trim();
  if (!val) return null;
  try {
    const resolved = path.resolve(val);
    return resolved;
  } catch {
    return null;
  }
}

export function isSandboxAvailable(): boolean {
  const root = getSandboxRoot();
  if (!root) return false;
  try {
    runGit(root, ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export function createWorktree(
  repoRoot: string,
  sandboxId: string
): { ok: true; sandboxPath: string } | { ok: false; error: string } {
  if (!/^[a-zA-Z0-9_-]+$/.test(sandboxId)) {
    return { ok: false, error: "Worktree identifier contains unsupported path characters." };
  }
  const sandboxRoot = getSandboxRoot();
  if (!sandboxRoot) {
    return {
      ok: false,
      error: "ETHEN_LOCAL_SANDBOX_ROOT is not set. Sandbox mode requires a configured sandbox root directory.",
    };
  }

  if (!fs.existsSync(sandboxRoot)) {
    try {
      fs.mkdirSync(sandboxRoot, { recursive: true });
    } catch {
      return { ok: false, error: `Failed to create sandbox root directory: ${sandboxRoot}` };
    }
  }

  const sandboxPath = path.join(sandboxRoot, sandboxId);

  if (fs.existsSync(sandboxPath)) {
    return { ok: false, error: `Sandbox path already exists: ${sandboxPath}` };
  }

  const headCommit = readHeadCommit(repoRoot);
  if (!headCommit) {
    return { ok: false, error: "Could not determine HEAD commit for worktree creation." };
  }

  try {
    runGit(repoRoot, [
      "worktree",
      "add",
      "--detach",
      sandboxPath,
      headCommit,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Git worktree creation failed: ${message}` };
  }

  if (!fs.existsSync(sandboxPath)) {
    return { ok: false, error: `Worktree created but sandbox path is missing: ${sandboxPath}` };
  }

  return { ok: true, sandboxPath };
}

export function removeWorktree(
  repoRoot: string,
  sandboxPath: string
): { ok: true } | { ok: false; error: string } {
  const sandboxRoot = getSandboxRoot();
  if (!sandboxRoot) {
    return { ok: false, error: "ETHEN_LOCAL_SANDBOX_ROOT is not set." };
  }

  const resolvedSandbox = path.resolve(sandboxPath);
  const resolvedRoot = path.resolve(sandboxRoot);

  if (!resolvedSandbox.startsWith(resolvedRoot + path.sep) && resolvedSandbox !== resolvedRoot) {
    return {
      ok: false,
      error: `Sandbox path ${sandboxPath} is outside the configured sandbox root. Cleanup refused.`,
    };
  }

  if (!fs.existsSync(resolvedSandbox)) {
    return { ok: false, error: `Sandbox path does not exist: ${sandboxPath}` };
  }

  const status = getWorktreeStatus(resolvedSandbox);
  if ("error" in status) return { ok: false, error: status.error };
  if (status.entries.length > 0) {
    return { ok: false, error: `Worktree has ${status.entries.length} unreviewed change(s). Review it before cleanup.` };
  }

  try {
    runGit(repoRoot, [
      "worktree",
      "remove",
      resolvedSandbox,
    ]);
  } catch (err) {
    return {
      ok: false,
      error: `Git worktree removal failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }

  try {
    if (fs.existsSync(resolvedSandbox)) {
      fs.rmSync(resolvedSandbox, { recursive: true, force: true });
    }
  } catch {
    // Non-critical — the worktree was already removed from git's tracking
  }

  return { ok: true };
}

export function getWorktreeDiff(
  sandboxPath: string,
  repoRoot: string
): { diff: string; truncated: boolean } | { error: string } {
  if (!fs.existsSync(sandboxPath)) {
    return { error: "Sandbox path does not exist." };
  }

  try {
    const stdout = runGit(sandboxPath, [
      "diff",
      "--no-ext-diff",
      "--",
    ]);
    const truncated = stdout.length >= MAX_GIT_OUTPUT_BYTES;
    return {
      diff: truncated ? stdout.slice(0, MAX_GIT_OUTPUT_BYTES) + "\n... (truncated)" : stdout,
      truncated,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export function getWorktreeStatus(
  sandboxPath: string
): { entries: Array<{ path: string; status: string }>; note: string } | { error: string } {
  if (!fs.existsSync(sandboxPath)) {
    return { error: "Sandbox path does not exist." };
  }

  try {
    const stdout = runGit(sandboxPath, [
      "status",
      "--porcelain=v1",
      "--branch",
    ]);
    const lines = stdout.trim().split("\n").filter(Boolean);
    const entries: Array<{ path: string; status: string }> = [];

    for (const line of lines) {
      if (line.startsWith("## ")) continue;
      if (line.length < 4) continue;
      const status = line.slice(0, 2);
      let filePath = line.slice(3);
      if (status.startsWith("R") && filePath.includes("\0")) {
        filePath = filePath.split("\0")[1] ?? filePath;
      }
      entries.push({ path: filePath, status: status.replace(/\s/g, "") });
    }

    return {
      entries,
      note: entries.length === 0 ? "Sandbox working tree is clean." : `${entries.length} changed file(s) in sandbox.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export function listWorktrees(repoRoot: string): Array<{ path: string; head: string; branch: string; detached: boolean }> {
  try {
    const stdout = runGit(repoRoot, ["worktree", "list", "--porcelain"]);
    const worktrees: Array<{ path: string; head: string; branch: string; detached: boolean }> = [];
    let current: Partial<{ path: string; head: string; branch: string; detached: boolean }> = {};

    for (const line of stdout.split("\n")) {
      if (line === "") {
        if (current.path) {
          worktrees.push({
            path: current.path,
            head: current.head ?? "unknown",
            branch: current.branch ?? "detached",
            detached: current.detached ?? false,
          });
        }
        current = {};
        continue;
      }
      if (line.startsWith("worktree ")) {
        current.path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice("branch ".length).replace("refs/heads/", "");
      } else if (line.startsWith("detached")) {
        current.detached = true;
      }
    }

    if (current.path) {
      worktrees.push({
        path: current.path,
        head: current.head ?? "unknown",
        branch: current.branch ?? "detached",
        detached: current.detached ?? false,
      });
    }

    return worktrees;
  } catch {
    return [];
  }
}

export function getSandboxConfigStatus(): {
  configured: boolean;
  root: string | null;
  available: boolean;
  note: string;
} {
  const root = getSandboxRoot();
  if (!root) {
    return {
      configured: false,
      root: null,
      available: false,
      note: "ETHEN_LOCAL_SANDBOX_ROOT is not configured. Set this environment variable to enable isolated git worktree execution.",
    };
  }
  if (!fs.existsSync(root)) {
    return {
      configured: false,
      root,
      available: false,
      note: `Sandbox root directory does not exist: ${root}. The directory will be created when the first worktree is requested.`,
    };
  }
  try {
    runGit(root, ["--version"]);
    return {
      configured: true,
      root,
      available: true,
      note: `Sandbox root is configured and git is available at ${root}.`,
    };
  } catch {
    return {
      configured: true,
      root,
      available: false,
      note: `Sandbox root is set to ${root} but git is not available in that location.`,
    };
  }
}

export function isSourceRepoDirty(repoRoot: string): {
  dirty: boolean;
  entries: Array<{ path: string; status: string }>;
  note: string;
} {
  try {
    const stdout = runGit(repoRoot, [
      "status",
      "--porcelain=v1",
      "--branch",
    ]);
    const lines = stdout.trim().split("\n").filter(Boolean);
    const entries: Array<{ path: string; status: string }> = [];
    for (const line of lines) {
      if (line.startsWith("## ")) continue;
      if (line.length < 4) continue;
      const status = line.slice(0, 2);
      let filePath = line.slice(3);
      if (status.startsWith("R") && filePath.includes("\0")) {
        filePath = filePath.split("\0")[1] ?? filePath;
      }
      entries.push({ path: filePath, status: status.replace(/\s/g, "") });
    }
    return {
      dirty: entries.length > 0,
      entries,
      note: entries.length === 0
        ? "Source working tree is clean."
        : `Source working tree is dirty — ${entries.length} file(s) have uncommitted changes. Worktree will be created from HEAD and will not include these changes.`,
    };
  } catch {
    return {
      dirty: false,
      entries: [],
      note: "Could not check source repo dirty state (git may not be available).",
    };
  }
}

export function getSandboxDisplayPath(sandboxPath: string): string {
  const sandboxRoot = getSandboxRoot();
  if (sandboxRoot) {
    const rel = path.relative(sandboxRoot, sandboxPath);
    if (!rel.startsWith("..")) return `[sandbox]/${rel}`;
  }
  return path.basename(sandboxPath);
}

/**
 * Check whether an absolute path lies inside the configured sandbox root.
 * This is the primary boundary guard — it prevents writing to the parent
 * repository checkout or to sibling worktrees.
 *
 * Returns `{ ok: true, resolved }` when the target path is inside the
 * worktree, or `{ ok: false, reason }` with a clear message.
 */
export function checkWorktreeBoundary(
  sandboxPath: string,
  targetPath: string,
): { ok: true; resolved: string } | { ok: false; reason: string } {
  const sandboxRoot = getSandboxRoot();
  if (!sandboxRoot) {
    return {
      ok: false,
      reason: "ETHEN_LOCAL_SANDBOX_ROOT is not configured — cannot check worktree boundaries.",
    };
  }

  let resolvedSandbox: string;
  let resolvedTarget: string;
  try {
    resolvedSandbox = path.resolve(sandboxPath);
    resolvedTarget = path.resolve(targetPath);
  } catch {
    return { ok: false, reason: `Failed to resolve path(s).` };
  }

  // The sandbox path itself must be inside the configured sandbox root.
  if (resolvedSandbox !== sandboxRoot && !resolvedSandbox.startsWith(sandboxRoot + path.sep)) {
    return {
      ok: false,
      reason: `Sandbox path "${resolvedSandbox}" is outside the configured sandbox root "${sandboxRoot}".`,
    };
  }

  // The target path must be inside the sandbox (no parent/sibling escape).
  if (resolvedTarget !== resolvedSandbox && !resolvedTarget.startsWith(resolvedSandbox + path.sep)) {
    return {
      ok: false,
      reason: `Target path "${resolvedTarget}" is outside the sandbox "${resolvedSandbox}" — would write to parent repo or sibling worktree.`,
    };
  }

  return { ok: true, resolved: resolvedTarget };
}

/**
 * Convenience: returns true if `checkWorktreeBoundary` would pass.
 */
export function isPathInApprovedWorktreeLocation(sandboxPath: string, targetPath: string): boolean {
  const result = checkWorktreeBoundary(sandboxPath, targetPath);
  return result.ok;
}
