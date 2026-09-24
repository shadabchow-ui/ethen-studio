// Central command parser + risk classifier.
// Parses command structure (tokens, operators, env vars, redirects) and
// classifies risk deterministically. Used by shell.run before execution.

import type {
  CommandParseResult,
  CommandRiskClassification,
  CommandRiskLevel,
  ShellOperatorKind,
} from "@ethen/contracts/tools/types";
import { COMMAND_RISK_LABELS } from "@ethen/contracts/tools/types";
import { ALLOWED_COMMAND_STRINGS } from "./local/safe-command";

const READ_ONLY_BASES = new Set([
  "ls", "dir", "pwd", "cat", "head", "tail", "less",
  "grep", "rg", "find", "wc", "sort", "uniq", "cut",
  "stat", "file", "which", "where", "type",
  "echo", "date", "env", "printenv", "whoami",
]);

const DESTRUCTIVE_PATTERNS = [
  /\brm\b\s+.*-rf?\b/i,
  /\brm\b\s+.*-r\b/i,
  /\brmdir\b/i,
  /\bdel\b/i,
  /\bdrop\s+table\b/i,
  /\bdrop\s+db\b/i,
  /\btruncate\b/i,
  /\bformat\b/i,
  /\bmkfs\b/i,
  /\bdd\b\s+if=/i,
  /\b>\s*\/dev\b/i,
  /\bchmod\b\s+.*777/i,
  /\bchmod\b\s+.*-R\b/i,
  /\bchown\b\s+.*-R\b/i,
  /\bkill\b\s+-9/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bterraform\s+destroy\b/i,
  /\bterraform\s+apply\b/i,
];

const GIT_MUTATING_SUBCOMMANDS = new Set([
  "commit", "add", "push", "checkout", "reset",
  "rebase", "merge", "branch", "tag", "stash",
  "clean",
]);

const SECRET_CLOUD_PATTERNS = [
  /\baws\b/i,
  /\bgcloud\b/i,
  /\baz\b/i,
  /\bkubectl\b/i,
  /\bterraform\b/i,
  /\bpulumi\b/i,
  /\bansible\b/i,
  /\bheroku\b/i,
  /\bfly\b\s+deploy/i,
  /\bvercel\b\s+deploy/i,
  /\bnetlify\b\s+deploy/i,
  /\bgh\b\s+secret/i,
  /\bgh\b\s+auth/i,
];

const NETWORK_PATTERNS = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bfetch\b/i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\brsync\b/i,
  /\bftp\b/i,
  /\bnc\b/i,
  /\btelnet\b/i,
  /\bhttpie\b/i,
  /\bgit\s+clone\s+/i,
];

const PACKAGE_INSTALL_PATTERNS = [
  /\bnpm\b\s+install/i,
  /\bnpm\b\s+i\b/i,
  /\bnpm\b\s+uninstall/i,
  /\bnpm\b\s+add/i,
  /\byarn\b\s+add/i,
  /\byarn\b\s+remove/i,
  /\byarn\b\s+install/i,
  /\bpip\b\s+install/i,
  /\bpip\b\s+uninstall/i,
  /\bpip3\b\s+install/i,
  /\bcargo\b\s+install/i,
  /\bcargo\b\s+uninstall/i,
  /\bgo\b\s+get\b/i,
  /\bgo\b\s+install\b/i,
  /\bpnpm\b\s+add/i,
  /\bpnpm\b\s+install/i,
  /\bpnpm\b\s+remove/i,
  /\bbun\b\s+add/i,
  /\bbun\b\s+install/i,
  /\bbun\b\s+remove/i,
  /\bapt\b\s+install/i,
  /\bapt-get\b\s+install/i,
  /\bbrew\b\s+install/i,
  /\bchoco\b\s+install/i,
  /\bsnap\b\s+install/i,
  /\bdocker\b\s+run\b/i,
  /\bdocker\b\s+pull\b/i,
];

const LIFECYCLE_SCRIPT_PATTERNS = [
  /\bpnpm\b\s+run\b\s+postinstall/i,
  /\bnpm\b\s+run\b\s+postinstall/i,
  /\byarn\b\s+run\b\s+postinstall/i,
  /\bpnpm\b\s+run\b\s+prepare/i,
  /\bnpm\b\s+run\b\s+prepare/i,
  /\byarn\b\s+run\b\s+prepare/i,
  /\bpnpm\b\s+run\b\s+preinstall/i,
  /\bnpm\b\s+run\b\s+preinstall/i,
  /\byarn\b\s+run\b\s+preinstall/i,
  /\bpnpm\b\s+run\b\s+prepublish/i,
  /\bnpm\b\s+run\b\s+prepublish/i,
  /\byarn\b\s+run\b\s+prepublish/i,
];

const NPX_ALONE_OR_ARBITRARY = /\bnpx\b(?!\s+(tsx|tsc|eslint|prettier|vitest|jest|playwright|cypress)\b)/i;

