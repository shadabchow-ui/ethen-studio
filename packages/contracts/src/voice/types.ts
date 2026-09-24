export type VoiceRoutingMode =
  | "balanced"
  | "best_quality"
  | "fastest"
  | "lowest_cost"
  | "private"
  | "fallback"
  | "manual";

/**
 * Privacy / local processing mode for voice requests.
 * Maps to what actually happens with audio data.
 */
export type VoicePrivacyMode =
  | "fully_local"     // All audio stays on-device
  | "stt_local_llm_cloud"  // Transcription local, LLM cloud
  | "tts_cloud"       // TTS in cloud
  | "hosted"          // Entirely hosted
  | "hybrid"          // Mixed local + cloud
  | "unavailable";    // No local runtime

export type VoiceProviderId =
  | "mock"
  | "openai"
  | "elevenlabs"
  | "cartesia"
  | "deepgram"
  | "assemblyai"
  | "twilio"
  | "local";

export type VoiceOrbState = "idle" | "connecting" | "listening" | "speaking" | "muted";
export type VoiceOrbVariant = "default" | "blue" | "violet" | "emerald";

export interface VoiceProviderCapabilities {
  tts: boolean;
  stt: boolean;
  realtime: boolean;
  cloning: boolean;
  local: boolean;
}

export interface VoiceGenerationRequest {
  script: string;
  routingMode: VoiceRoutingMode;
  providerId?: VoiceProviderId;
  modelId?: string;
  voiceId: string;
}

export interface VoiceGenerationRecord {
  id: string;
  createdAt: string;
  status: "pending" | "generating" | "done" | "error";
  script: string;
  providerId?: VoiceProviderId;
  modelId?: string;
  voiceId: string;
  voiceLabel: string;
  routingMode: VoiceRoutingMode;
  characterCount: number;
  durationMs?: number;
  audioUrl: string | null;
  error?: string;
  format?: "mp3" | "wav" | "opus";
  estimatedCost?: number;
  fallbackUsed?: boolean;
  routeReason?: string;
}

export interface IVoiceProvider {
  id: VoiceProviderId;
  capabilities: VoiceProviderCapabilities;
  generateSpeech(req: VoiceGenerationRequest): Promise<VoiceGenerationRecord>;
}

export interface VoiceRouterResult {
  selectedProviderId: VoiceProviderId;
  reason: string;
}

export interface VoiceModel {
  id: string;
  label: string;
  providerId: VoiceProviderId;
  description?: string;
}

export interface VoiceCatalogItem {
  id: string;
  name: string;
  provider: VoiceProviderId;
  gender: "male" | "female" | "neutral";
  accent?: string;
  tags?: string[];
  previewUrl?: string;
  description?: string;
}

export interface SpeechSynthesisRequest {
  text: string;
  provider?: VoiceProviderId;
  model?: string;
  voiceId?: string;
  routingMode?: VoiceRoutingMode;
  format?: "mp3" | "wav" | "opus";
  speed?: number;
}

export interface SpeechSynthesisResult {
  ok: boolean;
  id: string;
  provider: VoiceProviderId;
  model: string;
  voiceId: string;
  audioBase64?: string;
  audioUrl?: string;
  durationSeconds?: number;
  format: "mp3" | "wav" | "opus";
  estimatedCost?: number;
  actualCost?: number;
  fallbackUsed?: boolean;
  routeReason?: string;
  createdAt: string;
}

export interface SpeechGenerationItem {
  id: string;
  text: string;
  provider: VoiceProviderId;
  model: string;
  voiceId: string;
  routingMode: VoiceRoutingMode;
  fallbackUsed: boolean;
  routeReason?: string;
  cost?: number;
  durationSeconds?: number;
  createdAt: string;
  audioBase64: string;
  format: "mp3" | "wav" | "opus";
}

export interface VoicePersona {
  id: string;
  label: string;
  providerId: string;
  gender?: string;
  accent?: string;
  tags?: string[];
}

export interface SpeechSynthesisAdapterRequest {
  text: string;
  model: string;
  voiceId: string;
  format?: "mp3" | "wav" | "opus";
  speed?: number;
}

export interface SpeechSynthesisAdapterResult {
  audioBase64: string;
  format: "mp3" | "wav" | "opus";
  characterCount: number;
  durationSeconds: number | null;
}

export interface IVoiceServerAdapter {
  readonly id: VoiceProviderId;
  readonly label: string;
  readonly configured: boolean;
  readonly capabilities: VoiceProviderCapabilities;
  synthesizeSpeech(req: SpeechSynthesisAdapterRequest): Promise<SpeechSynthesisAdapterResult>;
  listVoices(): Promise<VoiceCatalogItem[]>;
}

export interface VoiceGenerationSettings {
  speed: number;
  stability: number;
  clarity: number;
  style: number;
}

