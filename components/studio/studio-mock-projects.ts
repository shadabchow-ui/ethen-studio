/**
 * ARCHIVED SPECIMEN (Studio V2 Job 08 certification).
 * Historical mock fixtures retained explicitly for tests and the labeled
 * archive surface only. Nothing here is production-authoritative: live
 * reads/writes go through the canonical project graph. Do not add new
 * production consumers.
 */
import type { MediaProject, MediaProjectKind, MediaProjectStatus } from "@/lib/media";

export type MockProjectDisplayType =
  | "campaign"
  | "product ad"
  | "cinematic video"
  | "AI influencer / character"
  | "game assets"
  | "general creative board";

export type MockProjectGraphStep = {
  id: string;
  label: string;
  kind: "prompt" | "job" | "output" | "asset" | "project";
  detail: string;
};

export type MockProjectQuickAction =
  | "open-project"
  | "add-asset"
  | "send-to-canvas"
  | "continue-in-app"
  | "export";

export type MockProject = MediaProject & {
  displayType: MockProjectDisplayType;
  coverTone: string;
  assetCount: number;
  activityLabel: string;
  quickActions: MockProjectQuickAction[];
  graph: MockProjectGraphStep[];
};

function displayTypeForKind(kind: MediaProjectKind): MockProjectDisplayType {
  const map: Partial<Record<MediaProjectKind, MockProjectDisplayType>> = {
    campaign: "campaign",
    product_shoot: "product ad",
    product_launch: "product ad",
    video_concept: "cinematic video",
    ai_influencer_profile: "AI influencer / character",
    character_pack: "AI influencer / character",
    game_asset_pack: "game assets",
    brand_kit: "general creative board",
    moodboard: "general creative board",
    storyboard: "cinematic video",
    ad_creative_set: "campaign",
  };
  return map[kind] ?? "general creative board";
}

const COVER_TONES = [
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
  "bg-[var(--bg-elevated)]",
];

