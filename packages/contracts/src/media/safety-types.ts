// ── Media Safety Categories ────────────────────────────────────────────────────

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

export const MEDIA_SAFETY_CATEGORY_LABELS: Record<MediaSafetyCategory, string> = {
  face_swap: "Face Swap",
  character_swap: "Character Swap",
  voice_change: "Voice Change",
  voice_cloning: "Voice Cloning",
  identity_voiceover: "Identity-Based Voiceover",
  public_figures: "Public Figures",
  minors: "Minors",
  impersonation: "Impersonation",
  deceptive_ads: "Deceptive Ads",
  copyrighted_style: "Copyrighted Style Imitation",
  product_claims: "Product Claims",
  fake_product_claims: "Fake Product Claims",
  copyright_style_copying: "Copyright Style Copying",
  uploaded_media: "Uploaded Media",
  external_publishing: "External Publishing",
};

export type MediaSafetyGateOutcome =
  | "allowed"
  | "warn"
  | "consent_required"
  | "approval_required"
  | "blocked"
  | "setup_required";

export const GATE_OUTCOME_LABELS: Record<MediaSafetyGateOutcome, string> = {
  allowed: "Allowed \u2014 safe to proceed",
  warn: "Warning \u2014 proceed with caution",
  consent_required: "Consent Required \u2014 user must explicitly confirm",
  approval_required: "Approval Required \u2014 human review needed",
  blocked: "Blocked \u2014 action prevented",
  setup_required: "Setup Required \u2014 missing configuration",
};

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

export type MediaWorkflowId =
  | "media.generate_image"
  | "media.edit_image"
  | "media.upscale_image"
  | "media.inpaint_image"
  | "media.relight_image"
  | "media.generate_video"
  | "media.image_to_video"
  | "media.edit_video"
  | "media.upscale_video"
  | "media.generate_voiceover"
  | "media.translate_speech"
  | "media.change_voice"
  | "media.create_project"
  | "media.save_asset"
  | "media.list_assets"
  | "media.get_asset"
  | "media.export_asset"
  | "media.train_character"
  | "media.virality_score"
  | "media.product_url_to_ad";

export const MEDIA_WORKFLOW_LABELS: Record<MediaWorkflowId, string> = {
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
  "media.train_character": "Train Character",
  "media.virality_score": "Virality Score",
  "media.product_url_to_ad": "Product URL to Ad",
};

// ── Media Safety Audit Trace ────────────────────────────────────────────────────

export interface MediaSafetyAuditTrace {
  promptMetadata: {
    prompt: string;
    negativePrompt?: string | null;
    style?: string | null;
  };
  providerMetadata: {
    provider: string;
    modelId: string;
  } | null;
  safetyGateResult: MediaSafetyGateResult;
  consentAccepted: boolean;
  approvalRequired: boolean;
  blockedReason: string | null;
  timestamp: string;
}

// ── Safety-aware job metadata extension ─────────────────────────────────────────

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