/**
 * Response normalizers for the Ollama native API.
 *
 * Each normalizer converts a raw Ollama NDJSON or JSON response into the
 * adapter-level types defined in local-model-types.ts.  The normalizers
 * are defensive — they silently skip or default fields that are missing
 * or malformed — so that a healthy adapter never throws during
 * normalisation (validation errors happen before the request).
 *
 * ── Known Ollama response shapes ─────────────────────────────────────────
 * These are based on the documented Ollama API and verified against the
 * test fixtures.  Unknown fields are silently dropped.  No fields are
 * assumed to be present unless the Ollama docs guarantee them.
 * See https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import type {
  InstalledLocalModel,
  LocalChatChunk,
  LocalModelDetails,
  ModelPullEvent,
  ModelPullPhase,
  RunningLocalModel,
} from "@ethen/contracts/local-models/local-model-types";

// ── Internal helpers ─────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ── Installed model (from /api/tags) ─────────────────────────────────────

export interface RawOllamaTagsModel {
  name?: unknown;
  model?: unknown;
  modified_at?: unknown;
  size?: unknown;
  digest?: unknown;
  details?: Record<string, unknown>;
}

/**
 * Normalize one entry from the /api/tags response into an InstalledLocalModel.
 * Returns null when the record cannot produce a valid name+model pair.
 */
export function normalizeInstalledModel(
  record: unknown,
  index: number,
): InstalledLocalModel | null {
  if (!isPlainObject(record)) return null;

  const name = parseString(record.name);
  const model = parseString(record.model) ?? name;
  if (!name || !model) return null;

  const details = isPlainObject(record.details) ? record.details : {};

  return {
    id: `ollama:${model}`,
    provider: "ollama",
    name,
    model,
    modifiedAt: parseString(record.modified_at),
    sizeBytes: parseNumber(record.size),
    digest: parseString(record.digest),
    family: parseString(details.family),
    parameterSize: parseString(details.parameter_size),
    quantizationLevel: parseString(details.quantization_level),
  };
}

/**
 * Normalize the full /api/tags response body into InstalledLocalModel[].
 */
