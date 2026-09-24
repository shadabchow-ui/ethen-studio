// Worktree Session Strategy — local-level worktree path guards and session metadata.
// This module composes the low-level helpers from sandbox.ts into a coherent
// worktree-default execution strategy used by the runtime/agent flow.
//
// Intentionally kept separate from lib/coding/runtime/sandbox-strategy.ts
// (which handles strategy-status reporting and stale-worktree cleanup) so that
// the runtime code can import pure path-guard types without bringing in
// the full runtime sandbox-strategy machinery.

import path from "node:path";
import { getSandboxRoot } from "./sandbox-server";

// ── Worktree session metadata ──────────────────────────────────────────────

export interface WorktreeSession {
  /** Whether this session targets a worktree at all. */
  enabled: boolean;
  /** Absolute path to the worktree on disk. Null if not yet provisioned. */
  path: string | null;
  /** Human-readable display path (e.g. "[sandbox]/run-abc"). */
  displayPath: string | null;
  /** Git worktree status snapshot at provisioning time. */
  status: "not_created" | "creating" | "ready" | "error" | "cleaned_up";
  /** ISO-8601 timestamp of when the worktree was provisioned. */
  createdAt: string | null;
  /** Evidence note recorded at end of run. */
  executionNote: string | null;
}

export function createWorktreeSession(
  sandboxId: string,
): WorktreeSession {
  const configured = getConfiguredSandboxRoot();
  const pathString: string | null = configured ? path.join(configured, sandboxId) : null;

  return {
    enabled: pathString !== null,
    path: pathString,
    displayPath: pathString ? getDisplayLabel(pathString) : null,
    status: pathString ? "not_created" : "not_created",
    createdAt: null,
    executionNote: null,
  };
}

function getConfiguredSandboxRoot(): string | null {
  try {
    return getSandboxRoot();
  } catch {
    return null;
  }
}

function getDisplayLabel(absolutePath: string): string {
  const sandboxRoot = getConfiguredSandboxRoot();
  if (sandboxRoot && absolutePath.startsWith(sandboxRoot)) {
    return `[sandbox]/${path.relative(sandboxRoot, absolutePath)}`;
  }
  return absolutePath;
}

// ── Worktree boundary path guards ──────────────────────────────────────────

/**
 * Check whether `targetPath` lies inside the worktree at `sandboxPath`.
 * Rejects paths that escape into the parent repository or into a sibling
 * worktree directory.  Returns `{ ok: true, resolved: absolutePath }` on
 * success, or `{ ok: false, reason }` when the path would cross a boundary.
 */
export function isPathInApprovedWorktreeLocation(
  sandboxPath: string,
  targetPath: string,
): { ok: true; resolved: string } | { ok: false; reason: string } {
  const sandboxRoot = getConfiguredSandboxRoot();
  if (!sandboxRoot) {
    return { ok: false, reason: "ETHEN_LOCAL_SANDBOX_ROOT is not configured — cannot validate worktree boundaries." };
  }

  // Resolve both paths to their real (canonical) forms.
  let resolvedSandbox: string;
  let resolvedTarget: string;
  try {
    resolvedSandbox = path.resolve(sandboxPath);
    resolvedTarget = path.resolve(targetPath);
  } catch {
    return { ok: false, reason: `Failed to resolve path(s).` };
  }

  // The sandbox path MUST be inside the configured sandbox root.
  if (!resolvedSandbox.startsWith(sandboxRoot + path.sep) && resolvedSandbox !== sandboxRoot) {
    return {
      ok: false,
      reason: `Sandbox path "${resolvedSandbox}" is outside the configured sandbox root "${sandboxRoot}".`,
    };
  }

  // The target path MUST be inside the sandbox path (no parent/sibling escape).
  if (!resolvedTarget.startsWith(resolvedSandbox + path.sep) && resolvedTarget !== resolvedSandbox) {
    return {
      ok: false,
      reason: `Target path "${resolvedTarget}" is outside the sandbox "${resolvedSandbox}" — would write to parent repo or sibling worktree.`,
    };
  }

  return { ok: true, resolved: resolvedTarget };
}

/**
 * Assert that `targetPath` is within the worktree at `sandboxPath`.
 * Throws if the boundary check fails.
 */
export function assertPathIsInSandbox(sandboxPath: string, targetPath: string): string {
  const result = isPathInApprovedWorktreeLocation(sandboxPath, targetPath);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.resolved;
}

/**
 * Check whether the configured sandbox root can support worktree-default
 * execution (env var is set and git is available).
 */
export function isWorktreeDefaultAvailable(): boolean {
  return getConfiguredSandboxRoot() !== null;
}

// ── Execution mode helpers ─────────────────────────────────────────────────

export type ExecutionModeEvidence =
  | { mode: "worktree"; sandboxPath: string; displayPath: string; recordedBy: string }
  | { mode: "direct_root"; repoPath: string; reason: string; recordedBy: string };
