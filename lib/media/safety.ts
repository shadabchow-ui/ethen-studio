import type {
  MediaSafetyCategory,
  MediaSafetyGateOutcome,
  MediaSafetyGateResult,
  MediaWorkflowId,
} from "./safety-types";
import type { MediaMode, MediaCapability } from "./types";

export interface SafetyClassifierInput {
  workflowId: MediaWorkflowId;
  mode?: MediaMode | null;
  capability?: MediaCapability | null;
  prompt: string;
  usesFaceSwap?: boolean;
  usesCharacterSwap?: boolean;
  usesVoiceChange?: boolean;
  usesVoiceCloning?: boolean;
  targetsPublicFigure?: boolean;
  involvesMinors?: boolean;
  isImpersonation?: boolean;
  isDeceptiveAd?: boolean;
  imitatesCopyrightedStyle?: boolean;
  makesProductClaims?: boolean;
  hasUploadedMedia?: boolean;
  targetsExternalPublishing?: boolean;
}

const WORKFLOW_RISK_MAP: Record<MediaWorkflowId, MediaSafetyCategory[]> = {
  "media.generate_image": [],
  "media.edit_image": ["uploaded_media"],
  "media.upscale_image": [],
  "media.inpaint_image": ["uploaded_media"],
  "media.relight_image": [],
  "media.generate_video": [],
  "media.image_to_video": ["uploaded_media"],
  "media.edit_video": ["uploaded_media"],
  "media.upscale_video": [],
  "media.generate_voiceover": ["identity_voiceover"],
  "media.translate_speech": [],
  "media.change_voice": ["voice_change"],
  "media.create_project": [],
  "media.save_asset": [],
  "media.list_assets": [],
  "media.get_asset": [],
  "media.export_asset": ["external_publishing"],
  "media.train_character": ["uploaded_media"],
  "media.virality_score": [],
  "media.product_url_to_ad": ["product_claims", "copyrighted_style"],
};

export function classifyMediaSafety(input: SafetyClassifierInput): MediaSafetyGateResult {
  const triggered: MediaSafetyCategory[] = [];
  const reasons: string[] = [];
  const messages: string[] = [];

  const baseCategories = WORKFLOW_RISK_MAP[input.workflowId] ?? [];
  for (const cat of baseCategories) {
    if (!triggered.includes(cat)) triggered.push(cat);
  }

  if (input.usesFaceSwap && !triggered.includes("face_swap")) {
    triggered.push("face_swap");
  }
  if (input.usesCharacterSwap && !triggered.includes("character_swap")) {
    triggered.push("character_swap");
  }
  if (input.usesVoiceChange && !triggered.includes("voice_change")) {
    triggered.push("voice_change");
  }
  if (input.usesVoiceCloning && !triggered.includes("voice_cloning")) {
    triggered.push("voice_cloning");
  }
  if (input.targetsPublicFigure && !triggered.includes("public_figures")) {
    triggered.push("public_figures");
  }
  if (input.involvesMinors && !triggered.includes("minors")) {
    triggered.push("minors");
  }
  if (input.isImpersonation && !triggered.includes("impersonation")) {
    triggered.push("impersonation");
  }
  if (input.isDeceptiveAd && !triggered.includes("deceptive_ads")) {
    triggered.push("deceptive_ads");
  }
  if (input.imitatesCopyrightedStyle && !triggered.includes("copyrighted_style")) {
    triggered.push("copyrighted_style");
  }
  if (input.makesProductClaims && !triggered.includes("product_claims")) {
    triggered.push("product_claims");
  }
  if (input.hasUploadedMedia && !triggered.includes("uploaded_media")) {
    triggered.push("uploaded_media");
  }
  if (input.targetsExternalPublishing && !triggered.includes("external_publishing")) {
    triggered.push("external_publishing");
  }

  const hasFaceSwap = triggered.includes("face_swap");
  const hasCharacterSwap = triggered.includes("character_swap");
  const hasVoiceCloning = triggered.includes("voice_cloning");
  const hasVoiceChange = triggered.includes("voice_change");
  const hasIdentityVoiceover = triggered.includes("identity_voiceover");
  const hasPublicFigures = triggered.includes("public_figures");
  const hasMinors = triggered.includes("minors");
  const hasImpersonation = triggered.includes("impersonation");
  const hasDeceptiveAds = triggered.includes("deceptive_ads");
  const hasCopyrightedStyle = triggered.includes("copyrighted_style");
  const hasProductClaims = triggered.includes("product_claims");
  const hasExternalPublishing = triggered.includes("external_publishing");

  if (hasMinors) {
    reasons.push("This workflow involves minors and is blocked for identity manipulation.");
    messages.push("This workflow is blocked for minors or sexualized identity manipulation.");
  }

  if (hasImpersonation) {
    reasons.push("Impersonation use is blocked.");
    messages.push("Do not use generated media for deception, impersonation, or unsupported product claims.");
  }

  if (hasDeceptiveAds) {
    reasons.push("Deceptive advertising use is blocked.");
    messages.push("Do not use generated media for deception, impersonation, or unsupported product claims.");
  }

  if (hasFaceSwap || hasCharacterSwap) {
    reasons.push("Consent required before identity-based generation.");
    messages.push("Consent required before identity-based generation.");
  }

  if (hasVoiceCloning || hasVoiceChange || hasIdentityVoiceover) {
    reasons.push("Consent required before identity-based voice/voiceover generation.");
    messages.push("Consent required before identity-based generation.");
  }

  if (hasPublicFigures) {
    reasons.push("Public figure generation requires explicit consent and may carry legal risk.");
    messages.push("Generating media depicting public figures requires explicit consent.");
  }

  if (hasCopyrightedStyle) {
    reasons.push("Imitation of copyrighted styles may carry legal risk.");
  }

  if (hasProductClaims) {
    reasons.push("Generated product claims must be reviewed for accuracy and regulatory compliance.");
    messages.push("Product claims in generated media must be reviewed before use.");
  }

  if (hasExternalPublishing) {
    reasons.push("External publishing requires review before distribution.");
    messages.push("Review generated media before external publishing.");
  }

  let outcome: MediaSafetyGateOutcome;
  let requiresConsent = false;
  const requiresApproval = false;
  let blocked = false;
  let warnOnly = false;

  if (hasMinors) {
    outcome = "blocked";
    blocked = true;
  } else if (hasImpersonation) {
    outcome = "blocked";
    blocked = true;
  } else if (hasDeceptiveAds) {
    outcome = "blocked";
    blocked = true;
  } else if (hasFaceSwap || hasCharacterSwap || hasVoiceCloning || hasVoiceChange || hasIdentityVoiceover || hasPublicFigures) {
    outcome = "consent_required";
    requiresConsent = true;
  } else if (hasProductClaims || hasCopyrightedStyle || hasExternalPublishing) {
    outcome = "warn";
    warnOnly = true;
  } else if (triggered.length === 0) {
    outcome = "allowed";
  } else {
    outcome = "warn";
    warnOnly = true;
  }

  return {
    outcome,
    triggeredCategories: triggered,
    reasons,
    messages,
    requiresConsent,
    requiresApproval,
    blocked,
    warnOnly,
  };
}

