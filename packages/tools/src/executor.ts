import "server-only";
import type { CodingToolId } from "@ethen/contracts/tools/types";
import {
  gitDiff,
  gitStatus,
  repoGetMetadata,
  repoListTree,
  repoReadFile,
  repoSearchFiles,
} from "./local/repo-bridge";
import { executableForPlatform, resolveAllowedCommand } from "./local/safe-command";
import { previewCommand } from "./command-risk";
import type { CommandRiskClassification } from "@ethen/contracts/tools/types";
import type {
  GitDiffResult,
  GitStatusResult,
  LocalRepoResponse,
  ReadFileResult,
  RepoMetadata,
  SearchMatch,
  TreeEntry,
  FileProposePatchOutput,
} from "./local/types";
import { parsePatch } from "./local/patch";
import { validatePatchPath, validatePatchFileContent } from "./local/patch-guards";
import { validateReadBeforeEdit } from "./local/read-tracker";
import type { PatchApplyOutput } from "./local/types";
import { applyPatch, proposePatch } from "./patch-runtime-port";
import { redactSecrets, redactSummary } from "@ethen/security/redact";
import { getProposal, isExecutable, markExecuted, markFailed } from "@ethen/security/approvals/store";
import { computePayloadHash } from "@ethen/security/policies/payload-hash";
import { validateSignedApprovalToken } from "@ethen/security/policies/signed-approval-token";
import { enforcePolicyDecision } from "@ethen/security/policies/enforcer";
import { spawn, type ChildProcess } from "node:child_process";

const MAX_SHELL_OUTPUT_BYTES = 100 * 1024;
const SHELL_TIMEOUT_MS = 120_000;

/** Maximum bytes per emitted stream chunk before capping. */
const MAX_STREAM_CHUNK_BYTES = 4_096;

export interface ExecuteToolOptions {
  /** Called with each stdout chunk as it arrives. Capped at MAX_STREAM_CHUNK_BYTES. */
  onStdoutChunk?: (chunk: string) => void;
  /** Called with each stderr chunk as it arrives. Capped at MAX_STREAM_CHUNK_BYTES. */
  onStderrChunk?: (chunk: string) => void;
  /** Stops the underlying process and its child process group when aborted. */
  signal?: AbortSignal;
}

const SANITIZED_ENV: Record<string, string | undefined> = {
  HOME: process.env.HOME,
  USER: process.env.USER,
  PATH: process.env.PATH,
  LANG: process.env.LANG ?? "en_US.UTF-8",
  NODE_ENV: "development",
  SystemRoot: process.env.SystemRoot,
  ComSpec: process.env.ComSpec,
  PATHEXT: process.env.PATHEXT,
  USERPROFILE: process.env.USERPROFILE,
};

export interface ShellRunResult {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  truncated: boolean;
  risk: CommandRiskClassification | null;
  redacted?: boolean;
}

function sanitizedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(SANITIZED_ENV)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.killed) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    killer.on("error", () => child.kill());
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
}

