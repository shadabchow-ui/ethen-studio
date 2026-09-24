/**
 * Studio V2 Job 12 (P0-10) — lifecycle-derived Studio navigation contract.
 *
 * Studio shell/palette entries derive from the canonical portfolio registry
 * plus enrollment audience. Nothing is hardcoded around the registry: while
 * Studio is lifecycle-`unavailable`/HIDDEN this module yields no public
 * entries, and promotion flows through evidence-bound registry change — not
 * through nav edits.
 */

import {
  getPortfolioEntry,
  isVisibleOnSurface,
  lifecycleToNavBadge,
  type DiscoverySurface,
  type PortfolioEntry,
} from "@ethen/contracts/portfolio/index";
import type { NavItemConfig } from "./navigation";

export interface StudioAudience {
  /** Private-alpha enrollment (enrolled organization / allowlist). */
  enrolled: boolean;
}

export interface StudioNavEntry extends NavItemConfig {
  surface: DiscoverySurface;
}

const STUDIO_ENTRY_DEFINITIONS: ReadonlyArray<{
  id: string;
  label: string;
  icon: string;
  href: string;
  surface: DiscoverySurface;
}> = [
  { id: "studio", label: "Studio", icon: "sparkle", href: "/studio", surface: "navigation" },
  { id: "studio-projects", label: "Projects", icon: "project", href: "/studio/projects", surface: "navigation" },
  { id: "studio-assets", label: "Assets", icon: "files", href: "/studio/assets", surface: "navigation" },
  { id: "studio-jobs", label: "Jobs", icon: "clock", href: "/studio/jobs", surface: "navigation" },
  { id: "studio-canvas", label: "Canvas", icon: "grid", href: "/studio/canvas", surface: "navigation" },
];

const STUDIO_PALETTE_DEFINITIONS: ReadonlyArray<{
  id: string;
  label: string;
  href: string;
}> = [
  { id: "studio-open", label: "Open Studio", href: "/studio" },
  { id: "studio-new", label: "New Studio project", href: "/studio/projects" },
  { id: "studio-jobs-open", label: "Open Studio jobs", href: "/studio/jobs" },
];

export interface StudioPaletteEntry {
  id: string;
  label: string;
  group: "Studio";
  href: string;
  badge?: "beta" | "preview" | "soon";
}

/**
 * Derive Studio shell-nav entries. Public surfaces follow registry
 * visibility; the enrolled Studio audience additionally sees entries inside
 * Studio's own enrollment-gated scope once the lifecycle leaves
 * `unavailable`/`retired`. Enrolled visibility never overrides a frozen or
 * retired product, and never leaks to public discovery surfaces.
 */
export function deriveStudioNavEntries(
  entry: PortfolioEntry | undefined,
  audience: StudioAudience,
): StudioNavEntry[] {
  if (!entry) return [];
  if (entry.lifecycle === "retired") return [];
  const badge = lifecycleToNavBadge(entry.lifecycle);
  const toEntry = (definition: (typeof STUDIO_ENTRY_DEFINITIONS)[number]): StudioNavEntry => ({
    id: definition.id,
    label: definition.label,
    icon: definition.icon,
    href: definition.href,
    badge,
    surface: definition.surface,
  });
  // Public surfaces follow registry visibility; hidden products never leak.
  const visible = STUDIO_ENTRY_DEFINITIONS.filter((definition) =>
    isVisibleOnSurface(entry, definition.surface),
  );
  if (visible.length > 0) return visible.map(toEntry);
  // Enrolled-only scope: once evidence promotes Studio past `unavailable`,
  // enrolled users see entries inside the gated boundary. Frozen (`unavailable`)
  // and retired products stay hidden for everyone.
  if (!audience.enrolled) return [];
  if (entry.lifecycle === "unavailable") return [];
  return STUDIO_ENTRY_DEFINITIONS.map(toEntry);
}

/**
 * Derive Studio palette entries under the same authority. Hidden or
 * unavailable products never leak into the shared palette; enrolled scope
 * entries are returned for Studio's own palette host only.
 */
export function deriveStudioPaletteEntries(
  entry: PortfolioEntry | undefined,
  audience: StudioAudience,
): StudioPaletteEntry[] {
  if (!entry || entry.lifecycle === "retired") return [];
  const badge = lifecycleToNavBadge(entry.lifecycle);
  // Shared palette follows registry visibility; hidden products never leak.
  if (isVisibleOnSurface(entry, "command-palette")) {
    return STUDIO_PALETTE_DEFINITIONS.map((definition) => ({
      ...definition,
      group: "Studio" as const,
      badge,
    }));
  }
  // Studio's own palette host (inside the enrollment gate) may surface
  // entries once the lifecycle leaves `unavailable`.
  if (!audience.enrolled || entry.lifecycle === "unavailable") return [];
  return STUDIO_PALETTE_DEFINITIONS.map((definition) => ({
    ...definition,
    group: "Studio" as const,
    badge,
  }));
}

/**
 * Studio V3 Job 4 — project-scoped href helpers (additive; entry derivation
 * unchanged). Project sections live under the workspace header, not the
 * global registry, because they require a durable project identity.
 */
export type StudioProjectSection =
  | "overview"
  | "create-image"
  | "edit-image"
  | "create-video"
  | "assets"
  | "characters"
  | "products"
  | "brands"
  | "review"
  | "export";

const STUDIO_PROJECT_SECTION_PATHS: Readonly<Record<StudioProjectSection, string>> = {
  overview: "",
  "create-image": "/create/image",
  "edit-image": "/edit/image",
  "create-video": "/create/video",
  assets: "/assets",
  characters: "/characters",
  products: "/products",
  brands: "/brands",
  review: "/review",
  export: "/export",
};

export function studioProjectHref(projectId: string, section: StudioProjectSection = "overview"): string {
  return `/studio/projects/${projectId}${STUDIO_PROJECT_SECTION_PATHS[section]}`;
}

/** Parse a project href back to identity + section; null when not a project route. */
export function parseStudioProjectHref(pathname: string): { projectId: string; section: StudioProjectSection } | null {
  const match = /^\/studio\/projects\/([^/]+)(\/.*)?$/.exec(pathname.split("?")[0] ?? "");
  if (!match?.[1]) return null;
  const rest = match[2] ?? "";
  const entry = (Object.entries(STUDIO_PROJECT_SECTION_PATHS) as Array<[StudioProjectSection, string]>).find(([, path]) => path === rest);
  if (!entry) return null;
  return { projectId: match[1], section: entry[0] };
}

/** Registry-backed convenience wrappers (single call sites for hosts). */
export function getStudioNavEntries(audience: StudioAudience): StudioNavEntry[] {
  return deriveStudioNavEntries(getPortfolioEntry("studio"), audience);
}

export function getStudioPaletteEntries(audience: StudioAudience): StudioPaletteEntry[] {
  return deriveStudioPaletteEntries(getPortfolioEntry("studio"), audience);
}
