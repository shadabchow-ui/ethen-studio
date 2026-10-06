import { STUDIO_CANONICAL_ROUTES } from "@/lib/studio-v5/route-map";

export interface TemplateEntry {
  id: string;
  title: string;
  description: string;
  href: string;
  versionLabel: string;
  rightsLabel: string;
}

// RC5 — template targets built from the route map (no legacy aliases).
// RC7 — pure data module (no React) so the search index and node tests can
// import it without pulling the library component.
export const CURATED_TEMPLATES: readonly TemplateEntry[] = [
  { id: "product-shot", title: "Product shot", description: "Clean product render with direction controls.", href: `${STUDIO_CANONICAL_ROUTES.canvas}?template=product-shot`, versionLabel: "v1", rightsLabel: "Your generations" },
  { id: "scene-board", title: "Scene board", description: "Shot list with takes and review handoff.", href: `${STUDIO_CANONICAL_ROUTES.canvas}?template=scene-board`, versionLabel: "v1", rightsLabel: "Your generations" },
  { id: "voice-draft", title: "Voice draft", description: "Script to speech starter with voice slots.", href: `${STUDIO_CANONICAL_ROUTES.createVoice}?template=voice-draft`, versionLabel: "v1", rightsLabel: "Voice consent required" },
  { id: "campaign-starter", title: "Campaign starter", description: "Brief to first variants for review.", href: `${STUDIO_CANONICAL_ROUTES.canvas}?template=campaign-starter`, versionLabel: "v1", rightsLabel: "Review required" },
];