function spawnChild(
  executable: string,
  args: string[],
  cwd: string,
  onChunk?: {
    onStdoutChunk?: (chunk: string) => void;
    onStderrChunk?: (chunk: string) => void;
  },
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; exitCode: number; truncated: boolean; durationMs: number }> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const opts = {
      cwd,
      env: sanitizedEnv() as NodeJS.ProcessEnv,
      timeout: SHELL_TIMEOUT_MS,
      detached: process.platform !== "win32",
      windowsHide: true,
    };
    const child: ChildProcess = spawn(executable, args, opts);
    const abort = () => terminateProcessTree(child);
    if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });

    let stdout = "";
    let stderr = "";
    let truncated = false;

    if (child.stdout) {
      child.stdout.on("data", (data: Buffer) => {
      if (stdout.length < MAX_SHELL_OUTPUT_BYTES) {
        stdout += data.toString("utf8");
        if (stdout.length > MAX_SHELL_OUTPUT_BYTES) {
          stdout = stdout.slice(0, MAX_SHELL_OUTPUT_BYTES);
          truncated = true;
        }
      } else {
        truncated = true;
      }
      const raw = data.toString("utf8");
      if (onChunk?.onStdoutChunk && raw.length > 0) {
        const capped = raw.length > MAX_STREAM_CHUNK_BYTES ? raw.slice(0, MAX_STREAM_CHUNK_BYTES) : raw;
        onChunk.onStdoutChunk(redactSecrets(capped).text);
      }
    });
    }

    if (child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
      if (stderr.length < MAX_SHELL_OUTPUT_BYTES) {
        stderr += data.toString("utf8");
        if (stderr.length > MAX_SHELL_OUTPUT_BYTES) {
          stderr = stderr.slice(0, MAX_SHELL_OUTPUT_BYTES);
          truncated = true;
        }
      } else {
        truncated = true;
      }
      const raw = data.toString("utf8");
      if (onChunk?.onStderrChunk && raw.length > 0) {
        const capped = raw.length > MAX_STREAM_CHUNK_BYTES ? raw.slice(0, MAX_STREAM_CHUNK_BYTES) : raw;
        onChunk.onStderrChunk(redactSecrets(capped).text);
      }
    });
    }

    child.on("close", (code: number | null) => {
      signal?.removeEventListener("abort", abort);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
        truncated,
        durationMs: Date.now() - startedAt,
      });
    });

    child.on("error", (err: Error) => {
      signal?.removeEventListener("abort", abort);
      reject(err);
    });
  });
}

// ── Trace ──────────────────────────────────────────────────────────────────────

interface ToolTraceEvent {
  tool: CodingToolId | "shell.run" | "file.propose_patch" | "file.apply_patch";
  ok: boolean;
  durationMs: number;
  outputSize: number;
  error?: string;
}

function writeTrace(event: ToolTraceEvent): void {
  console.log(
    "[tool-trace]",
    JSON.stringify({ ...event, ts: new Date().toISOString() })
  );
}

// ── Input schemas ──────────────────────────────────────────────────────────────

export type ShellRunInput = {
  tool: "shell.run";
  command: string;
  approvalId?: string;
  approvalToken?: string;
};

export type PatchProposeInput = { tool: "file.propose_patch"; runId: string; patch: string; reason: string; expectedFiles: string[]; validationCommands?: string[]; readFiles?: string[] };

export type PatchApplyToolInput = {
  tool: "file.apply_patch";
  runId: string;
  proposalId: string;
  approvalId?: string;
  approvalToken?: string;
  atomic?: boolean;
};

export type ToolInput =
  | { tool: "repo.get_metadata" }
  | { tool: "repo.list_tree"; path?: string }
  | { tool: "repo.read_file"; path: string }
  | { tool: "repo.search_files"; query: string; maxMatches?: number; caseSensitive?: boolean }
  | { tool: "git.status" }
  | { tool: "git.diff"; staged?: boolean }
  | ShellRunInput
  | PatchProposeInput
  | PatchApplyToolInput;

// ── Output ─────────────────────────────────────────────────────────────────────

export type ToolOutput =
  | LocalRepoResponse<RepoMetadata>
  | LocalRepoResponse<TreeEntry[]>
  | LocalRepoResponse<ReadFileResult>
  | LocalRepoResponse<SearchMatch[]>
  | LocalRepoResponse<GitStatusResult>
  | LocalRepoResponse<GitDiffResult>
  | LocalRepoResponse<ShellRunResult>
  | LocalRepoResponse<FileProposePatchOutput>
  | LocalRepoResponse<PatchApplyOutput>;

// ── Sanitize helpers ───────────────────────────────────────────────────────────

const MAX_OUTPUT_CHARS = 64_000;
// repo.list_tree returns plain path/type/size entries (no file contents),
// so it is safe to allow a much larger payload than the generic 64 KB cap.
// At MAX_TREE_ENTRIES (2000) entries, a flat path list can exceed 64 KB on
// any repo of moderate size, which silently dropped the entire tree before
// this limit was raised — the client received `{ _truncated: true }` instead
// of an array and showed a misleading "could not be loaded" message.
const MAX_TREE_OUTPUT_CHARS = 1_000_000;

