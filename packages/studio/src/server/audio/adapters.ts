/** Studio V5 audio — synthetic audio provider adapter (STUDIO_11). Server-only. */
import "server-only";
import { createHash } from "node:crypto";
import { asIcu } from "../../contracts/money";
import type { TaskName } from "../../contracts/tasks";
import type {
  ProviderAdapterPort,
  ProviderOperationState,
  ProviderOutputDescriptor,
  ProviderUsageReport,
  UsageEstimate,
} from "../ports/provider-adapter";
import { ProviderError } from "../providers/types";

export const SYNTHETIC_AUDIO_ADAPTER_NAME = "synthetic-audio-test" as const;
export const SYNTHETIC_AUDIO_ADAPTER_VERSION = "0.0.0-test" as const;

export const SYNTHETIC_AUDIO_TASKS: readonly TaskName[] = [
  "speech.synthesize",
  "speech.transcribe",
  "speech.align",
  "text.translate",
  "audio.transform",
];

export interface SyntheticAudioAdapterConfig {
  failSubmit?: boolean;
  failTasks?: readonly TaskName[];
  meterUnit?: string;
}

/** Deterministic metadata the adapter reports instead of raw audio bytes. */
export interface SyntheticAudioMetadata {
  operationId: string;
  task: TaskName;
  durationMs: number;
  segments: number;
  speakers: readonly string[];
  language: string;
  transcriptRef: string;
}

function metadataFor(operationId: string, task: TaskName, parameters: Readonly<Record<string, unknown>>): SyntheticAudioMetadata {
  const digest = createHash("sha256").update(`${task}:${operationId}`).digest("hex");
  const durationMs = 1000 + (parseInt(digest.slice(0, 8), 16) % 11000);
  const speakers =
    task === "speech.transcribe" || task === "speech.align"
      ? ["SPEAKER_00", "SPEAKER_01"]
      : ["SPEAKER_00"];
  const language = typeof parameters.language === "string" && parameters.language ? parameters.language : "en";
  return {
    operationId,
    task,
    durationMs,
    segments: task === "speech.synthesize" ? 1 : 2,
    speakers,
    language,
    transcriptRef: `synthetic:transcript:${digest.slice(0, 12)}`,
  };
}

function requireAudioInput(task: TaskName, parameters: Readonly<Record<string, unknown>>): void {
  if (task === "speech.synthesize" || task === "text.translate") {
    const text = parameters.text ?? parameters.script;
    if (typeof text !== "string" || !text.trim()) {
      throw new ProviderError("INVALID_PARAMETERS", `synthetic audio adapter requires text for ${task}.`);
    }
    return;
  }
  if (typeof parameters.sourceAssetId !== "string" || !parameters.sourceAssetId.trim()) {
    throw new ProviderError("INVALID_PARAMETERS", `synthetic audio adapter requires sourceAssetId for ${task}.`);
  }
}

/**
 * Test/certification-only audio adapter: deterministic in-memory operations
 * with synthetic.invalid URLs that can never be mistaken for provider
 * output. Never registered in production wiring. Audio is always assessed
 * through metadata/transcripts plus runtime playback checks — this
 * adapter emits metadata only, never audio bytes.
 */
export function createSyntheticAudioAdapter(config: SyntheticAudioAdapterConfig = {}): ProviderAdapterPort {
  const meterUnit = config.meterUnit ?? "audio_second";
  const operations = new Map<string, { key: string; task: TaskName; metadata: SyntheticAudioMetadata }>();
  const byKey = new Map<string, string>();

  function operationIdFor(key: string): string {
    return `synthetic-audio:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
  }

  function validate(task: TaskName, parameters: Readonly<Record<string, unknown>>): void {
    if (!SYNTHETIC_AUDIO_TASKS.includes(task)) {
      throw new ProviderError("UNSUPPORTED_TASK", `synthetic audio adapter does not serve ${task}.`);
    }
    requireAudioInput(task, parameters);
  }

  const port: ProviderAdapterPort = {
    adapterName: SYNTHETIC_AUDIO_ADAPTER_NAME,
    adapterVersion: SYNTHETIC_AUDIO_ADAPTER_VERSION,
    supportedTasks: [...SYNTHETIC_AUDIO_TASKS],

    validate(task: TaskName, parameters: Readonly<Record<string, unknown>>): void {
      validate(task, parameters);
    },

    estimateUsage(task: TaskName, parameters: Readonly<Record<string, unknown>>): UsageEstimate {
      validate(task, parameters);
      const seconds = task === "speech.synthesize" || task === "text.translate" ? 1 : 12;
      return { meterUnit, meterQuantity: seconds, estimatedCostIcu: asIcu(seconds * 2) };
    },

    async submit(
      task: TaskName,
      parameters: Readonly<Record<string, unknown>>,
      operationKey: string,
    ): Promise<string> {
      validate(task, parameters);
      const replay = byKey.get(operationKey);
      if (replay) return replay;
      if (config.failSubmit || config.failTasks?.includes(task)) {
        throw new ProviderError("PROVIDER_FAILED", `synthetic audio adapter forced submit failure for ${task}.`);
      }
      const id = operationIdFor(operationKey);
      operations.set(id, { key: operationKey, task, metadata: metadataFor(id, task, parameters) });
      byKey.set(operationKey, id);
      return id;
    },

    async query(operationId: string): Promise<ProviderOperationState> {
      return operations.has(operationId) ? "SUCCEEDED" : "UNKNOWN";
    },

    async reconcile(operationId: string, operationKey: string): Promise<ProviderOperationState> {
      const keyed = byKey.get(operationKey);
      if (keyed && keyed !== operationId) return operations.has(keyed) ? "SUCCEEDED" : "UNKNOWN";
      return operations.has(operationId) ? "SUCCEEDED" : "UNKNOWN";
    },

    async cancel(operationId: string): Promise<boolean> {
      return operations.has(operationId);
    },

    async retrieveOutputs(operationId: string): Promise<readonly ProviderOutputDescriptor[]> {
      const operation = operations.get(operationId);
      if (!operation) {
        throw new ProviderError("NOT_FOUND", `Unknown synthetic audio operation ${operationId}.`);
      }
      return [
        {
          providerUrl: `https://synthetic.invalid/audio/${operationId}/output.json`,
          mediaType: "application/json",
          byteSize: null,
          expiresAt: null,
        },
      ];
    },

    async reportUsage(operationId: string): Promise<ProviderUsageReport> {
      const operation = operations.get(operationId);
      if (!operation) {
        throw new ProviderError("NOT_FOUND", `Unknown synthetic audio operation ${operationId}.`);
      }
      const seconds = Math.max(1, Math.round(operation.metadata.durationMs / 1000));
      return { meterUnit, meterQuantity: seconds, providerMinorAmount: null, redactedError: null };
    },
  };
  METADATA_LOOKUP.set(port, (operationKey: string) => {
    const id = byKey.get(operationKey);
    return id ? (operations.get(id)?.metadata ?? null) : null;
  });
  return port;
}

const METADATA_LOOKUP = new WeakMap<ProviderAdapterPort, (operationKey: string) => SyntheticAudioMetadata | null>();

/** Read deterministic metadata for a submitted operation (tests/certification only). */
export function syntheticAudioMetadata(
  adapter: ProviderAdapterPort,
  operationKey: string,
): SyntheticAudioMetadata | null {
  return METADATA_LOOKUP.get(adapter)?.(operationKey) ?? null;
}
