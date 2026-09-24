import type { ToolId } from "@ethen/contracts/tools/types";

/**
 * Media-specific output type for tool contract metadata.
 * Broader than AgentOutputType — covers every modality Media Studio produces.
 */
export type MediaOutputType =
  | "image"
  | "video"
  | "audio"
  | "game_asset"
  | "asset"
  | "media_project"
  | "canvas"
  | "chat";

/**
 * Minimal contract metadata bound to a single media tool ID.
 */
export interface MediaToolContract {
  toolId: ToolId;
  outputTypes: MediaOutputType[];
  /** Human-readable label for the tool's primary output. */
  label: string;
}

/**
 * Media tool contract registry — every registered media tool ID
 * has a corresponding contract entry describing what it produces.
 */
export const MEDIA_TOOL_CONTRACTS: MediaToolContract[] = [
  { toolId: "media.status", outputTypes: ["asset"], label: "Provider status" },
  { toolId: "media.generate_image", outputTypes: ["image"], label: "Generated image" },
  { toolId: "media.edit_image", outputTypes: ["image"], label: "Edited image" },
  { toolId: "media.upscale_image", outputTypes: ["image"], label: "Upscaled image" },
  { toolId: "media.inpaint_image", outputTypes: ["image"], label: "Inpainted image" },
  { toolId: "media.relight_image", outputTypes: ["image"], label: "Relit image" },
  { toolId: "media.generate_video", outputTypes: ["video"], label: "Generated video" },
  { toolId: "media.image_to_video", outputTypes: ["video"], label: "Animated video" },
  { toolId: "media.edit_video", outputTypes: ["video"], label: "Edited video" },
  { toolId: "media.upscale_video", outputTypes: ["video"], label: "Upscaled video" },
  { toolId: "media.generate_voiceover", outputTypes: ["audio"], label: "Voiceover audio" },
  { toolId: "media.translate_speech", outputTypes: ["audio"], label: "Translated audio" },
  { toolId: "media.change_voice", outputTypes: ["audio"], label: "Voice-changed audio" },
  { toolId: "media.generate_sound_effect", outputTypes: ["audio"], label: "Sound effect" },
  { toolId: "media.generate_music_bed", outputTypes: ["audio"], label: "Music bed" },
  { toolId: "media.generate_game_asset", outputTypes: ["game_asset", "image"], label: "Game asset" },
  { toolId: "media.generate_sprite_pack", outputTypes: ["game_asset", "image"], label: "Sprite pack" },
  { toolId: "media.generate_character_pack", outputTypes: ["game_asset", "image"], label: "Character pack" },
  { toolId: "media.generate_game_ui", outputTypes: ["game_asset", "image"], label: "Game UI" },
  { toolId: "media.create_project", outputTypes: ["media_project"], label: "Media project" },
  { toolId: "media.save_asset", outputTypes: ["asset"], label: "Saved asset" },
  { toolId: "media.list_assets", outputTypes: ["asset"], label: "Asset list" },
  { toolId: "media.get_asset", outputTypes: ["asset"], label: "Asset detail" },
  { toolId: "media.export_asset", outputTypes: ["asset"], label: "Exported asset" },
  { toolId: "media.train_character", outputTypes: ["game_asset", "image"], label: "Trained character" },
  { toolId: "media.virality_score", outputTypes: ["asset"], label: "Virality score" },
  { toolId: "media.product_url_to_ad", outputTypes: ["image", "video"], label: "Ad creative" },
];
