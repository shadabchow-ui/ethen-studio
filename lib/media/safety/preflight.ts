import type { MediaGenerationRequest, MediaJobSafetyMeta } from "@ethen/contracts/media/types";
import type { MediaSafetyGateResult, MediaWorkflowId } from "./types";
import { classifyMediaSafety, isGateBlocking, isConsentRequired } from "./classifier";
import { stampJobSafetyMeta, buildMediaAuditTrace } from "./audit";
import type { MediaAppDefinition } from "../apps";
import { moderationBlockedError } from "../errors";

export interface PreflightInput {
  request: MediaGenerationRequest;
  app?: MediaAppDefinition | null;
  sessionId?: string | null;
}

export interface PreflightResult {
  allowed: boolean;
  blocked: boolean;
  requiresConsent: boolean;
  requiresApproval: boolean;
  safetyResult: MediaSafetyGateResult;
  safetyMeta: MediaJobSafetyMeta;
  blockedReason: string | null;
  /** When blocked, this is a ProviderError that can be thrown or returned. */
  blockedError: string | null;
}

export function runSafetyPreflight(input: PreflightInput): PreflightResult {
  const { request, app, sessionId } = input;

  const toolId = (app?.defaultToolId ?? "media.generate_image") as MediaWorkflowId;

  const safetyResult = classifyMediaSafety({
    workflowId: toolId,
    mode: request.mode ?? null,
    capability: request.capability ?? null,
    prompt: request.prompt,
    usesFaceSwap: app?.safety?.categories?.includes("face_swap") ?? false,
    usesCharacterSwap: app?.safety?.categories?.includes("character_swap") ?? false,
    usesVoiceChange: app?.safety?.categories?.includes("voice_change") ?? false,
    usesVoiceCloning: app?.safety?.categories?.includes("voice_cloning") ?? false,
    targetsPublicFigure: app?.safety?.categories?.includes("public_figures") ?? false,
    involvesMinors: app?.safety?.categories?.includes("minors") ?? false,
    isImpersonation: app?.safety?.categories?.includes("impersonation") ?? false,
    isDeceptiveAd: app?.safety?.categories?.includes("deceptive_ads") ?? false,
    imitatesCopyrightedStyle: app?.safety?.categories?.includes("copyrighted_style") ?? false,
    makesProductClaims: app?.safety?.categories?.includes("product_claims") ?? false,
    hasUploadedMedia: app?.safety?.categories?.includes("uploaded_media") ?? false,
    targetsExternalPublishing: app?.safety?.categories?.includes("external_publishing") ?? false,
  });

  const blocked = isGateBlocking(safetyResult);
  const requiresConsent = isConsentRequired(safetyResult);
  const blockedReason = blocked ? safetyResult.reasons.join("; ") : null;

  const safetyMeta = stampJobSafetyMeta(
    safetyResult,
    false,
    safetyResult.outcome === "approval_required",
    blockedReason,
    null,
  );

  const blockedError = blocked
    ? moderationBlockedError(safetyResult.messages.join(" ")).message
    : null;

  return {
    allowed: safetyResult.outcome === "allowed" || safetyResult.outcome === "warn",
    blocked,
    requiresConsent,
    requiresApproval: safetyResult.outcome === "approval_required",
    safetyResult,
    safetyMeta,
    blockedReason,
    blockedError,
  };
}

export function evaluateAppSafety(app: MediaAppDefinition): PreflightResult {
  return runSafetyPreflight({
    request: {
      modality: app.defaultMode === "video" || app.defaultMode === "motion" ? "video"
        : app.defaultMode === "audio" ? "audio"
        : "image",
      prompt: "",
      mode: app.defaultMode,
    },
    app,
  });
}

export function canExecuteApp(app: MediaAppDefinition): { allowed: boolean; reason: string } {
  const result = evaluateAppSafety(app);

  if (result.blocked) {
    return { allowed: false, reason: result.blockedReason ?? "Blocked by safety policy." };
  }

  if (app.trustState === "setup-required" || app.trustState === "provider-unavailable") {
    return { allowed: false, reason: "Provider setup is required before execution." };
  }

  if (app.setupState === "setup_required") {
    return { allowed: false, reason: "App setup is required before execution." };
  }

  if (app.setupState === "coming_soon" || app.setupState === "planned") {
    return { allowed: false, reason: "This app is not yet available." };
  }

  return { allowed: true, reason: "App can execute." };
}