function truncateOutput<T>(data: T, maxChars: number = MAX_OUTPUT_CHARS): T {
  const s = JSON.stringify(data);
  if (s.length <= maxChars) return data;
  const kb = Math.round(maxChars / 1000);
  return { _truncated: true, note: `Output exceeded ${kb} KB and was omitted.` } as unknown as T;
}

// ── Validate input fields ──────────────────────────────────────────────────────

function validateRelPath(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required field: ${field}`);
  }
  if (value.includes("\0")) throw new Error(`Field ${field} contains null bytes.`);
  return value.trim();
}

function validateQuery(value: unknown): string {
  const q = validateRelPath(value, "query");
  if (q.length > 500) throw new Error("Query exceeds 500 characters.");
  return q;
}

function validateMaxMatches(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(1, Math.floor(value)), 200);
}

function validateCommand(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing required field: command");
  }
  if (value.length > 2000) throw new Error("Command exceeds 2000 characters.");
  return value.trim();
}

// ── Executor ───────────────────────────────────────────────────────────────────

export async function executeTool(
  root: string,
  input: ToolInput,
  options?: ExecuteToolOptions,
): Promise<ToolOutput> {
  const start = Date.now();
  let result: ToolOutput;

  try {
    switch (input.tool) {
      case "repo.get_metadata": {
        const data = truncateOutput(repoGetMetadata(root));
        result = { ok: true, data };
        break;
      }

      case "repo.list_tree": {
        const subPath =
          typeof input.path === "string" && input.path.trim()
            ? input.path.trim()
            : ".";
        const data = truncateOutput(repoListTree(root, subPath), MAX_TREE_OUTPUT_CHARS);
        result = { ok: true, data };
        break;
      }

      case "repo.read_file": {
        const relPath = validateRelPath(input.path, "path");
        const data = truncateOutput(repoReadFile(root, relPath));
        result = { ok: true, data };
        break;
      }

      case "repo.search_files": {
        const query = validateQuery(input.query);
        const maxMatches = validateMaxMatches(input.maxMatches);
        const caseSensitive =
          typeof input.caseSensitive === "boolean" ? input.caseSensitive : false;
        const data = truncateOutput(
          repoSearchFiles(root, query, { maxMatches, caseSensitive })
        );
        result = { ok: true, data };
        break;
      }

      case "git.status": {
        const { result: statusData } = gitStatus(root);
        const data = truncateOutput(statusData);
        result = { ok: true, data };
        break;
      }

      case "git.diff": {
        const staged =
          "staged" in input && typeof input.staged === "boolean" ? input.staged : false;
        const data = truncateOutput(gitDiff(root, staged));
        result = { ok: true, data };
        break;
      }

      case "shell.run": {
        const command = validateCommand(input.command);
        const shellApprovalError = validateApprovalForStateChangingExecution(
          "shell.run",
          input.approvalId,
          input.approvalToken,
          { command },
        );
        if (shellApprovalError) {
          throw new Error(shellApprovalError);
        }
        const policy = previewCommand(command);
        if (!policy.allowed) {
          throw new Error(policy.reason);
        }
        const resolved = resolveAllowedCommand(command);
        if (!resolved) {
          throw new Error(
            `Command "${command}" is not in the shell.run allowlist. Allowed: pnpm lint|typecheck|build|test, git diff|status.`
          );
        }
        const cwd = root;
        const { stdout, stderr, exitCode, truncated, durationMs } = await spawnChild(
          executableForPlatform(resolved.executable),
          resolved.args,
          cwd,
          options ? {
            onStdoutChunk: options.onStdoutChunk,
            onStderrChunk: options.onStderrChunk,
          } : undefined,
          options?.signal,
        );
        const redactedStdout = redactSecrets(stdout.slice(0, MAX_SHELL_OUTPUT_BYTES));
        const redactedStderr = redactSecrets(stderr.slice(0, MAX_SHELL_OUTPUT_BYTES));
        const shellResult: ShellRunResult = {
          command,
          cwd,
          exitCode,
          stdout: redactedStdout.text,
          stderr: redactedStderr.text,
          startedAt: new Date(start).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs,
          truncated: truncated || stdout.length > MAX_SHELL_OUTPUT_BYTES || stderr.length > MAX_SHELL_OUTPUT_BYTES,
          risk: policy,
          redacted: redactedStdout.redacted || redactedStderr.redacted || undefined,
        };
        finalizeApprovalOutcome(
          input.approvalId,
          exitCode === 0,
          exitCode === 0 ? undefined : `Command exited with code ${exitCode}.`,
        );
        result = { ok: true, data: shellResult };
        break;
      }

      case "file.propose_patch": {
        const data = truncateOutput(executeProposePatch(root, input.runId, input.patch, input.reason, input.expectedFiles, input.validationCommands, input.readFiles));
        result = { ok: true, data };
        break;
      }

      case "file.apply_patch": {
        const data = truncateOutput(
          executeApplyPatch(
            root,
            input.runId,
            input.proposalId,
            input.approvalId,
            input.approvalToken,
            input.atomic,
          ),
        );
        result = { ok: true, data };
        break;
      }
    }

    writeTrace({
      tool: input.tool,
      ok: true,
      durationMs: Date.now() - start,
      outputSize: JSON.stringify(result).length,
    });
    return result;
  } catch (err) {
    const error = redactSummary(err instanceof Error ? err.message : "Internal error", 500);
    writeTrace({
      tool: input.tool,
      ok: false,
      durationMs: Date.now() - start,
      outputSize: 0,
      error,
    });
    return { ok: false, error };
  }
}

function executeProposePatch(
  root: string,
  runId: string,
  patchRaw: string,
  reason: string,
  expectedFiles: string[],
  validationCommands?: string[],
  readFiles?: string[],
): FileProposePatchOutput {
  const warnings: string[] = [];
  const proposalId = `pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (!runId || typeof runId !== "string") {
    return {
      proposalId: "",
      status: "rejected",
      affectedFiles: [],
      previewDiff: "",
      policy: emptyPolicy(),
      warnings: [],
      error: "Missing required field: runId.",
    };
  }

  if (!patchRaw || typeof patchRaw !== "string") {
    return {
      proposalId,
      status: "rejected",
      affectedFiles: [],
      previewDiff: "",
      policy: emptyPolicy(),
      warnings: [],
      error: "Missing required field: patch.",
    };
  }

  if (!reason || typeof reason !== "string") {
    return {
      proposalId,
      status: "rejected",
      affectedFiles: [],
      previewDiff: "",
      policy: emptyPolicy(),
      warnings: [],
      error: "Missing required field: reason.",
    };
  }

  const parsed = parsePatch(patchRaw);

  if (parsed.errors.length > 0) {
    return {
      proposalId,
      status: "rejected",
      affectedFiles: [],
      previewDiff: "",
      policy: emptyPolicy(),
      warnings,
      error: `Patch parsing failed: ${parsed.errors.join("; ")}`,
    };
  }

  const operationPaths = parsed.operations.map((op) => op.filePath);
  const allTargetPaths = [...new Set([...expectedFiles, ...operationPaths])];

  const policy = emptyPolicy();
  const edits: Array<{ filePath: string; content: string }> = [];

  for (const filePath of operationPaths) {
    const pathCheck = validatePatchPath(root, filePath);
    if (!pathCheck.safe) {
      const isSecret = pathCheck.reason?.includes("Secret") || pathCheck.reason?.includes("Environment");
      const isTraversal = pathCheck.reason?.includes("Path traversal") || pathCheck.reason?.includes("Absolute");

      if (isTraversal) policy.pathTraversalBlocked = true;
      if (isSecret) policy.secretPathsBlocked = true;

      return {
        proposalId,
        status: "rejected",
        affectedFiles: allTargetPaths,
        previewDiff: "",
        policy,
        warnings,
        error: `Path rejected: ${pathCheck.reason}`,
      };
    }

    const op = parsed.operations.find((o) => o.filePath === filePath);
    if (op?.kind === "delete") {
      return {
        proposalId,
        status: "rejected",
        affectedFiles: allTargetPaths,
        previewDiff: "",
        policy,
        warnings,
        error: "Delete operations are not supported by the current approval-gated patch pipeline.",
      };
    }
    const content = op?.content;
    if (content !== undefined) {
      const contentCheck = validatePatchFileContent(root, filePath, content);
      if (!contentCheck.safe) {
        return {
          proposalId,
          status: "rejected",
          affectedFiles: allTargetPaths,
          previewDiff: "",
          policy: { ...policy, binaryBlocked: true },
          warnings,
          error: `Content rejected: ${contentCheck.reason}`,
        };
      }
      edits.push({ filePath, content });
    }
  }

  const readCheck = validateReadBeforeEdit(runId, allTargetPaths, readFiles);
  policy.readBeforeEditEnforced = true;

  if (!readCheck.passed) {
    policy.readBeforeEditPassed = false;
    const unreadList = readCheck.unreadFiles.join(", ");
    return {
      proposalId,
      status: "rejected",
      affectedFiles: allTargetPaths,
      previewDiff: "",
      policy,
      warnings,
      error: `Read-before-edit check failed. The following files must be read in this run before proposing changes: ${unreadList}`,
    };
  }
  policy.readBeforeEditPassed = true;

  const previewDiff = buildPreviewDiff(parsed.operations);

  const riskLevel = classifyRiskLevel(parsed.operations);
  policy.riskLevel = riskLevel;

  if (riskLevel === "high") {
    warnings.push("High-risk proposal: verify changes carefully before approval.");
  }

  if (validationCommands && validationCommands.length > 0) {
    warnings.push(`Validation commands proposed: ${validationCommands.join(", ")}`);
  }

  const proposal = proposePatch(
    {
      runId,
      title: reason.slice(0, 120),
      reason,
      edits,
      editDescription: reason,
      riskLevel: riskLevel === "high" ? "high" : riskLevel === "medium" ? "medium" : "low",
    },
    root,
  );

  if (!("proposalId" in proposal)) {
    return {
      proposalId,
      status: "rejected",
      affectedFiles: allTargetPaths,
      previewDiff,
      policy,
      warnings,
      error: proposal.error,
    };
  }

  warnings.push("Dry-run only — no files were written.");

  return {
    proposalId: proposal.proposalId,
    status: riskLevel === "high" ? "requires_approval" : "validated",
    affectedFiles: allTargetPaths,
    previewDiff,
    policy,
    warnings,
  };
}

