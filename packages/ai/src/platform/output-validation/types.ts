export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type OutputValidationSeverity = "none" | "warning" | "error";
export type OutputValidationIssueSeverity = "warning" | "error";

export interface OutputValidationIssue {
  code: string;
  message: string;
  severity: OutputValidationIssueSeverity;
  stage: string;
  path?: string;
}

export interface OutputValidationRedaction {
  path: string;
  count: number;
}

export interface OutputValidationEvidence {
  stageOrder: string[];
  citationCount: number;
  grounded: boolean;
  executableSignals: string[];
  truncatedPaths: string[];
  schemaName?: string;
}

export interface OutputValidationResult<T = unknown> {
  ok: boolean;
  severity: OutputValidationSeverity;
  warnings: OutputValidationIssue[];
  errors: OutputValidationIssue[];
  redactions: OutputValidationRedaction[];
  evidence: OutputValidationEvidence;
  sanitizedOutput: T;
}

export interface ValidationSchemaBase {
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
}

export interface ObjectValidationSchema extends ValidationSchemaBase {
  type: "object";
  required?: string[];
  properties?: Record<string, ValidationSchema>;
  allowAdditionalProperties?: boolean;
}

export interface ArrayValidationSchema extends ValidationSchemaBase {
  type: "array";
  items?: ValidationSchema;
}

export interface StringValidationSchema extends ValidationSchemaBase {
  type: "string";
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp | string;
}

export interface NumberValidationSchema extends ValidationSchemaBase {
  type: "number";
}

export interface BooleanValidationSchema extends ValidationSchemaBase {
  type: "boolean";
}

export interface NullValidationSchema extends ValidationSchemaBase {
  type: "null";
}

export type ValidationSchema =
  | ObjectValidationSchema
  | ArrayValidationSchema
  | StringValidationSchema
  | NumberValidationSchema
  | BooleanValidationSchema
  | NullValidationSchema;

export interface OutputValidationOptions {
  schema?: ValidationSchema;
  schemaName?: string;
  maxStringLength?: number;
  maxArrayLength?: number;
  requireGrounding?: boolean;
  citationCount?: number;
  allowExecutableContent?: boolean;
  executableContentMode?: "warn" | "block";
}

export interface OutputValidationContext {
  readonly options: Required<
    Pick<
      OutputValidationOptions,
      | "maxStringLength"
      | "maxArrayLength"
      | "requireGrounding"
      | "citationCount"
      | "allowExecutableContent"
      | "executableContentMode"
    >
  > &
    Pick<OutputValidationOptions, "schema" | "schemaName">;
}

export interface OutputValidationStageResult {
  output: unknown;
  warnings?: OutputValidationIssue[];
  errors?: OutputValidationIssue[];
  redactions?: OutputValidationRedaction[];
  executableSignals?: string[];
  truncatedPaths?: string[];
}

export interface OutputValidationStage {
  readonly name: string;
  run(input: unknown, context: OutputValidationContext): OutputValidationStageResult;
}
