// ── Core modality types ──────────────────────────────────────────────────

export type MediaModality = "image" | "video" | "audio";

export type MediaMode =
  | "image"
  | "video"
  | "audio"
  | "marketing"
  | "product"
  | "influencer"
  | "motion"
  | "canvas"
  | "game";

export type MediaAppCategory =
  | "featured"
  | "image"
  | "video"
  | "audio"
  | "marketing"
  | "product"
  | "influencer"
  | "canvas"
  | "edit"
  | "utility"
  | "game";

export type MediaAppArchetype =
  | "prompt_studio"
  | "before_after_editor"
  | "camera_motion_studio"
  | "product_marketing_studio"
  | "character_influencer_studio"
  | "voice_audio_studio"
  | "canvas_board"
  | "scorecard_tool"
  | "game_asset_studio";

export type MediaAppTrustState =
  | "mock"
  | "setup-required"
  | "live"
  | "provider-unavailable";

export type MediaAppRiskLevel = "low" | "medium" | "high";

export type MediaAppFlag = "featured" | "top" | "new";

export type MediaAppSectionId =
  | "image_creation"
  | "video_creation"
  | "marketing_product"
  | "influencer_identity"
  | "audio_voice"
  | "canvas_planning"
  | "utilities_trust"
  | "game_assets";

export type MediaAppLifecycleState =
  | "mock"
  | "setup_required"
  | "coming_soon"
  | "planned"
  | "live";

export type MediaStudioTabId =
  | "explore"
  | "image"
  | "video"
  | "audio"
  | "supercomputer"
  | "mcp-cli"
  | "collab"
  | "plugins"
  | "marketing-studio"
  | "cinema-studio"
  | "ai-influencer"
  | "canvas"
  | "apps";

export interface MediaApp {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: MediaAppCategory;
  archetype: MediaAppArchetype;
  storeSection: MediaAppSectionId;
  studioTab: MediaStudioTabId;
  requiredInputs: string[];
  optionalInputs: string[];
  outputTypes: string[];
  defaultToolId: string | null;
  defaultMode: MediaMode;
  riskLevel: MediaAppRiskLevel;
  trustState: MediaAppTrustState;
  setupState: MediaAppLifecycleState;
  estimatedCreditsLabel: string;
  estimatedCredits?: string;
  providerRequirement?: string;
  modelRequirement?: string;
  safetyLabel?: string;
  route?: string;
  badges?: string[];
  flags?: MediaAppFlag[];
  isFeatured?: boolean;
  isNew?: boolean;
  isTop?: boolean;
}

export type GenerationButtonState =
  | "ready"
  | "missing-prompt"
  | "generating"
  | "setup-required"
  | "provider-unavailable";

// ── Media capabilities ───────────────────────────────────────────────────

export type MediaCapability = string;

// ── Media model ──────────────────────────────────────────────────────────

export type ModelExecutionState = "available" | "setup_required" | "contract_only" | "planned";

export interface MediaModel {
  id: string;
  provider: string;
  name: string;
  displayName: string;
  modality: MediaModality;
  tasks: string[];
  maxOutput?: string;
  supportsFineTuning: boolean;
  estimatedCredits: number;
  executionState: ModelExecutionState;
  setupRequired: boolean;
}

// ── Mode-specific params ─────────────────────────────────────────────────

export interface ImageParams {
  aspectRatio?: string;
  style?: string;
  quality?: string;
  variants?: number;
  seed?: string | number;
  negativePrompt?: string;
  referenceImages?: string;
  model?: string;
  width?: number;
  height?: number;
}

export interface VideoParams {
  aspectRatio?: string;
  camera?: string;
  motion?: string;
  duration?: number;
  durationSeconds?: number;
  quality?: string;
  referenceImage?: string;
  model?: string;
  width?: number;
  height?: number;
  framesPerSecond?: number;
}

export interface AudioParams {
  voice?: string;
  duration?: number;
  durationSeconds?: number;
  language?: string;
  tone?: string;
  outputFormat?: string;
  voiceId?: string;
}