export function buildMockProjects(): MockProject[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;

  const raw: MockProject[] = [
    {
      id: "mp-1",
      name: "Summer Campaign 2026",
      description: "Brand imagery and social ads for the summer product launch campaign.",
      kind: "campaign",
      status: "active",
      modality: "image",
      assetIds: ["a1", "a2", "a3", "a4", "a5"],
      jobIds: ["j1", "j2", "j3"],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(now - 6 * day).toISOString(),
      updatedAt: new Date(now - 3 * hour).toISOString(),
      displayType: "campaign",
      coverTone: COVER_TONES[0],
      assetCount: 14,
      activityLabel: "Edited 3 hours ago",
      quickActions: ["open-project", "add-asset", "send-to-canvas", "continue-in-app"],
      graph: [
        { id: "g1-1", label: "Prompt", kind: "prompt", detail: "Summer lifestyle ad creative — bright, warm, aspirational" },
        { id: "g1-2", label: "Mock Job", kind: "job", detail: "Create Image · 4 variants · Photoreal" },
        { id: "g1-3", label: "Output", kind: "output", detail: "4 hero image variants · 1:1 · Standard" },
        { id: "g1-4", label: "Asset", kind: "asset", detail: "Saved to campaign · favorited 2 of 4" },
        { id: "g1-5", label: "Project", kind: "project", detail: "Summer Campaign 2026 · 14 assets" },
      ],
    },
    {
      id: "mp-2",
      name: "Product Launch: Earbuds V3",
      description: "Product photography, lifestyle shots, and ad creatives for the new earbuds launch.",
      kind: "product_launch",
      status: "active",
      modality: "image",
      assetIds: ["a6", "a7", "a8"],
      jobIds: ["j4", "j5"],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(now - 4 * day).toISOString(),
      updatedAt: new Date(now - 6 * hour).toISOString(),
      displayType: "product ad",
      coverTone: COVER_TONES[1],
      assetCount: 9,
      activityLabel: "Edited 6 hours ago",
      quickActions: ["open-project", "add-asset", "send-to-canvas"],
      graph: [
        { id: "g2-1", label: "Prompt", kind: "prompt", detail: "Product URL → lifestyle shots for premium earbuds" },
        { id: "g2-2", label: "Mock Job", kind: "job", detail: "Product Ad · Instagram · Premium tone" },
        { id: "g2-3", label: "Output", kind: "output", detail: "2 ad variants · 9:16 portrait · Standard" },
        { id: "g2-4", label: "Asset", kind: "asset", detail: "Saved to project · storyboard included" },
        { id: "g2-5", label: "Project", kind: "project", detail: "Product Launch: Earbuds V3 · 9 assets" },
      ],
    },
    {
      id: "mp-3",
      name: "City Noir Scene",
      description: "Cinematic scene generation for a rain-soaked detective short.",
      kind: "video_concept",
      status: "draft",
      modality: "video",
      assetIds: ["a9", "a10"],
      jobIds: ["j6"],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(now - 3 * day).toISOString(),
      updatedAt: new Date(now - 12 * hour).toISOString(),
      displayType: "cinematic video",
      coverTone: COVER_TONES[2],
      assetCount: 6,
      activityLabel: "Edited 12 hours ago",
      quickActions: ["open-project", "send-to-canvas", "continue-in-app"],
      graph: [
        { id: "g3-1", label: "Prompt", kind: "prompt", detail: "Noir city scene — rain, neon reflections, detective silhouette" },
        { id: "g3-2", label: "Mock Job", kind: "job", detail: "Cinematic Scene · Wide · 35mm · Noir mood" },
        { id: "g3-3", label: "Output", kind: "output", detail: "Scene draft · 16:9 · Standard quality" },
        { id: "g3-4", label: "Asset", kind: "asset", detail: "Saved as video concept reference" },
        { id: "g3-5", label: "Project", kind: "project", detail: "City Noir Scene · 6 assets" },
      ],
    },
    {
      id: "mp-4",
      name: "Influencer Profile: Nova",
      description: "AI influencer persona for fashion and lifestyle social campaigns.",
      kind: "ai_influencer_profile",
      status: "active",
      modality: "image",
      assetIds: ["a11", "a12", "a13", "a14", "a15", "a16"],
      jobIds: ["j7", "j8", "j9", "j10"],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(now - 10 * day).toISOString(),
      updatedAt: new Date(now - 1 * hour).toISOString(),
      displayType: "AI influencer / character",
      coverTone: COVER_TONES[3],
      assetCount: 22,
      activityLabel: "Edited 1 hour ago",
      quickActions: ["open-project", "add-asset", "send-to-canvas", "continue-in-app"],
      graph: [
        { id: "g4-1", label: "Prompt", kind: "prompt", detail: "Create character: Nova — modern, minimalist, fashion-forward" },
        { id: "g4-2", label: "Mock Job", kind: "job", detail: "AI Influencer · Portrait · Casual · Studio set" },
        { id: "g4-3", label: "Output", kind: "output", detail: "3 looks generated · Portrait · Standard" },
        { id: "g4-4", label: "Asset", kind: "asset", detail: "Character profile + 3 look variants saved" },
        { id: "g4-5", label: "Project", kind: "project", detail: "Nova · 22 assets · character consistency maintained" },
      ],
    },
    {
      id: "mp-5",
      name: "Game Asset Pack: Fantasy RPG",
      description: "Character sprites, environment tiles, and UI elements for fantasy RPG.",
      kind: "game_asset_pack",
      status: "draft",
      modality: "image",
      assetIds: ["a17", "a18", "a19", "a20"],
      jobIds: ["j11", "j12"],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(now - 8 * day).toISOString(),
      updatedAt: new Date(now - 18 * hour).toISOString(),
      displayType: "game assets",
      coverTone: COVER_TONES[4],
      assetCount: 18,
      activityLabel: "Edited 18 hours ago",
      quickActions: ["open-project", "add-asset", "continue-in-app"],
      graph: [
        { id: "g5-1", label: "Prompt", kind: "prompt", detail: "Fantasy RPG character sprites — pixel art, 32×32, 4-directional" },
        { id: "g5-2", label: "Mock Job", kind: "job", detail: "Game Assets · Character · Pixel style pack" },
        { id: "g5-3", label: "Output", kind: "output", detail: "4 asset variants · 1:1 · Standard" },
        { id: "g5-4", label: "Asset", kind: "asset", detail: "Spritesheet and individual frames saved" },
        { id: "g5-5", label: "Project", kind: "project", detail: "Fantasy RPG · 18 assets · export PNG ready" },
      ],
    },
    {
      id: "mp-6",
      name: "Brand Moodboard: Rebrand 2026",
      description: "Visual direction and mood references for the company rebrand.",
      kind: "moodboard",
      status: "active",
      modality: "image",
      assetIds: ["a21", "a22", "a23"],
      jobIds: ["j13"],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(now - 5 * day).toISOString(),
      updatedAt: new Date(now - 4 * hour).toISOString(),
      displayType: "general creative board",
      coverTone: COVER_TONES[5],
      assetCount: 8,
      activityLabel: "Edited 4 hours ago",
      quickActions: ["open-project", "add-asset", "send-to-canvas"],
      graph: [
        { id: "g6-1", label: "Prompt", kind: "prompt", detail: "Brand moodboard — clean, modern, premium, monochrome" },
        { id: "g6-2", label: "Mock Job", kind: "job", detail: "Reference Moodboard · Style clustering" },
        { id: "g6-3", label: "Output", kind: "output", detail: "Moodboard compiled with 12 references" },
        { id: "g6-4", label: "Asset", kind: "asset", detail: "Board saved · 8 curated references" },
        { id: "g6-5", label: "Project", kind: "project", detail: "Rebrand 2026 · 8 reference assets" },
      ],
    },
    {
      id: "mp-7",
      name: "Holiday Ad Creative Set",
      description: "Multi-platform ad creatives for the holiday campaign push.",
      kind: "ad_creative_set",
      status: "archived",
      modality: "image",
      assetIds: ["a24", "a25", "a26", "a27", "a28"],
      jobIds: ["j14", "j15", "j16"],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(now - 30 * day).toISOString(),
      updatedAt: new Date(now - 7 * day).toISOString(),
      displayType: "campaign",
      coverTone: COVER_TONES[6],
      assetCount: 31,
      activityLabel: "Archived · Last edited 7 days ago",
      quickActions: ["open-project"],
      graph: [
        { id: "g7-1", label: "Prompt", kind: "prompt", detail: "Holiday campaign — festive, warm, family-oriented visual language" },
        { id: "g7-2", label: "Mock Job", kind: "job", detail: "Marketing Studio · Instagram + TikTok · Static + Carousel" },
        { id: "g7-3", label: "Output", kind: "output", detail: "6 concept variants across platforms" },
        { id: "g7-4", label: "Asset", kind: "asset", detail: "Full set exported · 31 assets total" },
        { id: "g7-5", label: "Project", kind: "project", detail: "Holiday Ad Creative Set · 31 assets · Archived" },
      ],
    },
    {
      id: "mp-8",
      name: "Character Motion: Runner",
      description: "Animated character loop for a fitness app demo reel.",
      kind: "character_pack",
      status: "draft",
      modality: "video",
      assetIds: ["a29"],
      jobIds: ["j17"],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(now - 2 * day).toISOString(),
      updatedAt: new Date(now - 2 * hour).toISOString(),
      displayType: "AI influencer / character",
      coverTone: COVER_TONES[7],
      assetCount: 3,
      activityLabel: "Edited 2 hours ago",
      quickActions: ["open-project", "add-asset", "continue-in-app"],
      graph: [
        { id: "g8-1", label: "Prompt", kind: "prompt", detail: "Character running cycle — athletic, clean loop, side view" },
        { id: "g8-2", label: "Mock Job", kind: "job", detail: "Character Motion · Run · Medium intensity" },
        { id: "g8-3", label: "Output", kind: "output", detail: "Pose card · Run cycle · Medium intensity" },
        { id: "g8-4", label: "Asset", kind: "asset", detail: "Character reference + pose card saved" },
        { id: "g8-5", label: "Project", kind: "project", detail: "Runner · 3 assets · motion preset data" },
      ],
    },
    {
      id: "mp-9",
      name: "Explainer Video Series",
      description: "Concept art and storyboard for the platform explainer video series.",
      kind: "storyboard",
      status: "active",
      modality: "video",
      assetIds: ["a30", "a31", "a32"],
      jobIds: ["j18", "j19"],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(now - 7 * day).toISOString(),
      updatedAt: new Date(now - 8 * hour).toISOString(),
      displayType: "cinematic video",
      coverTone: COVER_TONES[8],
      assetCount: 11,
      activityLabel: "Edited 8 hours ago",
      quickActions: ["open-project", "send-to-canvas", "continue-in-app"],
      graph: [
        { id: "g9-1", label: "Prompt", kind: "prompt", detail: "Platform explainer — clean UI walkthrough, modern, accessible" },
        { id: "g9-2", label: "Mock Job", kind: "job", detail: "Cinematic Scene · Wide · Establishing shot" },
        { id: "g9-3", label: "Output", kind: "output", detail: "3 scene drafts · Storyboard compiled" },
        { id: "g9-4", label: "Asset", kind: "asset", detail: "Storyboard frames + scene references saved" },
        { id: "g9-5", label: "Project", kind: "project", detail: "Explainer Video Series · 11 assets · storyboard complete" },
      ],
    },
    {
      id: "mp-10",
      name: "Narration Voice Profiles",
      description: "Voice samples and audio identity for the explainer series narration.",
      kind: "brand_kit",
      status: "draft",
      modality: "audio",
      assetIds: ["a33", "a34"],
      jobIds: ["j20"],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(now - 2 * day).toISOString(),
      updatedAt: new Date(now - 24 * hour).toISOString(),
      displayType: "general creative board",
      coverTone: COVER_TONES[9],
      assetCount: 5,
      activityLabel: "Edited yesterday",
      quickActions: ["open-project", "add-asset", "continue-in-app"],
      graph: [
        { id: "g10-1", label: "Prompt", kind: "prompt", detail: "Professional narration voice — warm, clear, American accent" },
        { id: "g10-2", label: "Mock Job", kind: "job", detail: "Voiceover · ElevenLabs/default · English" },
        { id: "g10-3", label: "Output", kind: "output", detail: "Voice sample generated · MP3 · 30s" },
        { id: "g10-4", label: "Asset", kind: "asset", detail: "Voice profile + sample saved" },
        { id: "g10-5", label: "Project", kind: "project", detail: "Narration Voice Profiles · 5 assets · draft" },
      ],
    },
  ];

  return raw;
}

let cached: MockProject[] | null = null;

export function getMockProjects(): MockProject[] {
  if (!cached) cached = buildMockProjects();
  return cached;
}

export function getMockProjectById(id: string): MockProject | undefined {
  return getMockProjects().find((p) => p.id === id);
}

export const PROJECT_QUICK_ACTION_LABELS: Record<MockProjectQuickAction, string> = {
  "open-project": "Open Project",
  "add-asset": "Add Asset",
  "send-to-canvas": "Send to Canvas",
  "continue-in-app": "Continue in App",
  export: "Export",
};

export const PROJECT_QUICK_ACTION_DISABLED = new Set<MockProjectQuickAction>(["export"]);

export const GRAPH_KIND_LABELS: Record<MockProjectGraphStep["kind"], string> = {
  prompt: "Prompt",
  job: "Mock Job",
  output: "Output",
  asset: "Asset",
  project: "Project",
};
