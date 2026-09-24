/**
 * Minimal runtime schema validation for high-risk JSON request bodies.
 *
 * Usage:
 *   import { validateBody } from "./request-validator";
 *   const result = validateBody<ChatRequest>(body, chatSchema);
 *   if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
 *   const valid = result.data;
 *
 * This module favours simple TypeScript type-guard patterns over adding a
 * new dependency. Upgrade to zod if validation shape grows beyond these
 * primitives.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type ValidationRule<T> = {
  field: keyof T;
  required?: boolean;
  type: "string" | "number" | "boolean" | "array" | "object";
  /** If type is "array", check elements with this rule. */
  elementRule?: ValidationRule<Record<string, unknown>>;
  /** If type is "object", check nested fields with these rules. */
  nestedRules?: ValidationRule<Record<string, unknown>>[];
  /** Custom validator. Return `null` on pass, or an error string. */
  validate?: (value: unknown) => string | null;
};

export type ValidationSchema<T> = ValidationRule<T>[];

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── Core validator ────────────────────────────────────────────────────────

export function validateBody<T extends Record<string, unknown>>(
  body: unknown,
  schema: ValidationSchema<T>,
): ValidationResult<T> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const record = body as Record<string, unknown>;

  for (const rule of schema) {
    const value = record[rule.field as string];

    // Required check
    if (rule.required !== false && (value === undefined || value === null)) {
      return {
        ok: false,
        error: `Missing required field: "${String(rule.field)}"`,
      };
    }

    // Skip type check if optional and absent
    if (value === undefined || value === null) continue;

    // Type check
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (actualType !== rule.type) {
      return {
        ok: false,
        error: `Field "${String(rule.field)}" must be a ${rule.type}, got ${actualType}`,
      };
    }

    // Array element checks
    if (rule.type === "array" && rule.elementRule) {
      const arr = value as unknown[];
      for (let i = 0; i < arr.length; i++) {
        const elemResult = validateSingle(arr[i], rule.elementRule, `${String(rule.field)}[${i}]`);
        if (!elemResult.ok) return elemResult;
      }
    }

    // Nested object checks
    if (rule.type === "object" && rule.nestedRules) {
      for (const nestedRule of rule.nestedRules) {
        const nestedValue = (value as Record<string, unknown>)[nestedRule.field as string];
        const nestedResult = validateSingle(
          nestedValue,
          nestedRule,
          `${String(rule.field)}.${String(nestedRule.field)}`,
        );
        if (!nestedResult.ok) return nestedResult;
      }
    }

    // Custom validator
    if (rule.validate) {
      const err = rule.validate(value);
      if (err) {
        return { ok: false, error: `${String(rule.field)}: ${err}` };
      }
    }
  }

  return { ok: true, data: body as T };
}

function validateSingle<T>(
  value: unknown,
  rule: ValidationRule<T>,
  path: string,
): ValidationResult<null> {
  if (rule.required !== false && (value === undefined || value === null)) {
    return { ok: false, error: `Missing required field: "${path}"` };
  }

  if (value === undefined || value === null) return { ok: true, data: null };

  const actualType = Array.isArray(value) ? "array" : typeof value;
  if (actualType !== rule.type) {
    return {
      ok: false,
      error: `Field "${path}" must be a ${rule.type}, got ${actualType}`,
    };
  }

  if (rule.validate) {
    const err = rule.validate(value);
    if (err) return { ok: false, error: `${path}: ${err}` };
  }

  return { ok: true, data: null };
}

// ── Common validation helpers ─────────────────────────────────────────────

export function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "must be a non-empty string";
  }
  return null;
}

export function positiveInteger(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return "must be a positive integer";
  }
  return null;
}

export function allowedValues<T extends string>(...allowed: T[]) {
  return (value: unknown): string | null => {
    if (!allowed.includes(value as T)) {
      return `must be one of [${allowed.join(", ")}]`;
    }
    return null;
  };
}
