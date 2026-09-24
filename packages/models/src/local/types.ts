// LM-P0-01/LM-P0-09: canonical IPC channels are defined in ipc-contract.ts
// This file re-exports them for backward compatibility — new code should
// import from ./ipc-contract directly.
export { LOCAL_MODELS_CHANNELS, LOCAL_MODELS_EVENT_CHANNEL } from "./ipc-contract";
export type { LocalModelIpcEvent, LocalModelsIpcBridge } from "./ipc-contract";

export const LOCAL_MODELS_DEFAULT_BASE_URL = "http://localhost:11434";
export const LOCAL_MODELS_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "::1"] as const;
export const LOCAL_MODELS_ALLOWED_PORT = 11434;

export type LocalModelRuntimeState =
  | "detected"
  | "setup_required"
  | "not_running"
  | "invalid_base_url"
  | "timeout"
  | "unexpected_response"
  | "blocked_by_policy";

export type LocalRuntimeProvider = "ollama" | "lm-studio" | "llama-cpp" | "custom-openai";

export interface LocalModelRuntimeStatus {
  provider: LocalRuntimeProvider;
  state: LocalModelRuntimeState;
  detected: boolean;
  baseUrlLabel: "localhost" | "configured";
  version?: string | null;
  installedModelCount: number;
  detail: string;
  checkedAt: string;
  durationMs?: number;
}

export interface LocalModelSummary {
  id: string;
  provider: LocalRuntimeProvider;
  name: string;
  model: string;
  modifiedAt?: string | null;
  sizeBytes?: number | null;
  digest?: string | null;
  family?: string | null;
  parameterSize?: string | null;
  quantizationLevel?: string | null;
}

export interface LocalModelDetails extends LocalModelSummary {
  license?: string | null;
  modelfile?: string | null;
  template?: string | null;
  parameters?: string | null;
  system?: string | null;
  capabilities?: string[];
  rawMetadata?: Record<string, unknown>;
}

export interface LocalModelApiError {
  code:
    | "setup_required"
    | "not_running"
    | "invalid_base_url"
    | "timeout"
    | "unexpected_response"
    | "invalid_model_name"
    | "blocked_by_policy";
  message: string;
  safeDetail?: string;
}

export interface LocalModelsStatusPayload {
  ok: true;
  status: LocalModelRuntimeStatus;
}

export interface LocalModelsListPayload {
  ok: true;
  status: LocalModelRuntimeStatus;
  models: LocalModelSummary[];
}

export interface LocalModelsShowPayload {
  ok: true;
  status: LocalModelRuntimeStatus;
  model: LocalModelDetails | null;
}

export interface LocalModelsErrorPayload {
  ok: false;
  error: LocalModelApiError;
}

export interface LocalModelsShowRequest {
  model: string;
}

// ── Phase 3: approval-gated model pull/install ────────────────────────────
// Pull is the first local mutation surface. It is explicitly opt-in: the
// request must carry an affirmative approval gesture. No automatic pulls,
// no background pulls, no arbitrary endpoints. localhost-only Ollama only.

/**
 * Exact acknowledgement string the user must send to confirm a pull.
 * Deliberately verbose so it cannot be triggered accidentally or by a
 * defaulting client. Changing this string is a user-facing safety change.
 */
export const LOCAL_MODEL_PULL_ACKNOWLEDGEMENT =
  "I understand this will download the model from the public Ollama registry to my local disk using my network.";

export const LOCAL_MODEL_DELETE_ACKNOWLEDGEMENT =
  "I understand this will permanently remove the selected local model from my disk.";

export type LocalModelPullPhase =
  | "pulling_manifest"
  | "downloading_layers"
  | "verifying_digest"
  | "writing_manifest"
  | "removing_unused_layers"
  | "success";

export interface LocalModelPullProgressEvent {
  phase: LocalModelPullPhase;
  /** Normalized phase label safe to render in the UI. */
  label: string;
  /** Ollama-reported completed bytes for the active layer, if reported. */
  completedBytes?: number | null;
  /** Ollama-reported total bytes for the active layer, if reported. */
  totalBytes?: number | null;
  /** Raw Ollama status string, only included when it normalizes cleanly. */
  rawStatus?: string;
  /** Monotonic sequence number for ordering on the client. */
  sequence: number;
}

export interface LocalModelsPullRequest {
  model: string;
  /** Must be explicitly `true`. Defaults to false everywhere. */
  approved: boolean;
  /** Must equal LOCAL_MODEL_PULL_ACKNOWLEDGEMENT exactly. */
  acknowledgement: string;
}

export interface LocalModelsPullProgressFrame {
  ok: true;
  event: LocalModelPullProgressEvent;
}

export interface LocalModelsPullErrorPayload {
  ok: false;
  error: LocalModelPullApiError;
}

export interface LocalModelPullApiError {
  code:
    | "approval_required"
    | "invalid_model_name"
    | "blocked_by_policy"
    | "invalid_base_url"
    | "not_running"
    | "setup_required"
    | "timeout"
    | "pull_failed";
  message: string;
  safeDetail?: string;
}
