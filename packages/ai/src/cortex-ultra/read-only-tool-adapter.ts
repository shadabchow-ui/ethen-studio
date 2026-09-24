// ── Cortex Ultra Read-Only Tool Adapter ───────────────────────────────────────
// Safe adapter around existing read-only tool/research paths.
// Allowed tools: search (→ research.answer), retrieval (→ research.contents),
// repo (→ repo-bridge read-only operations), file (→ file read via repo-bridge).
// Unknown/write/state-changing tools are denied.
// Tool output is untrusted evidence — never treated as instruction.
// Prompt-injection text in tool output is never exposed to system/runtime.

import type { ToolClass } from "../cortex/types";
import type { CortexToolRequest } from "./types";
import {
  repoReadFile,
  repoListTree,
  repoSearchFiles,
  repoGetMetadata,
} from "@ethen/tools/local/repo-bridge";
import {
  getRepoRoot,
  resolveRepoPath,
  MAX_FILE_BYTES,
  MAX_TREE_ENTRIES,
} from "@ethen/tools/local/guards";
import type { ReadFileResult, TreeEntry, SearchMatch, RepoMetadata } from "@ethen/tools/local/types";

// ── Safe adapter result ──────────────────────────────────────────────────────

export interface ReadOnlyToolResult {
  toolName: string;
  toolClass: ToolClass;
  success: boolean;
  /** Compact summary safe for user-facing display. Never raw output. */
  summary: string;
  /** Source URLs collected (e.g. research sources). Never fabricated. */
  sourceUrls: string[];
  /** Whether this tool class is actually backed by a working provider. */
  grounded: boolean;
  /** Deferred tool classes — these exist in the allowlist but lack execution wiring. */
  deferred: boolean;
  error?: string;
}

// ── Read-only tool allowlist ─────────────────────────────────────────────────

export const READ_ONLY_TOOL_CLASSES: ReadonlySet<ToolClass> = new Set([
  "search",
  "retrieval",
  "repo",
  "file",
]);

// Tool classes that are write/state-changing — always denied.
export const WRITE_TOOL_CLASSES: ReadonlySet<ToolClass> = new Set([
  "browser",
  "computer_use",
  "api",
  "connector",
  "terminal",
  "calendar",
  "email",
  "slack",
  "github",
  "drive",
]);

// Which read-only tool classes have grounded execution paths.
const GROUNDED_TOOL_CLASSES: ReadonlySet<ToolClass> = new Set([
  "search",
  "retrieval",
  "repo",
  "file",
]);

// ── Sanitization ─────────────────────────────────────────────────────────────

const MAX_SUMMARY_LENGTH = 500;

function sanitizeSummary(text: string): string {
  const cleaned = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  if (cleaned.length <= MAX_SUMMARY_LENGTH) return cleaned;
  return cleaned.slice(0, MAX_SUMMARY_LENGTH - 3) + "...";
}

function isPromptInjectionLike(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    "ignore all previous instructions",
    "you are now",
    "system prompt:",
    "override safety",
    "bypass policy",
    "disable verification",
    "act as root",
    "sudo ",
    "pretend you are",
  ];
  return patterns.some((p) => lower.includes(p));
}

function defendAgainstInjection(text: string): string {
  if (isPromptInjectionLike(text)) {
    return "[Tool output contained potential prompt injection — redacted by read-only adapter]";
  }
  return text;
}

// ── Research tool execution ──────────────────────────────────────────────────

