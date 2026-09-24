import {
  buildNavSectionsFromPortfolio,
  buildProductCommandItemsFromPortfolio,
  buildCommandCenterAgentItemsFromPortfolio,
  isVisibleOnSurface,
  resolvePortfolioEntryForPath,
  CANONICAL_FLAGSHIP_RUNTIME_MAP,
  type DeploymentTarget,
} from "@ethen/contracts/portfolio/index";

export type NavItemConfig = {
  id: string;
  label: string;
  icon: string;
  href: string;
  badge?: "soon" | "new" | "preview" | "beta" | "mock";
  children?: NavItemConfig[];
};

export type NavSection = {
  label: string;
  items: NavItemConfig[];
};

export type RouteLoadingCategory = "document" | "workspace" | "data" | "editor" | "none";
export type RouteScrollOwner = "shell" | "page" | "panel" | "browser";
export type RoutePerformanceCategory = "marketing" | "document" | "workspace" | "data-heavy" | "interactive";

export type RouteMeta = {
  href: string;
  label: string;
  title: string;
  navigationGroup: string;
  commandPaletteVisible: boolean;
  loadingCategory: RouteLoadingCategory;
  scrollOwner: RouteScrollOwner;
  performanceCategory: RoutePerformanceCategory;
};

/**
 * Canonical, static, typed route registry. This is the single source of truth
 * for route label, page title, navigation group, command-palette visibility,
 * loading category, primary scroll owner, and performance category.
 *
 * Rules:
 * - Route groups are represented by their URL-stable hrefs (no `(group)` segments).
 * - Dynamic segments use the App Router placeholder form (e.g. `[runId]`).
 * - Nested routes without a dedicated entry resolve to their nearest ancestor
 *   section entry via {@link matchRouteMeta}; unknown routes resolve to `undefined`
 *   and are never given fabricated metadata.
 * - `title` and `label` preserve existing user-facing strings verbatim.
 *
 * The nine scoped production route families are exhaustively represented at the
 * section level and enforced by `scripts/validate-scroll-owner.ts`:
 * ai-gateway, settings, model-library, agent-runs, logs, code, studio,
 * local-models (`/local-models`), and sentinel.
 */
