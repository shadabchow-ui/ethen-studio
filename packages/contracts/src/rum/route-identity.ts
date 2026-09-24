/**
 * Instant Experience remediation pass 1 — route identity contract (audit F1/F6).
 *
 * Single authority for each browser app's RUM route identity: pathname prefix
 * → route TEMPLATE (+ class). Consumed by:
 *  - the app bindings (`EthenRumNext routes=…`), which map a pathname to the
 *    template the collector must see on the destination's `data-iex-route`
 *    marker (exact match — see packages/app-shell/src/instant-rum.ts);
 *  - the RUM sink allowlist (`rum/schema.ts`), so every template an app can
 *    emit is accepted and nothing else is.
 *
 * Rule: a prefix is listed ONLY when its destination renders a visible marker
 * whose value equals the template. Mapping a route without a marker would make
 * every sample report `cts_ms=null` (a false measurement), so such routes stay
 * unmapped (samples dropped) and are tracked as adoption gaps instead.
 * Longest prefix wins; templates never contain ids.
 * Framework-free data module.
 */

export type RumRouteClass = "R1" | "R2" | "R3" | "R4" | "R5";

export interface RumRouteIdentity {
  route: string;
  routeClass: RumRouteClass | null;
}

export type RumRouteMap = Readonly<Record<string, RumRouteIdentity>>;

const r3 = (route: string): RumRouteIdentity => ({ route, routeClass: "R3" });
/** Studio keeps route classes unclassified (M6B-07): no invented R-class semantics. */
const unclassified = (route: string): RumRouteIdentity => ({ route, routeClass: null });

/**
 * chat-core: Chat product surface (`/`, `/chat`), the Research workspace,
 * and the Settings route. `/settings` maps since Pass 3.5: the page-mode
 * settings shell stamps its title `h1` with the template
 * (`titleRouteMarker="/settings"`); dialog mode is a panel, not a route.
 */
export const CHAT_CORE_RUM_ROUTES: RumRouteMap = {
  "/": r3("/"),
  "/chat": r3("/chat"),
  "/research": r3("/research"),
  "/settings": r3("/settings"),
};

/** designer: persistent console shell (root layout) around four destinations. */
export const DESIGNER_RUM_ROUTES: RumRouteMap = {
  "/": r3("/"),
  "/projects": r3("/projects/[id]"),
  "/marketplace": r3("/marketplace"),
  "/settings": r3("/settings"),
};

/**
 * platform-core — Pass 3 complete active-route census
 * (artifacts/four-app-remediation-pass3-2026-09-15/PLATFORM_ROUTE_COVERAGE.md).
 *
 * Keys are exact route TEMPLATES; each destination stamps the same value on
 * its visible identity h1 (claims verified by the certifier's route audit).
 * Pass 1–2 families (Observability, Operator, project detail) keep class R3;
 * Pass 3 additions stay unclassified (no invented R-class semantics).
 *
 * Intentionally unmapped (samples dropped, see the coverage record):
 * `/` (redirect → /console), `/audit-log` (hidden fixture, always 404),
 * `/workflow-agent/{connections,create,mcp}` (redirects), sign-in/up (auth
 * entries). Pass 3.5 closed the last three identity gaps (`/logs`,
 * `/settings`, `/workflow-agent`) via their existing semantic landmarks —
 * no visible heading was added.
 */
