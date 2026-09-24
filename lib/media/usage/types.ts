import type { MediaModality, MediaMode } from "@ethen/contracts/media/types";

// ── Pricing dimensions (typed metadata for cost estimation) ───────────────────

export type PricingDimension =
  | "image_generation"
  | "image_editing"
  | "upscale"
  | "video_seconds"
  | "video_resolution"
  | "audio_characters"
  | "voice_minutes"
  | "provider_cost"
  | "export_type"
  | "storage_usage";

export const PRICING_DIMENSION_LABELS: Record<PricingDimension, string> = {
  image_generation: "Image generation",
  image_editing: "Image edit",
  upscale: "Upscale",
  video_seconds: "Video seconds",
  video_resolution: "Video resolution",
  audio_characters: "Audio characters",
  voice_minutes: "Voice minutes",
  provider_cost: "Provider cost",
  export_type: "Export type",
  storage_usage: "Storage usage",
};

// ── Dimension cost entry ──────────────────────────────────────────────────────

export interface DimensionCostEntry {
  dimension: PricingDimension;
  modality: MediaModality;
  /** Credit cost per unit (e.g. per image, per second, per minute). */
  creditsPerUnit: number;
  /** Unit label for display. */
  unitLabel: string;
  /** Base multiplier when a specific mode is selected. */
  modeMultiplier?: Partial<Record<MediaMode, number>>;
  /** Cost is waived (0) in mock mode. */
  waivedInMock: boolean;
  /** Cost is waived (0) when setup is required. */
  waivedInSetupRequired: boolean;
}

// ── Credit estimate result ────────────────────────────────────────────────────

export type CreditEstimateStatus =
  | "estimated"
  | "tier_only"
  | "mock_free"
  | "setup_required_free"
  | "not_available"
  | "limit_reached";

export interface CreditEstimateResult {
  status: CreditEstimateStatus;
  /** Total estimated credits. 0 when free/mock/setup-required. */
  totalCredits: number;
  /** Per-dimension breakdown. */
  breakdown: CreditEstimateDimensionBreakdown[];
  /** User's current credit balance, if known. null when unknown. */
  currentBalance: number | null;
  /** Whether the estimated cost exceeds the available balance. */
  exceedsBalance: boolean;
  /** Human-readable note. */
  note: string;
  /** Whether this estimate is mock/free (no real credit consumption). */
  isFreeFlow: boolean;
}

export interface CreditEstimateDimensionBreakdown {
  dimension: PricingDimension;
  label: string;
  units: number;
  creditsPerUnit: number;
  subtotal: number;
  note?: string;
}

// ── Usage event record for media generation ────────────────────────────────────

export type MediaUsageEventType =
  | "media.generate"
  | "media.generate.mock"
  | "media.generate.setup_required"
  | "media.generate.failed"
  | "media.export"
  | "media.storage.add"
  | "media.storage.remove"
  | "media.project.create"
  | "media.project.archive"
  | "media.asset.favorite"
  | "media.asset.assign";

export interface MediaUsageEvent {
  eventType: MediaUsageEventType;
  jobId?: string | null;
  assetId?: string | null;
  projectId?: string | null;
  modality?: MediaModality | null;
  mode?: MediaMode | null;
  providerId?: string | null;
  modelId?: string | null;
  toolId?: string | null;
  estimatedCredits?: number | null;
  creditCost?: number | null;
  dimensions?: CreditEstimateDimensionBreakdown[];
  error?: string | null;
  metadata?: Record<string, unknown> | null;
  timestamp: string;
}

// ── Storage/persistence metadata ───────────────────────────────────────────────

export type StorageDurability = "non_durable" | "session_only" | "browser_local" | "supabase" | "not_provided";

export interface StorageStatus {
  durability: StorageDurability;
  /** True when data is persisted across sessions/restarts. */
  isDurable: boolean;
  /** Human-readable status label. */
  label: string;
  /** Description of the storage backend. */
  description: string;
}

export const STORAGE_STATUS_NON_DURABLE: StorageStatus = {
  durability: "non_durable",
  isDurable: false,
  label: "In-memory (non-durable)",
  description: "Data is held in memory only and will be lost on page refresh or server restart.",
};

export const STORAGE_STATUS_BROWSER_LOCAL: StorageStatus = {
  durability: "browser_local",
  isDurable: false,
  label: "Browser-local only",
  description: "Data is stored in browser memory or localStorage only and is not synced to a server.",
};

export const STORAGE_STATUS_SUPABASE: StorageStatus = {
  durability: "supabase",
  isDurable: true,
  label: "Supabase (durable)",
  description: "Data is persisted to Supabase and survives refreshes, restarts, and server cycles.",
};

export const STORAGE_STATUS_LOCAL_FS: StorageStatus = {
  durability: "not_provided",
  isDurable: false,
  label: "Local file system (non-durable)",
  description: "Data is stored in the local file system only. Not synced to a server and may be lost on restart.",
};

export const STORAGE_STATUS_NOT_PROVIDED: StorageStatus = {
  durability: "not_provided",
  isDurable: false,
  label: "Storage not provided",
  description: "No storage backend is configured for this data.",
};
