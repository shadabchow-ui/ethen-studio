import type { VerifierFinding, VerifierOutput } from "./verifier";
import type { VerifierStatus, VerifierType } from "./types";

export interface CodeVerifierContext {
  repoAvailable: boolean;
  repoName?: string;
  repoBranch?: string;
  repoInspected: boolean;
  filesListed?: string[];
  filesRead?: string[];
  validationCommandsIdentified: boolean;
  validationCommands?: string[];
  writeActionsProposed: boolean;
  outputText: string;
  userRequest: string;
}

export interface CodeVerifierResult {
  status: VerifierStatus;
  score: number;
  verifierType: VerifierType;
  findings: VerifierFinding[];
  warnings: string[];
  suggestedFixes: string[];
  requiresRerun: boolean;
  summary: string;
  repoGrounded: boolean;
  validationPlanned: boolean;
  toolsUsed: boolean;
}

function extractPathReferences(outputText: string): string[] {
  const pathPattern = /\b[\w./-]+\.[a-z]{1,6}\b/gi;
  const matches = outputText.match(pathPattern) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

function hasInventedPathRisk(
  outputText: string,
  knownFiles: string[] | undefined
): boolean {
  if (!knownFiles || knownFiles.length === 0) {
    const pathMatches = extractPathReferences(outputText);
    return pathMatches.length > 3;
  }
  const knownLower = new Set(knownFiles.map((f) => f.toLowerCase()));
  const refs = extractPathReferences(outputText);
  const unknownRefs = refs.filter((r) => !knownLower.has(r));
  return unknownRefs.length > 1 && unknownRefs.length >= refs.length * 0.5;
}

function detectWriteActionIntent(outputText: string): boolean {
  const writePhrases = [
    "create file", "edit file", "modify file", "update file",
    "write to", "overwrite", "delete file", "remove file",
    "add to file", "change file", "patch", "commit",
    "run terminal", "execute command", "shell run",
    "npm install", "pnpm add", "yarn add",
  ];
  const lower = outputText.toLowerCase();
  return writePhrases.some((p) => lower.includes(p));
}

function detectValidationCommand(outputText: string): boolean {
  const validationPatterns = [
    /\bpnpm (lint|typecheck|build|test)\b/,
    /\bnpm (run )?(lint|test|build)\b/,
    /\byarn (lint|test|build)\b/,
    /\bnpx tsc\b/,
    /\beslint\b/,
    /\bpytest\b/,
    /\bcargo test\b/,
    /\bgo test\b/,
  ];
  return validationPatterns.some((p) => p.test(outputText));
}

function extractValidationCommands(outputText: string): string[] {
  const commands: string[] = [];
  const lines = outputText.split("\n");
  const cmdPattern = /`([a-z]+(?:\s+[a-z]+)+(?:\s+[\w./-]+)*)`/gi;
  for (const line of lines) {
    const matches = line.matchAll(cmdPattern);
    for (const m of matches) {
      const cmd = m[1].trim();
      if (detectValidationCommand(cmd)) {
        commands.push(cmd);
      }
    }
  }
  return [...new Set(commands)];
}

export function verifyCodeOutput(ctx: CodeVerifierContext): CodeVerifierResult {
  const findings: VerifierFinding[] = [];
  const warnings: string[] = [];
  const suggestedFixes: string[] = [];
  let score = 1;

  if (!ctx.outputText || ctx.outputText.trim().length === 0) {
    return {
      status: "failed",
      score: 0,
      verifierType: "code",
      findings: [{ type: "empty_output", detail: "Code output text is empty" }],
      warnings: ["Empty code output produced"],
      suggestedFixes: ["Re-run code analysis with a proper prompt"],
      requiresRerun: true,
      summary: "Empty code output detected",
      repoGrounded: false,
      validationPlanned: false,
      toolsUsed: false,
    };
  }

  if (!ctx.repoAvailable) {
    findings.push({
      type: "repo_not_available",
      detail: "No local repository is connected. Set ETHEN_LOCAL_REPO_PATH to enable repo-grounded code assistance.",
    });
    warnings.push("Repository not connected — code analysis cannot be repo-grounded. Set ETHEN_LOCAL_REPO_PATH for full repo awareness.");
    score -= 0.2;
    suggestedFixes.push("Set ETHEN_LOCAL_REPO_PATH in .env.local to connect a repository.");
  } else {
    if (ctx.repoInspected) {
      findings.push({
        type: "repo_inspected",
        detail: `Repository ${ctx.repoName ?? "unknown"} was inspected before analysis`,
      });
    } else {
      findings.push({
        type: "repo_not_inspected",
        detail: "Repository is connected but was not inspected before producing this analysis",
      });
      warnings.push("Code analysis produced without repo inspection — results may not be grounded.");
      score -= 0.15;
      suggestedFixes.push("Run repo inspection before code analysis to ensure grounded results.");
    }
  }

  if (hasInventedPathRisk(ctx.outputText, ctx.filesListed)) {
    findings.push({
      type: "invented_path_risk",
      detail: "Output references file paths that were not confirmed from the repository",
    });
    warnings.push("Some file paths in the output may be invented rather than sourced from the repo — verify before relying.");
    score -= 0.15;
    suggestedFixes.push("Verify file paths exist in the repository before acting on them.");
  }

  if (!ctx.validationCommandsIdentified && !detectValidationCommand(ctx.outputText)) {
    findings.push({
      type: "no_validation_planned",
      detail: "No validation commands (lint, typecheck, test, build) were identified in the analysis",
    });
    warnings.push("No validation commands identified — always run lint, typecheck, and tests before deploying changes.");
    score -= 0.1;
    suggestedFixes.push("Include validation command recommendations: pnpm lint, pnpm typecheck, pnpm build, pnpm test.");
  } else {
    const cmds = extractValidationCommands(ctx.outputText);
    if (cmds.length > 0) {
      findings.push({
        type: "validation_planned",
        detail: `Validation commands identified: ${cmds.join(", ")}`,
      });
    } else if (ctx.validationCommandsIdentified) {
      findings.push({
        type: "validation_planned",
        detail: "Validation commands were identified during analysis",
      });
    }
  }

  if (detectWriteActionIntent(ctx.outputText)) {
    findings.push({
      type: "write_action_proposed",
      detail: "Output proposes file edits, command execution, or other write actions that require explicit user approval",
    });
    warnings.push("Write actions proposed — all file edits and shell commands require explicit approval before execution.");
    score -= 0.05;
    suggestedFixes.push("Review all proposed changes before approving. Use the approval workflow for write actions.");
  }

  const repoGrounded = ctx.repoAvailable && ctx.repoInspected && !hasInventedPathRisk(ctx.outputText, ctx.filesListed);
  const toolsUsed = ctx.filesListed !== undefined && (ctx.filesListed.length > 0 || (ctx.filesRead ?? []).length > 0);
  const validationPlanned = ctx.validationCommandsIdentified || detectValidationCommand(ctx.outputText);

  score = Math.max(0, Math.min(1, score));

  let status: VerifierStatus;
  if (score >= 0.8) {
    status = "passed";
  } else if (score >= 0.5) {
    status = "warned";
  } else {
    status = "failed";
  }

  let summary = "Code verification completed";
  if (status === "passed") summary = "Code output verified successfully";
  else if (status === "warned") summary = "Code output verified with warnings";
  else summary = "Code output verification failed";

  return {
    status,
    score,
    verifierType: "code",
    findings,
    warnings,
    suggestedFixes,
    requiresRerun: status === "failed",
    summary,
    repoGrounded,
    validationPlanned,
    toolsUsed,
  };
}