export interface MarketingParams {
  platform: string;
  aspectRatio: string;
  style: string;
  quality: string;
  variants: number;
  brandVoice: string;
  model: string;
}

export interface ProductParams {
  category: string;
  aspectRatio: string;
  style: string;
  quality: string;
  background: string;
  lighting: string;
  model: string;
}

export interface InfluencerParams {
  niche: string;
  aspectRatio: string;
  style: string;
  mood: string;
  platform: string;
  model: string;
}

export interface MotionParams {
  animationType: string;
  duration: number;
  easing: string;
  resolution: string;
  model: string;
}

export interface CanvasParams {
  boardType: string;
  references: string;
  campaignIntent: string;
  stylingIntent: string;
}

export type MediaParams =
  | ImageParams
  | VideoParams
  | AudioParams
  | MarketingParams
  | ProductParams
  | InfluencerParams
  | MotionParams
  | CanvasParams;

export interface MediaGenerationConfig {
  width?: number;
  height?: number;
  aspectRatio?: string;
  durationSeconds?: number;
  framesPerSecond?: number;
  language?: string;
  voiceId?: string;
  quality?: "draft" | "standard" | "high";
  style?: string;
}

// ── Media job statuses ───────────────────────────────────────────────────

export type MediaJobState =
  | "queued"
  | "planning"
  | "running"
  | "awaiting_upload"
  | "awaiting_approval"
  | "processing"
  | "completed"
  | "failed"
  | "canceled"
  | "expired";

export const TERMINAL_MEDIA_JOB_STATUSES: MediaJobState[] = ["completed", "failed", "canceled"];
export const ACTIVE_MEDIA_JOB_STATUSES: MediaJobState[] = ["queued", "planning", "running"];
export const CANCELABLE_MEDIA_JOB_STATUSES: MediaJobState[] = ["queued", "planning", "running"];
export const RETRYABLE_MEDIA_JOB_STATUSES: MediaJobState[] = ["failed"];

export type MediaJobStatus = MediaJobState;

// ── Media job ────────────────────────────────────────────────────────────

export type MediaJobResultModality = "image" | "video" | "audio";

export interface MediaJobResultMetadata {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fileSizeBytes: number;
  mimeType: string;
  format: string;
  label: string;
  extra: Record<string, unknown> | null;
  prompt?: string;
  style?: string;
  negativePrompt?: string;
}

export interface MediaJobResult {
  modality: MediaJobResultModality;
  assetUrl: string;
  previewUrl: string | null;
  metadata: MediaJobResultMetadata;
  generatedAt: string;
  isMock: boolean;
}

export interface MediaJob {
  id: string;
  sessionId?: string | null;
  status: MediaJobState;
  state: MediaJobState;
  mode: MediaMode | null;
  modality: MediaModality;
  toolId?: string;
  capability: string;
  modelId: string;
  modelName: string;
  providerId: string;
  providerName: string;
  prompt: string | null;
  negativePrompt: string | null;
  params: MediaParams | null;
  config: MediaGenerationConfig | null;
  projectId: string | null;
  resultUrl?: string | null;
  assetId: string | null;
  result: MediaJobResult | null;
  error: ProviderError | string | null;
  progress: number;
  fallbackUsed?: boolean;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  estimatedCredits?: number | null;
  createdAt: string;
  startedAt?: string | null;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  retryCount?: number;
  originalJobId: string | null;
  initiatedBy: string | null;

  /** Provider-side job identifier (e.g. OpenAI generation ID). */
  providerJobId?: string | null;
  /** Credits actually charged (once settled by ledger). */
  chargedCredits?: number | null;
  /** Ledger settlement status for this job's credits. */
  creditSettlementStatus?: string | null;
  /** Trace/session identifier for linking jobs across providers. */
  traceId?: string | null;
  /** Confidence level of the credit estimate. */
  creditEstimateConfidence?: "exact" | "estimated" | "unknown" | null;
  /** Whether the output asset is usable/valid. */
  usable?: boolean | null;
  /** Whether the job output was discarded/wasted. */
  waste?: boolean | null;
}

