export type StudioShowcaseAssetType = "video" | "image";

export type StudioShowcaseSection =
  | "hero"
  | "featured"
  | "cinema"
  | "video"
  | "image"
  | "marketing"
  | "influencer"
  | "games"
  | "canvas"
  | "supercomputer";

export type StudioShowcaseAspectRatio = "16/9" | "4/5" | "1/1" | "9/16" | "21/9";

export type StudioShowcaseStatus =
  | "mock-preview"
  | "setup-required"
  | "live"
  | "coming-soon";

export type StudioShowcaseAsset = {
  id: string;
  type: StudioShowcaseAssetType;
  title: string;
  description?: string;
  section: StudioShowcaseSection;
  filename: string;
  posterFilename?: string;
  aspectRatio: StudioShowcaseAspectRatio;
  tags: string[];
  appSlug?: string;
  ctaLabel?: string;
  status?: StudioShowcaseStatus;
  priority?: boolean;
};

export type StudioShowcasePageSectionId =
  | "hero-rail"
  | "mission-card"
  | "quick-launch"
  | "cinema-showcase"
  | "viral-presets"
  | "supercomputer-banner"
  | "image-gallery"
  | "marketing-banner"
  | "video-worlds"
  | "canvas-banner"
  | "influencer-gallery"
  | "games-gallery"
  | "explore-apps"
  | "status-strip";

export type StudioShowcaseLayoutMode =
  | "featuredRail"
  | "mosaic"
  | "banner"
  | "chipCloud"
  | "compactAppGrid";

export type StudioShowcaseSectionDefinition = {
  id: StudioShowcasePageSectionId;
  title: string;
  description?: string;
  assetSection?: StudioShowcaseSection;
  layoutMode: StudioShowcaseLayoutMode;
  order: number;
};
