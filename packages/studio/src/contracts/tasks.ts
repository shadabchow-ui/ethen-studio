/** Studio V5 kernel — frozen task registry names + capability/endpoint schemas. */
import { STUDIO_TASK_SCHEMA_VERSION, type VersionPins } from "./versions";

export const TASK_FAMILIES = [
  "image",
  "video",
  "speech",
  "music",
  "audio",
  "mesh",
  "text",
  "timeline",
  "agent",
] as const;
export type TaskFamily = (typeof TASK_FAMILIES)[number];

/** Canonical `<family>.<verb>` entries (authority §9). Frozen by STUDIO_01. */
export const TASK_NAMES = [
  "image.generate",
  "image.edit",
  "video.generate",
  "video.edit",
  "speech.synthesize",
  "speech.transcribe",
  "speech.align",
  "text.translate",
  "music.generate",
  "audio.generate",
  "audio.transform",
  "mesh.generate",
  "timeline.render",
  "agent.plan",
  "agent.investigate",
  "agent.invoke",
] as const;
export type TaskName = (typeof TASK_NAMES)[number];

/**
 * M2 (D5 canonical core) — task-level capability schemas for the two tasks
 * added by the catalog milestone. Endpoint-level controls still come from
 * each endpoint's hash-pinned schema snapshot; these cores only fix the
 * task's media contract, runtime class and cost unit. M3/M4 specialize.
 */
export const TASK_SCHEMA_CORE: Record<"video.edit" | "mesh.generate", CapabilitySpec> = {
  "video.edit": {
    task: "video.edit",
    taskSchemaVersion: STUDIO_TASK_SCHEMA_VERSION,
    runtimeClass: "durable",
    inputMedia: ["video"],
    outputMedia: ["video"],
    maxDurationMs: null,
    maxDimensionPx: null,
    locales: [],
    controls: [],
    identityBinding: false,
    costUnit: "second",
    policyRestrictions: [],
  },
  "mesh.generate": {
    task: "mesh.generate",
    taskSchemaVersion: STUDIO_TASK_SCHEMA_VERSION,
    runtimeClass: "durable",
    inputMedia: ["text", "image"],
    outputMedia: ["model"],
    maxDurationMs: null,
    maxDimensionPx: null,
    locales: [],
    controls: [],
    identityBinding: false,
    costUnit: "task_unit",
    policyRestrictions: [],
  },
};

export function isTaskName(value: string): value is TaskName {
  return (TASK_NAMES as readonly string[]).includes(value);
}

export type RuntimeClass = "bounded" | "durable" | "realtime";

export interface CapabilitySpec {
  task: TaskName;
  taskSchemaVersion: string;
  runtimeClass: RuntimeClass;
  inputMedia: readonly string[];
  outputMedia: readonly string[];
  maxDurationMs: number | null;
  maxDimensionPx: number | null;
  locales: readonly string[];
  controls: readonly string[];
  identityBinding: boolean;
  costUnit: string;
  policyRestrictions: readonly string[];
}

export interface EndpointSchema {
  endpointId: string;
  task: TaskName;
  schemaVersion: string;
  jsonSchema: Readonly<Record<string, unknown>>;
  requiredControls: readonly string[];
  supportedControls: readonly string[];
}

export class TaskPinMismatchError extends Error {
  readonly code = "TASK_PIN_MISMATCH" as const;
  constructor(message: string) {
    super(message);
    this.name = "TaskPinMismatchError";
  }
}

/** Reject unknown tasks and mismatched task/schema pins. Pure, browser-safe. */
export function validateTaskPin(
  task: string,
  endpointSchema: Pick<EndpointSchema, "task" | "schemaVersion">,
  pins: VersionPins,
): void {
  if (!isTaskName(task)) {
    throw new TaskPinMismatchError(`unknown task: ${task}`);
  }
  if (endpointSchema.task !== task) {
    throw new TaskPinMismatchError(
      `endpoint task ${endpointSchema.task} does not match requested ${task}`,
    );
  }
  if (pins.taskSchemaVersion !== STUDIO_TASK_SCHEMA_VERSION) {
    throw new TaskPinMismatchError(
      `task schema ${pins.taskSchemaVersion} != frozen ${STUDIO_TASK_SCHEMA_VERSION}`,
    );
  }
  if (endpointSchema.schemaVersion !== pins.endpointSchemaVersion) {
    throw new TaskPinMismatchError(
      `endpoint schema ${endpointSchema.schemaVersion} != pinned ${pins.endpointSchemaVersion}`,
    );
  }
}