function buildPreviewDiff(operations: import("./local/types").PatchOperation[]): string {
  const lines: string[] = [];
  for (const op of operations) {
    switch (op.kind) {
      case "add":
        lines.push(`--- /dev/null`);
        lines.push(`+++ b/${op.filePath}`);
        lines.push(`@@ -0,0 +1,${countContentLines(op.content)} @@`);
        if (op.content) {
          for (const contentLine of op.content.split("\n")) {
            lines.push(`+ ${contentLine}`);
          }
        }
        break;
      case "update":
        lines.push(`--- a/${op.filePath}`);
        lines.push(`+++ b/${op.filePath}`);
        lines.push(`@@ update @@`);
        if (op.content) {
          for (const contentLine of op.content.split("\n")) {
            lines.push(`+ ${contentLine}`);
          }
        }
        break;
      case "delete":
        lines.push(`--- a/${op.filePath}`);
        lines.push(`+++ /dev/null`);
        lines.push(`@@ delete @@`);
        break;
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function countContentLines(content?: string): number {
  if (!content) return 0;
  return content.split("\n").length;
}

function classifyRiskLevel(operations: import("./local/types").PatchOperation[]): "low" | "medium" | "high" {
  const hasDelete = operations.some((op) => op.kind === "delete");
  const fileCount = operations.length;
  if (hasDelete && fileCount > 3) return "high";
  if (hasDelete) return "medium";
  if (fileCount > 5) return "medium";
  return "low";
}

function emptyPolicy(): import("./local/types").PatchPolicy {
  return {
    riskLevel: "low",
    secretPathsBlocked: false,
    pathTraversalBlocked: false,
    binaryBlocked: false,
    oversizedBlocked: false,
    readBeforeEditEnforced: true,
    readBeforeEditPassed: false,
  };
}

function executeApplyPatch(
  root: string,
  runId: string,
  proposalId: string,
  approvalId?: string,
  approvalToken?: string,
  atomic?: boolean,
): PatchApplyOutput {
  if (!runId || typeof runId !== "string") {
    return {
      patchId: "",
      status: "failed",
      appliedFiles: [],
      failedFiles: [],
      diffs: {},
      checkpointId: "",
      rollbackAvailable: false,
      verification: { verified: false, checks: [], summary: "Missing required field: runId." },
      errors: ["Missing required field: runId."],
      beforeContentHashes: {},
      afterContentHashes: {},
    };
  }

  if (!proposalId || typeof proposalId !== "string") {
    return {
      patchId: "",
      status: "failed",
      appliedFiles: [],
      failedFiles: [],
      diffs: {},
      checkpointId: "",
      rollbackAvailable: false,
      verification: { verified: false, checks: [], summary: "Missing required field: proposalId." },
      errors: ["Missing required field: proposalId."],
      beforeContentHashes: {},
      afterContentHashes: {},
    };
  }

  const approvalError = validateApprovalForStateChangingExecution(
    "file.apply_patch",
    approvalId,
    approvalToken,
    {
      runId,
      proposalId,
      atomic: atomic ?? true,
    },
  );
  if (approvalError) {
    return {
      patchId: "",
      status: "failed",
      appliedFiles: [],
      failedFiles: [],
      diffs: {},
      checkpointId: "",
      rollbackAvailable: false,
      verification: { verified: false, checks: [], summary: approvalError },
      errors: [approvalError],
      beforeContentHashes: {},
      afterContentHashes: {},
    };
  }

  const result = applyPatch(
    { runId, proposalId, approvalId, approvalToken, atomic: atomic ?? true },
    root
  );

  finalizeApprovalOutcome(
    approvalId,
    result.status === "applied",
    result.errors.length > 0 ? result.errors.join("; ") : undefined,
  );

  return result;
}

function validateApprovalForStateChangingExecution(
  toolId: "file.apply_patch" | "shell.run",
  approvalId: string | undefined,
  approvalToken: string | undefined,
  payload: Record<string, unknown>,
): string | null {
  const policyResult = enforcePolicyDecision({
    projectId: null,
    targetKind: "tool_call",
    action: toolId,
    toolName: toolId,
    arguments: payload,
    traceId: `trace_exec_${Date.now()}`,
    profile: null,
    riskTier: toolId === "shell.run" ? "high" : "medium",
  });

  if (policyResult.denied) {
    return `Policy denied: ${policyResult.decision.reason}`;
  }

  if (policyResult.requiresApproval && !approvalId) {
    return `Policy requires approval for "${toolId}". Submit an approval proposal first.`;
  }

  if (!approvalId) {
    return `State-changing tool "${toolId}" requires signed approval. Provide valid approvalId and approvalToken.`;
  }

  const proposal = getProposal(approvalId);
  if (!proposal) {
    return "Approval proposal not found.";
  }

  if (!isExecutable(approvalId)) {
    return `Approval proposal status is "${proposal.status}" — must be "approved" to execute.`;
  }

  const expiresAt = proposal.expiresAt ?? "";
  if (proposal.expiresAt && new Date(proposal.expiresAt).getTime() <= Date.now()) {
    markFailed(approvalId);
    return `Approval expired at ${proposal.expiresAt}.`;
  }

  const validation = validateSignedApprovalToken({
    token: approvalToken,
    expected: {
      proposalId: proposal.id,
      toolId,
      payloadHash: computePayloadHash(payload),
      sessionId: proposal.sessionId ?? null,
      userId: proposal.userId ?? null,
      expiresAt,
    },
  });

  if (!validation.ok) {
    if (validation.failure.code === "expired_token") {
      markFailed(approvalId);
    }
    return validation.failure.message;
  }

  return null;
}

function finalizeApprovalOutcome(
  approvalId: string | undefined,
  succeeded: boolean,
  _error?: string,
): void {
  if (!approvalId) {
    return;
  }

  if (succeeded) {
    markExecuted(approvalId);
    return;
  }

  markFailed(approvalId);
}
