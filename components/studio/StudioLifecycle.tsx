/**
 * IE-M6B M6B-07 — studio lifecycle shell (client boundary).
 *
 * Adopts M5-01 route focus (single announcement region) for studio routes.
 * Mounted once in the app root layout, outside any suspense boundary, so
 * identity focus never waits on data regions and the contract survives
 * workbench ↔ non-workbench transitions.
 *
 * Pass 2: titles resolve per route from the pages' own metadata titles
 * (extracted from each page's `metadata.title`), so the focus contract no
 * longer fights per-route metadata with a fixed string. Untitled routes
 * (audio/image/video) inherit the root default "Ethen Studio", which is
 * exactly what the metadata system shows there.
 */
"use client";

import { usePathname } from "next/navigation";
import { EthenRouteFocus } from "@ethen/app-shell/a11y/next";

const STUDIO_TITLES: Record<string, string> = {
  "/studio": "Studio",
  "/studio/apps": "Studio Apps",
  "/studio/apps/ai-influencer": "AI Influencer",
  "/studio/apps/character-motion": "Character Motion",
  "/studio/apps/cinematic-scene": "Cinematic Scene",
  "/studio/apps/create-image": "Create Image",
  "/studio/apps/game-assets": "Game Assets",
  "/studio/apps/image-to-video": "Image to Video",
  "/studio/apps/marketing": "Marketing Studio",
  "/studio/apps/product-ad": "Product Ad",
  "/studio/apps/text-to-video": "Text to Video",
  "/studio/archive": "Studio Archive (Preview) — Ethen",
  "/studio/assets": "Assets",
  "/studio/campaigns": "Campaigns",
  "/studio/canvas": "Canvas",
  "/studio/cinema": "Cinema",
  "/studio/director": "Creative Director",
  "/studio/exports": "Exports & Review",
  "/studio/jobs": "Jobs",
  "/studio/models": "Models",
  "/studio/projects": "Projects",
  "/studio/workflows": "Canvas Workflows",
};

const DEFAULT_TITLE = "Ethen Studio";

export function titleForStudioPath(pathname: string | null): string {
  if (!pathname) return DEFAULT_TITLE;
  return STUDIO_TITLES[pathname] ?? DEFAULT_TITLE;
}

export function StudioLifecycle(): React.JSX.Element {
  // Remediation Pass 1: shell identity moved to the AppShell chrome root
  // (the actual lifetime owner). This boundary keeps focus only — the old
  // display:contents marker had no box and could never satisfy the
  // rendered-shell contract.
  const pathname = usePathname();
  return <EthenRouteFocus title={titleForStudioPath(pathname)} />;
}