export const PLATFORM_CORE_RUM_ROUTES: RumRouteMap = {
  "/observability": r3("/observability"),
  "/observability/traces": r3("/observability/traces"),
  "/observability/agents": r3("/observability/agents"),
  "/observability/models": r3("/observability/models"),
  "/observability/errors": r3("/observability/errors"),
  "/observability/costs": r3("/observability/costs"),
  "/operator": r3("/operator"),
  "/projects/[projectId]": r3("/projects/[projectId]"),
  "/projects/[projectId]/gateway": r3("/projects/[projectId]/gateway"),
  "/projects/[projectId]/logs": r3("/projects/[projectId]/logs"),
  "/projects/[projectId]/usage": r3("/projects/[projectId]/usage"),
  "/projects/[projectId]/sandboxes": r3("/projects/[projectId]/sandboxes"),
  "/projects/[projectId]/policies": r3("/projects/[projectId]/policies"),
  "/projects/[projectId]/workflows": r3("/projects/[projectId]/workflows"),
  ...Object.fromEntries(
    [
      "/projects",
      // Admin family (layout-owned platform-admin shell).
      "/admin",
      "/admin/agents",
      "/admin/agents/new",
      "/admin/agents/[id]",
      "/admin/audit",
      "/admin/credits",
      "/admin/health",
      "/admin/pmf",
      "/admin/sessions",
      "/admin/usage",
      "/admin/users",
      // Standalone operational surfaces (page-owned platform-* shells).
      "/agent-runs",
      "/agent-runs/[runId]",
      "/approvals",
      "/artifacts",
      "/billing",
      "/console",
      "/environment-variables",
      "/evals",
      "/firewall",
      "/logs",
      "/marketplace",
      "/mcp",
      "/platform-status",
      "/policies",
      "/sessions",
      "/settings",
      "/usage",
      // Flow home (identity on the existing Flow landmark section).
      // Sentinel family (layout-owned flagship shell).
      "/sentinel",
      "/sentinel/findings/[findingId]",
      "/sentinel/findings/[findingId]/evidence",
      "/sentinel/history",
      "/sentinel/intake",
      "/sentinel/patches/[patchProposalId]",
      "/sentinel/reports",
      "/sentinel/repos",
      "/sentinel/repos/[repoId]",
      "/sentinel/review",
      "/sentinel/scans/[scanPlanId]",
      "/sentinel/scans/[scanPlanId]/findings",
      "/sentinel/scans/preview",
      "/sentinel/settings",
      "/sentinel/status",
      // Flow family (workflow-agent).
      "/workflow-agent",
      "/workflow-agent/approvals",
      "/workflow-agent/apps",
      "/workflow-agent/apps/[app]",
      "/workflow-agent/build",
      "/workflow-agent/functionalization",
      "/workflow-agent/integrations",
      "/workflow-agent/runs",
      "/workflow-agent/runs/[runId]",
      "/workflow-agent/settings",
      "/workflow-agent/templates",
      "/workflow-agent/webhooks",
      "/workflow-agent/workflows",
    ].map((template) => [template, unclassified(template)]),
  ),
};

export const PLATFORM_PROJECT_SECTIONS = ["gateway", "logs", "usage", "sandboxes", "policies", "workflows"] as const;

/**
 * Exact segment match: static segments must be equal, `[param]` matches one
 * segment, lengths must agree. Unknown deeper paths resolve null (honest
 * drop) rather than borrowing a parent template.
 */
function templateScore(template: string, pathname: string): number {
  const t = template.split("/").filter(Boolean);
  const p = pathname.split("?")[0]!.split("/").filter(Boolean);
  if (t.length !== p.length) return -1;
  let statics = 0;
  for (let i = 0; i < t.length; i += 1) {
    if (/^\[[^\]]+\]$/.test(t[i]!)) continue;
    if (t[i] !== p[i]) return -1;
    statics += 1;
  }
  return statics;
}

/**
 * Platform pathname resolver (binding AND certifier producer, identical by
 * construction). Most static segments wins, so `/admin/agents/new` and
 * `/sentinel/scans/preview` never resolve to their dynamic siblings.
 */
export function resolvePlatformRumTemplate(pathname: string): RumRouteIdentity | null {
  let best: RumRouteIdentity | null = null;
  let bestScore = -1;
  for (const [template, mapped] of Object.entries(PLATFORM_CORE_RUM_ROUTES)) {
    const score = templateScore(template, pathname);
    if (score > bestScore) {
      best = mapped;
      bestScore = score;
    }
  }
  return best;
}

