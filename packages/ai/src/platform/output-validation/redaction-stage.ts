import { redactSecrets } from "@ethen/security/redact";
import type {
  JsonValue,
  OutputValidationContext,
  OutputValidationIssue,
  OutputValidationRedaction,
  OutputValidationStage,
  OutputValidationStageResult,
} from "./types";

function walk(
  value: JsonValue,
  path: string,
  warnings: OutputValidationIssue[],
  redactions: OutputValidationRedaction[],
): JsonValue {
  if (typeof value === "string") {
    const result = redactSecrets(value);
    if (result.redacted) {
      warnings.push({
        code: "secret_redacted",
        message: "Potential secret content was redacted.",
        severity: "warning",
        stage: "redaction-stage",
        path,
      });
      redactions.push({ path, count: result.count });
    }
    return result.text;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => walk(item, `${path}[${index}]`, warnings, redactions));
  }

  if (value && typeof value === "object") {
    const next: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = walk(nested as JsonValue, `${path}.${key}`, warnings, redactions);
    }
    return next;
  }

  return value;
}

export const redactionStage: OutputValidationStage = {
  name: "redaction-stage",
  run(input: unknown, _context: OutputValidationContext): OutputValidationStageResult {
    const warnings: OutputValidationIssue[] = [];
    const redactions: OutputValidationRedaction[] = [];
    const output = walk(input as JsonValue, "$", warnings, redactions);
    return { output, warnings, redactions };
  },
};
