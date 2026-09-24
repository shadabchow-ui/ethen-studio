import "server-only";

import {
  LOCAL_MODELS_ALLOWED_HOSTS,
  LOCAL_MODELS_ALLOWED_PORT,
  LOCAL_MODELS_DEFAULT_BASE_URL,
  type LocalModelApiError,
  type LocalModelDetails,
  type LocalModelRuntimeStatus,
  type LocalModelSummary,
} from "./types";
import {
  assertSupported,
  type UpstreamAdapter,
} from "../runtime/upstream-adapter";

const SAFE_MODEL_NAME_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}(:[a-zA-Z0-9][a-zA-Z0-9._-]{0,63})?$/;

const VERSION_TIMEOUT_MS = 1200;
const TAGS_TIMEOUT_MS = 2200;
const SHOW_TIMEOUT_MS = 2600;

const VERSION_MAX_BYTES = 32 * 1024;
const TAGS_MAX_BYTES = 512 * 1024;
const SHOW_MAX_BYTES = 512 * 1024;

const ALLOWED_HOST_SET = new Set<string>(LOCAL_MODELS_ALLOWED_HOSTS);

interface ResolvedOllamaEndpoint {
  baseUrl: string;
  baseUrlLabel: "localhost" | "configured";
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: unknown;
    model?: unknown;
    modified_at?: unknown;
    size?: unknown;
    digest?: unknown;
    details?: unknown;
  }>;
}

interface OllamaShowResponse {
  modelfile?: unknown;
  parameters?: unknown;
  template?: unknown;
  system?: unknown;
  license?: unknown;
  details?: unknown;
  model_info?: unknown;
  capabilities?: unknown;
}

interface OllamaVersionResponse {
  version?: unknown;
}

class LocalModelsClientError extends Error implements LocalModelApiError {
  code: LocalModelApiError["code"];
  safeDetail?: string;

  constructor(
    code: LocalModelApiError["code"],
    message: string,
    safeDetail?: string,
  ) {
    super(message);
    this.name = "LocalModelsClientError";
    this.code = code;
    this.safeDetail = safeDetail;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return items.length > 0 ? items : undefined;
}

function getResolvedOllamaEndpoint(): ResolvedOllamaEndpoint {
  const rawBaseUrl = process.env.OLLAMA_BASE_URL?.trim() || LOCAL_MODELS_DEFAULT_BASE_URL;
  const baseUrlLabel = process.env.OLLAMA_BASE_URL?.trim()
    ? "configured"
    : "localhost";

  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new LocalModelsClientError(
      "invalid_base_url",
      "OLLAMA_BASE_URL is invalid for the local runtime phase.",
    );
  }

  const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1");

  if (parsed.protocol !== "http:") {
    throw new LocalModelsClientError(
      "invalid_base_url",
      "OLLAMA_BASE_URL must use plain http during this read-only phase.",
    );
  }
  if (parsed.username || parsed.password) {
    throw new LocalModelsClientError(
      "blocked_by_policy",
      "OLLAMA_BASE_URL is blocked by the localhost-only policy.",
    );
  }
  if (!ALLOWED_HOST_SET.has(host)) {
    throw new LocalModelsClientError(
      "blocked_by_policy",
      "OLLAMA_BASE_URL is blocked by the localhost-only policy.",
    );
  }
  if ((parsed.port || String(LOCAL_MODELS_ALLOWED_PORT)) !== String(LOCAL_MODELS_ALLOWED_PORT)) {
    throw new LocalModelsClientError(
      "invalid_base_url",
      "OLLAMA_BASE_URL must use port 11434 during this read-only phase.",
    );
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new LocalModelsClientError(
      "blocked_by_policy",
      "OLLAMA_BASE_URL is blocked by the localhost-only policy.",
    );
  }
  if (parsed.search || parsed.hash) {
    throw new LocalModelsClientError(
      "blocked_by_policy",
      "OLLAMA_BASE_URL is blocked by the localhost-only policy.",
    );
  }

  return {
    baseUrl: `http://${host === "::1" ? "[::1]" : host}:${LOCAL_MODELS_ALLOWED_PORT}`,
    baseUrlLabel,
  };
}

