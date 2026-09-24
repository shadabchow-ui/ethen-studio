import { MEDIA_APPS, filterMediaApps } from "./apps";
import type {
  MediaApp,
  MediaAppCategory,
  MediaStudioTabId,
  MediaAppSectionId,
} from "./types";
import type { MediaAppDefinition } from "./apps";
import { evaluateAppGate, type AppSafetyGateState, type AppSafetyGateResult } from "./safety/app-gate";

export interface MediaStudioNavItem {
  id: MediaStudioTabId;
  label: string;
  description: string;
  enabled: boolean;
  isPlaceholder: boolean;
}

export const MEDIA_STUDIO_NAV_ITEMS: MediaStudioNavItem[] = [
  { id: "explore", label: "Explore", description: "Featured and recently used apps", enabled: true, isPlaceholder: false },
  { id: "image", label: "Image", description: "Image creation and editing tools", enabled: true, isPlaceholder: false },
  { id: "video", label: "Video", description: "Video creation and motion tools", enabled: true, isPlaceholder: false },
  { id: "audio", label: "Audio", description: "Audio and voice tools", enabled: true, isPlaceholder: false },
  { id: "supercomputer", label: "Supercomputer", description: "High-compute media surface — not wired yet", enabled: true, isPlaceholder: true },
  { id: "mcp-cli", label: "MCP & CLI", description: "MCP and CLI tooling surface — not wired yet", enabled: true, isPlaceholder: true },
  { id: "collab", label: "Collab", description: "Collaboration surface — not wired yet", enabled: true, isPlaceholder: true },
  { id: "plugins", label: "Plugins", description: "Utility and trust tools", enabled: true, isPlaceholder: false },
  { id: "marketing-studio", label: "Marketing Studio", description: "Marketing and product content tools", enabled: true, isPlaceholder: false },
  { id: "cinema-studio", label: "Cinema Studio", description: "Cinematic and motion tools", enabled: true, isPlaceholder: false },
  { id: "ai-influencer", label: "AI Influencer", description: "Influencer and identity tools", enabled: true, isPlaceholder: false },
  { id: "canvas", label: "Canvas", description: "Planning and moodboard tools", enabled: true, isPlaceholder: false },
  { id: "apps", label: "Apps", description: "All apps organized by section", enabled: true, isPlaceholder: false },
];

export const MEDIA_STUDIO_PLACEHOLDER_TABS: MediaStudioTabId[] = ["supercomputer", "mcp-cli", "collab"];

export const PLACEHOLDER_TAB_CONTENT: Record<MediaStudioTabId, { title: string; note: string } | null> = {
  supercomputer: { title: "Supercomputer", note: "No verified supercomputer-specific media surface is exposed by the current local app metadata. The nav keeps the label visible without inventing non-existent runtimes." },
  "mcp-cli": { title: "MCP & CLI", note: "No media-specific MCP or CLI catalog is grounded in the current local media data. This view stays honest instead of fabricating tooling." },
  collab: { title: "Collab", note: "The current repo does not expose a verified collaboration-specific media catalog yet, so this view stays intentionally sparse." },
  explore: null,
  image: null,
  video: null,
  audio: null,
  plugins: null,
  "marketing-studio": null,
  "cinema-studio": null,
  "ai-influencer": null,
  canvas: null,
  apps: null,
};

export const STUDIO_TAB_TO_SECTION: Partial<Record<MediaStudioTabId, MediaAppSectionId>> = {
  image: "image_creation",
  video: "video_creation",
  audio: "audio_voice",
  "marketing-studio": "marketing_product",
  "cinema-studio": "video_creation",
  "ai-influencer": "influencer_identity",
  canvas: "canvas_planning",
  plugins: "utilities_trust",
};

export const STUDIO_TAB_TO_CATEGORY: Partial<Record<MediaStudioTabId, string>> = {
  image: "image",
  video: "video",
  audio: "audio",
  "marketing-studio": "marketing",
  "cinema-studio": "video",
  "ai-influencer": "influencer",
  canvas: "canvas",
  plugins: "utility",
};

export function getAppsForStudioTab(tabId: MediaStudioTabId): MediaApp[] {
  if (tabId === "explore") {
    return MEDIA_APPS.filter((app) => (app.flags ?? []).includes("featured")).slice(0, 6);
  }
  if (tabId === "apps") {
    return MEDIA_APPS;
  }

  const section = STUDIO_TAB_TO_SECTION[tabId];
  if (section) {
    return filterMediaApps({ section });
  }

  const category = STUDIO_TAB_TO_CATEGORY[tabId];
  if (category) {
    return filterMediaApps({ category: category as MediaAppCategory });
  }

  return [];
}

export function getFeaturedAppIds(): string[] {
  return MEDIA_APPS.filter((app) => (app.flags ?? []).includes("featured")).map((app) => app.id);
}

export function getAppById(id: string): MediaAppDefinition | undefined {
  return MEDIA_APPS.find((app) => app.id === id);
}

export function evaluateAppById(id: string, consentProvided: boolean): AppSafetyGateResult | null {
  const app = getAppById(id);
  if (!app) return null;
  return evaluateAppGate(app, consentProvided);
}

export function getAppsByGateState(state: AppSafetyGateState): MediaAppDefinition[] {
  return MEDIA_APPS.filter((app) => {
    const gate = evaluateAppGate(app, false);
    return gate.state === state;
  });
}

export function getRiskyAppIds(): string[] {
  return MEDIA_APPS
    .filter((app) => {
      const gate = evaluateAppGate(app, false);
      return gate.state !== "allowed";
    })
    .map((app) => app.id);
}

export function getBlockedAppIds(): string[] {
  return getAppsByGateState("blocked").map((app) => app.id);
}

export function getConsentRequiredAppIds(): string[] {
  return getAppsByGateState("consent_required").map((app) => app.id);
}

export function getApprovalRequiredAppIds(): string[] {
  return getAppsByGateState("approval_required").map((app) => app.id);
}