async function executeResearchSearch(query: string): Promise<{
  summary: string;
  sourceUrls: string[];
  grounded: boolean;
}> {
  try {
    // Dynamic import to avoid server-only issues in test contexts
    const { executeCortexResearchTool } = await import("../cortex/research");
    const { buildResearchInputFromResult } = await import("../cortex/research");
    const outcome = await executeCortexResearchTool(query);
    const input = buildResearchInputFromResult({
      query,
      provider: outcome.provider,
      result: outcome.result,
    });

    const sourceUrls = input.sources.map((s) => s.url);
    const sourceCount = sourceUrls.length;

    if (outcome.failed) {
      return {
        summary: `Research lookup failed: ${outcome.errorMessage ?? "unknown error"}. No evidence collected.`,
        sourceUrls: [],
        grounded: true,
      };
    }

    if (sourceCount === 0 && !input.answerText) {
      return {
        summary: "Research completed with no sources or answer text. No evidence collected.",
        sourceUrls: [],
        grounded: true,
      };
    }

    const parts: string[] = [];
    if (input.answerText) {
      parts.push(`Research answer: ${input.answerText}`);
    }
    if (sourceCount > 0) {
      parts.push(`${sourceCount} sources found`);
    }
    if (input.evidence.length > 0) {
      parts.push(`${input.evidence.length} evidence items`);
    }

    return {
      summary: parts.join(". "),
      sourceUrls,
      grounded: true,
    };
  } catch {
    return {
      summary: "Research tool unavailable (provider not configured). No evidence collected.",
      sourceUrls: [],
      grounded: false,
    };
  }
}

async function executeRetrievalQuery(query: string): Promise<{
  summary: string;
  sourceUrls: string[];
  grounded: boolean;
}> {
  try {
    const { executeCortexResearchTool } = await import("../cortex/research");
    const { buildResearchInputFromResult } = await import("../cortex/research");
    const outcome = await executeCortexResearchTool(query);
    const input = buildResearchInputFromResult({
      query,
      provider: outcome.provider,
      result: outcome.result,
    });

    const sourceUrls = input.sources.map((s) => s.url);

    if (outcome.failed) {
      return {
        summary: `Content retrieval failed: ${outcome.errorMessage ?? "unknown error"}. No evidence collected.`,
        sourceUrls: [],
        grounded: true,
      };
    }

    if (sourceUrls.length === 0) {
      return {
        summary: "Content retrieval completed with no sources. No evidence collected.",
        sourceUrls: [],
        grounded: true,
      };
    }

    return {
      summary: `${sourceUrls.length} sources retrieved for content analysis.`,
      sourceUrls,
      grounded: true,
    };
  } catch {
    return {
      summary: "Retrieval tool unavailable (provider not configured). No evidence collected.",
      sourceUrls: [],
      grounded: false,
    };
  }
}

// ── Repo/file grounded execution (reuses existing repo-bridge) ──────────────

