/**
 * Studio V3 Job 2 — schema snapshots + schema-to-control adapter (pure).
 *
 * Client presentation and server validation share these pure mappings, but
 * run separately: the browser renders controls from `adaptInputSchema`, the
 * server re-validates with `validateControlValues` before any Job 3 runtime
 * use. Unsupported REQUIRED inputs reject the whole schema — required values
 * are never silently stripped. Advanced raw parameters pass through only for
 * supported fields.
 */

export type ControlKind =
  | "enum"
  | "boolean"
  | "number"
  | "string"
  | "media-ref"
  | "nested"
  | "unsupported";

export interface ControlDef {
  name: string;
  kind: ControlKind;
  label: string;
  required: boolean;
  defaultValue: unknown;
  enumValues?: readonly string[];
  min?: number;
  max?: number;
  maxLength?: number;
  mediaKinds?: readonly string[];
  children?: readonly ControlDef[];
  raw: unknown;
  unsupportedReason: string | null;
}

export interface AdaptedControls {
  controls: readonly ControlDef[];
  /** Required inputs that cannot be represented — the schema is unusable. */
  blockingUnsupported: readonly string[];
  /** Optional inputs skipped or degraded, with reasons. */
  degraded: Readonly<Record<string, string>>;
}

const MEDIA_HINTS: readonly { match: RegExp; kinds: readonly string[] }[] = [
  { match: /image|picture|photo/i, kinds: ["image"] },
  { match: /video|motion/i, kinds: ["video"] },
  { match: /audio|music|voice|sound/i, kinds: ["audio"] },
];

