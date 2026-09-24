import type { MediaAsset, MediaJobState, MediaProviderStatus } from "./types";
import type { MediaProject } from "./projects";
import type { MediaSafetyGateResult, MediaSafetyCategory } from "./safety-types";

export type MediaStudioTrustState =
  | "mock"
  | "setup-required"
  | "live"
  | "failed"
  | "fallback"
  | "provider-unavailable"
  | "awaiting-approval";

export type MediaStudioRiskLevel =
  | "safe"
  | "identity"
  | "voice"
  | "public_figure"
  | "minor_sensitive"
  | "deceptive_ad"
  | "copyrighted_style"
  | "product_claims"
  | "uploaded_media"
  | "external_publish";

export interface MediaLibraryCollection {
  id: string;
  label: string;
  description: string;
  count: number;
  assetIds: string[];
}

export interface MediaProjectCollection {
  id: string;
  label: string;
  description: string;
  count: number;
  projectIds: string[];
}

const CATEGORY_TO_RISK: Partial<Record<MediaSafetyCategory, MediaStudioRiskLevel>> = {
  face_swap: "identity",
  character_swap: "identity",
  voice_change: "voice",
  voice_cloning: "voice",
  identity_voiceover: "voice",
  public_figures: "public_figure",
  minors: "minor_sensitive",
  impersonation: "deceptive_ad",
  deceptive_ads: "deceptive_ad",
  copyrighted_style: "copyrighted_style",
  product_claims: "product_claims",
  uploaded_media: "uploaded_media",
  external_publishing: "external_publish",
};

export const MEDIA_STUDIO_TRUST_LABELS: Record<MediaStudioTrustState, string> = {
  mock: "Mock preview",
  "setup-required": "Setup required",
  live: "Live provider",
  failed: "Failed",
  fallback: "Fallback used",
  "provider-unavailable": "Provider unavailable",
  "awaiting-approval": "Awaiting approval",
};

export const MEDIA_STUDIO_RISK_LABELS: Record<MediaStudioRiskLevel, string> = {
  safe: "Safe",
  identity: "Identity",
  voice: "Voice",
  public_figure: "Public figure",
  minor_sensitive: "Minor sensitive",
  deceptive_ad: "Deceptive ad",
  copyrighted_style: "Copyrighted style",
  product_claims: "Product claims",
  uploaded_media: "Uploaded media",
  external_publish: "External publish",
};

export function deriveMediaTrustState(input: {
  providerStatus?: MediaProviderStatus | null;
  isMock?: boolean;
  fallbackUsed?: boolean;
  jobState?: MediaJobState | null;
  failed?: boolean;
}): MediaStudioTrustState {
  if (input.jobState === "awaiting_approval") {
    return "awaiting-approval";
  }
  if (input.failed || input.jobState === "failed") {
    return "failed";
  }
  if (input.fallbackUsed) {
    return "fallback";
  }
  if (input.isMock) {
    return "mock";
  }
  if (!input.providerStatus) {
    return "setup-required";
  }
  if (!input.providerStatus.available) {
    return input.providerStatus.setupRequired ? "setup-required" : "provider-unavailable";
  }
  return "live";
}

export function deriveMediaRiskLevels(safety: MediaSafetyGateResult | null): MediaStudioRiskLevel[] {
  if (!safety || safety.triggeredCategories.length === 0) {
    return ["safe"];
  }

  const levels: MediaStudioRiskLevel[] = [];
  for (const category of safety.triggeredCategories) {
    const mapped = CATEGORY_TO_RISK[category];
    if (mapped && !levels.includes(mapped)) {
      levels.push(mapped);
    }
  }

  return levels.length > 0 ? levels : ["safe"];
}

function matchesKind(asset: MediaAsset, expectedKinds: string[]): boolean {
  const kind = asset.kind ?? asset.type;
  return expectedKinds.includes(kind);
}