const EXFILTRATION_PATTERNS = [
  /\bnc\b\s+-e\b/i,
  /\bnc\b\s+-c\b/i,
  /\bbash\b\s+-i\b\s+>/i,
  /\bpython\b\s+-c\b\s+['"]import\b/i,
  /\bperl\b\s+-e\b/i,
  /\bruby\b\s+-e\b/i,
  /\bphp\b\s+-r\b/i,
];

const VALIDATION_PATTERNS = [
  /\bpnpm\s+(test|typecheck|lint|build)\b/i,
  /\bnpm\s+(test|run\s+test|run\s+lint|run\s+build|run\s+typecheck)\b/i,
  /\bnpx\s+(tsx|tsc|eslint|prettier|vitest|jest|playwright|cypress)\b/i,
  /\byarn\s+(test|lint|build|typecheck)\b/i,
  /\bcargo\s+(test|check|clippy)\b/i,
  /\bgo\s+(test|vet)\b/i,
  /\bpytest\b/i,
  /\btsc\b/i,
  /\beslint\b/i,
  /\bprettier\b/i,
  /\bvitest\b/i,
  /\bjest\b/i,
  /\bnext\s+lint\b/i,
  /\bgit\s+diff\b/i,
  /\bgit\s+status\b/i,
];

function parseShellOperators(raw: string): {
  operators: Array<{ kind: ShellOperatorKind; position: number }>;
  hasRedirect: boolean;
  hasSubshell: boolean;
} {
  const operators: Array<{ kind: ShellOperatorKind; position: number }> = [];
  let hasRedirect = false;
  let hasSubshell = false;

  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "\\" && i + 1 < raw.length) {
      i += 2;
      continue;
    }

    if (raw[i] === '"' || raw[i] === "'") {
      const quote = raw[i];
      i++;
      while (i < raw.length) {
        if (raw[i] === "\\" && i + 1 < raw.length) {
          i += 2;
          continue;
        }
        if (raw[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (raw[i] === "`") {
      operators.push({ kind: "subshell", position: i });
      hasSubshell = true;
      i++;
      while (i < raw.length && raw[i] !== "`") {
        if (raw[i] === "\\" && i + 1 < raw.length) i += 2;
        else i++;
      }
      if (i < raw.length) i++;
      continue;
    }

    if (raw[i] === "$" && i + 1 < raw.length && raw[i + 1] === "(") {
      operators.push({ kind: "subshell", position: i });
      hasSubshell = true;
      i += 2;
      let depth = 1;
      while (i < raw.length && depth > 0) {
        if (raw[i] === "(") depth++;
        else if (raw[i] === ")") depth--;
        i++;
      }
      continue;
    }

    if (raw.slice(i, i + 2) === "&&") {
      operators.push({ kind: "and", position: i });
      i += 2;
      continue;
    }

    if (raw.slice(i, i + 2) === "||") {
      operators.push({ kind: "or", position: i });
      i += 2;
      continue;
    }

    if (raw[i] === ";" && (i === raw.length - 1 || !raw.slice(i + 1, i + 3).match(/^\d/))) {
      operators.push({ kind: "semicolon", position: i });
      i++;
      continue;
    }

    if (raw[i] === "|" && raw[i + 1] !== "|") {
      operators.push({ kind: "pipe", position: i });
      i++;
      continue;
    }

    if (raw.slice(i, i + 2) === ">>") {
      operators.push({ kind: "redirect_out", position: i });
      hasRedirect = true;
      i += 2;
      continue;
    }

    if (raw[i] === ">" && raw[i - 1] !== "2") {
      operators.push({ kind: "redirect_out", position: i });
      hasRedirect = true;
      i++;
      continue;
    }

    if (raw[i] === "<" && raw[i - 1] !== "2") {
      operators.push({ kind: "redirect_in", position: i });
      hasRedirect = true;
      i++;
      continue;
    }

    if (raw[i] === "&" && i === raw.length - 1) {
      operators.push({ kind: "background", position: i });
      i++;
      continue;
    }

    i++;
  }

  return { operators, hasRedirect, hasSubshell };
}

export function parseCommand(raw: string): CommandParseResult {
  const trimmed = raw.trim();

  const { operators, hasRedirect, hasSubshell } = parseShellOperators(trimmed);

  const hasOperators = operators.length > 0;
  const isSafe = !hasOperators && !hasRedirect && !hasSubshell;

  const hasEnvAssignment = /^\s*\w+\s*=\s*\S/.test(trimmed);

  const tokens = trimmed.split(/\s+/).filter(Boolean);

  let baseCommand = tokens.length > 0 ? tokens[0].toLowerCase() : "";
  const args = tokens.slice(1);

  if (hasEnvAssignment && baseCommand.includes("=")) {
    const eqIdx = tokens[0].indexOf("=");
    if (eqIdx > 0 && eqIdx < tokens[0].length - 1) {
      baseCommand = tokens.length > 1 ? tokens[1].toLowerCase() : baseCommand;
    }
  }

  return {
    raw: trimmed,
    baseCommand,
    args,
    operators,
    hasEnvAssignment,
    hasRedirect,
    hasSubshell,
    isSafe,
  };
}

export function classifyCommand(parseResult: CommandParseResult): CommandRiskLevel {
  const { raw, baseCommand, args, hasRedirect, hasSubshell } = parseResult;

  if (!raw) return "unknown";

  if (LIFECYCLE_SCRIPT_PATTERNS.some((p) => p.test(raw))) return "package_install";
  if (EXFILTRATION_PATTERNS.some((p) => p.test(raw))) return "destructive";
  if (NPX_ALONE_OR_ARBITRARY.test(raw)) return "unknown";
  if (SECRET_CLOUD_PATTERNS.some((p) => p.test(raw))) return "secrets_or_cloud";
  if (DESTRUCTIVE_PATTERNS.some((p) => p.test(raw))) return "destructive";
  if (PACKAGE_INSTALL_PATTERNS.some((p) => p.test(raw))) return "package_install";

  if (hasSubshell) return "unknown";
  if (hasRedirect) return "unknown";

  const operators = parseResult.operators;
  for (const op of operators) {
    if (op.kind === "pipe" || op.kind === "and" || op.kind === "or" || op.kind === "semicolon") {
      return "unknown";
    }
  }

  if (baseCommand === "git" && args.length > 0) {
    const subCmd = args[0].toLowerCase();
    if (GIT_MUTATING_SUBCOMMANDS.has(subCmd)) return "git_mutation";
  }

  if (NETWORK_PATTERNS.some((p) => p.test(raw))) return "network";

  if (VALIDATION_PATTERNS.some((p) => p.test(raw))) return "validation";

  if (READ_ONLY_BASES.has(baseCommand)) return "safe_read_only";

  return "unknown";
}

const allowlistedExactCommands = new Set(ALLOWED_COMMAND_STRINGS);

export function getCommandPolicy(
  raw: string,
  isApproved: boolean,
): CommandRiskClassification {
  const trimmed = raw.trim();
  const parseResult = parseCommand(trimmed);
  const riskLevel = classifyCommand(parseResult);
  const indicators: string[] = [];

  if (parseResult.hasSubshell) indicators.push("subshell detected");
  if (parseResult.hasRedirect) indicators.push("redirect detected");
  for (const op of parseResult.operators) {
    if (op.kind === "pipe") indicators.push("pipe operator");
    if (op.kind === "and") indicators.push("&& operator");
    if (op.kind === "or") indicators.push("|| operator");
    if (op.kind === "semicolon") indicators.push("semicolon operator");
    if (op.kind === "background") indicators.push("background operator");
  }

  const inAllowlist = allowlistedExactCommands.has(trimmed);

  if (!trimmed) {
    return {
      raw: trimmed,
      parseResult,
      riskLevel: "unknown",
      allowed: false,
      approvalRequired: false,
      reason: "Empty command.",
      indicators,
    };
  }

  if (!inAllowlist) {
    if (parseResult.hasSubshell || parseResult.hasRedirect || !parseResult.isSafe) {
      return {
        raw: trimmed,
        parseResult,
        riskLevel,
        allowed: false,
        approvalRequired: false,
        reason: `Command contains shell operators/special characters and is not in the allowlist. Classified as "${COMMAND_RISK_LABELS[riskLevel]}".`,
        indicators,
      };
    }

    return {
      raw: trimmed,
      parseResult,
      riskLevel,
      allowed: false,
      approvalRequired: false,
      reason: `Command "${trimmed}" is not in the shell.run allowlist. Classified as "${COMMAND_RISK_LABELS[riskLevel]}".`,
      indicators,
    };
  }

  if (riskLevel === "destructive" || riskLevel === "secrets_or_cloud") {
    return {
      raw: trimmed,
      parseResult,
      riskLevel,
      allowed: false,
      approvalRequired: false,
      reason: `Command classified as "${COMMAND_RISK_LABELS[riskLevel]}" — blocked by policy.`,
      indicators,
    };
  }

  if (riskLevel === "unknown") {
    return {
      raw: trimmed,
      parseResult,
      riskLevel,
      allowed: false,
      approvalRequired: false,
      reason: `Command risk is "unknown" — blocked by policy.`,
      indicators,
    };
  }

  if (riskLevel === "package_install" || riskLevel === "git_mutation" || riskLevel === "network") {
    return {
      raw: trimmed,
      parseResult,
      riskLevel,
      allowed: false,
      approvalRequired: false,
      reason: `Command classified as "${COMMAND_RISK_LABELS[riskLevel]}" — blocked by policy.`,
      indicators,
    };
  }

  if (riskLevel === "validation" || riskLevel === "safe_read_only") {
    return {
      raw: trimmed,
      parseResult,
      riskLevel,
      allowed: true,
      approvalRequired: true,
      reason: `Command classified as "${COMMAND_RISK_LABELS[riskLevel]}" — requires approval.`,
      indicators,
    };
  }

  return {
    raw: trimmed,
    parseResult,
    riskLevel,
    allowed: false,
    approvalRequired: false,
    reason: "Unknown policy decision.",
    indicators,
  };
}

export function previewCommand(raw: string): CommandRiskClassification {
  return getCommandPolicy(raw, false);
}
