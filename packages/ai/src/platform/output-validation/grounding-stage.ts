import type {
  OutputValidationContext,
  OutputValidationIssue,
  OutputValidationStage,
  OutputValidationStageResult,
} from "./types";

export const groundingStage: OutputValidationStage = {
  name: "grounding-stage",
  run(input: unknown, context: OutputValidationContext): OutputValidationStageResult {
    const warnings: OutputValidationIssue[] = [];

    if (context.options.requireGrounding && context.options.citationCount <= 0) {
      warnings.push({
        code: "missing_citations",
        message: "Grounded output was requested, but no citations were provided.",
        severity: "warning",
        stage: "grounding-stage",
        path: "$",
      });
    }

    return { output: input, warnings };
  },
};
