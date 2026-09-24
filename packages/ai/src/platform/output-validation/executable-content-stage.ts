import type {
  JsonValue,
  OutputValidationContext,
  OutputValidationIssue,
  OutputValidationStage,
  OutputValidationStageResult,
} from "./types";

const SIGNAL_PATTERNS: Array<{ signal: string; pattern: RegExp }> = [
  { signal: "shell-shebang", pattern: /^#!\/(?:bin|usr\/bin)\/(?:bash|sh|zsh|env\s+bash|env\s+sh)/im },
  { signal: "dangerous-shell", pattern: /\b(?:rm\s+-rf|curl\s+https?:\/\/|wget\s+https?:\/\/|bash\s+-c|chmod\s+\d{3}|git\s+push)\b/i },
  { signal: "html-document", pattern: /<!DOCTYPE html>|<html\b/i },
  { signal: "script-tag", pattern: /<script\b/i },
  { signal: "js-eval", pattern: /\b(?:eval\(|new Function\(|document\.write\()/i },
];

function collectSignals(value: JsonValue, signals: Set<string>): void {
  if (typeof value === "string") {
    for (const entry of SIGNAL_PATTERNS) {
      if (entry.pattern.test(value)) {
        signals.add(entry.signal);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSignals(item, signals));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((nested) => collectSignals(nested as JsonValue, signals));
  }
}

export const executableContentStage: OutputValidationStage = {
  name: "executable-content-stage",
  run(input: unknown, context: OutputValidationContext): OutputValidationStageResult {
    if (context.options.allowExecutableContent) {
      return { output: input };
    }

    const warnings: OutputValidationIssue[] = [];
    const errors: OutputValidationIssue[] = [];
    const signals = new Set<string>();

    collectSignals(input as JsonValue, signals);

    if (signals.size === 0) {
      return { output: input, executableSignals: [] };
    }

    const issue: OutputValidationIssue = {
      code: "executable_content_detected",
      message: `Suspicious executable content detected: ${[...signals].join(", ")}.`,
      severity: context.options.executableContentMode === "block" ? "error" : "warning",
      stage: "executable-content-stage",
      path: "$",
    };

    if (context.options.executableContentMode === "block") {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }

    return {
      output: input,
      warnings,
      errors,
      executableSignals: [...signals],
    };
  },
};