export function buildMediaLibraryCollections(assets: MediaAsset[]): MediaLibraryCollection[] {
  const collections: Array<{ id: string; label: string; description: string; match: (asset: MediaAsset) => boolean }> = [
    {
      id: "my-generations",
      label: "My Generations",
      description: "Recent mock and live outputs created from Media Studio apps.",
      match: (asset) => asset.source === "generation" || Boolean(asset.jobId),
    },
    {
      id: "favorites",
      label: "Favorites",
      description: "Pinned outputs worth reusing later.",
      match: (asset) => asset.favorite === true,
    },
    {
      id: "references",
      label: "References",
      description: "Uploaded references and style-direction inputs.",
      match: (asset) => matchesKind(asset, ["reference"]),
    },
    {
      id: "moodboards",
      label: "Moodboards",
      description: "Boards for visual direction, styling, and campaign planning.",
      match: (asset) => matchesKind(asset, ["moodboard"]),
    },
    {
      id: "character-profiles",
      label: "Character Profiles",
      description: "Identity-safe personas and reusable character directions.",
      match: (asset) => matchesKind(asset, ["character", "character_profile"]),
    },
    {
      id: "voice-profiles",
      label: "Voice Profiles",
      description: "Voice samples, narrators, and profile-ready audio references.",
      match: (asset) => matchesKind(asset, ["voice", "voice_profile"]),
    },
    {
      id: "product-assets",
      label: "Product Assets",
      description: "Commerce visuals, pack shots, and reusable product media.",
      match: (asset) => matchesKind(asset, ["product_asset"]),
    },
    {
      id: "campaign-assets",
      label: "Campaign Assets",
      description: "Launch-ready ad creative, UGC drafts, and campaign deliverables.",
      match: (asset) => matchesKind(asset, ["campaign_asset"]),
    },
    {
      id: "game-assets",
      label: "Game Assets",
      description: "Game-ready 2D assets — sprites, characters, UI elements, tilesets, backgrounds, and icons.",
      match: (asset) => matchesKind(asset, ["game_asset"]),
    },
  ];

  return collections.map((collection) => {
    const matched = assets.filter(collection.match);
    return {
      id: collection.id,
      label: collection.label,
      description: collection.description,
      count: matched.length,
      assetIds: matched.map((asset) => asset.id),
    };
  });
}

export function buildMediaProjectCollections(projects: MediaProject[]): MediaProjectCollection[] {
  const collections: Array<{ id: string; label: string; description: string; match: (project: MediaProject) => boolean }> = [
    {
      id: "recent-projects",
      label: "Recent Projects",
      description: "Active workspaces touched recently in Media Studio.",
      match: () => true,
    },
    {
      id: "campaign-boards",
      label: "Campaign Boards",
      description: "Messaging, launch planning, and paid social boards.",
      match: (project) => project.kind === "campaign",
    },
    {
      id: "product-boards",
      label: "Product Boards",
      description: "Merchandising, PDP, and product narrative boards.",
      match: (project) => project.kind === "product_launch",
    },
    {
      id: "character-boards",
      label: "Character Boards",
      description: "Persona, consistency, and reusable identity boards.",
      match: (project) => project.kind === "character_pack",
    },
  ];

  return collections.map((collection) => {
    const matched = projects.filter(collection.match);
    return {
      id: collection.id,
      label: collection.label,
      description: collection.description,
      count: matched.length,
      projectIds: matched.map((project) => project.id),
    };
  });
}

export function getDisabledActionReason(action: "export" | "download" | "upload" | "provider", trustState: MediaStudioTrustState): string {
  if (action === "export") {
    return "Export requires live provider output.";
  }
  if (action === "download") {
    return trustState === "mock"
      ? "Download unavailable in mock preview."
      : "Download unavailable until a live provider output exists.";
  }
  if (action === "upload") {
    return "Upload storage is not configured.";
  }
  return "Provider setup required.";
}
