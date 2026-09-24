export type EthenPublicModelLane = "expert" | "fast" | "deep";

export interface EthenPublicModelProfile {
  lane: EthenPublicModelLane;
  label: string;
  description: string;
}

export const ETHEN_PUBLIC_MODEL_PROFILES: Record<EthenPublicModelLane, EthenPublicModelProfile> = {
  expert: {
    lane: "expert",
    label: "High",
    description: "Flagship default for most work.",
  },
  fast: {
    lane: "fast",
    label: "Instant",
    description: "Low-latency option for quick turns.",
  },
  deep: {
    lane: "deep",
    label: "Medium",
    description: "Deeper reasoning for harder tasks.",
  },
};

export const ETHEN_PUBLIC_MODEL_ORDER: EthenPublicModelLane[] = ["expert", "fast", "deep"];

export function classifyPublicModelLane(modelId: string): EthenPublicModelLane {
  const lower = modelId.toLowerCase();

  if (/(^o[1-9]\b|reason|opus|deep|(?:^|[-_/])pro(?:$|[-_/]))/.test(lower)) {
    return "deep";
  }

  if (/(mini|flash|haiku|fast|nano|turbo|lite|small)/.test(lower)) {
    return "fast";
  }

  return "expert";
}

// ─── Composer task categories & catalog-backed model payload ─────────────────
//
// These types power the homepage composer's task pills and the scrollable
// model panel. The composer payload is *derived* from real gateway catalog
// records (GatewayCatalogModelRecord) so it never invents model availability
// or capability claims. Server-only catalog code (loader.ts) is not imported
// here — the records are passed in from a server boundary or fetched from the
// existing /api/gateway/v1/models endpoint by the client.

import type {
  GatewayCatalogModelRecord,
  GatewayCatalogStatusKind,
  GatewayModelCapabilityFamily,
} from "./gateway/model-catalog/types";
import { getGatewayProviderLogoPath } from "./gateway/model-catalog/provider-logos";

/** Task categories surfaced as pills above the homepage composer. */
export type TaskCategory = "text" | "code" | "math" | "image-gen" | "vision";

export interface TaskCategoryMeta {
  category: TaskCategory;
  label: string;
}

/**
 * Ordered task pills. "Auto" is intentionally NOT a pill — the default task is
 * "text" and the composer still routes image prompts when Image Gen is active.
 */
export const TASK_CATEGORIES: TaskCategoryMeta[] = [
  { category: "text", label: "Text" },
  { category: "code", label: "Code" },
  { category: "math", label: "Math" },
  { category: "image-gen", label: "Image Gen" },
  { category: "vision", label: "Vision" },
];

/** Default placeholder per task category. */
export const TASK_PLACEHOLDER: Record<TaskCategory, string> = {
  text: "What's on your mind?",
  code: "Describe the code to write or review…",
  math: "Ask a math or quantitative question…",
  "image-gen": "Type to imagine",
  vision: "Describe an image to analyze…",
};

/**
 * Compact, client-safe model option derived from a real catalog record.
 *
 * `statusKind` mirrors the catalog's own status classification — never faked.
 * `logoPath` is resolved through the existing provider-logos module and may be
 * `null`, in which case the UI renders a provider monogram fallback.
 */
export interface ComposerModelOption {
  /** Catalog model_id (e.g. "openai/gpt-4o"). */
  id: string;
  /** Display label (model_name if present, else model_id). */
  label: string;
  /** Raw provider label from the catalog. */
  provider: string;
  /** Normalized provider slug. */
  providerSlug: string;
  /** Capability family from the catalog (may be "unknown"). */
  family: GatewayModelCapabilityFamily;
  /** Context window string as recorded (e.g. "128K"), or null. */
  contextWindow: string | null;
  /** Catalog status — drives the status chip. Never invented. */
  statusKind: GatewayCatalogStatusKind;
  /** True only when the catalog marks the model runnable. */
  runnable: boolean;
  /** Resolved logo asset path, or null when no logo is confirmed. */
  logoPath: string | null;
  /** Set only for recommended presets (High/Instant/Medium lanes). */
  preset?: EthenPublicModelLane;
}

/**
 * Heuristic mapping from a catalog record to a composer task category.
 *
 * Grounded in the catalog's `capabilityFamily` plus `capabilityTags`/model_id
 * keyword signals. Records that cannot be confidently categorized fall back to
 * "text" — they are never claimed as image/vision/code when the catalog does
 * not support it. This is a known limitation reported to the user.
 */
export function taskCategoryForModel(record: GatewayCatalogModelRecord): TaskCategory {
  const family = record.capabilityFamily;
  const tags = (record.capabilityTags ?? []).join(" ").toLowerCase();
  const id = record.model_id.toLowerCase();

  if (family === "code") return "code";
  if (family === "image") return "image-gen";

  // Vision is not a first-class catalog family; detect via capability tags or
  // well-known model id signals. Only grounded tag/id matches qualify.
  if (tags.includes("vision") || tags.includes("image-input") || /\bvision\b/.test(id)) {
    return "vision";
  }

  // Math/reasoning is best-effort, grounded in tags or known id signals.
  if (tags.includes("math") || /o1|math|qwq/.test(id)) {
    return "math";
  }

  // Text-compatible families default to Text.
  if (family === "text" || family === "reasoning" || family === "long-context" || family === "unknown") {
    return "text";
  }

  // Embedding/rerank/realtime/speech/transcription/video have no composer task
  // surface; fall back to text rather than inventing a category.
  return "text";
}

/**
 * Build a compact, client-safe composer model payload from real catalog records.
 *
 * Preserves status faithfully (runnable/provider-configured/missing-key/
 * unsupported-modality/catalog-only) and resolves provider logos through the
 * existing logo module. Caller is expected to fetch records from a server
 * boundary or the /api/gateway/v1/models endpoint.
 */
export function buildComposerModelOptions(records: GatewayCatalogModelRecord[]): ComposerModelOption[] {
  const seen = new Set<string>();
  const options: ComposerModelOption[] = [];

  for (const record of records) {
    if (!record.model_id || !record.provider) continue;
    if (seen.has(record.model_id)) continue;
    seen.add(record.model_id);

    options.push({
      id: record.model_id,
      label: record.model_name?.trim() || record.model_id,
      provider: record.provider,
      providerSlug: record.providerSlug,
      family: record.capabilityFamily,
      contextWindow: record.context_window ?? null,
      statusKind: record.status.kind,
      runnable: record.status.kind === "runnable",
      logoPath: getGatewayProviderLogoPath(record.providerSlug),
    });
  }

  return options;
}

/**
 * Recommended preset rows shown above the catalog list. These map the existing
 * High/Instant/Medium lanes to preset chips — clearly labeled as presets, not
 * as the full model list.
 */
export interface ComposerPresetOption {
  lane: EthenPublicModelLane;
  label: string;
  description: string;
}

export const COMPOSER_MODEL_PRESETS: ComposerPresetOption[] = ETHEN_PUBLIC_MODEL_ORDER.map(
  (lane) => ({
    lane,
    label: ETHEN_PUBLIC_MODEL_PROFILES[lane].label,
    description: ETHEN_PUBLIC_MODEL_PROFILES[lane].description,
  }),
);