/** Project-detail subset of the resolver (kept for existing callers). */
export function resolvePlatformRumRoute(pathname: string): RumRouteIdentity | null {
  const resolved = resolvePlatformRumTemplate(pathname);
  return resolved?.route.startsWith("/projects/[projectId]") ? resolved : null;
}

/**
 * studio: destinations whose page frame renders the identity marker.
 * Pass 3 (STUDIO_ROUTE_COVERAGE.md): public landing + token review, and the
 * nine generator workbenches (marker on the visible "Studio / <app>" label).
 * Unmapped by design: `/studio/apps`, `/studio/{audio,canvas,image,video}`
 * (redirects to /studio) and sign-in/up. `/studio/archive` stays mapped for
 * its local-preview build but 404s in product.
 */
export const STUDIO_RUM_ROUTES: RumRouteMap = {
  "/": unclassified("/"),
  "/studio/review": unclassified("/studio/review/[token]"),
  "/studio/apps/create-image": unclassified("/studio/apps/create-image"),
  "/studio/apps/text-to-video": unclassified("/studio/apps/text-to-video"),
  "/studio/apps/image-to-video": unclassified("/studio/apps/image-to-video"),
  "/studio/apps/product-ad": unclassified("/studio/apps/product-ad"),
  "/studio/apps/ai-influencer": unclassified("/studio/apps/ai-influencer"),
  "/studio/apps/cinematic-scene": unclassified("/studio/apps/cinematic-scene"),
  "/studio/apps/character-motion": unclassified("/studio/apps/character-motion"),
  "/studio/apps/game-assets": unclassified("/studio/apps/game-assets"),
  "/studio/apps/marketing": unclassified("/studio/apps/marketing"),
  "/studio": unclassified("/studio"),
  "/studio/assets": unclassified("/studio/assets"),
  "/studio/projects": unclassified("/studio/projects"),
  "/studio/projects/[projectId]": unclassified("/studio/projects/[projectId]"),
  "/studio/projects/[projectId]/create/image": unclassified("/studio/projects/[projectId]/create/image"),
  "/studio/projects/[projectId]/edit/image": unclassified("/studio/projects/[projectId]/edit/image"),
  "/studio/projects/[projectId]/create/video": unclassified("/studio/projects/[projectId]/create/video"),
  "/studio/projects/[projectId]/assets": unclassified("/studio/projects/[projectId]/assets"),
  "/studio/projects/[projectId]/characters": unclassified("/studio/projects/[projectId]/characters"),
  "/studio/projects/[projectId]/products": unclassified("/studio/projects/[projectId]/products"),
  "/studio/projects/[projectId]/brands": unclassified("/studio/projects/[projectId]/brands"),
  "/studio/projects/[projectId]/review": unclassified("/studio/projects/[projectId]/review"),
  "/studio/projects/[projectId]/export": unclassified("/studio/projects/[projectId]/export"),
  "/studio/campaigns": unclassified("/studio/campaigns"),
  "/studio/cinema": unclassified("/studio/cinema"),
  "/studio/director": unclassified("/studio/director"),
  "/studio/exports": unclassified("/studio/exports"),
  "/studio/models": unclassified("/studio/models"),
  "/studio/workflows": unclassified("/studio/workflows"),
  "/studio/archive": unclassified("/studio/archive"),
  "/studio/jobs": unclassified("/studio/jobs"),
  "/studio/settings": unclassified("/studio/settings"),
};

/** Every template each app can emit (sink allowlist input). */
export function rumTemplatesFor(app: "chat-core" | "designer" | "platform-core" | "studio"): string[] {
  const maps: Record<string, RumRouteMap> = {
    "chat-core": CHAT_CORE_RUM_ROUTES,
    designer: DESIGNER_RUM_ROUTES,
    "platform-core": PLATFORM_CORE_RUM_ROUTES,
    studio: STUDIO_RUM_ROUTES,
  };
  const templates = new Set(Object.values(maps[app]!).map((entry) => entry.route));
  return [...templates].sort();
}
