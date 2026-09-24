import type { MediaAsset, MediaJob, MediaJobResult } from "./types";
import { STORAGE_STATUS_NON_DURABLE } from "./usage";

export type { MediaAsset };

export type MediaAssetKind =
  | "image"
  | "video"
  | "audio"
  | "reference"
  | "character"
  | "voice"
  | "moodboard"
  | "character_profile"
  | "voice_profile"
  | "product_asset"
  | "campaign_asset"
  | "game_asset";

export type MediaAssetSource =
  | "upload"
  | "generation"
  | "import"
  | "provider_result";

let assets: MediaAsset[] = [];
let nextId = 1;

function generateId(): string {
  return `mock-asset-${nextId++}-${Date.now()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function seedMockAssets(count = 12): MediaAsset[] {
  const providers = ["deepseek", "openai", "stability", "replicate", "elevenlabs", "runway"];
  const models = ["deepseek-v4-flash", "dall-e-3", "stable-diffusion-3", "midjourney-v6", "eleven-turbo-v2"];
  const titles = [
    "Futuristic Cityscape",
    "Wireless Earbuds Product Shot",
    "Tech Review Thumbnail",
    "Elven Archer Character",
    "Luxury Brand Moodboard",
    "Sustainable Fashion Ad",
    "Fintech Logo Concept",
    "Abstract Purple Wallpaper",
    "Glass Facade Reference",
    "Sci-Fi Soldier Sheet",
    "Warm Narrator Voice Sample",
    "Coastal Interior Moodboard",
  ];
  const toolIds = [
    "media.generate_image",
    "media.generate_image",
    "media.generate_video",
    "media.generate_image",
    "media.create_project",
    "media.generate_image",
    "media.generate_image",
    "media.generate_image",
    "media.generate_image",
    "media.generate_image",
    "media.generate_voiceover",
    "media.create_project",
  ];
  const kinds: MediaAssetKind[] = [
    "campaign_asset",
    "product_asset",
    "campaign_asset",
    "character_profile",
    "moodboard",
    "campaign_asset",
    "reference",
    "product_asset",
    "reference",
    "character",
    "voice_profile",
    "moodboard",
  ];
  const types: Array<MediaAsset["type"]> = [
    "image",
    "image",
    "video",
    "image",
    "image",
    "image",
    "image",
    "image",
    "image",
    "image",
    "audio",
    "image",
  ];
  const startDate = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const seeded: MediaAsset[] = [];
  for (let i = 0; i < count; i++) {
    const createdAt = new Date(startDate + i * 12 * 60 * 60 * 1000).toISOString();
    seeded.push({
      id: generateId(),
      projectId: null,
      jobId: null,
      type: types[i % types.length],
      kind: kinds[i % kinds.length],
      title: titles[i % titles.length],
      toolId: toolIds[i % toolIds.length],
      costEstimate: (i + 1) * 2,
      url: `/api/media/mock-asset/${i}`,
      thumbnailUrl: `/api/media/mock-thumb/${i}`,
      mimeType: types[i % types.length] === "audio" ? "audio/mpeg" : types[i % types.length] === "video" ? "video/mp4" : "image/png",
      width: types[i % types.length] === "audio" ? null : types[i % types.length] === "video" ? 1920 : 1024,
      height: types[i % types.length] === "audio" ? null : types[i % types.length] === "video" ? 1080 : 1024,
      durationSeconds: types[i % types.length] === "audio" ? 22 : types[i % types.length] === "video" ? 8 : null,
      modelName: models[i % models.length],
      providerName: providers[i % providers.length],
      prompt: titles[i % titles.length],
      source: "generation",
      isMock: true,
      favorite: i < 3,
      tags: ["mock"],
      seed: i * 42 + 1,
      negativePrompt: i % 3 === 0 ? "blurry, low quality, distorted" : null,
      metadata: { mock: true, generatedPreview: true, variantIndex: i },
      aspectRatio: types[i % types.length] === "video" ? "16:9" : "1:1",
      voice: types[i % types.length] === "audio" ? "Warm narrator" : null,
      language: types[i % types.length] === "audio" ? "English" : null,
      createdAt,
      updatedAt: createdAt,
    });
  }
  assets = seeded;
  return seeded;
}

export function getAssets(): MediaAsset[] {
  return [...assets];
}

export function getAssetsForOwner(ownerId: string): MediaAsset[] {
  return assets.filter((asset) => asset.ownerId === ownerId).map((asset) => ({ ...asset }));
}

export function getAssetById(id: string): MediaAsset | undefined {
  return assets.find((a) => a.id === id);
}

export function getAssetsByProject(projectId: string): MediaAsset[] {
  return assets.filter((a) => a.projectId === projectId);
}

export function addAsset(asset: Omit<MediaAsset, "id" | "createdAt" | "updatedAt">): MediaAsset {
  const now = nowIso();
  const created: MediaAsset = {
    ...asset,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  assets.unshift(created);
  return created;
}

export function toggleFavorite(id: string): MediaAsset | null {
  const asset = assets.find((a) => a.id === id);
  if (!asset) return null;
  asset.favorite = !asset.favorite;
  asset.updatedAt = nowIso();
  return { ...asset };
}

/**
 * Save a completed job result as a reusable asset.
 * Mock assets are labeled with isMock: true.
 * Callers may supply additional overrides (title, projectId, etc.).
 */
export function saveJobResultAsAsset(
  job: MediaJob,
  overrides?: Partial<Pick<MediaAsset, "title" | "projectId" | "tags" | "ownerId">>,
): MediaAsset | null {
  const result = job.result;
  if (!result) return null;

  return addAsset({
    jobId: job.id,
    projectId: overrides?.projectId ?? job.projectId ?? null,
    ownerId: overrides?.ownerId ?? null,
    type: result.modality === "video" ? "video" : result.modality === "audio" ? "audio" : "image",
    title: overrides?.title ?? result.metadata.label ?? `Mock ${result.modality}`,
    toolId: job.toolId,
    url: result.assetUrl,
    thumbnailUrl: result.previewUrl,
    mimeType: result.metadata.mimeType,
    width: result.metadata.width ?? null,
    height: result.metadata.height ?? null,
    durationSeconds: result.metadata.durationSeconds ?? null,
    modelId: job.modelId,
    modelName: job.modelName,
    providerId: job.providerId,
    providerName: job.providerName,
    prompt: job.prompt,
    negativePrompt: job.negativePrompt,
    seed: undefined,
    source: "generation",
    isMock: result.isMock,
    favorite: false,
    tags: overrides?.tags ?? ["mock"],
    metadata: result.metadata.extra ?? null,
    kind: result.modality,
    modality: result.modality,
    fileSizeBytes: result.metadata.fileSizeBytes,
  });
}

export function clearAssets(): void {
  assets = [];
  nextId = 1;
}

// ─── Durable storage hooks (called by server-side sync layer) ────────────

export function hydrateAssetStore(newAssets: MediaAsset[], newNextId: number): void {
  assets = newAssets;
  nextId = newNextId;
}

export function snapshotAssetStore(): MediaAsset[] {
  return [...assets];
}

export function snapshotAssetNextId(): number {
  return nextId;
}

// ── Durability & ownership ────────────────────────────────────────────────

/**
 * Media asset store durability status.
 * Production uses durable Supabase repository + proof checksum; tests use memory.
 */
export const ASSET_STORE_DURABILITY = "durable_supabase_proof" as const;
export const ASSET_STORE_FALLBACK_DURABILITY = STORAGE_STATUS_NON_DURABLE;

/**
 * Ownership check: verifies an asset belongs to a given session/user.
 * Currently, assets have no owner_id field — this always returns true
 * as a no-op until ownership persistence is implemented.
 */
export function assetBelongsToSession(
  asset: MediaAsset,
  sessionId: string | null,
): boolean {
  return Boolean(sessionId && asset.ownerId === sessionId);
}
