/** Studio V5 catalog — pure parameter/schema validation (STUDIO_06). Browser-safe. */
import type { EndpointSpec } from "./types";

export interface ParameterProblem {
  control: string;
  message: string;
}

export interface ParameterValidation {
  ok: boolean;
  problems: ParameterProblem[];
}

/**
 * Validate normalized core fields against the endpoint's complete JSON
 * schema (explicit subset: type, enum, const, required, properties,
 * items/minItems/maxItems, minimum/maximum, minLength/maxLength).
 * Unknown schema keywords are ignored; unknown REQUIRED controls disable
 * execution with an explanation (returned, never thrown, so UI can render
 * the disabled reason).
 */
export function validateCoreParameters(
  spec: EndpointSpec,
  parameters: Readonly<Record<string, unknown>>,
): ParameterValidation {
  const problems: ParameterProblem[] = [];
  const schema = spec.jsonSchema;
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Readonly<Record<string, unknown>>)
      : {};
  const required =
    Array.isArray(schema.required) && schema.required.every((r) => typeof r === "string")
      ? (schema.required as readonly string[])
      : [];

  for (const control of spec.requiredControls) {
    if (!spec.supportedControls.includes(control)) {
      problems.push({
        control,
        message: `Required control "${control}" is not supported by ${spec.endpointId}; execution is disabled.`,
      });
    }
  }
  for (const name of required) {
    if (parameters[name] === undefined || parameters[name] === null) {
      problems.push({ control: name, message: `Required parameter "${name}" is missing.` });
    }
  }
  for (const [name, value] of Object.entries(parameters)) {
    if (name === "provider_params") continue;
    const declared = properties[name] as
      | Readonly<Record<string, unknown>>
      | undefined;
    if (!declared || typeof declared !== "object") {
      problems.push({
        control: name,
        message: `Parameter "${name}" is not declared in the ${spec.endpointId} schema.`,
      });
      continue;
    }
    const problem = checkValue(name, value, declared);
    if (problem) problems.push(problem);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Explicit raw-provider parameter validation: provider_params must be a
 * namespaced object and every key must be on the endpoint's raw allowlist
 * with the declared primitive kind. No silent passthrough.
 */
export function validateRawProviderParameters(
  spec: EndpointSpec,
  providerParams: unknown,
): ParameterValidation {
  const problems: ParameterProblem[] = [];
  if (providerParams === undefined || providerParams === null) {
    return { ok: true, problems };
  }
  if (typeof providerParams !== "object" || Array.isArray(providerParams)) {
    return {
      ok: false,
      problems: [
        { control: "provider_params", message: "provider_params must be a namespaced object." },
      ],
    };
  }
  for (const [name, value] of Object.entries(providerParams as Readonly<Record<string, unknown>>)) {
    const kind = spec.rawParams[name];
    if (!kind) {
      problems.push({
        control: `provider_params.${name}`,
        message: `Raw provider parameter "${name}" is not allowlisted for ${spec.endpointId}.`,
      });
      continue;
    }
    if (!matchesPrimitive(value, kind)) {
      problems.push({
        control: `provider_params.${name}`,
        message: `Raw provider parameter "${name}" must be ${kind}.`,
      });
    }
  }
  return { ok: problems.length === 0, problems };
}

function matchesPrimitive(value: unknown, kind: string): boolean {
  switch (kind) {
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    default:
      return false;
  }
}

function checkValue(
  name: string,
  value: unknown,
  declared: Readonly<Record<string, unknown>>,
): ParameterProblem | null {
  const type = declared.type;
  if (typeof type === "string" && !matchesSchemaType(value, type)) {
    return { control: name, message: `Parameter "${name}" must be ${type}.` };
  }
  if (Array.isArray(declared.enum) && !declared.enum.some((v) => sameJson(v, value))) {
    return {
      control: name,
      message: `Parameter "${name}" value is not in the supported set for this endpoint.`,
    };
  }
  if (declared.const !== undefined && !sameJson(declared.const, value)) {
    return { control: name, message: `Parameter "${name}" must equal the pinned value.` };
  }
  if (typeof value === "number") {
    if (typeof declared.minimum === "number" && value < declared.minimum) {
      return { control: name, message: `Parameter "${name}" is below minimum ${declared.minimum}.` };
    }
    if (typeof declared.maximum === "number" && value > declared.maximum) {
      return { control: name, message: `Parameter "${name}" is above maximum ${declared.maximum}.` };
    }
  }
  if (typeof value === "string") {
    if (typeof declared.minLength === "number" && value.length < declared.minLength) {
      return { control: name, message: `Parameter "${name}" is shorter than minLength ${declared.minLength}.` };
    }
    if (typeof declared.maxLength === "number" && value.length > declared.maxLength) {
      return { control: name, message: `Parameter "${name}" exceeds maxLength ${declared.maxLength}.` };
    }
  }
  if (Array.isArray(value)) {
    if (typeof declared.minItems === "number" && value.length < declared.minItems) {
      return { control: name, message: `Parameter "${name}" needs at least ${declared.minItems} items.` };
    }
    if (typeof declared.maxItems === "number" && value.length > declared.maxItems) {
      return { control: name, message: `Parameter "${name}" allows at most ${declared.maxItems} items.` };
    }
    const items = declared.items as Readonly<Record<string, unknown>> | undefined;
    if (items && typeof items === "object") {
      for (let i = 0; i < value.length; i += 1) {
        const itemProblem = checkValue(`${name}[${i}]`, value[i], items);
        if (itemProblem) return itemProblem;
      }
    }
  }
  return null;
}

function matchesSchemaType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
