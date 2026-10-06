/**
 * STUDIO_08 → V5 M1 — authority navigation model (pure, browser-safe).
 *
 * Owner Lock D information architecture. The Studio sidebar is the only
 * global navigation: Explore, then CREATE, BUILD, DISCOVER, WORK, PRO
 * (collapsible) and PRODUCTS (collapsible). Every entry points at its
 * canonical V5 route (M1 route map); legacy URLs redirect server-side in
 * one hop, so no entry links to a redirect, a hash on the home page, or a
 * page that bounces home.
 *
 * Entries without a runnable destination yet are disabled with an honest
 * reason — never a fake link. Project-scoped entries resolve through the
 * canonical active project.
 */

export interface StudioV5NavEntry {
  id: string;
  label: string;
  /**
   * Static href. Entries needing project scope use hrefFor +
   * disabledWithoutProjectReason; an entry with BOTH href and hrefFor
   * uses the project route when a project is selected and falls back to
   * the public href otherwise (RC4: sidebar Edit matches the tab).
   */
  href?: string;
  hrefFor?: (projectId: string) => string;
  disabledWithoutProjectReason?: string;
  /** Full workbench title derived by pro pages (RC5: no generic "Pro Workbench"). */
  title?: string;
  /** Deferred feature; renders disabled with this reason. */
  deferredReason?: string;
  /** Route prefixes that mark this entry active (deep-link aware). */
  activePrefixes: readonly string[];
  /** Specific suffixes that win over broader prefixes (project review). */
  activeSuffixes?: readonly string[];
  icon: string;
}

export interface StudioV5NavSection {
  id: string;
  label: string;
  /** Expandable groups (Pro, Products) collapse to one row when closed. */
  expandable?: boolean;
  entries: readonly StudioV5NavEntry[];
}