async function executeRepoOperation(
  toolName: string,
  args: Record<string, unknown>
): Promise<ReadOnlyToolResult> {
  const root = getRepoRoot();
  if (!root) {
    return {
      toolName,
      toolClass: "repo",
      success: true,
      summary: "Repo tool requires a configured repo root (ETHEN_LOCAL_REPO_PATH). No evidence collected.",
      sourceUrls: [],
      grounded: false,
      deferred: false,
    };
  }

  try {
    const nameLower = toolName.toLowerCase();

    // repo.read_file → read a single file
    if (nameLower.includes("read_file") || nameLower.includes(".read")) {
      const relPath = typeof args.path === "string" && args.path.trim() ? args.path.trim() : "";
      if (!relPath) {
        return {
          toolName,
          toolClass: "repo",
          success: false,
          summary: "repo.read_file requires a non-empty path argument.",
          sourceUrls: [],
          grounded: true,
          deferred: false,
          error: "empty_path",
        };
      }
      const result: ReadFileResult = repoReadFile(root, relPath);
      const contentSummary = defendAgainstInjection(result.content);
      const truncated =
        contentSummary.length > 500
          ? contentSummary.slice(0, 497) + "..."
          : contentSummary;
      return {
        toolName,
        toolClass: "repo",
        success: true,
        summary: `Read file "${relPath}" (${result.size} bytes${result.truncated ? ", truncated" : ""}): ${truncated}`,
        sourceUrls: [],
        grounded: true,
        deferred: false,
      };
    }

    // repo.list_tree → directory listing
    if (nameLower.includes("list_tree") || nameLower.includes("list") || nameLower.includes("tree")) {
      const subPath = typeof args.path === "string" && args.path.trim() ? args.path.trim() : ".";
      const entries: TreeEntry[] = repoListTree(root, subPath);
      const entrySummary = entries.slice(0, 50).map((e) => `${e.path} (${e.type})`).join(", ");
      const total = entries.length;
      const note = total > 50 ? ` (${total - 50} more entries omitted)` : "";
      return {
        toolName,
        toolClass: "repo",
        success: true,
        summary: `Listed ${total} entr${total === 1 ? "y" : "ies"} under "${subPath}": ${entrySummary}${note}`,
        sourceUrls: [],
        grounded: true,
        deferred: false,
      };
    }

    // repo.search_files → content search
    if (nameLower.includes("search_files") || nameLower.includes("search")) {
      const query = typeof args.query === "string" && args.query.trim() ? args.query.trim() : "";
      if (!query) {
        return {
          toolName,
          toolClass: "repo",
          success: false,
          summary: "repo.search_files requires a non-empty query argument.",
          sourceUrls: [],
          grounded: true,
          deferred: false,
          error: "empty_query",
        };
      }
      const maxMatches = typeof args.maxMatches === "number" ? Math.min(Math.max(1, args.maxMatches), 200) : 100;
      const caseSensitive = typeof args.caseSensitive === "boolean" ? args.caseSensitive : false;
      const matches: SearchMatch[] = repoSearchFiles(root, query, { maxMatches, caseSensitive });
      const matchSummary = matches.slice(0, 20).map((m) => `${m.path}:${m.line}`).join(", ");
      const total = matches.length;
      const note = total > 20 ? ` (${total - 20} more matches omitted)` : "";
      return {
        toolName,
        toolClass: "repo",
        success: true,
        summary: `Searched "${query}": ${total} match${total === 1 ? "" : "es"} found${note ? note : ""}. ${matchSummary}`,
        sourceUrls: [],
        grounded: true,
        deferred: false,
      };
    }

    // repo.get_metadata / default → repo metadata
    const meta: RepoMetadata = repoGetMetadata(root);
    return {
      toolName,
      toolClass: "repo",
      success: true,
      summary: `Repo metadata: "${meta.name}" (branch: ${meta.branch}, commit: ${meta.headCommit})`,
      sourceUrls: [],
      grounded: true,
      deferred: false,
    };
  } catch (err) {
    return {
      toolName,
      toolClass: "repo",
      success: false,
      summary: `Repo operation failed: ${err instanceof Error ? err.message : "unknown error"}. No evidence collected.`,
      sourceUrls: [],
      grounded: true,
      deferred: false,
      error: "execution_failed",
    };
  }
}

async function executeFileOperation(
  toolName: string,
  args: Record<string, unknown>
): Promise<ReadOnlyToolResult> {
  const root = getRepoRoot();
  if (!root) {
    return {
      toolName,
      toolClass: "file",
      success: true,
      summary: "File tool requires a configured repo root (ETHEN_LOCAL_REPO_PATH). No evidence collected.",
      sourceUrls: [],
      grounded: false,
      deferred: false,
    };
  }

  try {
    const relPath = typeof args.path === "string" && args.path.trim() ? args.path.trim() : "";
    if (!relPath) {
      return {
        toolName,
        toolClass: "file",
        success: false,
        summary: "file.read requires a non-empty path argument.",
        sourceUrls: [],
        grounded: true,
        deferred: false,
        error: "empty_path",
      };
    }
    const result: ReadFileResult = repoReadFile(root, relPath);
    const contentSummary = defendAgainstInjection(result.content);
    const truncated =
      contentSummary.length > 500
        ? contentSummary.slice(0, 497) + "..."
        : contentSummary;
    return {
      toolName,
      toolClass: "file",
      success: true,
      summary: `Read file "${relPath}" (${result.size} bytes${result.truncated ? ", truncated" : ""}): ${truncated}`,
      sourceUrls: [],
      grounded: true,
      deferred: false,
    };
  } catch (err) {
    return {
      toolName,
      toolClass: "file",
      success: false,
      summary: `File read failed: ${err instanceof Error ? err.message : "unknown error"}. No evidence collected.`,
      sourceUrls: [],
      grounded: true,
      deferred: false,
      error: "execution_failed",
    };
  }
}

