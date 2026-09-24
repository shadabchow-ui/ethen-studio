import { executableContentStage } from "./executable-content-stage";
import { groundingStage } from "./grounding-stage";
import { redactionStage } from "./redaction-stage";
import { schemaStage } from "./schema-stage";
import type {
  OutputValidationOptions,
  OutputValidationResult,
  OutputValidationSeverity,
  OutputValidationStage,
} from "./types";

const DEFAULT_OPTIONS: Required<
  Pick<
    OutputValidationOptions,
    | "maxStringLength"
    | "maxArrayLength"
    | "requireGrounding"
    | "citationCount"
    | "allowExecutableContent"
    | "executableContentMode"
  >
> = {
  maxStringLength: 4000,
  maxArrayLength: 100,
  requireGrounding: false,
  citationCount: 0,
  allowExecutableContent: false,
  executableContentMode: "warn",
};

export function createDefaultOutputValidationStages(): OutputValidationStage[] {
  return [schemaStage, redactionStage, executableContentStage, groundingStage];
}

function getSeverity(hasErrors: boolean, hasWarnings: boolean): OutputValidationSeverity {
  if (hasErrors) return "error";
  if (hasWarnings) return "warning";
  return "none";
}

export function validateOutput<T = unknown>(
  input: T,
  options: OutputValidationOptions = {},
): OutputValidationResult<T> {
  const stages = createDefaultOutputValidationStages();
  const context = {
    options: {
      ...DEFAULT_OPTIONS,
      ...options,
    },
  };

  let current: unknown = input;
  const warnings = [];
  const errors = [];
  const redactions = [];
  const executableSignals = new Set<string>();
  const truncatedPaths = new Set<string>();

  for (const stage of stages) {
    const result = stage.run(current, context);
    current = result.output;
    warnings.push(...(result.warnings ?? []));
    errors.push(...(result.errors ?? []));
    redactions.push(...(result.redactions ?? []));
    for (const signal of result.executableSignals ?? []) executableSignals.add(signal);
    for (const path of result.truncatedPaths ?? []) truncatedPaths.add(path);
  }

  return {
    ok: errors.length === 0,
    severity: getSeverity(errors.length > 0, warnings.length > 0),
    warnings,
    errors,
    redactions,
    evidence: {
      stageOrder: stages.map((stage) => stage.name),
      citationCount: context.options.citationCount,
      grounded: context.options.requireGrounding,
      executableSignals: [...executableSignals],
      truncatedPaths: [...truncatedPaths],
      schemaName: context.options.schemaName,
    },
    sanitizedOutput: current as T,
  };
}

export * from "./types";