export const ROUTE_REGISTRY = [
  // Root / workspace compatibility
  { href: "/", label: "Home", title: "Home", navigationGroup: "Navigate", commandPaletteVisible: false, loadingCategory: "document", scrollOwner: "shell", performanceCategory: "marketing" },
  { href: "/console", label: "Console", title: "Console", navigationGroup: "Build", commandPaletteVisible: true, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/workspace", label: "Workspace", title: "Model Workspace", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/chat", label: "Chat", title: "Chat", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  // Legacy /chats redirects to the model workspace family (next.config
  // + proxy); they carry no page identity and no registry entry.

  // Settings (scoped)
  { href: "/settings", label: "Settings", title: "Settings", navigationGroup: "System", commandPaletteVisible: true, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },

  // Logs (scoped)
  { href: "/logs", label: "Logs", title: "Logs", navigationGroup: "Advanced", commandPaletteVisible: true, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },

  // Code (scoped)
  { href: "/code", label: "Code", title: "Code", navigationGroup: "Build", commandPaletteVisible: true, loadingCategory: "editor", scrollOwner: "panel", performanceCategory: "interactive" },
  { href: "/code/settings", label: "Code Settings", title: "Code Settings", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },

  // Local Models (canonical route family)
  { href: "/local-models", label: "Local", title: "Local", navigationGroup: "Navigate", commandPaletteVisible: true, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/local-models/chat", label: "Local Chat", title: "Local Chat", navigationGroup: "Navigate", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "panel", performanceCategory: "interactive" },
  { href: "/local-models/installed", label: "Installed Models", title: "Installed Models", navigationGroup: "Navigate", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/local-models/catalog", label: "Local Catalog", title: "Local Catalog", navigationGroup: "Navigate", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/local-models/providers", label: "Local Providers", title: "Local Providers", navigationGroup: "Navigate", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/local-models/diagnostics", label: "Local Diagnostics", title: "Local Diagnostics", navigationGroup: "Navigate", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },

  // Model Library (scoped)
  { href: "/model-library", label: "Model Library", title: "Model Library", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },

  // Agent Runs (scoped)
  { href: "/agent-runs", label: "Agent Runs", title: "Agent Runs", navigationGroup: "Advanced", commandPaletteVisible: true, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/agent-runs/[runId]", label: "Agent Run", title: "Agent Runs", navigationGroup: "Advanced", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },

  // AI Gateway (scoped)
  { href: "/ai-gateway", label: "Gateway", title: "Gateway", navigationGroup: "Platform", commandPaletteVisible: true, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/ai-gateway/api-keys", label: "API Keys", title: "API Keys", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/ai-gateway/byok", label: "Bring Your Own Key", title: "Bring Your Own Key", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/ai-gateway/docs", label: "Documentation", title: "Documentation", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "document", scrollOwner: "shell", performanceCategory: "document" },
  { href: "/ai-gateway/keys", label: "API Keys", title: "API Keys", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/ai-gateway/leaderboards", label: "Leaderboards", title: "Leaderboards", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/ai-gateway/logs", label: "Logs", title: "Logs", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/ai-gateway/models", label: "Model List", title: "Model List", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/ai-gateway/playground", label: "Playground", title: "Playground", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "editor", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/ai-gateway/providers", label: "Providers", title: "Providers", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/ai-gateway/quick-start", label: "Quick Start", title: "Quick Start", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "document", scrollOwner: "shell", performanceCategory: "document" },
  { href: "/ai-gateway/settings", label: "Settings", title: "Settings", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/ai-gateway/templates", label: "Templates", title: "Templates", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/ai-gateway/usage", label: "Usage", title: "Usage", navigationGroup: "Platform", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },

  // Studio (scoped)
  { href: "/studio", label: "Studio", title: "Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/studio/apps", label: "Apps", title: "Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/studio/assets", label: "Assets", title: "Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/studio/audio", label: "Audio", title: "Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "editor", scrollOwner: "panel", performanceCategory: "interactive" },
  { href: "/studio/canvas", label: "Canvas", title: "Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "editor", scrollOwner: "panel", performanceCategory: "interactive" },
  { href: "/studio/image", label: "Image", title: "Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "editor", scrollOwner: "panel", performanceCategory: "interactive" },
  { href: "/studio/jobs", label: "Jobs", title: "Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/studio/models", label: "Models", title: "Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/studio/projects", label: "Projects", title: "Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/studio/video", label: "Video", title: "Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "editor", scrollOwner: "panel", performanceCategory: "interactive" },

  // Sentinel (scoped — native console owns its own scroll region)
  { href: "/sentinel", label: "Security", title: "Security", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "panel", performanceCategory: "interactive" },
  { href: "/sentinel/repos", label: "Repositories", title: "Repositories", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "panel", performanceCategory: "data-heavy" },
  { href: "/sentinel/repos/[repoId]", label: "Repository", title: "Repository", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "panel", performanceCategory: "data-heavy" },
  { href: "/sentinel/review", label: "Review Queue", title: "Review Queue", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "panel", performanceCategory: "data-heavy" },
  { href: "/sentinel/history", label: "Scan History", title: "Scan History", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "panel", performanceCategory: "data-heavy" },
  { href: "/sentinel/reports", label: "Reports", title: "Reports", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "panel", performanceCategory: "data-heavy" },
  { href: "/sentinel/status", label: "Readiness", title: "Readiness", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "panel", performanceCategory: "interactive" },
  { href: "/sentinel/settings", label: "Settings", title: "Settings", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "panel", performanceCategory: "interactive" },
  { href: "/sentinel/intake", label: "Repo Intake", title: "Repo Intake", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "panel", performanceCategory: "interactive" },
  { href: "/sentinel/scans/preview", label: "Scan Plan Preview", title: "Scan Plan Preview", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "panel", performanceCategory: "interactive" },
  { href: "/sentinel/scans/[scanPlanId]", label: "Scan", title: "Scan", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "panel", performanceCategory: "data-heavy" },
  { href: "/sentinel/scans/[scanPlanId]/findings", label: "Findings Inbox", title: "Findings Inbox", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "panel", performanceCategory: "data-heavy" },
  { href: "/sentinel/findings/[findingId]", label: "Finding", title: "Finding", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "panel", performanceCategory: "data-heavy" },
  { href: "/sentinel/findings/[findingId]/evidence", label: "Evidence", title: "Evidence", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "panel", performanceCategory: "data-heavy" },
  { href: "/sentinel/patches/[patchProposalId]", label: "Patch Proposal", title: "Patch Proposal", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "panel", performanceCategory: "data-heavy" },

  // Workflow
  { href: "/workflow-agent", label: "Flow", title: "Flow", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/workflow-agent/build", label: "Workflow builder", title: "Workflow", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "editor", scrollOwner: "panel", performanceCategory: "interactive" },

  // Platform / advanced (non-scoped, AppShell-backed document/data routes)
  { href: "/projects", label: "Projects", title: "Projects", navigationGroup: "Platform", commandPaletteVisible: true, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/marketplace", label: "Fleet", title: "Fleet", navigationGroup: "Platform", commandPaletteVisible: true, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/sessions", label: "Sessions", title: "Sessions", navigationGroup: "Navigate", commandPaletteVisible: true, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/artifacts", label: "Artifacts", title: "Artifacts", navigationGroup: "Advanced", commandPaletteVisible: true, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/approvals", label: "Approvals", title: "Approvals", navigationGroup: "Advanced", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/audit-log", label: "Audit Log", title: "Audit Log", navigationGroup: "Advanced", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/environment-variables", label: "Environment Variables", title: "Environment Variables", navigationGroup: "Advanced", commandPaletteVisible: true, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/evals", label: "Evals", title: "Evals", navigationGroup: "Advanced", commandPaletteVisible: true, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/firewall", label: "Firewall", title: "Firewall", navigationGroup: "Advanced", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/mcp", label: "MCP", title: "MCP", navigationGroup: "Advanced", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/observability", label: "Observability", title: "Observability", navigationGroup: "Advanced", commandPaletteVisible: true, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/operator", label: "Operator", title: "Operator", navigationGroup: "Advanced", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/policies", label: "Policies", title: "Policies", navigationGroup: "Advanced", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/platform-status", label: "Platform Status", title: "Platform Status", navigationGroup: "Advanced", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/usage", label: "Usage", title: "Usage", navigationGroup: "Advanced", commandPaletteVisible: true, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/founder-agent", label: "Founder", title: "Founder", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },

  // Voice
  { href: "/voice", label: "Voice", title: "Voice", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/voice/agents", label: "Agents", title: "Voice Agents", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/voice/api", label: "API", title: "Voice API", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "document", scrollOwner: "shell", performanceCategory: "document" },
  { href: "/voice/consent", label: "Consent", title: "Voice Consent", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/voice/dub", label: "Dubbing", title: "Voice Dubbing", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "editor", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/voice/local", label: "Local Voice", title: "Local Voice", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/voice/marketplace", label: "Voice Marketplace", title: "Voice Marketplace", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/voice/phone", label: "Phone Agents", title: "Phone Agents", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/voice/sessions", label: "Voice Sessions", title: "Voice Sessions", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
  { href: "/voice/settings", label: "Settings", title: "Voice Settings", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/voice/studio", label: "Studio", title: "Voice Studio", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "editor", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/voice/transcribe", label: "Transcribe", title: "Transcribe", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "workspace", scrollOwner: "shell", performanceCategory: "interactive" },
  { href: "/voice/usage", label: "Usage", title: "Voice Usage", navigationGroup: "Build", commandPaletteVisible: false, loadingCategory: "data", scrollOwner: "shell", performanceCategory: "data-heavy" },
] as const satisfies readonly RouteMeta[];

/**
 * The nine scoped production route families whose primary vertical scroll owner
 * must be declared and enforced. Each entry is the URL-stable section root.
 */
export const SCOPED_ROUTE_ROOTS = [
  "/ai-gateway",
  "/settings",
  "/model-library",
  "/agent-runs",
  "/logs",
  "/code",
  "/studio",
  "/local-models",
  "/sentinel",
] as const;

export function findRouteMeta(href: string): RouteMeta | undefined {
  return ROUTE_REGISTRY.find((route) => route.href === href);
}

/** Split a pathname into non-empty segments, ignoring query/hash. */
function segmentsOf(pathname: string): string[] {
  const clean = pathname.split(/[?#]/)[0] ?? pathname;
  return clean.split("/").filter(Boolean);
}

/**
 * Does a registry href (which may contain `[param]` dynamic segments) match the
 * given concrete pathname exactly, segment for segment?
 */
function hrefMatchesExact(href: string, pathname: string): boolean {
  const a = segmentsOf(href);
  const b = segmentsOf(pathname);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => (seg.startsWith("[") && seg.endsWith("]")) || seg === b[i]);
}

/** Is `prefix` an ancestor of (or equal to) `pathname`, honoring dynamic segments and segment boundaries? */
function hrefIsAncestor(href: string, pathname: string): boolean {
  const a = segmentsOf(href);
  const b = segmentsOf(pathname);
  if (a.length > b.length) return false;
  return a.every((seg, i) => (seg.startsWith("[") && seg.endsWith("]")) || seg === b[i]);
}

/**
 * Resolve the canonical {@link RouteMeta} for a concrete pathname.
 *
 * Resolution order:
 * 1. Exact match (including dynamic-segment routes).
 * 2. Nearest ancestor section entry (longest matching prefix on segment boundaries).
 * 3. `undefined` — unknown routes are never given fabricated metadata.
 */
export function matchRouteMeta(pathname: string): RouteMeta | undefined {
  // 1. Exact (dynamic-aware) match wins.
  const exact = ROUTE_REGISTRY.find((route) => hrefMatchesExact(route.href, pathname));
  if (exact) return exact;

  // 2. Longest ancestor prefix. `/` is only used as an exact match, never as a
  //    catch-all ancestor, so unknown top-level routes fall through to undefined.
  let best: RouteMeta | undefined;
  let bestDepth = -1;
  for (const route of ROUTE_REGISTRY) {
    if (route.href === "/") continue;
    if (!hrefIsAncestor(route.href, pathname)) continue;
    const depth = segmentsOf(route.href).length;
    if (depth > bestDepth) {
      best = route;
      bestDepth = depth;
    }
  }
  return best;
}

/** Canonical page title for a pathname, or `undefined` for unknown routes. */
export function routeTitle(pathname: string): string | undefined {
  return matchRouteMeta(pathname)?.title;
}

/** Canonical scroll owner for a pathname, or `undefined` for unknown routes. */
export function routeScrollOwner(pathname: string): RouteScrollOwner | undefined {
  return matchRouteMeta(pathname)?.scrollOwner;
}

export const SENTINEL_NAV_SECTIONS: NavSection[] = [
  {
    label: "Security",
    items: [
      { id: "sentinel-overview", label: "Overview", icon: "shield", href: "/sentinel" },
      { id: "sentinel-repos", label: "Repositories", icon: "git", href: "/sentinel/repos" },
      { id: "sentinel-review", label: "Review Queue", icon: "tasks", href: "/sentinel/review" },
      { id: "sentinel-history", label: "Scan History", icon: "sessions", href: "/sentinel/history" },
      { id: "sentinel-reports", label: "Reports", icon: "files", href: "/sentinel/reports" },
      { id: "sentinel-status", label: "Readiness", icon: "star", href: "/sentinel/status" },
      { id: "sentinel-settings", label: "Settings", icon: "settings", href: "/sentinel/settings" },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "policies", label: "Policies", icon: "permissions", href: "/policies" },
    ],
  },
];

export const AI_GATEWAY_NAV_SECTIONS: NavSection[] = [
  {
    label: "Gateway",
    items: [
      { id: "ai-gateway-overview", label: "Overview", icon: "models", href: "/ai-gateway" },
      { id: "ai-gateway-model-list", label: "Model List", icon: "files", href: "/ai-gateway/models" },
      { id: "ai-gateway-usage", label: "Usage", icon: "billing", href: "/ai-gateway/usage" },
      { id: "ai-gateway-logs", label: "Logs", icon: "sessions", href: "/ai-gateway/logs" },
      { id: "ai-gateway-api-keys", label: "API Keys", icon: "permissions", href: "/ai-gateway/api-keys" },
      { id: "ai-gateway-playground", label: "Playground", icon: "terminal", href: "/ai-gateway/playground" },
      { id: "ai-gateway-documentation", label: "Documentation", icon: "chats", href: "/ai-gateway/docs" },
    ],
  },
];

/**
 * Primary navigation — derived from the SOL-04 portfolio registry.
 * Do not add product entries here; update lib/portfolio/registry.ts.
 */
export const NAV_SECTIONS: NavSection[] = buildNavSectionsFromPortfolio();

/**
 * SHELL_NAV_SECTIONS — what the application shell actually renders.
 *
 * The Console is the primary chat portal and a gateway to the rest of Ethen,
 * not a directory. Permanently listing all fourteen flagships in the sidebar
 * turned the shell into a product menu; flagship discovery belongs to Fleet,
 * the ⌘K launcher, and the composer's flagship picker instead.
 *
 * {@link NAV_SECTIONS} stays the canonical portfolio projection — it remains
 * the authority consumed by `scripts/validate-nav-truth.ts`, the Fleet grid,
 * and the command palette. Nothing about the registry changes here; this is a
 * presentation-layer choice about which of those destinations earn a permanent
 * sidebar row.
 *
 * Every href below resolves to a real, existing route. There is no user-pin
 * store yet, so no "Pinned" section is rendered — an empty or invented one
 * would be a fake control. Recent sessions are rendered by the sidebar itself
 * from live session data.
 */
export const SHELL_NAV_SECTIONS: NavSection[] = [
  {
    label: "",
    items: [
      { id: "console", label: "Console", icon: "chats", href: "/console" },
      { id: "fleet", label: "Apps", icon: "grid", href: "/marketplace" },
      { id: "projects", label: "Projects", icon: "project", href: "/projects" },
      { id: "artifacts", label: "Library", icon: "files", href: "/artifacts" },
    ],
  },
];

export type CommandItem = {
  id: string;
  label: string;
  group: string;
  badge?: "soon" | "new";
  shortcut?: string;
  href?: string;
  hint?: string;
};

export type CommandCenterActionId = "new-chat" | "upload-files" | "add-url";

export type CommandCenterItem = {
  id: string;
  label: string;
  hint: string;
  href?: string;
  agentSlug?: string;
  actionId?: CommandCenterActionId;
};

export type CommandCenterGroup = {
  id: string;
  label: string;
  items: CommandCenterItem[];
};

export const CONNECTOR_COMMAND_ITEMS: CommandItem[] = [
  { id: "app-google-workspace", label: "Google Workspace", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "Gmail, Drive, Calendar, Docs, and Sheets" },
  { id: "app-microsoft-365", label: "Microsoft 365", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "Outlook, Calendar, OneDrive, SharePoint, and Teams" },
  { id: "app-webhooks", label: "Webhooks", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "Inbound and outbound workflow hooks" },
  { id: "app-zapier", label: "Zapier", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "Automation connector" },
  { id: "app-make", label: "Make", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "Visual automation scenarios" },
  { id: "app-n8n", label: "n8n", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "Self-hosted workflow automation" },
  { id: "app-salesforce", label: "Salesforce", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "CRM connector" },
  { id: "app-hubspot", label: "HubSpot", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "CRM and marketing connector" },
  { id: "app-zendesk", label: "Zendesk", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "Support ticket connector" },
  { id: "app-intercom", label: "Intercom", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "Support and messaging connector" },
  { id: "app-jira", label: "Jira", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "Issues and project management" },
  { id: "app-linear", label: "Linear", group: "Apps & Connectors", href: "/workflow-agent/integrations", hint: "Issues and team workflows" },
];

/**
 * Command palette items. Product destinations come from the SOL-04 portfolio
 * registry; non-product utilities remain listed here and are filtered so that
 * hidden portfolio routes cannot leak into the palette.
 */
const COMMAND_ITEMS_STATIC: CommandItem[] = [
  { id: "new-chat", label: "New Chat", group: "Actions", href: "/console", shortcut: "N", hint: "Start a fresh conversation" },
  { id: "fleet", label: "Fleet", group: "Actions", href: "/marketplace", hint: "Browse Fleet templates" },
  { id: "sessions", label: "Sessions", group: "Navigate", href: "/sessions", hint: "Browse past workspace runs" },
  { id: "projects", label: "Projects", group: "Navigate", href: "/projects", hint: "Open the project command center" },
  { id: "settings", label: "Settings", group: "Navigate", href: "/settings", hint: "Open account and workspace settings" },
  { id: "artifacts", label: "Artifacts", group: "Advanced", href: "/artifacts", hint: "Browse saved agent outputs and artifacts" },
  { id: "logs", label: "Logs", group: "Advanced", href: "/logs", hint: "Preview execution and audit logs" },
  { id: "usage", label: "Usage", group: "Advanced", href: "/usage", hint: "View credit usage and billing" },
  { id: "evals", label: "Evals", group: "Advanced", href: "/evals", hint: "Model evaluation runs" },
  { id: "audit-log", label: "Audit Log", group: "Advanced", href: "/audit-log", hint: "Security and access audit trail" },
  { id: "environment-variables", label: "Environment Variables", group: "Advanced", href: "/environment-variables", hint: "Workspace environment configuration" },
  { id: "runs", label: "Agent Runs", group: "Advanced", href: "/agent-runs", hint: "Run receipts, approvals, evidence, and diagnostics" },
  { id: "observability", label: "Observability", group: "Advanced", href: "/observability", hint: "Traces, health, and runtime state" },
];

function isCommandHrefAllowed(href: string | undefined): boolean {
  if (!href) return true;
  const entry = resolvePortfolioEntryForPath(href);
  if (!entry) return true;
  return isVisibleOnSurface(entry, "command-palette");
}

export const COMMAND_ITEMS: CommandItem[] = [
  ...buildProductCommandItemsFromPortfolio(),
  ...COMMAND_ITEMS_STATIC.filter((item) => isCommandHrefAllowed(item.href)),
];

const COMMAND_CENTER_START: CommandCenterItem[] = [
  { id: "cc-new-chat", label: "New chat", hint: "Fresh composer", href: "/console", actionId: "new-chat" },
  { id: "cc-sessions", label: "Continue session", hint: "Resume past work", href: "/sessions" },
  { id: "cc-projects", label: "Open project", hint: "Jump into a project", href: "/projects" },
  { id: "cc-ai-gateway", label: "Open Gateway", hint: "Inspect the model gateway spine", href: "/ai-gateway" },
  { id: "cc-artifacts", label: "Open artifact", hint: "Review saved outputs", href: "/artifacts" },
  { id: "cc-runs", label: "View active runs", hint: "Background activity", href: "/agent-runs" },
  { id: "cc-fleet", label: "Browse Fleet", hint: "Template catalogue", href: "/marketplace" },
];

const COMMAND_CENTER_WORK: CommandCenterItem[] = [
  { id: "cc-work-sessions", label: "Sessions", hint: "All sessions", href: "/sessions" },
  { id: "cc-work-projects", label: "Projects", hint: "Project hub", href: "/projects" },
  { id: "cc-work-artifacts", label: "Artifacts", hint: "Saved outputs", href: "/artifacts" },
  { id: "cc-work-usage", label: "Usage", hint: "Credits and billing", href: "/usage" },
];

const COMMAND_CENTER_CONNECT: CommandCenterItem[] = [
  { id: "cc-upload", label: "Upload files", hint: "Attach local files", actionId: "upload-files" },
  { id: "cc-url", label: "Add URL", hint: "Paste a source link", actionId: "add-url" },
  { id: "cc-models", label: "Model providers", hint: "Provider and API key settings", href: "/settings" },
];

export const COMMAND_CENTER_GROUPS: CommandCenterGroup[] = [
  {
    id: "start",
    label: "Start",
    items: COMMAND_CENTER_START.filter((item) => isCommandHrefAllowed(item.href)),
  },
  {
    id: "agents",
    label: "Workspaces",
    items: buildCommandCenterAgentItemsFromPortfolio(),
  },
  {
    id: "work",
    label: "Work",
    items: COMMAND_CENTER_WORK.filter((item) => isCommandHrefAllowed(item.href)),
  },
  {
    id: "connect",
    label: "Add / Connect",
    items: COMMAND_CENTER_CONNECT.filter((item) => isCommandHrefAllowed(item.href)),
  },
];

export function findNavItemById(id: string) {
  return NAV_SECTIONS.flatMap((section) => section.items).find((item) => item.id === id);
}

export function findCommandItemById(id: string) {
  return COMMAND_ITEMS.find((item) => item.id === id);
}

export const VOICE_NAV_SECTIONS: NavSection[] = [
  {
    label: "Voice",
    items: [
      { id: "voice-overview", label: "Overview", icon: "sparkle", href: "/voice" },
      { id: "voice-studio", label: "Studio", icon: "terminal", href: "/voice/studio" },
      { id: "voice-agents", label: "Agents", icon: "grid", href: "/voice/agents" },
      { id: "voice-transcribe", label: "Transcribe", icon: "files", href: "/voice/transcribe" },
      { id: "voice-consent", label: "Consent", icon: "permissions", href: "/voice/consent", badge: "new" as const },
      { id: "voice-api", label: "API", icon: "terminal", href: "/voice/api" },
      { id: "voice-usage", label: "Usage", icon: "billing", href: "/voice/usage" },
      { id: "voice-settings", label: "Settings", icon: "settings", href: "/voice/settings" },
    ],
  },
];

export function getNavSectionsForPath(pathname: string) {
  if (pathname.startsWith("/ai-gateway")) return AI_GATEWAY_NAV_SECTIONS;
  if (
    pathname.startsWith("/sentinel") ||
    pathname.startsWith("/security") ||
    pathname.startsWith("/policies")
  ) return SENTINEL_NAV_SECTIONS;
  if (pathname.startsWith("/voice")) return VOICE_NAV_SECTIONS;
  /* Default shell navigation is Console-shaped, not the product directory.
   * See SHELL_NAV_SECTIONS. */
  return SHELL_NAV_SECTIONS;
}

export function getNavSectionsForTarget(target: DeploymentTarget): NavSection[] {
  if (target === "chat") {
    const chatFlagships = CANONICAL_FLAGSHIP_RUNTIME_MAP.filter((m) => m.owner === "chat");
    return [
      {
        label: "Chat",
        items: [
          { id: "chat", label: "Chat", icon: "chats", href: "/chat" },
          ...chatFlagships.map((product) => ({
            id: product.id,
            label: product.displayName,
            icon: product.id === "research" ? "search" : product.id === "voice" ? "chats" : product.id === "studio" ? "sparkle" : product.id === "designer" ? "sparkle" : "star",
            href: product.canonicalRoute,
          })),
        ],
      },
    ];
  }
  return SHELL_NAV_SECTIONS;
}
