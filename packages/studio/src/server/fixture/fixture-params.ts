/**
 * Studio V5 M4 — deterministic fixture parameters (dev/test tooling).
 *
 * Builds schema-satisfying parameters for required-only goldens and
 * fixture round-trips. Pure (no node APIs, no markers): imported by the
 * hermetic suite and the attestation script. Never used in production
 * request paths — production parameters always come from the caller.
 */
import type { EndpointSpec } from "../../catalog/types";

export type Declared = Record<string, unknown> & {
  type?: unknown;
  enum?: unknown;
  const?: unknown;
  anyOf?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  minLength?: unknown;
  maxLength?: unknown;
  minItems?: unknown;
  maxItems?: unknown;
  items?: unknown;
};

/** Deterministic schema-satisfying value (required-only goldens). */
export function synthValue(name: string, declared: Declared): unknown {
  if (declared.const !== undefined) return declared.const;
  if (Array.isArray(declared.enum) && declared.enum.length > 0) return declared.enum[0];
  const branches = Array.isArray(declared.anyOf) ? (declared.anyOf as Declared[]) : null;
  const branch = branches?.find((entry) => entry && typeof entry === "object" && (entry as Declared).type !== "null" && (entry as Declared).type !== undefined);
  const node: Declared = { ...declared, ...(branch ?? {}) };
  const type = typeof node.type === "string" ? node.type : null;
  const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
  switch (type) {
    case "string": {
      let value = /url|uri|image|video|audio|file|path/i.test(name) && !/prompt|text|caption|description/i.test(name)
        ? "https://example.com/fixture-input"
        : `test ${name}`;
      const minLength = num(node.minLength) ?? 0;
      while (value.length < minLength) value += " x";
      const maxLength = num(node.maxLength);
      if (maxLength !== null && value.length > maxLength) value = value.slice(0, Math.max(maxLength, 0));
      return value;
    }
    case "integer": {
      const low = Math.ceil(num(node.minimum) ?? 1);
      const high = num(node.maximum) !== null ? Math.floor(num(node.maximum) as number) : low;
      return low <= high ? low : low;
    }
    case "number": {
      const low = num(node.minimum) ?? 1;
      const high = num(node.maximum);
      return high !== null && high < low ? high : low;
    }
    case "boolean":
      return true;
    case "array": {
      const items = (node.items && typeof node.items === "object" ? node.items : {}) as Declared;
      const minItems = num(node.minItems) ?? 1;
      const maxItems = num(node.maxItems);
      const count = Math.max(1, maxItems !== null ? Math.min(Math.max(minItems, 1), maxItems) : Math.max(minItems, 1));
      return Array.from({ length: count }, () => synthValue(name, items));
    }
    case "object":
      return {};
    default:
      return `test ${name}`;
  }
}

export function requiredParams(spec: EndpointSpec): Record<string, unknown> {
  const schema = spec.jsonSchema as { required?: unknown; properties?: unknown };
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const properties = (schema.properties ?? {}) as Record<string, Declared>;
  const params: Record<string, unknown> = {};
  for (const name of required) {
    params[name] = synthValue(name, properties[name] ?? {});
  }
  return params;
}
