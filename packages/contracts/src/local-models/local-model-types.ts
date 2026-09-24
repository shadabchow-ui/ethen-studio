/**
 * Adapter-level types for the Ollama Local Model Runtime.
 *
 * These types define the public contract between the Ollama adapter layer
 * and its callers (Electron IPC wrappers, Local Chat UI, model picker UI).
 * They are deliberately decoupled from the raw Ollama API wire format;
 * normalisation happens in ollama-normalizers.ts.
 *
 * ── Architecture note ────────────────────────────────────────────────────
 * This module is the _upstream_ types file. The existing types.ts in this
 * directory carries the Phase 1–3 read-only client types. Those are not
 * replaced — they remain the read-only client's contract. This file is the
 * new adapter-level contract that all 7 adapter methods return.
 *
 * When both sets converge in a future phase, types.ts should be replaced by
 * this file or re-exported through it. For now they coexist.
 */

// ── Adapter error code (single unified set) ──────────────────────────────
// The complete set of normalised error states the adapter can return.
// These replace the narrower sets in types.ts for all new adapter methods.
export type LocalModelErrorCode =
  | "not_installed"
  | "not_running"
  | "endpoint_unreachable"
  | "invalid_base_url"
  | "timeout"
  | "unexpected_response"
  | "model_missing"
  | "model_name_invalid"
  | "pull_failed"
  | "delete_failed"
  | "chat_failed"
  | "cancelled"
  | "blocked_by_policy";

// ── Runtime status ───────────────────────────────────────────────────────
export type RuntimeProvider = "ollama" | "llama-cpp";

export interface LocalRuntimeStatus {
  provider: RuntimeProvider;
  /** Human-readable version string from /api/version, or null. */
  version: string | null;
  /** True if Ollama responded successfully. */
  detected: boolean;
  /** Label for UI display of the current base URL. */
  baseUrlLabel: "localhost" | "configured";
  /** Number of installed models (from /api/tags). */
  installedModelCount: number;
  /** Human-readable summary of the runtime state. */
  detail: string;
  /** ISO-8601 timestamp of the check. */
  checkedAt: string;
  /** Elapsed wall-clock time for the check, in ms. */
  durationMs?: number;
}

// ── Installed model ──────────────────────────────────────────────────────
export interface InstalledLocalModel {
  /** Adapter-scoped unique identifier, e.g. "ollama:qwen2.5-coder:7b". */
  id: string;
  /** Provider that hosts this model. */
  provider: RuntimeProvider;
  /** Short display name. */
  name: string;
  /** Full model tag. */
  model: string;
  /** ISO-8601 last-modified timestamp from Ollama. */
  modifiedAt: string | null;
  /** Model file size in bytes. */
  sizeBytes: number | null;
  /** Content digest (SHA-256). */
  digest: string | null;
  /** Model family, e.g. "qwen", "llama". */
  family: string | null;
  /** Parameter size label, e.g. "7B", "70B". */
  parameterSize: string | null;
  /** Quantisation level, e.g. "Q4_K_M". */
  quantizationLevel: string | null;
}

// ── Running model ────────────────────────────────────────────────────────
export interface RunningLocalModel {
  /** Adapter-scoped unique identifier. */
  id: string;
  provider: RuntimeProvider;
  /** Model tag currently loaded. */
  model: string;
  /** Human-readable name. */
  name: string;
  /** Memory used by the loaded model in bytes. */
  sizeVramBytes: number | null;
  /** Processor utilisation, 0–100 percentage or null. */
  processorUtilization: number | null;
  /** How long the model has been loaded, in ms. */
  expiresAt: string | null;
  /** Raw /api/ps metadata for future inspection. */
  rawDetails: Record<string, unknown> | undefined;
}

// ── Model details ────────────────────────────────────────────────────────
export interface LocalModelDetails extends InstalledLocalModel {
  /** Model license identifier, e.g. "apache-2.0". */
  license: string | null;
  /** Modelfile content, if returned by /api/show. */
  modelfile: string | null;
  /** Prompt template string. */
  template: string | null;
  /** Model parameters. */
  parameters: string | null;
  /** System prompt embedded in the model. */
  system: string | null;
  /** Capabilities advertised by the model, e.g. ["completion", "chat"]. */
  capabilities: string[] | undefined;
  /** Raw /api/show response sections for forward compatibility. */
  rawMetadata: Record<string, unknown> | undefined;
}

