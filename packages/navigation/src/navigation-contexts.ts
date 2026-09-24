/**
 * D16 — navigation context authority.
 *
 * Ethen serves four different kinds of interface from one codebase, and they
 * do not share a navigation model. The approved B-01 marketing header belongs
 * on public pages and nowhere else: putting it on /console or /admin would
 * offer "Contact sales" to someone already inside the product, and putting the
 * workspace sidebar on /pricing would offer a launcher to someone who has not
 * signed in.
 *
 * Before this module nothing named that boundary — each surface simply mounted
 * whatever shell its route happened to import. This declares the four
 * contexts, says which navigation authority owns each, and resolves any
 * pathname to exactly one. `resolveNavContext` is the check a shell can use to
 * refuse the wrong chrome, and the Design Lab demonstrates the four side by
 * side rather than implying one header fits everything.
 *
 * This module is descriptive, not a router: it changes no route and mounts no
 * shell. D16 establishes the boundary; applying it is the reviewed rollout.
 */

export type NavContextId = "marketing" | "product" | "app" | "internal";

export interface NavContext {
  id: NavContextId;
  label: string;
  /** Who the surface is for, in one line. */
  audience: string;
  /** The module that owns this context's destinations. */
  authority: string;
  /** The shell that renders this context's chrome. */
  shell: string;
  /** What the navigation offers. */
  affordances: readonly string[];
  /** Route prefixes this context owns. Longest match wins. */
  routes: readonly string[];
}

/**
 * PRODUCT is deliberately a *marketing* context, not an app one: /products/*
 * pages sell a flagship to someone who has not signed in, so they keep the
 * public header and add product-scoped sub-navigation beneath it. The
 * authenticated runtime for the same flagship (/code, /ai-gateway, …) is APP.
 */
export const NAV_CONTEXTS: readonly NavContext[] = [
  {
    id: "marketing",
    label: "Marketing",
    audience: "Public visitors, signed out. Editorial, pricing, company, trust.",
    authority: "lib/marketing/navigation.ts — MARKETING_PRIMARY_NAV",
    shell: "components/marketing/BrandShellHeader.tsx (+ MarketingShell)",
    affordances: ["Six top-level entries", "Mega menus", "Login / Contact sales / Try Ethen", "Linked footer"],
    routes: [
      "/",
      "/products",
      "/solutions",
      "/models",
      "/platform",
      "/resources",
      "/pricing",
      "/company",
      "/contact",
      "/docs",
      "/legal",
      "/download",
      "/help",
    ],
  },
  {
    id: "product",
    label: "Product marketing",
    audience: "Public visitors evaluating one flagship.",
    authority: "lib/marketing/navigation.ts — MARKETING_FLAGSHIP_LINKS",
    shell: "components/marketing/BrandShellHeader.tsx + product sub-navigation",
    affordances: ["Public header retained", "Product-scoped sub-nav", "Lifecycle stated per product", "Single conversion CTA"],
    routes: ["/products/"],
  },
  {
    id: "app",
    label: "App / workspace",
    audience: "Signed-in operators doing the work.",
    authority: "lib/navigation.ts — NAV_SECTIONS, COMMAND_ITEMS",
    shell: "components/shell/EdsFlagshipShell.tsx / EdsSystemShell.tsx",
    affordances: ["Product sidebar", "Launcher", "Command palette", "Account", "No sales CTA"],
    routes: [
      "/console",
      "/workspace",
      "/code",
      "/research",
      "/local-models",
      "/ai-gateway",
      "/model-intelligence",
      "/model-library",
      "/compute",
      "/designer",
      "/founder-agent",
      "/studio",
      "/sentinel",
      "/voice",
      "/workflow-agent",
      "/agents",
      "/agent-runs",
      "/artifacts",
      "/sessions",
      "/projects",
      "/marketplace",
      "/settings",
      "/billing",
      "/evals",
      "/policies",
      "/mcp",
      "/approvals",
      "/logs",
      "/observability",
      "/environment-variables",
      "/firewall",
      "/platform-status",
    ],
  },
  {
    id: "internal",
    label: "Internal / admin",
    audience: "Operators and administrators. Never public.",
    authority: "lib/navigation.ts — SHELL_NAV_SECTIONS",
    shell: "components/shell/EdsSystemShell.tsx",
    affordances: ["Minimal chrome", "No marketing surface", "No launcher", "Dev labs are 404 in production"],
    routes: ["/admin", "/operator", "/audit-log", "/dev"],
  },
];

const CONTEXTS_BY_ID = new Map<NavContextId, NavContext>(NAV_CONTEXTS.map((c) => [c.id, c]));

export function getNavContext(id: NavContextId): NavContext {
  const context = CONTEXTS_BY_ID.get(id);
  if (!context) throw new Error(`[navigation-contexts] unknown context "${id}"`);
  return context;
}

/**
 * Resolve a pathname to the one context that owns it. Longest prefix wins, so
 * "/products/code" resolves to `product` rather than `marketing` even though
 * both declare a "/products" prefix. Unknown paths resolve to `app`: an
 * unrecognised surface is treated as authenticated, which fails closed —
 * showing the sales header to a signed-in operator is the worse mistake.
 */
export function resolveNavContext(pathname: string): NavContext {
  const path = pathname.split(/[?#]/)[0] || "/";
  if (path === "/") return getNavContext("marketing");

  let best: { context: NavContext; length: number } | null = null;
  for (const context of NAV_CONTEXTS) {
    for (const prefix of context.routes) {
      if (prefix === "/") continue;
      const matches = path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
      if (matches && (!best || prefix.length > best.length)) {
        best = { context, length: prefix.length };
      }
    }
  }
  return best?.context ?? getNavContext("app");
}

/** True when a surface may render the public marketing header. */
export function allowsMarketingChrome(pathname: string): boolean {
  const id = resolveNavContext(pathname).id;
  return id === "marketing" || id === "product";
}