function labelFor(name: string): string {
  return name.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function adaptProp(name: string, prop: unknown, required: boolean, depth: number): ControlDef {
  const base = { name, label: labelFor(name), required, defaultValue: undefined as unknown, raw: prop, unsupportedReason: null as string | null };
  if (!prop || typeof prop !== "object") {
    return { ...base, kind: "unsupported", unsupportedReason: "not-an-object" };
  }
  const p = prop as Record<string, unknown>;
  if (typeof p.unsupported === "string") {
    return { ...base, kind: "unsupported", unsupportedReason: p.unsupported };
  }
  const def = p.default;
  if (Array.isArray(p.enum) && p.enum.length > 0) {
    return { ...base, kind: "enum", defaultValue: def, enumValues: p.enum.map(String) };
  }
  if (p.type === "boolean" || (Array.isArray(p.anyOf) && p.anyOf.some((b) => (b as Record<string, unknown>)?.type === "boolean"))) {
    return { ...base, kind: "boolean", defaultValue: typeof def === "boolean" ? def : false };
  }
  if (p.type === "integer" || p.type === "number") {
    return {
      ...base, kind: "number", defaultValue: typeof def === "number" ? def : undefined,
      min: typeof p.minimum === "number" ? p.minimum : undefined,
      max: typeof p.maximum === "number" ? p.maximum : undefined,
    };
  }
  if (p.type === "string" || p.format === "uri" || p.format === "url") {
    const hint = MEDIA_HINTS.find((h) => h.match.test(name));
    const looksMedia = hint ?? (/(_url|_uri|Url|Uri)$/.test(name) ? { kinds: ["image", "video", "audio"] as const } : null);
    if (looksMedia) {
      return { ...base, kind: "media-ref", defaultValue: typeof def === "string" ? def : "", mediaKinds: [...looksMedia.kinds] };
    }
    return {
      ...base, kind: "string", defaultValue: typeof def === "string" ? def : "",
      maxLength: typeof p.maxLength === "number" ? p.maxLength : undefined,
    };
  }
  if (p.type === "object" && p.properties && typeof p.properties === "object" && depth < 2) {
    const req = new Set(Array.isArray(p.required) ? (p.required as string[]) : []);
    const children = Object.entries(p.properties as Record<string, unknown>)
      .slice(0, 30)
      .map(([k, v]) => adaptProp(k, v, req.has(k), depth + 1));
    return { ...base, kind: "nested", defaultValue: undefined, children };
  }
  if (Array.isArray(p.anyOf) || Array.isArray(p.oneOf)) {
    const variants = ((p.anyOf ?? p.oneOf) as unknown[]).filter((v) => {
      const record = (v ?? {}) as Record<string, unknown>;
      return record.type !== "null" && typeof record.unsupported !== "string";
    });
    if (variants.length === 1) return adaptProp(name, variants[0], required, depth);
    return { ...base, kind: "unsupported", unsupportedReason: "multi-type union" };
  }
  if (p.type === "array") {
    return { ...base, kind: "unsupported", unsupportedReason: "array inputs need a dedicated renderer" };
  }
  return { ...base, kind: "unsupported", unsupportedReason: `unmapped type ${String(p.type ?? "unknown")}` };
}

export function adaptInputSchema(input: {
  required?: readonly string[];
  properties?: Readonly<Record<string, unknown>>;
} | null): AdaptedControls {
  if (!input || typeof input !== "object" || !input.properties) {
    return { controls: [], blockingUnsupported: ["missing-input-schema"], degraded: {} };
  }
  const req = new Set(input.required ?? []);
  const controls = Object.entries(input.properties).map(([name, prop]) => adaptProp(name, prop, req.has(name), 0));
  const blocking = controls.filter((c) => c.kind === "unsupported" && c.required).map((c) => c.name);
  const degraded: Record<string, string> = {};
  for (const c of controls) {
    if (c.kind === "unsupported" && !c.required && c.unsupportedReason) degraded[c.name] = c.unsupportedReason;
  }
  return { controls, blockingUnsupported: blocking, degraded };
}

export interface ControlValidation {
  ok: boolean;
  values: Readonly<Record<string, unknown>>;
  errors: Readonly<Record<string, string>>;
}

export function validateControlValues(
  adapted: AdaptedControls,
  values: Readonly<Record<string, unknown>>,
): ControlValidation {
  const errors: Record<string, string> = {};
  const out: Record<string, unknown> = {};
  if (adapted.blockingUnsupported.length > 0) {
    for (const name of adapted.blockingUnsupported) errors[name] = "required input is not representable";
    return { ok: false, values: {}, errors };
  }
  for (const control of adapted.controls) {
    if (control.kind === "unsupported") continue;
    const value = values[control.name] ?? control.defaultValue;
    if (control.required && (value === undefined || value === null || value === "")) {
      errors[control.name] = "required";
      continue;
    }
    if (value === undefined || value === null || value === "") {
      if (control.defaultValue !== undefined) out[control.name] = control.defaultValue;
      continue;
    }
    if (control.kind === "enum" && control.enumValues && !control.enumValues.includes(String(value))) {
      errors[control.name] = `must be one of ${control.enumValues.join(", ")}`;
      continue;
    }
    if (control.kind === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) { errors[control.name] = "must be a number"; continue; }
      if (control.min !== undefined && n < control.min) { errors[control.name] = `minimum ${control.min}`; continue; }
      if (control.max !== undefined && n > control.max) { errors[control.name] = `maximum ${control.max}`; continue; }
      out[control.name] = n;
      continue;
    }
    if (control.kind === "string" && control.maxLength !== undefined && String(value).length > control.maxLength) {
      errors[control.name] = `maximum ${control.maxLength} characters`;
      continue;
    }
    if (control.kind === "boolean" && typeof value !== "boolean") {
      errors[control.name] = "must be true or false";
      continue;
    }
    out[control.name] = value;
  }
  return { ok: Object.keys(errors).length === 0, values: out, errors };
}

/** Advanced raw parameters: only supported (representable) fields pass through. */
export function filterRawParams(
  adapted: AdaptedControls,
  raw: Readonly<Record<string, unknown>>,
): { params: Readonly<Record<string, unknown>>; dropped: readonly string[] } {
  const supported = new Set(
    adapted.controls.filter((c) => c.kind !== "unsupported").map((c) => c.name),
  );
  const params: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (supported.has(k)) params[k] = v;
    else dropped.push(k);
  }
  return { params, dropped };
}