// ── Media asset ──────────────────────────────────────────────────────────

export type MediaAssetType = "image" | "video" | "audio" | "game_asset";

export interface MediaAsset {
  id: string;
  projectId: string | null;
  /** Immutable owner binding for private-beta local repositories. */
  ownerId?: string | null;
  jobId: string | null;
  sessionId?: string | null;
  type: MediaAssetType;
  /** Kind of asset (used by assets.ts module). */
  kind?: string;
  modality?: MediaModality;
  /** Human-readable title for this asset. */
  title?: string;
  /** The toolId that generated this asset. */
  toolId?: string;
  /** Reference to a safety audit trace. */
  safetyTraceId?: string | null;
  /** Estimated or actual cost for generating this asset. */
  costEstimate?: number | null;
  url: string | null;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  duration?: number | null;
  durationSeconds?: number | null;
  fileSize?: number | null;
  aspectRatio?: string | null;
  voice?: string | null;
  language?: string | null;
  tone?: string | null;
  outputFormat?: string | null;
  modelId?: string | null;
  modelName?: string;
  providerId?: string | null;
  providerName?: string;
  prompt?: string | null;
  negativePrompt?: string | null;
  seed?: number | null;
  metadata?: Record<string, unknown> | null;
  params?: MediaParams | null;
  source?: string;
  isMock?: boolean;
  favorite?: boolean;
  tags?: string[];
  fileSizeBytes?: number;
  createdAt: string;
  updatedAt?: string | null;
  filename?: string;
}

// ── Media project ────────────────────────────────────────────────────────

// Legacy type aliases for UI components
export type MediaImageAsset = MediaAsset;
export type MediaVideoAsset = MediaAsset;
export type MediaAudioAsset = MediaAsset;

export type MediaProjectStatus = "draft" | "active" | "archived";

export type MediaProjectKind =
  | "campaign"
  | "product_shoot"
  | "product_launch"
  | "video_concept"
  | "ai_influencer_profile"
  | "character_pack"
  | "brand_kit"
  | "moodboard"
  | "game_asset_pack"
  | "storyboard"
  | "ad_creative_set";

export interface MediaProject {
  id: string;
  /** Immutable owner binding. Production tenancy additionally requires database RLS. */
  ownerId?: string | null;
  name: string;
  description: string | null;
  kind: MediaProjectKind;
  status: MediaProjectStatus;
  modality: MediaModality | null;
  assetIds: string[];
  jobIds: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ── Provider types ───────────────────────────────────────────────────────

export type ProviderMode = "live" | "mock" | "setup-required" | "disabled" | "fallback";
export type ProviderTrustLabel = "live" | "mock" | "setup_required" | "not_provided" | "disabled" | "failed" | "fallback" | "unavailable";

export type MediaProviderStatusValue =
  | "mock"
  | "setup-required"
  | "live"
  | "failed"
  | "fallback"
  | "provider-unavailable"
  | "disabled";

export interface MediaProviderInfo {
  id: string;
  label: string;
  modality: MediaModality | "multi";
  status: MediaProviderStatusValue;
  configured: boolean;
  setupRequired: boolean;
  setupRequiredReason?: string;
  /** Capabilities this provider covers. */
  capabilities?: string[];
  /** Fallback provider id used when this provider is unavailable. */
  fallbackProviderId?: string;
}

export interface MediaProviderStatus {
  id: string;
  label: string;
  modality: MediaModality | "multi";
  mode: ProviderMode;
  available: boolean;
  configured: boolean;
  setupRequired: boolean;
  setupRequiredReason?: string;
  lastCheckedAt: string;
  trust: ProviderTrustLabel;
  /** Capabilities this provider covers. */
  capabilities?: string[];
  /** Fallback provider id used when this provider is unavailable. */
  fallbackProviderId?: string;
}

// ── Provider errors ──────────────────────────────────────────────────────

export type ProviderErrorCode =
  | "provider_unavailable"
  | "setup_required"
  | "invalid_request"
  | "rate_limited"
  | "moderation_blocked"
  | "insufficient_credits"
  | "timeout"
  | "provider_failed"
  | "unknown";

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  retryable: boolean;
  statusCode: number;
}

