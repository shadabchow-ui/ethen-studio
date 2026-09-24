import "server-only";

import { createHash } from "node:crypto";
import { MEDIA_APPS } from "../apps";
import type { MediaSafetyCategory, MediaWorkflowId } from "@ethen/contracts/media/safety-types";

export type StudioWorkflowPolicy = Readonly<{
  appId: string;
  version: "stu-10-v1";
  workflowId: MediaWorkflowId;
  categories: readonly MediaSafetyCategory[];
  disabled: boolean;
  requiresPostModeration: boolean;
  requiresProvenance: boolean;
  requiresExportApproval: boolean;
}>;

const IDENTITY_SENSITIVE = new Set([
  "face-swap", "character-swap", "ai-influencer", "soul-id-character",
  "change-voice", "voice-profile", "recast-character", "lipsync-studio", "voiceover",
]);

function toWorkflow(value: string | null): MediaWorkflowId {
  const known: MediaWorkflowId[] = ["media.generate_image", "media.edit_image", "media.upscale_image", "media.inpaint_image", "media.relight_image", "media.generate_video", "media.image_to_video", "media.edit_video", "media.upscale_video", "media.generate_voiceover", "media.translate_speech", "media.change_voice", "media.create_project", "media.save_asset", "media.list_assets", "media.get_asset", "media.export_asset", "media.train_character", "media.virality_score", "media.product_url_to_ad"];
  return known.includes(value as MediaWorkflowId) ? value as MediaWorkflowId : "media.generate_image";
}

export const STUDIO_WORKFLOW_POLICIES: Readonly<Record<string, StudioWorkflowPolicy>> = Object.fromEntries(
  MEDIA_APPS.map((app) => [app.id, Object.freeze({
    appId: app.id,
    version: "stu-10-v1" as const,
    workflowId: toWorkflow(app.defaultToolId),
    categories: Object.freeze([...app.safety.categories]),
    disabled: IDENTITY_SENSITIVE.has(app.id),
    requiresPostModeration: true,
    requiresProvenance: true,
    requiresExportApproval: app.safety.categories.includes("external_publishing"),
  })]),
);

/** Never fall back to client-provided safety flags; unknown apps are rejected. */
export function getStudioWorkflowPolicy(appId: string | null): StudioWorkflowPolicy | null {
  if (!appId) return null;
  return STUDIO_WORKFLOW_POLICIES[appId] ?? null;
}

export function hashStudioGenerationInput(input: { prompt: string; projectId: string; policy: StudioWorkflowPolicy; modelId?: string | null; sourceAssetHashes?: readonly string[] }): string {
  return createHash("sha256").update(JSON.stringify({ prompt: input.prompt.trim(), projectId: input.projectId, policy: input.policy.version, appId: input.policy.appId, workflow: input.policy.workflowId, modelId: input.modelId ?? null, assets: [...(input.sourceAssetHashes ?? [])].sort() })).digest("hex");
}