// ── Chat request ─────────────────────────────────────────────────────────
export interface LocalChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: Uint8Array[];
}

export interface LocalChatRequest {
  model: string;
  messages: LocalChatMessage[];
  /** Optional overrides — defaults are sensible for local inference. */
  options?: Partial<{
    temperature: number;
    topP: number;
    topK: number;
    maxTokens: number;
    stop: string[];
    seed: number;
    repeatPenalty: number;
    frequencyPenalty: number;
    presencePenalty: number;
    numCtx: number;
    numPredict: number;
  }>;
  /** Keep the model loaded after generation. */
  keepAlive?: string;
}

// ── Chat chunk (streaming) ───────────────────────────────────────────────
export type LocalChatChunkType =
  | "delta"       // Normal token delta.
  | "done"        // Final terminal chunk.
  | "error";      // Mid-stream error.

export interface LocalChatChunk {
  type: LocalChatChunkType;
  /** The delta text content (empty for non-delta chunks). */
  content: string;
  /** true only for the final "done" chunk. */
  done: boolean;
  /** Total duration in nanoseconds, present on the done chunk. */
  totalDurationNanos?: number | null;
  /** Tokens per second during generation, present on the done chunk. */
  tokensPerSecond?: number | null;
  /** Tokens evaluated during prompt processing, present on the done chunk. */
  promptEvalCount?: number | null;
  /** Tokens generated in the response, present on the done chunk. */
  evalCount?: number | null;
  /** Error detail when type === "error". */
  error?: string | null;
}

// ── Pull event (streaming) ───────────────────────────────────────────────
export type ModelPullPhase =
  | "pulling_manifest"
  | "downloading_layers"
  | "verifying_digest"
  | "writing_manifest"
  | "removing_unused_layers"
  | "success";

export interface ModelPullEvent {
  phase: ModelPullPhase;
  /** Human-readable phase label for UI display. */
  label: string;
  /** Bytes downloaded for the active layer, or null. */
  completedBytes: number | null;
  /** Total bytes for the active layer, or null. */
  totalBytes: number | null;
  /** Raw Ollama status string (only included when it normalises cleanly). */
  rawStatus: string | undefined;
  /** Monotonic sequence number for ordering on the client. */
  sequence: number;
}

// ── Delete result ────────────────────────────────────────────────────────
export interface DeleteLocalModelResult {
  /** The model tag that was deleted. */
  model: string;
  /** true if the model was confirmed deleted. */
  deleted: boolean;
  /** Detail message from Ollama. */
  detail: string;
}

// ── Adapter interface ────────────────────────────────────────────────────
// This is the contract that all callers (IPC wrappers, UI, tests) depend on.
// Implemented by the OllamaLocalModelAdapter class in ./ollama-client.ts.

export interface OllamaLocalModelAdapter {
  /** Check runtime health and return a status summary. */
  status(): Promise<LocalRuntimeStatus>;

  /** List all models installed on the Ollama server. */
  listInstalled(): Promise<InstalledLocalModel[]>;

  /** List models currently loaded in VRAM. */
  listRunning(): Promise<RunningLocalModel[]>;

  /** Get detailed information about a specific model. */
  show(model: string): Promise<LocalModelDetails>;

  /**
   * Pull (download) a model from the Ollama registry.
   * Yields progress events as the download streams in.
   * Throws LocalModelError on failure or on abort via signal.
   */
  pull(
    model: string,
    signal?: AbortSignal,
  ): AsyncIterable<ModelPullEvent>;

  /**
   * Delete a model from the Ollama server.
   */
  delete(model: string): Promise<DeleteLocalModelResult>;

  /**
   * Stream a chat completion from a local model.
   * Yields LocalChatChunk events as the response streams in.
   * Throws LocalModelError on failure or on abort via signal.
   */
  chat(
    request: LocalChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<LocalChatChunk>;
}