export function mergeGateOutcomes(results: MediaSafetyGateResult[]): MediaSafetyGateResult {
  if (results.length === 0) {
    return {
      outcome: "allowed",
      triggeredCategories: [],
      reasons: [],
      messages: [],
      requiresConsent: false,
      requiresApproval: false,
      blocked: false,
      warnOnly: false,
    };
  }

  const outcomePriority: Record<MediaSafetyGateOutcome, number> = {
    blocked: 6,
    approval_required: 5,
    consent_required: 4,
    setup_required: 3,
    warn: 2,
    allowed: 1,
  };

  let worstOutcome: MediaSafetyGateOutcome = "allowed";
  let worstPriority = 1;

  const allTriggered: MediaSafetyCategory[] = [];
  const allReasons: string[] = [];
  const allMessages: string[] = [];

  for (const r of results) {
    for (const cat of r.triggeredCategories) {
      if (!allTriggered.includes(cat)) allTriggered.push(cat);
    }
    for (const reason of r.reasons) {
      if (!allReasons.includes(reason)) allReasons.push(reason);
    }
    for (const msg of r.messages) {
      if (!allMessages.includes(msg)) allMessages.push(msg);
    }
    const priority = outcomePriority[r.outcome] ?? 1;
    if (priority > worstPriority) {
      worstPriority = priority;
      worstOutcome = r.outcome;
    }
  }

  return {
    outcome: worstOutcome,
    triggeredCategories: allTriggered,
    reasons: allReasons,
    messages: allMessages,
    requiresConsent: results.some((r) => r.requiresConsent),
    requiresApproval: results.some((r) => r.requiresApproval),
    blocked: results.some((r) => r.blocked),
    warnOnly: worstOutcome === "warn",
  };
}

export function isApprovalRequired(result: MediaSafetyGateResult): boolean {
  return result.outcome === "approval_required" || result.requiresApproval;
}

export function isGateBlocking(result: MediaSafetyGateResult): boolean {
  return result.outcome === "blocked" || result.outcome === "setup_required";
}

export function isConsentRequired(result: MediaSafetyGateResult): boolean {
  return result.outcome === "consent_required" || result.requiresConsent;
}

export function getGateSummary(result: MediaSafetyGateResult): string {
  if (result.outcome === "allowed") return "This workflow is allowed to proceed.";

  const parts: string[] = [];
  if (result.blocked) parts.push("Blocked");
  if (result.requiresConsent) parts.push("Consent required");
  if (result.requiresApproval) parts.push("Approval required");
  if (result.warnOnly) parts.push("Warning");

  const prefix = parts.length > 0 ? parts.join(" | ") + ". " : "";
  return prefix + result.reasons.join(" ");
}