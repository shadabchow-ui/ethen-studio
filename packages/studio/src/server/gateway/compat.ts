/** Studio V5 gateway — legacy media compatibility adapter (STUDIO_19). Server-only. */
import "server-only";
import { createHash } from "node:crypto";
import { DEFAULT_VERSION_PINS } from "../../contracts/versions";
import type { TaskName } from "../../contracts/tasks";
import type { AdmissionResult } from "../runtime/admission";
import { gatewayError } from "./types";

/**
 * Legacy media-generate shape (observed from the existing
 * `app/api/media/generate` handler): modality + capability + prompt +
 * params. This adapter translates it onto canonical kernel admission;
 * the legacy handler itself stays owned by its domain.
 */
export interface LegacyGenerateInput {
  projectId: string;
  modality: string;
  capability?: string | null;
  prompt: string;
  modelId?: string | null;
  imageUrl?: string | null;
  params?: Readonly<Record<string, unknown>> | null;
  idempotencyKey?: string | null;
  quoteId?: string | null;
  endpointId?: string | null;
}

export interface CompatAdmission {
  task: TaskName;
  parameters: Readonly<Record<string, unknown>>;
  requestHash: string;
}

const MODALITY_TASK: Readonly<Record<string, TaskName>> = {
  image: "image.generate",
  video: "video.generate",
  voice: "speech.synthesize",
  speech: "speech.synthesize",
  music: "music.generate",
  sfx: "audio.generate",
  audio: "audio.generate",
  transcribe: "speech.transcribe",
};

/** Map legacy modality/capability onto one canonical task. Unknown maps reject. */
export function legacyTaskFor(input: Pick<LegacyGenerateInput, "modality" | "capability">): TaskName {
  if (input.capability === "image-to-video") return "video.generate";
  const task = MODALITY_TASK[input.modality];
  if (!task) {
    throw gatewayError("UNSUPPORTED_TASK", `Legacy modality is not supported: ${input.modality}.`, {
      modality: input.modality,
    });
  }
  return task;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

export function legacyRequestHash(input: {
  task: TaskName;
  prompt: string;
  modelId: string | null;
  imageUrl: string | null;
  params: Readonly<Record<string, unknown>>;
}): string {
  return createHash("sha256")
    .update(canonicalJson({ task: input.task, prompt: input.prompt, modelId: input.modelId, imageUrl: input.imageUrl, params: input.params }), "utf8")
    .digest("hex");
}

/** Translate a legacy generate call into canonical admission fields. */
export function toCompatAdmission(input: LegacyGenerateInput): CompatAdmission {
  if (!input.projectId.trim()) throw gatewayError("BAD_REQUEST", "projectId is required.");
  if (!input.prompt.trim()) throw gatewayError("BAD_REQUEST", "prompt is required.");
  const task = legacyTaskFor(input);
  const params = { ...(input.params ?? {}) };
  const parameters: Record<string, unknown> = {
    prompt: input.prompt,
    ...params,
    ...(input.modelId ? { legacyModelId: input.modelId } : {}),
    ...(input.imageUrl ? { referenceImage: input.imageUrl } : {}),
    legacyModality: input.modality,
  };
  return {
    task,
    parameters,
    requestHash: legacyRequestHash({
      task,
      prompt: input.prompt,
      modelId: input.modelId ?? null,
      imageUrl: input.imageUrl ?? null,
      params,
    }),
  };
}

export function compatPins(): typeof DEFAULT_VERSION_PINS {
  return { ...DEFAULT_VERSION_PINS };
}

export interface LegacyGenerateResponse {
  ok: true;
  jobId: string;
  status: string;
  task: TaskName;
  idempotencyKey: string;
  replayed: boolean;
}

/** Project a kernel admission result back into the legacy response shape. */
export function toLegacyResponse(
  admitted: AdmissionResult,
  input: { task: TaskName; idempotencyKey: string },
): LegacyGenerateResponse {
  return {
    ok: true,
    jobId: admitted.job.jobId,
    status: admitted.job.status,
    task: input.task,
    idempotencyKey: input.idempotencyKey,
    replayed: admitted.replayed,
  };
}
