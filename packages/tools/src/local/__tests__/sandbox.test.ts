// Local Worktree Sandbox — Validation Suite
// Run with: npx tsx lib/local/__tests__/sandbox.test.ts

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  getSandboxRoot,
  createWorktree,
  removeWorktree,
  getWorktreeStatus,
  getWorktreeDiff,
  listWorktrees,
  getSandboxDisplayPath,
  getSandboxConfigStatus,
  isSourceRepoDirty,
} from "../sandbox-server";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label}`);
}

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "ethen-sandbox-test-"));
const repoRoot = path.join(tmpBase, "repo");
const sandboxRoot = path.join(tmpBase, "sandboxes");

fs.mkdirSync(repoRoot, { recursive: true });
execFileSync("git", ["init", "-q"], { cwd: repoRoot });
execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
execFileSync("git", ["config", "user.name", "Test"], { cwd: repoRoot });
fs.writeFileSync(path.join(repoRoot, "README.md"), "hello\n");
execFileSync("git", ["add", "."], { cwd: repoRoot });
execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoRoot });

process.env.ETHEN_LOCAL_SANDBOX_ROOT = sandboxRoot;

// ── getSandboxRoot reads env ────────────────────────────────────────────────

assert(getSandboxRoot() === path.resolve(sandboxRoot), "getSandboxRoot resolves configured env path");

// ── createWorktree ───────────────────────────────────────────────────────────

const created = createWorktree(repoRoot, "run-1");
assert(created.ok === true, "createWorktree succeeds for a valid repo + sandbox root");
const sandboxPath = created.ok ? created.sandboxPath : "";
assert(fs.existsSync(sandboxPath), "worktree directory exists on disk after creation");
assert(fs.existsSync(path.join(sandboxPath, "README.md")), "worktree contains checked-out files from HEAD");

const duplicate = createWorktree(repoRoot, "run-1");
assert(duplicate.ok === false, "creating a worktree with a duplicate sandbox id fails");

// ── isolation: edits in the worktree do not touch the primary checkout ─────

fs.writeFileSync(path.join(sandboxPath, "README.md"), "edited in sandbox\n");
assert(
  fs.readFileSync(path.join(repoRoot, "README.md"), "utf8") === "hello\n",
  "editing a file inside the worktree leaves the primary checkout untouched",
);

const status = getWorktreeStatus(sandboxPath);
assert(!("error" in status) && status.entries.length === 1, "worktree status reports the edited file");

const diff = getWorktreeDiff(sandboxPath, repoRoot);
assert(!("error" in diff) && diff.diff.includes("edited in sandbox"), "worktree diff reflects the sandbox-only edit");

const realSandboxPath = fs.realpathSync(sandboxPath);
const worktrees = listWorktrees(repoRoot);
assert(worktrees.some((w) => fs.realpathSync(w.path) === realSandboxPath), "listWorktrees includes the created sandbox");

assert(
  getSandboxDisplayPath(sandboxPath).startsWith("[sandbox]/"),
  "getSandboxDisplayPath produces a sandbox-relative label",
);

// ── removeWorktree refuses paths outside the sandbox root ──────────────────

const outsideGuard = removeWorktree(repoRoot, repoRoot);
assert(outsideGuard.ok === false, "removeWorktree refuses to delete a path outside the configured sandbox root");
assert(fs.existsSync(repoRoot), "primary repo checkout survives a refused cleanup attempt");

const dirtyCleanup = removeWorktree(repoRoot, sandboxPath);
assert(dirtyCleanup.ok === false, "removeWorktree refuses to discard unreviewed worktree changes");
assert(fs.existsSync(sandboxPath), "dirty worktree remains available for review after cleanup refusal");

execFileSync("git", ["checkout", "--", "README.md"], { cwd: sandboxPath });

// ── removeWorktree cleans up a real sandbox path ────────────────────────────

const removed = removeWorktree(repoRoot, sandboxPath);
assert(removed.ok === true, "removeWorktree succeeds for a valid sandbox path");
assert(!fs.existsSync(sandboxPath), "worktree directory is gone after cleanup");

const worktreesAfter = listWorktrees(repoRoot);
assert(
  !worktreesAfter.some((w) => path.resolve(w.path) === path.resolve(sandboxPath)),
  "git no longer tracks the removed worktree",
);

// ── cleanup ──────────────────────────────────────────────────────────────────

delete process.env.ETHEN_LOCAL_SANDBOX_ROOT;

// ── getSandboxConfigStatus: missing env ─────────────────────────────────────

const missingEnvStatus = getSandboxConfigStatus();
assert(!missingEnvStatus.configured, "config status reports not configured when env is missing");
assert(missingEnvStatus.root === null, "config status root is null when env missing");
assert(missingEnvStatus.note.includes("not configured"), "config status note mentions not configured");

// ── getSandboxConfigStatus: with env set ─────────────────────────────────────

process.env.ETHEN_LOCAL_SANDBOX_ROOT = sandboxRoot;
const presentEnvStatus = getSandboxConfigStatus();
assert(presentEnvStatus.configured, "config status reports configured when env is set");
assert(presentEnvStatus.root === path.resolve(sandboxRoot), "config status root matches sandbox root");
assert(presentEnvStatus.available, "config status reports available when git is present");
delete process.env.ETHEN_LOCAL_SANDBOX_ROOT;

// ── createWorktree: missing env gives clear error ───────────────────────────

const missingEnvCreate = createWorktree(repoRoot, "run-missing-env");
assert(missingEnvCreate.ok === false, "createWorktree fails when env is not set");
assert(
  missingEnvCreate.ok === false && missingEnvCreate.error.includes("ETHEN_LOCAL_SANDBOX_ROOT"),
  "error message mentions ETHEN_LOCAL_SANDBOX_ROOT",
);

// ── isSourceRepoDirty: clean repo ────────────────────────────────────────────

const cleanState = isSourceRepoDirty(repoRoot);
assert(!cleanState.dirty, "source repo is not dirty (clean git state)");
assert(cleanState.entries.length === 0, "no dirty entries for clean repo");

// ── isSourceRepoDirty: dirty repo ────────────────────────────────────────────

execFileSync("git", ["checkout", "-b", "dirty-test", "-q"], { cwd: repoRoot });
fs.writeFileSync(path.join(repoRoot, "dirty-file.txt"), "uncommitted change\n");
const dirtyState = isSourceRepoDirty(repoRoot);
assert(dirtyState.dirty, "source repo is dirty after uncommitted change");
assert(dirtyState.entries.length === 1, "one dirty entry");
assert(dirtyState.entries[0].path === "dirty-file.txt", "dirty entry path is correct");
assert(dirtyState.note.includes("uncommitted changes"), "note mentions uncommitted changes");

// cleanup dirty test file
fs.unlinkSync(path.join(repoRoot, "dirty-file.txt"));
execFileSync("git", ["checkout", "-q", "-"], { cwd: repoRoot });
execFileSync("git", ["branch", "-D", "dirty-test", "-q"], { cwd: repoRoot });

// ── Final cleanup ────────────────────────────────────────────────────────────

fs.rmSync(tmpBase, { recursive: true, force: true });

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
