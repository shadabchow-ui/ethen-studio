/**
 * MUSE-004 — schema snapshot to renderer control mapping (pure, browser-safe).
 *
 * Single authority for which JSON-Schema input shapes the generic model
 * detail renderer supports. The catalog completeness validator
 * (scripts/validate-catalog-completeness.ts) asserts every required input
 * of every schema-supported endpoint maps to a supported control; anything
 * mapping to `unsupported` is a catalog gap with a reason, never a silent
 * omission. Unknown shapes stay `unsupported` — never guessed.
 */

export type SchemaControlType =
  | "text"
  | "textarea"
  | "select"
  | "multi-select"
  | "number"
  | "slider"
  | "toggle"
  | "file-upload"
  | "tags"
  | "group"
  | "list"
  | "unsupported";

export const RENDERER_CONTROL_TYPES: readonly SchemaControlType[] = [
  "text",
  "textarea",
  "select",
  "multi-select",
  "number",
  "slider",
  "toggle",
  "file-upload",
  "tags",
  "group",
  "list",
];

export function isRendererSupported(control: SchemaControlType): boolean {
  return control !== "unsupported";
}

export interface SchemaControl {
  control: SchemaControlType;
  reason: string;
}

type SchemaNode = Record<string, unknown>;

function asNode(value: unknown): SchemaNode | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as SchemaNode)
    : null;
}

function isNullBranch(value: unknown): boolean {
  const node = asNode(value);
  return node?.type === "null";
}

const FILE_NAME_PATTERN = /(^|[_-])(url|uri|image|video|audio|file|mask|asset|attachment|reference)([_-]|$)/i;
const FILE_FORMATS = new Set(["uri", "url", "image", "video", "audio", "binary"]);
const LONG_TEXT_NAME_PATTERN = /(prompt|description|text|lyrics|transcript|script|caption|negative)/i;
const LONG_TEXT_THRESHOLD = 160;

function controlForUnion(name: string, branches: readonly unknown[]): SchemaControl {
  const meaningful = branches.filter((branch) => !isNullBranch(branch));
  if (meaningful.length === 0) {
    return { control: "unsupported", reason: `${name}: union has no non-null branch` };
  }
  if (meaningful.length === 1) {
    const mapped = controlForInput(name, meaningful[0]);
    return { control: mapped.control, reason: `${name}: nullable ${mapped.reason}` };
  }
  // A preset enum inside a union (e.g. size preset string | dimension
  // object) renders as the preset select; the structured alternative is
  // out of scope for the generic renderer.
  const enumBranch = meaningful.find((branch) => Array.isArray(asNode(branch)?.enum));
  if (enumBranch) {
    const values = (asNode(enumBranch)?.enum as readonly unknown[]).length;
    return { control: "select", reason: `${name}: union renders the preset enum branch (${values} options)` };
  }
  const mapped = meaningful.map((branch) => controlForInput(name, branch).control);
  const first = mapped[0]!;
  if (mapped.every((control) => control === first) && isRendererSupported(first)) {
    return { control: first, reason: `${name}: union branches agree on ${first}` };
  }
  return { control: "unsupported", reason: `${name}: ambiguous union of ${meaningful.length} shapes` };
}

const MAX_NESTING_DEPTH = 4;

function controlForGroup(name: string, properties: Record<string, unknown>, depth: number): SchemaControl {
  const keys = Object.keys(properties);
  if (keys.length === 0) {
    return { control: "unsupported", reason: `${name}: object declares no properties` };
  }
  if (depth >= MAX_NESTING_DEPTH) {
    return { control: "unsupported", reason: `${name}: nesting exceeds the generic renderer depth` };
  }
  // A single-property object flattens to its child's control (e.g. a
  // voice object that is just a catalogue-name select).
  if (keys.length === 1) {
    const child = controlForInputDepth(`${name}.${keys[0]}`, properties[keys[0]], depth + 1);
    if (!isRendererSupported(child.control)) {
      return { control: "unsupported", reason: `${name}: single-property object child unsupported (${child.reason})` };
    }
    return { control: child.control, reason: `${name}: single-property object flattens to ${child.control}` };
  }
  for (const key of keys) {
    const child = controlForInputDepth(`${name}.${key}`, properties[key], depth + 1);
    if (!isRendererSupported(child.control)) {
      return { control: "unsupported", reason: `${name}: group child unsupported (${child.reason})` };
    }
  }
  return { control: "group", reason: `${name}: field group of ${keys.length} mappable inputs` };
}

/**
 * Map one named input schema to the renderer control that can edit it.
 * Pure and total: every input yields exactly one control plus a reason.
 */
export function controlForInput(name: string, schema: unknown): SchemaControl {
  return controlForInputDepth(name, schema, 0);
}