export const PROVIDER_ERROR_LABELS: Record<ProviderErrorCode, string> = {
  provider_unavailable: "Provider unavailable",
  setup_required: "Setup required",
  invalid_request: "Invalid request",
  rate_limited: "Rate limited",
  moderation_blocked: "Blocked by moderation",
  insufficient_credits: "Insufficient credits",
  timeout: "Request timed out",
  provider_failed: "Provider error",
  unknown: "Unknown error",
};

// ── Generation request / response ────────────────────────────────────────

export interface CreditEstimate {
  estimatedCredits: number;
  modelId: string | null;
  note: string | null;
}

export interface MediaGenerationRequest {
  modality?: MediaModality;
  prompt: string;
  negativePrompt?: string | null;
  mode?: MediaMode | null;
  modelId?: string | null;
  providerId?: string | null;
  capability?: string | null;
  sessionId?: string | null;
  /** STU-P0-04: approval token for consent-required workflows. */
  approvalToken?: string | null;
  projectId?: string | null;
  params?: MediaParams | null;
  config?: MediaGenerationConfig | null;
  initiatedBy?: string | null;
  style?: string;
  size?: string;
  durationSeconds?: number;
  seed?: number;
  extraParams?: Record<string, unknown>;
  qualityPreference?: "starter" | "balanced" | "premium";
  latencyPreference?: "fast" | "balanced" | "patient";
  /** Reference image URL for image-to-video (and future image-to-X) capabilities. */
  imageUrl?: string | null;
}

export interface MediaGenerationResponse {
  ok: boolean;
  job: MediaJob;
  provider?: {
    id: string;
    label: string;
    mode: ProviderMode;
    selectedModelId: string;
    fallbackUsed: boolean;
    trust: ProviderTrustLabel;
  };
  metadata?: {
    estimatedCredits: number | null;
    setupRequiredReason?: string;
  };
  jobId?: string;
  assetIds?: string[];
  state?: MediaJobState;
  urls?: string[];
  createdAt?: string;
  estimatedCredits?: number | null;
  asset?: MediaAsset | null;
  error?: string | null;
  providerAvailable?: boolean;
  providerName?: string;
  modelName?: string;
}

// ── API response envelopes ───────────────────────────────────────────────

export interface GenerateResponse {
  ok: boolean;
  data?: MediaGenerationResponse;
  error?: string;
}

export interface JobResponse {
  ok: boolean;
  data?: MediaJob;
  error?: string;
}

export interface JobListResponse {
  ok: boolean;
  data?: MediaJob[];
  error?: string;
}

export interface AssetsResponse {
  ok: boolean;
  data?: MediaAsset[];
  error?: string;
}

export interface ProjectsResponse {
  ok: boolean;
  data?: MediaProject[];
  error?: string;
}

export interface ProviderStatusResponse {
  ok: boolean;
  data?: MediaProviderInfo[];
  error?: string;
}

// ── Pricing / eval ───────────────────────────────────────────────────────

export interface MediaPricingEstimate {
  estimated: boolean;
  minCredits: number;
  maxCredits: number;
  perUnit: string;
}

export interface MediaEvalScores {
  overall: number;
  relevance: number;
  coherence: number;
  safety: number;
  imageQuality?: number | null;
  promptAdherence?: number | null;
  videoCoherence?: number | null;
  motionQuality?: number | null;
  identityConsistency?: number | null;
  audioQuality?: number | null;
  latency?: number | null;
  estimatedCost?: number | null;
  userSatisfaction?: number | null;
}

export interface MediaEvalMetadata {
  jobId: string;
  modality?: string;
  scores: MediaEvalScores;
  notes: string[];
  label?: string;
  generatedAt?: string;
  isMock?: boolean;
}

// ── Safety types ─────────────────────────────────────────────────────────