export function normalizeInstalledModels(
  json: unknown,
): InstalledLocalModel[] {
  if (!isPlainObject(json)) return [];
  const models = Array.isArray(json.models) ? json.models : [];
  return models
    .map((m, i) => normalizeInstalledModel(m, i))
    .filter((m): m is InstalledLocalModel => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Running model (from /api/ps) ─────────────────────────────────────────

export interface RawOllamaPsModel {
  name?: unknown;
  model?: unknown;
  size_vram?: unknown;
  digest?: unknown;
  expires_at?: unknown;
  size?: unknown;
  details?: Record<string, unknown>;
  processor?: Record<string, unknown>;
}

/**
 * Normalize one entry from the /api/ps response into a RunningLocalModel.
 */
export function normalizeRunningModel(
  record: unknown,
  _index: number,
): RunningLocalModel | null {
  if (!isPlainObject(record)) return null;

  const name = parseString(record.name);
  const model = parseString(record.model) ?? name;
  if (!name || !model) return null;

  const processor = isPlainObject(record.processor)
    ? record.processor
    : undefined;

  return {
    id: `ollama:${model}`,
    provider: "ollama",
    model,
    name,
    sizeVramBytes: parseNumber(record.size_vram),
    processorUtilization:
      processor !== undefined
        ? parseNumber(processor.utilization)
        : null,
    expiresAt: parseString(record.expires_at),
    rawDetails: {
      digest: record.digest,
      size: record.size,
      ...(processor ? { processor } : {}),
    },
  };
}

/**
 * Normalize the full /api/ps response body into RunningLocalModel[].
 */
export function normalizeRunningModels(json: unknown): RunningLocalModel[] {
  if (!isPlainObject(json)) return [];
  const models = Array.isArray(json.models) ? json.models : [];
  return models
    .map((m, i) => normalizeRunningModel(m, i))
    .filter((m): m is RunningLocalModel => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Model details (from /api/show) ───────────────────────────────────────

/**
 * Build a LocalModelDetails from an existing InstalledLocalModel plus the
 * raw /api/show response.
 */
export function buildDetailFromShow(
  base: InstalledLocalModel,
  showJson: unknown,
): LocalModelDetails {
  if (!isPlainObject(showJson)) {
    return { ...base, license: null, modelfile: null, template: null, parameters: null, system: null, capabilities: undefined, rawMetadata: undefined };
  }

  const details = isPlainObject(showJson.details) ? showJson.details : {};
  const modelInfo = isPlainObject(showJson.model_info) ? showJson.model_info : {};

  const capabilitiesRaw =
    parseStringArray(showJson.capabilities) ??
    parseStringArray(details.capabilities) ??
    parseStringArray(modelInfo.capabilities);

  return {
    ...base,
    license: parseString(showJson.license),
    modelfile: parseString(showJson.modelfile),
    template: parseString(showJson.template),
    parameters: parseString(showJson.parameters),
    system: parseString(showJson.system),
    capabilities: capabilitiesRaw,
    family: base.family ?? parseString(details.family),
    parameterSize:
      base.parameterSize ?? parseString(details.parameter_size),
    quantizationLevel:
      base.quantizationLevel ??
      parseString(details.quantization_level) ??
      parseString(modelInfo.quantization_level),
    rawMetadata:
      Object.keys({ details, modelInfo }).length > 0
        ? { details, modelInfo }
        : undefined,
  };
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return items.length > 0 ? items : undefined;
}

// ── Pull progress (from /api/pull NDJSON) ────────────────────────────────

const PHASE_LABELS: Record<ModelPullPhase, string> = {
  pulling_manifest: "Pulling manifest",
  downloading_layers: "Downloading layers",
  verifying_digest: "Verifying digest",
  writing_manifest: "Writing manifest",
  removing_unused_layers: "Removing unused layers",
  success: "Ready",
};

export function pullPhaseLabel(phase: ModelPullPhase): string {
  return PHASE_LABELS[phase];
}

export interface RawOllamaPullLine {
  status?: unknown;
  digest?: unknown;
  total?: unknown;
  completed?: unknown;
}

/**
 * Parse a single NDJSON line from /api/pull into a normalized ModelPullEvent.
 *
 * Returns null for unrecognised or keepalive lines.
 *
 * Known Ollama status prefixes:
 *   "pulling manifest"
 *   "pulling <sha256:digest>" (layer download)
 *   "verifying sha256 digest" / "verifying digest"
 *   "writing manifest"
 *   "removing any unused layers" / "removing unused layers"
 *   "success"
 */
export function normalizePullLine(
  lineText: string,
  sequence: number,
): ModelPullEvent | null {
  const trimmed = lineText.trim();
  if (!trimmed) return null;

  let json: RawOllamaPullLine;
  try {
    json = JSON.parse(trimmed) as RawOllamaPullLine;
  } catch {
    return null;
  }

  const rawStatus = typeof json.status === "string" ? json.status : "";
  const phase = derivePullPhase(rawStatus);
  if (!phase) return null;

  return {
    phase,
    label: PHASE_LABELS[phase],
    completedBytes:
      typeof json.completed === "number" && Number.isFinite(json.completed)
        ? json.completed
        : null,
    totalBytes:
      typeof json.total === "number" && Number.isFinite(json.total)
        ? json.total
        : null,
    rawStatus,
    sequence,
  };
}

function derivePullPhase(rawStatus: string): ModelPullPhase | null {
  const status = (rawStatus ?? "").trim().toLowerCase();
  if (!status) return null;

  if (status === "success") return "success";
  if (status.startsWith("pulling manifest")) return "pulling_manifest";
  if (status.startsWith("verifying sha256 digest") || status.startsWith("verifying digest"))
    return "verifying_digest";
  if (status.startsWith("writing manifest")) return "writing_manifest";
  if (status.startsWith("removing any unused layers") || status.startsWith("removing unused layers"))
    return "removing_unused_layers";
  if (status.startsWith("pulling ")) return "downloading_layers";

  return null;
}

// ── Chat chunk (from /api/chat NDJSON) ───────────────────────────────────

export interface RawOllamaChatLine {
  model?: unknown;
  created_at?: unknown;
  message?: {
    role?: unknown;
    content?: unknown;
    images?: unknown;
  };
  done?: unknown;
  total_duration?: unknown;
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  eval_duration?: unknown;
  done_reason?: unknown;
}

/**
 * Parse a single NDJSON line from /api/chat into a normalized LocalChatChunk.
 *
 * Returns null for unrecognised lines (keepalive, etc).
 */
export function normalizeChatLine(
  lineText: string,
): LocalChatChunk | null {
  const trimmed = lineText.trim();
  if (!trimmed) return null;

  let json: RawOllamaChatLine;
  try {
    json = JSON.parse(trimmed) as RawOllamaChatLine;
  } catch {
    return null;
  }

  const done = json.done === true;

  if (done) {
    const totalDurationNanos =
      typeof json.total_duration === "number" && Number.isFinite(json.total_duration)
        ? json.total_duration
        : null;

    const evalCount =
      typeof json.eval_count === "number" && Number.isFinite(json.eval_count)
        ? json.eval_count
        : null;

    const promptEvalCount =
      typeof json.prompt_eval_count === "number" && Number.isFinite(json.prompt_eval_count)
        ? json.prompt_eval_count
        : null;

    const evalDurationNanos =
      typeof json.eval_duration === "number" && Number.isFinite(json.eval_duration)
        ? json.eval_duration
        : null;

    const tokensPerSecond =
      evalCount != null && evalDurationNanos != null && evalDurationNanos > 0
        ? (evalCount / evalDurationNanos) * 1_000_000_000
        : null;

    return {
      type: "done",
      content: "",
      done: true,
      totalDurationNanos,
      tokensPerSecond: tokensPerSecond != null ? Math.round(tokensPerSecond * 100) / 100 : null,
      promptEvalCount,
      evalCount,
    };
  }

  const message = isPlainObject(json.message) ? json.message : {};
  const content = typeof message.content === "string" ? message.content : "";

  return {
    type: "delta",
    content,
    done: false,
  };
}

/** Parse a raw NDJSON stream body into an array of LocalChatChunks. */
export function parseChatNdjson(bodyText: string): LocalChatChunk[] {
  const lines = bodyText.split("\n");
  const chunks: LocalChatChunk[] = [];
  for (const line of lines) {
    const chunk = normalizeChatLine(line);
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

/** Parse a raw NDJSON stream body into an array of ModelPullEvents. */
export function parsePullNdjson(bodyText: string): ModelPullEvent[] {
  const lines = bodyText.split("\n");
  const events: ModelPullEvent[] = [];
  let seq = 0;
  for (const line of lines) {
    const event = normalizePullLine(line, seq);
    if (event) {
      events.push(event);
      seq += 1;
    }
  }
  return events;
}