export function getStudioV5NavSections(): readonly StudioV5NavSection[] {
  return [
    {
      id: "explore",
      label: "Explore",
      entries: [
        { id: "home", label: "Home", href: "/studio", activePrefixes: ["/studio"], icon: "home" },
        { id: "explore", label: "Explore", href: "/studio/explore", activePrefixes: ["/studio/explore"], icon: "compass" },
      ],
    },
    {
      id: "create",
      label: "Create",
      entries: [
        { id: "create-image", label: "Image", href: "/studio/create/image", activePrefixes: ["/studio/create/image"], activeSuffixes: ["/create/image"], icon: "image" },
        { id: "create-video", label: "Video", href: "/studio/create/video", activePrefixes: ["/studio/create/video"], activeSuffixes: ["/create/video"], icon: "video" },
        { id: "create-voice", label: "Voice", href: "/studio/create/voice", activePrefixes: ["/studio/create/voice"], icon: "voice" },
        { id: "create-music", label: "Music", href: "/studio/create/music", activePrefixes: ["/studio/create/music"], icon: "music" },
        { id: "create-sfx", label: "Sound effects", href: "/studio/create/sfx", activePrefixes: ["/studio/create/sfx"], icon: "sfx" },
        { id: "create-transcribe", label: "Transcribe", href: "/studio/create/transcribe", activePrefixes: ["/studio/create/transcribe"], icon: "transcribe" },
        { id: "create-dub", label: "Dub", href: "/studio/create/dub", activePrefixes: ["/studio/create/dub"], icon: "dubbing" },
        { id: "create-changer", label: "Change voice", href: "/studio/create/changer", activePrefixes: ["/studio/create/changer"], icon: "changer" },
        { id: "create-3d", label: "3D", href: "/studio/create/3d", activePrefixes: ["/studio/create/3d"], icon: "cube" },
        {
          id: "create-edit",
          label: "Edit",
          // RC5 — the project edit route is a legacy redirect source, so
          // the sidebar links the public edit runtime like the mode tab;
          // project scope rides the preserved ?projectId= query.
          href: "/studio/create/edit",
          activePrefixes: ["/studio/create/edit"],
          activeSuffixes: ["/edit/image"],
          icon: "edit",
        },
      ],
    },
    {
      id: "build",
      label: "Build",
      entries: [
        { id: "canvas", label: "Canvas", href: "/studio/workflows", activePrefixes: ["/studio/workflows"], icon: "grid" },
        { id: "apps", label: "Apps", href: "/studio/apps", activePrefixes: ["/studio/apps"], icon: "apps" },
        { id: "agent", label: "Creative Agent", href: "/studio/agent", activePrefixes: ["/studio/agent", "/studio/director"], icon: "sparkle" },
      ],
    },
    {
      id: "discover",
      label: "Discover",
      entries: [
        { id: "models", label: "Models", href: "/studio/models", activePrefixes: ["/studio/models"], icon: "model" },
        { id: "templates", label: "Templates", href: "/studio/templates", activePrefixes: ["/studio/templates"], icon: "template" },
        { id: "voices", label: "Voices", href: "/studio/voices", activePrefixes: ["/studio/voices"], icon: "voice" },
        { id: "characters", label: "Characters", href: "/studio/identities/characters", activePrefixes: ["/studio/identities/characters"], activeSuffixes: ["/characters"], icon: "identity" },
        { id: "products", label: "Products", href: "/studio/identities/products", activePrefixes: ["/studio/identities/products"], activeSuffixes: ["/products"], icon: "product" },
        { id: "brands", label: "Brands", href: "/studio/identities/brands", activePrefixes: ["/studio/identities/brands"], activeSuffixes: ["/brands"], icon: "brand" },
      ],
    },
    {
      id: "work",
      label: "Work",
      entries: [
        { id: "projects", label: "Projects", href: "/studio/work/projects", activePrefixes: ["/studio/work/projects", "/studio/projects"], icon: "project" },
        { id: "assets", label: "Assets", href: "/studio/work/assets", activePrefixes: ["/studio/work/assets"], activeSuffixes: ["/assets"], icon: "files" },
        { id: "history", label: "History", href: "/studio/work/jobs", activePrefixes: ["/studio/work/jobs"], icon: "clock" },
        { id: "reviews", label: "Reviews", href: "/studio/work/reviews", activePrefixes: ["/studio/work/reviews"], activeSuffixes: ["/review"], icon: "review" },
      ],
    },
    {
      id: "pro",
      label: "Pro",
      expandable: true,
      entries: [
        { id: "pro-image", label: "Image", title: "Image Studio", href: "/studio/pro/image", activePrefixes: ["/studio/pro/image"], icon: "image" },
        { id: "pro-video", label: "Video", title: "Video Studio", href: "/studio/pro/video", activePrefixes: ["/studio/pro/video"], icon: "video" },
        { id: "pro-audio", label: "Audio", title: "Audio Studio", href: "/studio/pro/audio", activePrefixes: ["/studio/pro/audio"], icon: "audio" },
        { id: "pro-dubbing", label: "Dubbing", title: "Dubbing Studio", href: "/studio/pro/dubbing", activePrefixes: ["/studio/pro/dubbing"], icon: "dubbing" },
        { id: "pro-cinema", label: "Cinema", title: "Cinema Studio", href: "/studio/pro/cinema", activePrefixes: ["/studio/pro/cinema"], icon: "cinema" },
      ],
    },
    {
      id: "products",
      label: "Products",
      expandable: true,
      entries: [
        { id: "marketing", label: "Marketing Studio", href: "/studio/marketing", activePrefixes: ["/studio/marketing", "/studio/campaigns"], icon: "marketing" },
        { id: "influencer", label: "AI Influencer", href: "/studio/influencer", activePrefixes: ["/studio/influencer"], icon: "influencer" },
        { id: "voice-agents", label: "Voice Agents", href: "/studio/voice-agents", activePrefixes: ["/studio/voice-agents"], icon: "realtime" },
      ],
    },
  ];
}

export interface StudioNavContext {
  projectId: string | null;
}

export interface ResolvedStudioV5NavEntry extends StudioV5NavEntry {
  resolvedHref: string | null;
  disabledReason: string | null;
}

export function resolveStudioV5Entry(entry: StudioV5NavEntry, context: StudioNavContext): ResolvedStudioV5NavEntry {
  if (entry.deferredReason) {
    return { ...entry, resolvedHref: null, disabledReason: entry.deferredReason };
  }
  if (entry.hrefFor) {
    if (context.projectId) {
      return { ...entry, resolvedHref: entry.hrefFor(context.projectId), disabledReason: null };
    }
    // RC4 — entries with both hrefFor and href fall back to the public
    // href without a project (sidebar Edit matches the Edit Image tab);
    // hrefFor-only entries keep the historical disabled behavior.
    if (entry.href) {
      return { ...entry, resolvedHref: entry.href, disabledReason: null };
    }
    return { ...entry, resolvedHref: null, disabledReason: entry.disabledWithoutProjectReason ?? "Select a project." };
  }
  return { ...entry, resolvedHref: entry.href ?? null, disabledReason: null };
}