export type MediaSafetyCategory =
  | "face_swap"
  | "character_swap"
  | "voice_change"
  | "voice_cloning"
  | "identity_voiceover"
  | "public_figures"
  | "minors"
  | "impersonation"
  | "deceptive_ads"
  | "copyrighted_style"
  | "copyright_style_copying"
  | "product_claims"
  | "fake_product_claims"
  | "uploaded_media"
  | "external_publishing";

export type MediaSafetyGateOutcome =
  | "allowed"
  | "warn"
  | "consent_required"
  | "approval_required"
  | "setup_required"
  | "blocked";

export interface MediaSafetyGateResult {
  outcome: MediaSafetyGateOutcome;
  triggeredCategories: MediaSafetyCategory[];
  reasons: string[];
  messages: string[];
  requiresConsent: boolean;
  requiresApproval: boolean;
  blocked: boolean;
  warnOnly: boolean;
}

export type MediaWorkflowId = import("./safety-types").MediaWorkflowId;

export const MEDIA_SAFETY_CATEGORY_LABELS: Record<MediaSafetyCategory, string> = {
  face_swap: "Face Swap",
  character_swap: "Character Swap",
  voice_change: "Voice Change",
  voice_cloning: "Voice Cloning",
  identity_voiceover: "Identity Voiceover",
  public_figures: "Public Figures",
  minors: "Minors",
  impersonation: "Impersonation",
  deceptive_ads: "Deceptive Ads",
  copyrighted_style: "Copyrighted Style",
  copyright_style_copying: "Copyright Style Copying",
  product_claims: "Product Claims",
  fake_product_claims: "Fake Product Claims",
  uploaded_media: "Uploaded Media",
  external_publishing: "External Publishing",
};

export const GATE_OUTCOME_LABELS: Record<MediaSafetyGateOutcome, string> = {
  allowed: "Allowed",
  warn: "Warning",
  consent_required: "Consent Required",
  approval_required: "Approval Required",
  setup_required: "Setup Required",
  blocked: "Blocked",
};

export const MEDIA_WORKFLOW_LABELS: Record<string, string> = {
  "media.generate_image": "Generate Image",
  "media.edit_image": "Edit Image",
  "media.upscale_image": "Upscale Image",
  "media.inpaint_image": "Inpaint Image",
  "media.relight_image": "Relight Image",
  "media.generate_video": "Generate Video",
  "media.image_to_video": "Image to Video",
  "media.edit_video": "Edit Video",
  "media.upscale_video": "Upscale Video",
  "media.generate_voiceover": "Generate Voiceover",
  "media.translate_speech": "Translate Speech",
  "media.change_voice": "Change Voice",
  "media.create_project": "Create Project",
  "media.save_asset": "Save Asset",
  "media.list_assets": "List Assets",
  "media.get_asset": "Get Asset",
  "media.export_asset": "Export Asset",
  "media.generate_sound_effect": "Generate Sound Effect",
  "media.generate_music_bed": "Generate Music Bed",
  "media.generate_game_asset": "Generate Game Asset",
  "media.generate_sprite_pack": "Generate Sprite Pack",
  "media.generate_character_pack": "Generate Character Pack",
  "media.generate_game_ui": "Generate Game UI",
  "media.train_character": "Train Character",
  "media.virality_score": "Virality Score",
  "media.product_url_to_ad": "Product URL to Ad",
};

export interface MediaSafetyAuditTrace {
  promptMetadata: {
    prompt: string;
    negativePrompt?: string | null;
    style?: string | null;
  };
  providerMetadata: { provider: string; modelId: string } | null;
  safetyGateResult: MediaSafetyGateResult;
  consentAccepted: boolean;
  approvalRequired: boolean;
  blockedReason: string | null;
  timestamp: string;
}

export interface MediaJobSafetyMeta {
  safetyGateResult: MediaSafetyGateResult;
  consentAccepted: boolean;
  consentAcceptedAt: string | null;
  approvalRequired: boolean;
  approvalRequestId: string | null;
  blockedReason: string | null;
  readPhaseCompleted: boolean;
  proposePhaseCompleted: boolean;
  executeConfirmed: boolean;
  safetyCheckedAt: string;
}