function deferredEvidence(toolClass: ToolClass): ReadOnlyToolResult {
  return {
    toolName: `${toolClass}.inspect`,
    toolClass,
    success: true,
    summary: `${toolClass} tool is read-only allowed but execution wiring is deferred. No evidence collected from this tool class.`,
    sourceUrls: [],
    grounded: false,
    deferred: true,
  };
}

// ── Main adapter ─────────────────────────────────────────────────────────────

export async function executeReadOnlyTool(
  request: CortexToolRequest
): Promise<ReadOnlyToolResult> {
  const { toolName, toolClass, args } = request;

  // Unknown tool class → deny.
  if (
    !READ_ONLY_TOOL_CLASSES.has(toolClass) &&
    !WRITE_TOOL_CLASSES.has(toolClass)
  ) {
    return {
      toolName,
      toolClass,
      success: false,
      summary: `Tool class "${toolClass}" is unknown. Only read-only tools (search, retrieval, repo, file) are allowed.`,
      sourceUrls: [],
      grounded: false,
      deferred: false,
      error: "unknown_tool_class",
    };
  }

  // Write/state-changing → deny safely.
  if (WRITE_TOOL_CLASSES.has(toolClass)) {
    return {
      toolName,
      toolClass,
      success: false,
      summary: `Tool class "${toolClass}" is a write/state-changing tool. Currently blocked in Cortex Ultra (read-only MVP).`,
      sourceUrls: [],
      grounded: false,
      deferred: false,
      error: "write_tool_blocked",
    };
  }

  // Search → execute research.answer via existing provider.
  if (toolClass === "search") {
    const query = typeof args?.query === "string" ? args.query : "";
    if (!query.trim()) {
      return {
        toolName,
        toolClass,
        success: false,
        summary: "Search requires a non-empty query string.",
        sourceUrls: [],
        grounded: true,
        deferred: false,
        error: "empty_query",
      };
    }
    const result = await executeResearchSearch(query);
    return {
      toolName,
      toolClass,
      success: true,
      summary: sanitizeSummary(defendAgainstInjection(result.summary)),
      sourceUrls: result.sourceUrls,
      grounded: result.grounded,
      deferred: false,
    };
  }

  // Retrieval → execute research.contents via existing provider.
  if (toolClass === "retrieval") {
    const query = typeof args?.query === "string" ? args.query : "";
    if (!query.trim()) {
      return {
        toolName,
        toolClass,
        success: false,
        summary: "Retrieval requires a non-empty query string.",
        sourceUrls: [],
        grounded: true,
        deferred: false,
        error: "empty_query",
      };
    }
    const result = await executeRetrievalQuery(query);
    return {
      toolName,
      toolClass,
      success: true,
      summary: sanitizeSummary(defendAgainstInjection(result.summary)),
      sourceUrls: result.sourceUrls,
      grounded: result.grounded,
      deferred: false,
    };
  }

  // Repo → grounded file/list/search/metadata operations via repo-bridge.
  if (toolClass === "repo") {
    return executeRepoOperation(toolName, args);
  }

  // File → grounded file read via repo-bridge.
  if (toolClass === "file") {
    return executeFileOperation(toolName, args);
  }

  // Fallback (should not reach here for known read-only classes).
  return deferredEvidence(toolClass);
}

// ── Policy helper ────────────────────────────────────────────────────────────

export function isReadOnly(toolClass: ToolClass): boolean {
  return READ_ONLY_TOOL_CLASSES.has(toolClass);
}

export function isWriteTool(toolClass: ToolClass): boolean {
  return WRITE_TOOL_CLASSES.has(toolClass);
}

export function isGrounded(toolClass: ToolClass): boolean {
  return GROUNDED_TOOL_CLASSES.has(toolClass);
}