// ─── Voice Agent Configuration Types ─────────────────────────────────────────

export type VoiceAgentStatus = "draft" | "test" | "live";

export interface VoiceAgentInstructions {
  role: string;
  goals: string[];
  allowedActions: string[];
  escalationRules: string[];
  tone: string;
  dataBoundaries: string[];
  failureBehavior: string[];
  handoffBehavior: string[];
  rawInstructions: string;
}

export interface VoiceAgentSafety {
  humanHandoffRequired: boolean;
  approvalRequiredForStateChangingActions: boolean;
  externalActionsDisabled: boolean;
  cloningDisabled: boolean;
}

export interface VoiceAgentHandoff {
  enabled: boolean;
  conditions: string[];
  targetType: "human" | "agent" | "workflow";
}

export interface VoiceAgentConfig {
  id: string;
  name: string;
  description: string;
  status: VoiceAgentStatus;
  providerId: VoiceProviderId | string;
  modelId: string;
  voiceId: string;
  routingMode: VoiceRoutingMode | string;
  language: string;
  instructions: VoiceAgentInstructions;
  safety: VoiceAgentSafety;
  handoff: VoiceAgentHandoff;
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_INSTRUCTIONS: VoiceAgentInstructions = {
  role: "",
  goals: [],
  allowedActions: [],
  escalationRules: [],
  tone: "",
  dataBoundaries: [],
  failureBehavior: [],
  handoffBehavior: [],
  rawInstructions: "",
};

export const DEFAULT_SAFETY: VoiceAgentSafety = {
  humanHandoffRequired: false,
  approvalRequiredForStateChangingActions: false,
  externalActionsDisabled: false,
  cloningDisabled: false,
};

export const DEFAULT_HANDOFF: VoiceAgentHandoff = {
  enabled: false,
  conditions: [],
  targetType: "human",
};

// ─── Phone / Telephony Agent Types ──────────────────────────────────────────

export type PhoneProviderId = "twilio" | "telnyx" | "sip";

export type PhoneProviderSetupStatus =
  | "not_configured"
  | "credentials_missing"
  | "phone_number_missing"
  | "webhook_not_configured"
  | "ready";

export type PhoneNumberStatus =
  | "not_provisioned"
  | "provisioning"
  | "active"
  | "suspended"
  | "released";

export type PhoneInboundRoutingStatus =
  | "not_configured"
  | "configured"
  | "testing"
  | "active";

export type PhoneRecordingConsentState =
  | "disabled"
  | "required"
  | "always_on"
  | "per_call";

export type PhoneTransferMode =
  | "none"
  | "human"
  | "agent"
  | "workflow";

export interface PhoneProviderConfig {
  providerId: PhoneProviderId;
  label: string;
  description: string;
  setupStatus: PhoneProviderSetupStatus;
  phoneNumberStatus: PhoneNumberStatus;
  phoneNumber: string | null;
  inboundRoutingStatus: PhoneInboundRoutingStatus;
  webhookUrl: string | null;
  configured: boolean;
  available: boolean;
}

export interface PhoneAgentConfig {
  id: string;
  name: string;
  description: string;
  providerId: PhoneProviderId | "none";
  voiceAgentId: string | null;
  phoneNumber: string | null;
  inboundRoutingEnabled: boolean;
  recordingConsent: PhoneRecordingConsentState;
  transferMode: PhoneTransferMode;
  transferTarget: string | null;
  status: "setup_required" | "ready" | "live";
  createdAt: string;
  updatedAt: string;
}

export interface PhoneConfigResponse {
  ok: boolean;
  providers: PhoneProviderConfig[];
  phoneAgents: PhoneAgentConfig[];
  phoneTransportImplemented: boolean;
  note: string;
}

// ─── Marketplace / Licensing Types ──────────────────────────────────────────

export type VoiceLicenseType =
  | "commercial"
  | "non_commercial"
  | "personal"
  | "enterprise"
  | "research"
  | "custom";

export type VoiceLicenseStatus =
  | "active"
  | "expired"
  | "revoked"
  | "pending_review"
  | "restricted";

export type VoiceCreatorVerificationStatus =
  | "verified"
  | "pending"
  | "rejected"
  | "not_applied"
  | "not_configured";

export type VoiceModerationStatus =
  | "approved"
  | "flagged"
  | "under_review"
  | "takedown_requested"
  | "taken_down"
  | "not_configured";

export type VoiceConsentStatus =
  | "consent_recorded"
  | "consent_pending"
  | "consent_missing"
  | "not_applicable"
  | "not_configured";

export interface VoiceLicenseTerms {
  type: VoiceLicenseType;
  status: VoiceLicenseStatus;
  permittedUse: string[];
  restrictedUse: string[];
  commercialRights: boolean;
  attributionRequired: boolean;
  territory: string[];
  expiresAt: string | null;
  issuedBy: string;
  issuedAt: string;
  notes: string | null;
}

export interface VoiceCreatorProfile {
  id: string;
  name: string;
  verificationStatus: VoiceCreatorVerificationStatus;
  verifiedAt: string | null;
  verificationMethod: string | null;
  submittedVoices: number;
  licensedVoices: number;
  joinedAt: string;
}

export interface VoiceMarketplaceItem {
  id: string;
  /** VoiceCatalogItem.id reference */
  voiceId: string;
  voiceName: string;
  provider: string;
  creator: VoiceCreatorProfile | null;
  license: VoiceLicenseTerms;
  moderationStatus: VoiceModerationStatus;
  consentStatus: VoiceConsentStatus;
  previewUrl: string | null;
  listedAt: string;
  updatedAt: string;
}

export interface MarketplaceChecklistItem {
  id: string;
  label: string;
  description: string;
  status: "ready" | "not_configured" | "in_progress" | "blocked";
  required: boolean;
}

export interface MarketplaceCatalog {
  items: VoiceMarketplaceItem[];
  meta: {
    totalLicensed: number;
    verifiedCreators: number;
    pendingReview: number;
    isLive: boolean;
    mode: "preview" | "controlled" | "live";
    note: string;
  };
}

// ─── Voice Cloning Consent Types ─────────────────────────────────────────────

export type ConsentStatus = "active" | "revoked" | "expired" | "needs_review";

export type ConsentScope =
  | "personal_use"
  | "team_use"
  | "commercial_use"
  | "research";

export type ConsentEligibilityLabel =
  | "user_declared_owns_voice"
  | "user_declared_has_permission"
  | "needs_documentation"
  | "needs_review";

export interface VoiceConsentRecord {
  id: string;
  projectId: string;
  userId: string;
  /** User-declared: the voice sample owner (could be self, another person, or organization) */
  ownerName: string;
  /** User-declared: relationship of the user to the voice owner */
  ownerRelationship: string;
  consentStatus: ConsentStatus;
  consentScope: ConsentScope;
  /** Providers the user has approved for cloning use */
  allowedProviders: string[];
  /** ISO timestamp when consent was recorded */
  consentedAt: string;
  /** ISO timestamp when consent was revoked, if applicable */
  revokedAt: string | null;
  /** Version of the terms accepted */
  termsVersion: string;
  /** User-declared: not a public figure / celebrity */
  notPublicFigure: boolean;
  /** User-declared: understands usage scope */
  understandsScope: boolean;
  /** User-declared: agrees to generated voice use */
  agreesToUsage: boolean;
  /** User-declared: understands revocation period */
  understandsRevocation: boolean;
  /** Commercial rights declaration — user-declared, not verified */
  commercialRightsLabel: ConsentEligibilityLabel;
  /** Provider scope eligibility — derived from allowedProviders */
  providerScopeLabel: ConsentEligibilityLabel;
  /** Abuse report reference if flagged */
  abuseReportRef: string | null;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp */
  updatedAt: string;
}

export interface VoiceConsentCreatePayload {
  ownerName: string;
  ownerRelationship: string;
  consentScope: ConsentScope;
  allowedProviders: string[];
  termsVersion: string;
  notPublicFigure: boolean;
  understandsScope: boolean;
  agreesToUsage: boolean;
  understandsRevocation: boolean;
}

export interface VoiceCustomVoice {
  id: string;
  name: string;
  /** Whether this voice has valid consent on file */
  consentVerified: boolean;
  /** Whether this voice is eligible for cloning (consent + provider support) */
  cloningEligible: boolean;
  /** Human-readable reason for ineligibility */
  cloningIneligibleReason: string | null;
  consentRef: string | null;
  createdAt: string;
}

export function createEmptyAgentConfig(
  overrides?: Partial<VoiceAgentConfig>,
): VoiceAgentConfig {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2, 15),
    name: "Untitled Agent",
    description: "",
    status: "draft",
    providerId: "mock",
    modelId: "mock-tts-standard",
    voiceId: "mock-voice-female",
    routingMode: "manual",
    language: "en",
    instructions: { ...EMPTY_INSTRUCTIONS },
    safety: { ...DEFAULT_SAFETY },
    handoff: { ...DEFAULT_HANDOFF },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// Compatibility barrel for the previously monolithic voice contract path.
// Deployable apps import this public subpath; keep the split contract modules
// reachable here without importing any app implementation back into packages.
export * from "./registry";
export * from "./creation";
export * from "./dubbing";
export * from "./jobs";
export * from "./transcription";
export * from "./realtime-types";
export * from "./consent";
export * from "./provenance";
export * from "./storage";
export * from "./usage";