/** Strip hash/query for active matching; /studio matches only the exact home. */
export function normalizeStudioPath(pathname: string): string {
  const clean = (pathname.split("#")[0] ?? "").split("?")[0] ?? "";
  return clean.length > 1 && clean.endsWith("/") ? clean.slice(0, -1) : clean || "/";
}

function matchesStudioSuffix(path: string, entry: StudioV5NavEntry): boolean {
  return (entry.activeSuffixes ?? []).some(
    (suffix) => path === suffix || (path.startsWith("/studio/") && path.endsWith(suffix)),
  );
}

export function isStudioEntryActive(pathname: string, entry: StudioV5NavEntry): boolean {
  const path = normalizeStudioPath(pathname);
  if (entry.id === "home") return path === "/studio";
  if (matchesStudioSuffix(path, entry)) return true;
  return entry.activePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function findActiveStudioEntryId(pathname: string): string | null {
  const path = normalizeStudioPath(pathname);
  if (path === "/studio") return "home";
  const sections = getStudioV5NavSections();
  // Specific suffix matches win over broader prefixes.
  for (const section of sections) {
    for (const entry of section.entries) {
      if (entry.id !== "home" && matchesStudioSuffix(path, entry)) return entry.id;
    }
  }
  for (const section of sections) {
    for (const entry of section.entries) {
      if (isStudioEntryActive(pathname, entry)) return entry.id;
    }
  }
  return null;
}

/**
 * RC5 — pro workbench title for a tool slug, derived from the nav
 * registry so page metadata and headers match sidebar/app naming.
 */
export function studioProTitleForTool(tool: string): string | null {
  const pro = getStudioV5NavSections().find((section) => section.id === "pro");
  const entry = pro?.entries.find((candidate) => candidate.id === `pro-${tool}`);
  return entry?.title ?? null;
}

/**
 * Preserve discovery context across navigation: project selection and
 * browse filters survive tool switches. Only allowlisted keys carry over.
 * Page-scoped params (`view`) never leak across pages (RC5: no more
 * `?view=expert` on Templates).
 */
const PRESERVED_QUERY_KEYS = ["projectId", "q", "task", "category"] as const;

export function preserveStudioQuery(href: string, currentSearch: string): string {
  let current: URLSearchParams;
  try {
    current = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  } catch {
    return href;
  }
  const [base, hash] = href.split("#");
  const target = new URLSearchParams((base ?? "").includes("?") ? (base ?? "").split("?")[1] ?? "" : "");
  for (const key of PRESERVED_QUERY_KEYS) {
    if (!target.has(key) && current.has(key)) {
      const value = current.get(key);
      if (value !== null) target.set(key, value);
    }
  }
  const query = target.toString();
  const cleanBase = (base ?? "").split("?")[0];
  return `${cleanBase}${query ? `?${query}` : ""}${hash !== undefined ? `#${hash}` : ""}`;
}

function navConceptKey(label: string): string {
  const normalized = label.trim().toLowerCase();
  // Create "Dub" and Pro "Dubbing" are one concept with different labels.
  if (normalized === "dub" || normalized === "dubbing") return "dub";
  return normalized;
}

/**
 * RC13 — accessible-name overrides for rail items. Labels that repeat
 * across sections (Create/Pro Image, Video, Dub/Dubbing) gain a section
 * qualifier ("Image (Create)"); anything else keeps its visible text.
 * Returns only the overridden ids (missing = no override).
 */
export function studioNavAccessibleNames(
  sections: readonly StudioV5NavSection[] = getStudioV5NavSections(),
): ReadonlyMap<string, string> {
  const sectionsByConcept = new Map<string, Set<string>>();
  for (const section of sections) {
    for (const entry of section.entries) {
      const key = navConceptKey(entry.label);
      const set = sectionsByConcept.get(key) ?? new Set<string>();
      set.add(section.id);
      sectionsByConcept.set(key, set);
    }
  }
  const names = new Map<string, string>();
  for (const section of sections) {
    for (const entry of section.entries) {
      const shared = (sectionsByConcept.get(navConceptKey(entry.label)) ?? new Set()).size > 1;
      if (shared) names.set(entry.id, `${entry.label} (${section.label})`);
    }
  }
  return names;
}

/** Roving-tabindex movement for the sidebar (Arrow/Home/End, wrapping). */
export function moveRovingIndex(current: number, count: number, key: string): number {
  if (count <= 0) return 0;
  const clamped = Math.min(Math.max(current, 0), count - 1);
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return (clamped + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return (clamped - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return clamped;
  }
}
