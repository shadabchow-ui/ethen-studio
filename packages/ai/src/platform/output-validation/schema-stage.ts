import type {
  JsonValue,
  OutputValidationContext,
  OutputValidationIssue,
  OutputValidationStage,
  OutputValidationStageResult,
  ValidationSchema,
} from "./types";

type MutableState = {
  warnings: OutputValidationIssue[];
  errors: OutputValidationIssue[];
  truncatedPaths: string[];
};

function issue(
  severity: "warning" | "error",
  code: string,
  message: string,
  path: string,
): OutputValidationIssue {
  return {
    severity,
    code,
    message,
    stage: "schema-stage",
    path,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function sanitizeValue(value: unknown, path: string, context: OutputValidationContext, state: MutableState): JsonValue {
  if (value === null) return null;

  if (typeof value === "string") {
    if (value.length <= context.options.maxStringLength) return value;
    state.truncatedPaths.push(path);
    state.warnings.push(
      issue(
        "warning",
        "string_truncated",
        `String exceeded ${context.options.maxStringLength} characters and was truncated.`,
        path,
      ),
    );
    return `${value.slice(0, context.options.maxStringLength - 1)}…`;
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    state.warnings.push(issue("warning", "non_finite_number", "Non-finite number converted to null.", path));
    return null;
  }

  if (typeof value === "boolean") return value;

  if (typeof value === "bigint") {
    state.warnings.push(issue("warning", "bigint_stringified", "BigInt converted to string for JSON safety.", path));
    return value.toString();
  }

  if (value instanceof Date) {
    state.warnings.push(issue("warning", "date_stringified", "Date converted to ISO string for JSON safety.", path));
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    const trimmed = value.slice(0, context.options.maxArrayLength);
    if (value.length > trimmed.length) {
      state.warnings.push(
        issue(
          "warning",
          "array_truncated",
          `Array exceeded ${context.options.maxArrayLength} items and was truncated.`,
          path,
        ),
      );
    }
    return trimmed.map((item, index) => sanitizeValue(item, `${path}[${index}]`, context, state));
  }

  if (isPlainObject(value)) {
    const output: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) {
        state.warnings.push(issue("warning", "undefined_omitted", "Undefined field omitted for JSON safety.", `${path}.${key}`));
        continue;
      }
      output[key] = sanitizeValue(nested, `${path}.${key}`, context, state);
    }
    return output;
  }

  state.warnings.push(
    issue(
      "warning",
      "unsupported_value_stringified",
      `Unsupported value of type "${typeof value}" was stringified for JSON safety.`,
      path,
    ),
  );
  return String(value);
}

function validateSchema(
  value: JsonValue,
  schema: ValidationSchema,
  path: string,
  state: MutableState,
): void {
  switch (schema.type) {
    case "object": {
      if (!isPlainObject(value)) {
        state.errors.push(issue("error", "schema_type_mismatch", `Expected object at ${path}.`, path));
        return;
      }
      const required = schema.required ?? [];
      for (const key of required) {
        if (!(key in value)) {
          state.errors.push(issue("error", "schema_required_missing", `Missing required field "${key}".`, `${path}.${key}`));
        }
      }
      if (schema.properties) {
        for (const [key, nestedSchema] of Object.entries(schema.properties)) {
          if (key in value) {
            validateSchema((value as Record<string, JsonValue>)[key], nestedSchema, `${path}.${key}`, state);
          }
        }
      }
      if (schema.allowAdditionalProperties === false && schema.properties) {
        for (const key of Object.keys(value)) {
          if (!(key in schema.properties)) {
            state.warnings.push(issue("warning", "schema_additional_property", `Unexpected property "${key}" retained.`, `${path}.${key}`));
          }
        }
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        state.errors.push(issue("error", "schema_type_mismatch", `Expected array at ${path}.`, path));
        return;
      }
      if (schema.items) {
        value.forEach((item, index) => validateSchema(item, schema.items as ValidationSchema, `${path}[${index}]`, state));
      }
      return;
    }
    case "string": {
      if (typeof value !== "string") {
        state.errors.push(issue("error", "schema_type_mismatch", `Expected string at ${path}.`, path));
        return;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        state.errors.push(issue("error", "schema_string_too_short", `String shorter than ${schema.minLength}.`, path));
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        state.errors.push(issue("error", "schema_string_too_long", `String longer than ${schema.maxLength}.`, path));
      }
      if (schema.pattern) {
        const pattern = typeof schema.pattern === "string" ? new RegExp(schema.pattern) : schema.pattern;
        if (!pattern.test(value)) {
          state.errors.push(issue("error", "schema_pattern_mismatch", "String did not match the required pattern.", path));
        }
      }
      return;
    }
    case "number":
      if (typeof value !== "number") {
        state.errors.push(issue("error", "schema_type_mismatch", `Expected number at ${path}.`, path));
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        state.errors.push(issue("error", "schema_type_mismatch", `Expected boolean at ${path}.`, path));
      }
      return;
    case "null":
      if (value !== null) {
        state.errors.push(issue("error", "schema_type_mismatch", `Expected null at ${path}.`, path));
      }
      return;
  }
}

export const schemaStage: OutputValidationStage = {
  name: "schema-stage",
  run(input: unknown, context: OutputValidationContext): OutputValidationStageResult {
    const state: MutableState = { warnings: [], errors: [], truncatedPaths: [] };
    const output = sanitizeValue(input, "$", context, state);

    if (context.options.schema) {
      validateSchema(output, context.options.schema, "$", state);
    }

    return {
      output,
      warnings: state.warnings,
      errors: state.errors,
      truncatedPaths: state.truncatedPaths,
    };
  },
};