function assertSafeModelName(model: string): string {
  if (typeof model !== "string") {
    throw new LocalModelsClientError(
      "invalid_model_name",
      "Model name is required.",
    );
  }

  const trimmed = model.trim();
  if (
    !trimmed ||
    trimmed.length > 192 ||
    trimmed !== model ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    /[\u0000-\u001f\u007f\s]/.test(trimmed) ||
    trimmed.includes("?") ||
    trimmed.includes("#") ||
    trimmed.includes("@") ||
    trimmed.includes("://") ||
    !SAFE_MODEL_NAME_PATTERN.test(trimmed)
  ) {
    throw new LocalModelsClientError(
      "invalid_model_name",
      "Model name is invalid for read-only local inspection.",
    );
  }

  return trimmed;
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  const declaredLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (declaredLength != null && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new LocalModelsClientError(
      "unexpected_response",
      "Ollama returned an unexpected response.",
    );
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new LocalModelsClientError(
        "unexpected_response",
        "Ollama returned an unexpected response.",
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new LocalModelsClientError(
          "unexpected_response",
          "Ollama returned an unexpected response.",
        );
      }
      text += decoder.decode(value, { stream: true });
    }
  }

  text += decoder.decode();
  return text;
}

async function fetchJson<T>(
  endpoint: ResolvedOllamaEndpoint,
  path: "/api/version" | "/api/tags" | "/api/show",
  options: {
    method: "GET" | "POST";
    timeoutMs: number;
    maxBytes: number;
    body?: string;
  },
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${endpoint.baseUrl}${path}`, {
      method: options.method,
      body: options.body,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: options.body
        ? { "content-type": "application/json" }
        : undefined,
    });

    if (!response.ok) {
      throw new LocalModelsClientError(
        response.status === 404 || response.status === 405
          ? "unexpected_response"
          : endpoint.baseUrlLabel === "configured"
            ? "not_running"
            : "setup_required",
        response.status === 404 || response.status === 405
          ? "Ollama returned an unexpected response."
          : "Ollama is not reachable on the local runtime endpoint.",
      );
    }

    const text = await readTextWithLimit(response, options.maxBytes);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new LocalModelsClientError(
        "unexpected_response",
        "Ollama returned an unexpected response.",
      );
    }
  } catch (error) {
    if (error instanceof LocalModelsClientError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new LocalModelsClientError(
        "timeout",
        "Timed out reaching the local runtime endpoint.",
      );
    }
    throw new LocalModelsClientError(
      endpoint.baseUrlLabel === "configured" ? "not_running" : "setup_required",
      "Ollama is not reachable on the local runtime endpoint.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildStatus(
  input: Omit<LocalModelRuntimeStatus, "provider" | "checkedAt">,
): LocalModelRuntimeStatus {
  return {
    provider: "ollama",
    checkedAt: new Date().toISOString(),
    ...input,
  };
}

export function isLocalModelsClientError(
  error: unknown,
): error is LocalModelsClientError {
  return error instanceof LocalModelsClientError;
}

export function buildStatusFromLocalModelsError(
  error: LocalModelsClientError,
  endpoint?: { baseUrlLabel: "localhost" | "configured" },
  durationMs?: number,
): LocalModelRuntimeStatus {
  const state =
    error.code === "invalid_model_name"
      ? "unexpected_response"
      : error.code;

  return buildStatus({
    state,
    detected: false,
    baseUrlLabel: endpoint?.baseUrlLabel ?? "localhost",
    version: null,
    installedModelCount: 0,
    detail: error.message,
    durationMs,
  });
}

function parseModelSummary(record: unknown): LocalModelSummary | null {
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

function summarizeModels(json: OllamaTagsResponse): LocalModelSummary[] {
  const models = Array.isArray(json.models) ? json.models : [];
  return models
    .map(parseModelSummary)
    .filter((model): model is LocalModelSummary => model !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildDetailFromShow(
  summary: LocalModelSummary,
  json: OllamaShowResponse,
): LocalModelDetails {
  const details = isPlainObject(json.details) ? json.details : {};
  const modelInfo = isPlainObject(json.model_info) ? json.model_info : {};
  const capabilities =
    parseStringArray(json.capabilities) ??
    parseStringArray(details.capabilities) ??
    parseStringArray(modelInfo.capabilities);

  return {
    ...summary,
    license: parseString(json.license),
    modelfile: parseString(json.modelfile),
    template: parseString(json.template),
    parameters: parseString(json.parameters),
    system: parseString(json.system),
    capabilities,
    family: summary.family ?? parseString(details.family),
    parameterSize: summary.parameterSize ?? parseString(details.parameter_size),
    quantizationLevel:
      summary.quantizationLevel ??
      parseString(details.quantization_level) ??
      parseString(modelInfo.quantization_level),
    rawMetadata:
      Object.keys({ details, modelInfo }).length > 0
        ? {
            details,
            modelInfo,
          }
        : undefined,
  };
}

export async function getOllamaStatus(): Promise<LocalModelRuntimeStatus> {
  const startedAt = Date.now();
  const endpoint = getResolvedOllamaEndpoint();
  const [versionJson, tagsJson] = await Promise.all([
    fetchJson<OllamaVersionResponse>(endpoint, "/api/version", {
      method: "GET",
      timeoutMs: VERSION_TIMEOUT_MS,
      maxBytes: VERSION_MAX_BYTES,
    }),
    fetchJson<OllamaTagsResponse>(endpoint, "/api/tags", {
      method: "GET",
      timeoutMs: TAGS_TIMEOUT_MS,
      maxBytes: TAGS_MAX_BYTES,
    }),
  ]);

  const models = summarizeModels(tagsJson);

  return buildStatus({
    state: "detected",
    detected: true,
    baseUrlLabel: endpoint.baseUrlLabel,
    version: parseString(versionJson.version),
    installedModelCount: models.length,
    detail:
      models.length > 0
        ? "Ollama-compatible local runtime detected."
        : "Ollama-compatible local runtime detected, but no installed models were listed.",
    durationMs: Date.now() - startedAt,
  });
}

export async function listOllamaModels(): Promise<{
  status: LocalModelRuntimeStatus;
  models: LocalModelSummary[];
}> {
  const startedAt = Date.now();
  const endpoint = getResolvedOllamaEndpoint();
  const [versionJson, tagsJson] = await Promise.all([
    fetchJson<OllamaVersionResponse>(endpoint, "/api/version", {
      method: "GET",
      timeoutMs: VERSION_TIMEOUT_MS,
      maxBytes: VERSION_MAX_BYTES,
    }),
    fetchJson<OllamaTagsResponse>(endpoint, "/api/tags", {
      method: "GET",
      timeoutMs: TAGS_TIMEOUT_MS,
      maxBytes: TAGS_MAX_BYTES,
    }),
  ]);

  const models = summarizeModels(tagsJson);
  const status = buildStatus({
    state: "detected",
    detected: true,
    baseUrlLabel: endpoint.baseUrlLabel,
    version: parseString(versionJson.version),
    installedModelCount: models.length,
    detail:
      models.length > 0
        ? "Ollama-compatible local runtime detected."
        : "Ollama-compatible local runtime detected, but no installed models were listed.",
    durationMs: Date.now() - startedAt,
  });

  return { status, models };
}

export async function showOllamaModel(model: string): Promise<{
  status: LocalModelRuntimeStatus;
  model: LocalModelDetails;
}> {
  const startedAt = Date.now();
  const endpoint = getResolvedOllamaEndpoint();
  const safeModel = assertSafeModelName(model);

  const [versionJson, tagsJson, showJson] = await Promise.all([
    fetchJson<OllamaVersionResponse>(endpoint, "/api/version", {
      method: "GET",
      timeoutMs: VERSION_TIMEOUT_MS,
      maxBytes: VERSION_MAX_BYTES,
    }),
    fetchJson<OllamaTagsResponse>(endpoint, "/api/tags", {
      method: "GET",
      timeoutMs: TAGS_TIMEOUT_MS,
      maxBytes: TAGS_MAX_BYTES,
    }),
    fetchJson<OllamaShowResponse>(endpoint, "/api/show", {
      method: "POST",
      timeoutMs: SHOW_TIMEOUT_MS,
      maxBytes: SHOW_MAX_BYTES,
      body: JSON.stringify({ model: safeModel }),
    }),
  ]);

  const models = summarizeModels(tagsJson);
  const summary =
    models.find((entry) => entry.model === safeModel || entry.name === safeModel) ?? {
      id: `ollama:${safeModel}`,
      provider: "ollama" as const,
      name: safeModel,
      model: safeModel,
      modifiedAt: undefined,
      sizeBytes: undefined,
      digest: undefined,
      family: undefined,
      parameterSize: undefined,
      quantizationLevel: undefined,
    };

  const detailModel = buildDetailFromShow(summary, showJson);
  const status = buildStatus({
    state: "detected",
    detected: true,
    baseUrlLabel: endpoint.baseUrlLabel,
    version: parseString(versionJson.version),
    installedModelCount: models.length,
    detail: "Ollama-compatible local runtime detected.",
    durationMs: Date.now() - startedAt,
  });

  return {
    status,
    model: detailModel,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// NEW IN THIS JOB: OllamaLocalModelAdapter
// ══════════════════════════════════════════════════════════════════════════
//
// The adapter class wraps the existing read-only client functions and adds
// the new mutable + streaming endpoints (listRunning, pull, delete, chat).
// It provides the `OllamaLocalModelAdapter` interface from local-model-types
// and uses the normalised error types from local-model-errors.
//
// All existing exports above remain unchanged for backward compatibility.

import { assertModelName } from "./ollama-model-name";
import {
  assertLocalhostOnlyUrl,
  LOCAL_RUNTIME_ALLOWED_HOSTS_SET,
  LOCAL_RUNTIME_ALLOWED_PORTS,
  LocalRuntimePolicyError,
} from "./local-runtime-policy";
import {
  cancelled,
  chatFailed,
  deleteFailed,
  endpointUnreachable,
  invalidBaseUrl,
  isLocalModelError,
  LocalModelError,
  mapLegacyErrorCode,
  modelMissing,
  notInstalled,
  notRunning,
  pullFailed,
  timeoutError,
  unexpectedResponse,
} from "./local-model-errors";
import {
  buildDetailFromShow as normalizeDetailFromShow,
  normalizeChatLine,
  normalizeInstalledModel,
  normalizeInstalledModels,
  normalizePullLine,
  normalizeRunningModel,
  normalizeRunningModels,
} from "./ollama-normalizers";
import type {
  DeleteLocalModelResult,
  InstalledLocalModel,
  LocalChatChunk,
  LocalChatRequest,
  LocalRuntimeStatus,
  ModelPullEvent,
  OllamaLocalModelAdapter,
  RunningLocalModel,
} from "@ethen/contracts/local-models/local-model-types";
import type { LocalModelDetails as NewLocalModelDetails } from "@ethen/contracts/local-models/local-model-types";

// ── Constants ────────────────────────────────────────────────────────────

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

const TIMEOUT_MS = {
  status: 2_000,
  listInstalled: 2_200,
  listRunning: 2_000,
  show: 2_600,
  delete: 3_000,
  pull: 300_000, // 5 min — large models
  chat: 120_000, // 2 min — long generations
} as const;

const MAX_BYTES = {
  json: 512 * 1024,
  stream: 8 * 1024 * 1024,
} as const;

// ── Internal HTTP helpers ────────────────────────────────────────────────

interface AdapterEndpoint {
  baseUrl: string;
  baseUrlLabel: "localhost" | "configured";
}

function resolveAdapterUrl(
  baseUrlOrUndefined: string | undefined,
): AdapterEndpoint {
  const raw =
    baseUrlOrUndefined?.trim() ||
    process.env.OLLAMA_BASE_URL?.trim() ||
    DEFAULT_OLLAMA_BASE_URL;

  const label: "localhost" | "configured" =
    baseUrlOrUndefined?.trim() || process.env.OLLAMA_BASE_URL?.trim()
      ? "configured"
      : "localhost";

  // Use the shared policy to validate localhost-only.
  try {
    assertLocalhostOnlyUrl(raw, "ollama");
    const parsed = new URL(raw);
    if ((parsed.port || String(LOCAL_MODELS_ALLOWED_PORT)) !== String(LOCAL_MODELS_ALLOWED_PORT)) {
      throw new LocalRuntimePolicyError(
        `Ollama must use port ${LOCAL_MODELS_ALLOWED_PORT} during the read-only phase.`,
        "invalid_base_url",
      );
    }
  } catch (err) {
    if (err instanceof LocalRuntimePolicyError) {
      if (err.code === "invalid_base_url") {
        throw invalidBaseUrl(err.message, { cause: err });
      }
      throw new LocalModelError("blocked_by_policy", err.message, {
        safeDetail: "Blocked by localhost-only security policy.",
        cause: err,
      });
    }
    throw err;
  }

  const normalized = raw.replace(/\/+$/, "");
  return { baseUrl: normalized, baseUrlLabel: label };
}

function adapterBaseUrl(endpoint: AdapterEndpoint): string {
  return endpoint.baseUrl;
}

/**
 * Generic JSON fetch for adapter operations.
 * Throws LocalModelError on all failure modes.
 */
async function adapterFetchJson<T>(
  endpoint: AdapterEndpoint,
  path: string,
  options: {
    method: "GET" | "POST" | "DELETE";
    timeoutMs: number;
    maxBytes: number;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<T> {
  // Build a composite signal that includes our internal timeout.
  const internalController = new AbortController();
  const timeout = setTimeout(() => internalController.abort(), options.timeoutMs);

  // Forward external abort signal to internal controller.
  const externalSignal = options.signal;
  let onAbort: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      internalController.abort();
    } else {
      onAbort = () => internalController.abort();
      externalSignal.addEventListener("abort", onAbort, { once: true });
    }
  }

  const compositeSignal = internalController.signal;

  try {
    const url = `${adapterBaseUrl(endpoint)}${path}`;
    const headers: Record<string, string> = {};
    if (options.body) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(url, {
      method: options.method,
      body: options.body,
      cache: "no-store",
      redirect: "error",
      signal: compositeSignal,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    if (!response.ok) {
      throw mapNonOkResponse(endpoint, response, options.method, path);
    }

    const text = await readTextWithLimit(response, options.maxBytes);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw unexpectedResponse(
        "Ollama returned an unexpected response (invalid JSON).",
      );
    }
  } catch (error) {
    if (isLocalModelError(error)) throw error;
    if (error instanceof LocalModelsClientError) {
      // Map the legacy error code to the unified set.
      throw new LocalModelError(
        mapLegacyErrorCode(error.code),
        error.message,
        { safeDetail: error.safeDetail, cause: error },
      );
    }
    if (error instanceof Error && error.name === "AbortError") {
      if (externalSignal?.aborted) {
        throw cancelled("Request was cancelled.");
      }
      throw timeoutError("Request to Ollama timed out.", { cause: error });
    }
    throw endpointUnreachable(
      `Could not reach the Ollama endpoint at ${endpoint.baseUrl}.`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
    if (onAbort && externalSignal) {
      externalSignal.removeEventListener("abort", onAbort);
    }
  }
}

function mapNonOkResponse(
  endpoint: AdapterEndpoint,
  response: Response,
  method: string,
  path: string,
): LocalModelError {
  const status = response.status;

  // 404 on a model-specific endpoint usually means model_missing.
  if (status === 404 && (path.includes("/api/show") || path.includes("/api/chat") || path.includes("/api/delete"))) {
    return modelMissing(path.split("/").pop() ?? "unknown");
  }

  // Generic error mapping.
  if (status === 404 || status === 405) {
    return unexpectedResponse(
      `Ollama returned HTTP ${status} for ${method} ${path}.`,
    );
  }

  if (endpoint.baseUrlLabel === "configured") {
    return notRunning(
      `Ollama at ${endpoint.baseUrl} returned HTTP ${status} for ${method} ${path}.`,
    );
  }

  return notInstalled(
    `Ollama on localhost returned HTTP ${status} for ${method} ${path}.`,
  );
}

/**
 * Read a response body with a byte limit, returning the text.
 * Throws LocalModelError if the body exceeds maxBytes.
 */
async function adapterReadWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  const declaredLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (
    declaredLength != null &&
    Number.isFinite(declaredLength) &&
    declaredLength > maxBytes
  ) {
    throw unexpectedResponse("Ollama response exceeds the size limit.");
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw unexpectedResponse("Ollama response exceeds the size limit.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw unexpectedResponse("Ollama response exceeds the size limit.");
      }
      text += decoder.decode(value, { stream: true });
    }
  }

  text += decoder.decode();
  return text;
}

// ── NDJSON streaming helpers (generator-based AsyncIterable) ─────────────

/**
 * Perform a fetch that streams NDJSON lines, yielding parsed lines as
 * an AsyncGenerator.  The generator handles AbortSignal, timeouts,
 * byte limits, and error mapping internally.
 */
async function* streamNdjson<T>(
  endpoint: AdapterEndpoint,
  path: string,
  options: {
    method: "POST" | "GET";
    timeoutMs: number;
    maxBytes: number;
    body?: string;
    signal?: AbortSignal;
    /** Transform each parsed line. Return null to skip the line. */
    parseLine: (line: string, index: number) => T | null;
    /** Map the final error — called only during streaming errors. */
    onStreamError?: (raw: unknown) => LocalModelError;
  },
): AsyncGenerator<T, void, undefined> {
  const internalController = new AbortController();
  const timeout = setTimeout(() => internalController.abort(), options.timeoutMs);

  const externalSignal = options.signal;
  let onAbort: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      internalController.abort();
    } else {
      onAbort = () => internalController.abort();
      externalSignal.addEventListener("abort", onAbort, { once: true });
    }
  }

  const compositeSignal = internalController.signal;
  let lineIndex = 0;

  try {
    const url = `${adapterBaseUrl(endpoint)}${path}`;
    const headers: Record<string, string> = { "content-type": "application/json" };

    const response = await fetch(url, {
      method: options.method,
      body: options.body,
      cache: "no-store",
      redirect: "error",
      signal: compositeSignal,
      headers,
    });

    if (!response.ok) {
      throw mapNonOkResponse(endpoint, response, options.method, path);
    }

    if (!response.body) {
      throw unexpectedResponse("Ollama did not return a streaming body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let totalBytesRead = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        totalBytesRead += value.byteLength;
        if (totalBytesRead > options.maxBytes) {
          await reader.cancel();
          throw unexpectedResponse("Stream exceeded the size limit and was aborted.");
        }

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");

          const parsed = options.parseLine(line, lineIndex);
          if (parsed !== null) {
            lineIndex += 1;
            yield parsed;
          }
        }
      }
    }

    // Flush trailing line.
    const trailing = options.parseLine(buffer, lineIndex);
    if (trailing !== null) {
      yield trailing;
    }
  } catch (error) {
    if (isLocalModelError(error)) throw error;
    if (error instanceof LocalModelsClientError) {
      throw new LocalModelError(
        mapLegacyErrorCode(error.code),
        error.message,
        { safeDetail: error.safeDetail, cause: error },
      );
    }
    if (error instanceof Error && error.name === "AbortError") {
      if (externalSignal?.aborted) {
        throw cancelled("Request was cancelled.");
      }
      throw timeoutError("Stream request to Ollama timed out.", { cause: error });
    }
    throw (options.onStreamError?.(error) ?? endpointUnreachable(
      `Could not reach the Ollama endpoint at ${endpoint.baseUrl}.`,
      { cause: error },
    ));
  } finally {
    clearTimeout(timeout);
    if (onAbort && externalSignal) {
      externalSignal.removeEventListener("abort", onAbort);
    }
  }
}

// ── Adapter class ────────────────────────────────────────────────────────

export class OllamaLocalModelAdapterImpl implements OllamaLocalModelAdapter {
  private endpoint: AdapterEndpoint;

  /**
   * @param baseUrlOverride  Optional explicit base URL.  Defaults to the
   *   OLLAMA_BASE_URL env var, then http://localhost:11434.
   *   Validated against the localhost-only policy.
   */
  constructor(baseUrlOverride?: string) {
    this.endpoint = resolveAdapterUrl(baseUrlOverride);
  }

  /** Re-resolve the endpoint (useful after env var changes). */
  refreshEndpoint(): void {
    this.endpoint = resolveAdapterUrl(undefined);
  }

  // ── status ───────────────────────────────────────────────────────────────

  async status(): Promise<LocalRuntimeStatus> {
    const startedAt = Date.now();

    try {
      // Delegate to the existing read-only client for backward compat.
      const existingStatus = await getOllamaStatus();

      return {
        provider: "ollama",
        version: existingStatus.version ?? null,
        detected: existingStatus.state === "detected",
        baseUrlLabel: existingStatus.baseUrlLabel,
        installedModelCount: existingStatus.installedModelCount,
        detail: existingStatus.detail,
        checkedAt: existingStatus.checkedAt,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      if (error instanceof LocalModelsClientError) {
        // Map legacy error to new status shape.
        const unifiedCode = mapLegacyErrorCode(error.code);
        return {
          provider: "ollama",
          version: null,
          detected: false,
          baseUrlLabel: this.endpoint.baseUrlLabel,
          installedModelCount: 0,
          detail: error.message,
          checkedAt: new Date().toISOString(),
          durationMs,
        };
      }

      if (isLocalModelError(error)) {
        return {
          provider: "ollama",
          version: null,
          detected: false,
          baseUrlLabel: this.endpoint.baseUrlLabel,
          installedModelCount: 0,
          detail: error.safeDetail,
          checkedAt: new Date().toISOString(),
          durationMs,
        };
      }

      return {
        provider: "ollama",
        version: null,
        detected: false,
        baseUrlLabel: this.endpoint.baseUrlLabel,
        installedModelCount: 0,
        detail: String(error),
        checkedAt: new Date().toISOString(),
        durationMs,
      };
    }
  }

  // ── listInstalled ────────────────────────────────────────────────────────

  async listInstalled(): Promise<InstalledLocalModel[]> {
    const json = await adapterFetchJson<{ models?: unknown[] }>(
      this.endpoint,
      "/api/tags",
      {
        method: "GET",
        timeoutMs: TIMEOUT_MS.listInstalled,
        maxBytes: MAX_BYTES.json,
      },
    );

    return normalizeInstalledModels(json);
  }

  // ── listRunning ──────────────────────────────────────────────────────────

  async listRunning(): Promise<RunningLocalModel[]> {
    const json = await adapterFetchJson<{ models?: unknown[] }>(
      this.endpoint,
      "/api/ps",
      {
        method: "GET",
        timeoutMs: TIMEOUT_MS.listRunning,
        maxBytes: MAX_BYTES.json,
      },
    );

    return normalizeRunningModels(json);
  }

  // ── show ─────────────────────────────────────────────────────────────────

  async show(model: string): Promise<NewLocalModelDetails> {
    const safeModel = assertModelName(model);

    // First get the tags to find a base summary, then get details.
    const [tagsJson, showJson] = await Promise.all([
      adapterFetchJson<{ models?: unknown[] }>(
        this.endpoint,
        "/api/tags",
        {
          method: "GET",
          timeoutMs: TIMEOUT_MS.listInstalled,
          maxBytes: MAX_BYTES.json,
        },
      ),
      adapterFetchJson<Record<string, unknown>>(
        this.endpoint,
        "/api/show",
        {
          method: "POST",
          timeoutMs: TIMEOUT_MS.show,
          maxBytes: MAX_BYTES.json,
          body: JSON.stringify({ model: safeModel }),
        },
      ),
    ]);

    const installedModels = normalizeInstalledModels(tagsJson);
    const base =
      installedModels.find(
        (m) => m.model === safeModel || m.name === safeModel,
      ) ??
      ({
        id: `ollama:${safeModel}`,
        provider: "ollama" as const,
        name: safeModel,
        model: safeModel,
        modifiedAt: null,
        sizeBytes: null,
        digest: null,
        family: null,
        parameterSize: null,
        quantizationLevel: null,
      } satisfies InstalledLocalModel);

    return normalizeDetailFromShow(base, showJson);
  }

  // ── pull ─────────────────────────────────────────────────────────────────

  pull(
    model: string,
    signal?: AbortSignal,
  ): AsyncIterable<ModelPullEvent> {
    const safeModel = assertModelName(model);

    const iterable = streamNdjson<ModelPullEvent>(
      this.endpoint,
      "/api/pull",
      {
        method: "POST",
        timeoutMs: TIMEOUT_MS.pull,
        maxBytes: MAX_BYTES.stream,
        body: JSON.stringify({ name: safeModel, stream: true }),
        signal,
        parseLine: (line, index) => normalizePullLine(line, index),
        onStreamError: (raw) =>
          pullFailed("Pull stream failed.", { cause: raw }),
      },
    );

    return withPullValidation(iterable);
  }

  // ── delete ───────────────────────────────────────────────────────────────

  async delete(model: string): Promise<DeleteLocalModelResult> {
    const safeModel = assertModelName(model);

    // Ollama DELETE /api/delete expects a JSON body with the model name.
    const response = await adapterFetchJson<Record<string, unknown>>(
      this.endpoint,
      "/api/delete",
      {
        method: "DELETE",
        timeoutMs: TIMEOUT_MS.delete,
        maxBytes: MAX_BYTES.json,
        body: JSON.stringify({ model: safeModel }),
      },
    );

    return {
      model: safeModel,
      deleted: true,
      detail: typeof response.status === "string"
        ? response.status
        : `Model "${safeModel}" deleted successfully.`,
    };
  }

  // ── chat ─────────────────────────────────────────────────────────────────

  chat(
    request: LocalChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<LocalChatChunk> {
    const safeModel = assertModelName(request.model);

    // Build the Ollama /api/chat request body.
    const body = buildChatRequestBody(request);

    const iterable = streamNdjson<LocalChatChunk>(
      this.endpoint,
      "/api/chat",
      {
        method: "POST",
        timeoutMs: TIMEOUT_MS.chat,
        maxBytes: MAX_BYTES.stream,
        body: JSON.stringify(body),
        signal,
        parseLine: (line) => normalizeChatLine(line),
        onStreamError: (raw) =>
          chatFailed("Chat stream failed.", { cause: raw }),
      },
    );

    return withChatValidation(iterable);
  }
}

// ── Streaming validation wrappers ────────────────────────────────────────

/**
 * Wraps an AsyncIterable<ModelPullEvent> and validates that a "success"
 * phase event is seen before the stream ends. Throws LocalModelError
 * if the stream ends without success.
 */
async function* withPullValidation(
  source: AsyncIterable<ModelPullEvent>,
): AsyncGenerator<ModelPullEvent, void, undefined> {
  let sawSuccess = false;
  try {
    for await (const event of source) {
      if (event.phase === "success") sawSuccess = true;
      yield event;
    }
    if (!sawSuccess) {
      throw pullFailed(
        "Pull completed without a success marker from Ollama.",
      );
    }
  } catch (error) {
    if (isLocalModelError(error)) throw error;
    throw pullFailed("Pull failed unexpectedly.", { cause: error });
  }
}

/**
 * Wraps an AsyncIterable<LocalChatChunk> and emits a final error chunk
 * if the stream ends without a "done" terminal chunk.
 */
async function* withChatValidation(
  source: AsyncIterable<LocalChatChunk>,
): AsyncGenerator<LocalChatChunk, void, undefined> {
  let sawDone = false;
  try {
    for await (const chunk of source) {
      if (chunk.done) sawDone = true;
      yield chunk;
    }
    if (!sawDone) {
      yield {
        type: "error" as const,
        content: "",
        done: true,
        error: "Chat stream ended without a terminal chunk.",
      };
    }
  } catch (error) {
    if (isLocalModelError(error)) {
      if (sawDone) {
        yield {
          type: "error" as const,
          content: "",
          done: true,
          error: error.safeDetail,
        };
        return;
      }
      throw error;
    }
    throw chatFailed("Chat stream failed unexpectedly.", { cause: error });
  }
}

// ── Chat body builder ────────────────────────────────────────────────────

function buildChatRequestBody(request: LocalChatRequest): Record<string, unknown> {
  const messages = request.messages.map((msg) => {
    const m: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };
    if (msg.images && msg.images.length > 0) {
      m.images = msg.images;
    }
    return m;
  });

  const body: Record<string, unknown> = {
    model: request.model,
    messages,
    stream: true,
  };

  if (request.options) {
    const opts: Record<string, unknown> = {};
    const o = request.options;
    if (o.temperature !== undefined) opts.temperature = o.temperature;
    if (o.topP !== undefined) opts.top_p = o.topP;
    if (o.topK !== undefined) opts.top_k = o.topK;
    if (o.maxTokens !== undefined) opts.num_predict = o.maxTokens;
    if (o.stop !== undefined) opts.stop = o.stop;
    if (o.seed !== undefined) opts.seed = o.seed;
    if (o.repeatPenalty !== undefined) opts.repeat_penalty = o.repeatPenalty;
    if (o.frequencyPenalty !== undefined) opts.frequency_penalty = o.frequencyPenalty;
    if (o.presencePenalty !== undefined) opts.presence_penalty = o.presencePenalty;
    if (o.numCtx !== undefined) opts.num_ctx = o.numCtx;
    if (o.numPredict !== undefined) opts.num_predict = o.numPredict;
    body.options = opts;
  }

  if (request.keepAlive) {
    body.keep_alive = request.keepAlive;
  }

  return body;
}

// ── Singleton default adapter ────────────────────────────────────────────

let _defaultAdapter: OllamaLocalModelAdapterImpl | null = null;

/**
 * Get or create the default OllamaLocalModelAdapter (uses env/base URL).
 */
export function getDefaultOllamaAdapter(): OllamaLocalModelAdapterImpl {
  if (!_defaultAdapter) {
    _defaultAdapter = new OllamaLocalModelAdapterImpl();
  }
  return _defaultAdapter;
}

/**
 * Reset the default adapter singleton (useful for testing).
 */
export function resetDefaultOllamaAdapter(): void {
  _defaultAdapter = null;
}

/**
 * SOL-23 Gateway contract boundary. Ollama remains discovery-only here:
 * mutation and chat stay owned by the local runtime and cannot be promoted
 * into the hosted Gateway accidentally.
 */
export const ollamaReadOnlyUpstreamAdapter: UpstreamAdapter = {
  id: "ollama",
  capabilities: Object.freeze({
    streaming: false,
    non_streaming: false,
    tool_calls: false,
    usage: false,
    read_only_discovery: true,
  }),
  async execute(request) {
    assertSupported(this, request);
    throw new Error("Ollama Gateway execution is outside the read-only certification scope.");
  },
  async discover() {
    const adapter = getDefaultOllamaAdapter();
    const [status, installed] = await Promise.all([
      adapter.status(),
      adapter.listInstalled(),
    ]);
    return { status, installed };
  },
};

// ── Re-exports for convenience ───────────────────────────────────────────

export { isLocalModelError, LocalModelError };
