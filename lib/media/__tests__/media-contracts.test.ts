// Media Contracts — Type & Registry Validation Suite
// Run with: npx tsx lib/media/__tests__/media-contracts.test.ts

import { TOOL_REGISTRY } from "@ethen/tools/registry";
import { MEDIA_MODELS, getModelsForMode, getDefaultModel } from "../models";
import type { ToolDefinition, ToolCategory } from "@ethen/contracts/tools/types";
import type { MediaMode } from "../types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Media tool IDs that should be registered ──────────────────────────────────

const MEDIA_TOOL_IDS = [
  "media.status",
  "media.generate_image",
  "media.edit_image",
  "media.upscale_image",
  "media.inpaint_image",
  "media.relight_image",
  "media.generate_video",
  "media.image_to_video",
  "media.edit_video",
  "media.upscale_video",
  "media.generate_voiceover",
  "media.translate_speech",
  "media.change_voice",
  "media.generate_sound_effect",
  "media.generate_music_bed",
  "media.generate_game_asset",
  "media.generate_sprite_pack",
  "media.generate_character_pack",
  "media.generate_game_ui",
  "media.create_project",
  "media.save_asset",
  "media.list_assets",
  "media.get_asset",
  "media.export_asset",
  "media.train_character",
  "media.virality_score",
  "media.product_url_to_ad",
];

const MEDIA_CATEGORIES: ToolCategory[] = [
  "media",
  "image_generation",
  "video_generation",
  "audio_generation",
  "asset_management",
  "media_projects",
];

// ── Tests ──────────────────────────────────────────────────────────────────────

function testAllMediaToolsRegistered(): void {
  console.log("\n[Media Tools Registered]");
  for (const toolId of MEDIA_TOOL_IDS) {
    const entry = TOOL_REGISTRY.find((t: ToolDefinition) => t.id === toolId);
    assert(Boolean(entry), `Tool ${toolId} is in registry`);
  }
}

function testAllMediaToolsAreContractOnly(): void {
  console.log("\n[Media Tools Execution State]");
  for (const toolId of MEDIA_TOOL_IDS) {
    const entry = TOOL_REGISTRY.find((t: ToolDefinition) => t.id === toolId);
    if (entry) {
      assertEqual(entry.executionState, "contract_only", `${toolId} executionState is contract_only`);
    }
  }
}

function testMediaCategoriesAreUsed(): void {
  console.log("\n[Media Categories Used]");
  for (const category of MEDIA_CATEGORIES) {
    const count = TOOL_REGISTRY.filter((t: ToolDefinition) => t.category === category).length;
    assert(count > 0, `At least one tool with category "${category}"`);
  }
}

function testAllMediaCategoriesValid(): void {
  console.log("\n[Media Category Types Valid]");
  const mediaTools = TOOL_REGISTRY.filter((t: ToolDefinition) =>
    MEDIA_TOOL_IDS.includes(t.id),
  );
  for (const tool of mediaTools) {
    const cat = tool.category as string;
    assert(
      MEDIA_CATEGORIES.includes(cat as ToolCategory),
      `${tool.id} has valid media category: ${cat}`,
    );
  }
}

function testMediaToolCount(): void {
  console.log("\n[Media Tool Count]");
  assertEqual(MEDIA_TOOL_IDS.length, 27, "27 media tool IDs defined");
  const registered = TOOL_REGISTRY.filter((t: ToolDefinition) =>
    MEDIA_TOOL_IDS.includes(t.id),
  );
  assertEqual(registered.length, 27, "27 media tools registered");
}

function testMediaModelsPresent(): void {
  console.log("\n[Media Models]");
  assert(MEDIA_MODELS.length > 0, "At least one media model defined");
  const imageModels = MEDIA_MODELS.filter((m) => m.modality === "image");
  const videoModels = MEDIA_MODELS.filter((m) => m.modality === "video");
  const audioModels = MEDIA_MODELS.filter((m) => m.modality === "audio");
  assert(imageModels.length > 0, "At least one image model");
  assert(videoModels.length > 0, "At least one video model");
  assert(audioModels.length > 0, "At least one audio model");
}

function testMediaModelShape(): void {
  console.log("\n[Media Model Shape]");
  for (const model of MEDIA_MODELS) {
    assert(Boolean(model.id), `Model ${model.id} has id`);
    assert(Boolean(model.name), `Model ${model.id} has name`);
    assert(Boolean(model.displayName), `Model ${model.id} has displayName`);
    assert(["image", "video", "audio"].includes(model.modality), `Model ${model.id} has valid modality`);
    assert(Array.isArray(model.tasks), `Model ${model.id} has tasks array`);
    assert(typeof model.estimatedCredits === "number", `Model ${model.id} has estimatedCredits`);
    assert(typeof model.setupRequired === "boolean", `Model ${model.id} has setupRequired`);
  }
}

function testGetModelsForMode(): void {
  console.log("\n[getModelsForMode]");
  const imageModels = getModelsForMode("image");
  assert(imageModels.length > 0, "Returns models for image mode");
  const videoModels = getModelsForMode("video");
  assert(videoModels.length > 0, "Returns models for video mode");
  const audioModels = getModelsForMode("audio");
  assert(audioModels.length > 0, "Returns models for audio mode");
}

function testGetDefaultModel(): void {
  console.log("\n[getDefaultModel]");
  const mode: MediaMode = "image";
  const result = getDefaultModel(mode);
  assert(result !== null, "Returns default model for image");
  if (result) {
    assert(Boolean(result.id), "Default model has id");
    assert(typeof result.setupRequired === "boolean", "Default model has setupRequired");
  }
}

// ── Run all tests ──────────────────────────────────────────────────────────────

testAllMediaToolsRegistered();
testAllMediaToolsAreContractOnly();
testMediaCategoriesAreUsed();
testAllMediaCategoriesValid();
testMediaToolCount();
testMediaModelsPresent();
testMediaModelShape();
testGetModelsForMode();
testGetDefaultModel();

console.log(`\n${"=".repeat(40)}`);
console.log(`Media contracts tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(40)}`);

if (failed > 0) process.exit(1);