function controlForInputDepth(name: string, schema: unknown, depth: number): SchemaControl {
  const node = asNode(schema);
  if (!node) {
    return { control: "unsupported", reason: `${name}: input schema is not an object` };
  }
  const union = node.anyOf ?? node.oneOf;
  if (Array.isArray(union)) {
    return controlForUnion(name, union);
  }
  if (Array.isArray(node.enum)) {
    const values = (node.enum as readonly unknown[]).length;
    if (values === 0) {
      return { control: "unsupported", reason: `${name}: empty enum has no options` };
    }
    return { control: "select", reason: `${name}: enum with ${values} option(s)` };
  }
  const type = node.type;
  if (type === "boolean") {
    return { control: "toggle", reason: `${name}: boolean flag` };
  }
  if (type === "integer" || type === "number") {
    const min = node.minimum ?? node.minValue;
    const max = node.maximum ?? node.maxValue;
    if (typeof min === "number" && typeof max === "number" && max > min) {
      return { control: "slider", reason: `${name}: bounded number ${min}..${max}` };
    }
    return { control: "number", reason: `${name}: unbounded number` };
  }
  if (type === "array") {
    const items = asNode(node.items);
    if (items && Array.isArray(items.enum) && (items.enum as readonly unknown[]).length > 0) {
      return { control: "multi-select", reason: `${name}: array of enum options` };
    }
    if (items?.type === "string" || items?.type === "integer" || items?.type === "number" || items?.type === "boolean") {
      return { control: "tags", reason: `${name}: list of ${items.type} values` };
    }
    if (items && (items.type === "object" || items.properties !== undefined)) {
      const group = controlForGroup(name, (items.properties ?? {}) as Record<string, unknown>, depth);
      if (!isRendererSupported(group.control)) {
        return { control: "unsupported", reason: `${name}: repeatable row unsupported (${group.reason})` };
      }
      return { control: "list", reason: `${name}: repeatable rows of ${group.control === "group" ? "field groups" : group.control}` };
    }
    return { control: "unsupported", reason: `${name}: array of non-scalar items` };
  }
  if (type === "string" || type === undefined) {
    const format = typeof node.format === "string" ? node.format : null;
    if ((format && FILE_FORMATS.has(format)) || FILE_NAME_PATTERN.test(name)) {
      return { control: "file-upload", reason: `${name}: file reference by ${format ? `format ${format}` : "name"}` };
    }
    const maxLength = node.maxLength;
    if ((typeof maxLength === "number" && maxLength > LONG_TEXT_THRESHOLD) || LONG_TEXT_NAME_PATTERN.test(name)) {
      return { control: "textarea", reason: `${name}: long-form text` };
    }
    if (type === undefined && (node.properties !== undefined || node.additionalProperties !== undefined)) {
      const properties = asNode(node.properties);
      if (!properties) {
        return { control: "unsupported", reason: `${name}: object without declared properties` };
      }
      return controlForGroup(name, properties as Record<string, unknown>, depth);
    }
    return { control: "text", reason: `${name}: short text` };
  }
  if (type === "object") {
    const properties = asNode(node.properties);
    if (!properties) {
      return { control: "unsupported", reason: `${name}: object without declared properties` };
    }
    return controlForGroup(name, properties as Record<string, unknown>, depth);
  }
  return { control: "unsupported", reason: `${name}: unrecognized schema type ${JSON.stringify(type)}` };
}

export type OutputModality = "queue" | "image" | "video" | "audio" | "file" | "unknown";

export interface OutputSupport {
  supported: boolean;
  modality: OutputModality;
  reason: string;
}

const MODALITY_HINTS: readonly { modality: OutputModality; pattern: RegExp }[] = [
  { modality: "video", pattern: /video/i },
  { modality: "audio", pattern: /audio|music|speech|voice/i },
  { modality: "image", pattern: /image|picture|thumbnail/i },
];

/**
 * Whether the snapshot output shape is supported by the Studio job runner.
 * Queue-wrapped endpoints (the whole FAL catalog surface) are supported;
 * direct media outputs are supported when they carry a recognizable media
 * payload; anything else is an honest gap.
 */
export function outputSupportForSnapshot(snapshot: unknown): OutputSupport {
  const node = asNode(snapshot);
  const output = asNode(node?.output);
  const refName = node?.output_name ?? output?.["$refName"];
  if (refName === "QueueStatus") {
    return { supported: true, modality: "queue", reason: "queue-wrapped endpoint resolves through the job runner" };
  }
  const properties = asNode(output?.properties);
  if (!output || !properties) {
    return { supported: false, modality: "unknown", reason: "output has no readable properties" };
  }
  const keys = Object.keys(properties).join(" ");
  for (const hint of MODALITY_HINTS) {
    if (hint.pattern.test(keys)) {
      return { supported: true, modality: hint.modality, reason: `direct ${hint.modality} payload in output properties` };
    }
  }
  if (/url|file|result|data/i.test(keys)) {
    return { supported: true, modality: "file", reason: "direct file/url payload in output properties" };
  }
  return { supported: false, modality: "unknown", reason: "output shape is not queue-wrapped and carries no media payload" };
}
