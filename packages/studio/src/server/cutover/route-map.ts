/**
 * STUDIO_20 — legacy → V5 route authority map.
 *
 * Every file under the legacy monolith trees (`app/studio/**`,
 * `app/api/media/**`) has exactly one entry. Pages resolve to the same
 * URL served by the standalone `apps/studio` deployable (DNS cutover,
 * not path rewrite). API routes are RETAINED as authenticated adapters
 * while monolith-served clients exist; each names its V1 successor
 * domain for post-drain migration. Nothing here deletes history.
 */

export type LegacyEntryKind = "page" | "api" | "support";
export type LegacyDisposition =
  | "mapped"
  | "redirect-stub"
  | "adapter-retained"
  | "disabled-stub";

export interface LegacyRouteEntry {
  /** Repo-relative legacy file. */
  legacy: string;
  kind: LegacyEntryKind;
  disposition: LegacyDisposition;
  /** Same-path target in apps/studio, or retained legacy path for adapters. */
  target: string;
  /** V1 API successor domain (APIs only). */
  successor?: string;
  note: string;
}

function page(legacy: string, target: string, disposition: LegacyDisposition, note: string): LegacyRouteEntry {
  return { legacy, kind: "page", disposition, target, note };
}

function api(legacy: string, successor: string, disposition: LegacyDisposition, note: string): LegacyRouteEntry {
  return { legacy, kind: "api", disposition, target: legacy, successor, note };
}

const W = "apps/studio/app/studio/(workbench)";

export const LEGACY_ROUTE_MAP: readonly LegacyRouteEntry[] = [
  // ── Legacy pages → same URL in apps/studio ──
  page("app/studio/page.tsx", `${W}/page.tsx`, "redirect-stub", "M5: monolith-only landing stub; standalone serves the canonical V5 home at /studio"),
  page("app/studio/image/page.tsx", `${W}/image/page.tsx`, "redirect-stub", "V5 M1: one-hop redirect to /studio/create/image"),
  page("app/studio/video/page.tsx", `${W}/video/page.tsx`, "redirect-stub", "V5 M1: one-hop redirect to /studio/create/video"),
  page("app/studio/audio/page.tsx", `${W}/audio/page.tsx`, "redirect-stub", "V5 M1: one-hop redirect to /studio/create/voice"),
  page("app/studio/models/page.tsx", `${W}/models/page.tsx`, "redirect-stub", "M5: monolith-only models stub; standalone serves the models adapter at /studio/models"),
  page("app/studio/canvas/page.tsx", `${W}/canvas/page.tsx`, "redirect-stub", "V5 M1: one-hop redirect to the canonical Canvas index /studio/workflows"),
  page("app/studio/jobs/page.tsx", `${W}/jobs/page.tsx`, "mapped", "standalone jobs surface in both apps"),
  page("app/studio/projects/page.tsx", `${W}/projects/page.tsx`, "mapped", "standalone projects surface in both apps"),
  page("app/studio/assets/page.tsx", `${W}/assets/page.tsx`, "mapped", "standalone assets surface in both apps"),
  page("app/studio/archive/page.tsx", `${W}/archive/page.tsx`, "mapped", "preview-gated archive in both apps"),
  page("app/studio/apps/page.tsx", `${W}/apps/page.tsx`, "mapped", "app index in both apps"),
  page("app/studio/apps/ai-influencer/page.tsx", `${W}/apps/ai-influencer/page.tsx`, "mapped", "same app route in both apps"),
  page("app/studio/apps/character-motion/page.tsx", `${W}/apps/character-motion/page.tsx`, "mapped", "same app route in both apps"),
  page("app/studio/apps/cinematic-scene/page.tsx", `${W}/apps/cinematic-scene/page.tsx`, "mapped", "same app route in both apps"),
  page("app/studio/apps/create-image/page.tsx", `${W}/apps/create-image/page.tsx`, "mapped", "same app route in both apps"),
  page("app/studio/apps/game-assets/page.tsx", `${W}/apps/game-assets/page.tsx`, "mapped", "same app route in both apps"),
  page("app/studio/apps/image-to-video/page.tsx", `${W}/apps/image-to-video/page.tsx`, "mapped", "same app route in both apps"),
  page("app/studio/apps/marketing/page.tsx", `${W}/apps/marketing/page.tsx`, "mapped", "same app route in both apps"),
  page("app/studio/apps/product-ad/page.tsx", `${W}/apps/product-ad/page.tsx`, "mapped", "same app route in both apps"),
  page("app/studio/apps/text-to-video/page.tsx", `${W}/apps/text-to-video/page.tsx`, "mapped", "same app route in both apps"),
  // ── Legacy API adapters (retained; monolith clients exist) ──
  api("app/api/media/approvals/route.ts", "v1/collaboration", "adapter-retained", "review approvals; V1 successor owns new integrations"),
  api("app/api/media/approvals/[id]/route.ts", "v1/collaboration", "adapter-retained", "review approval item; V1 successor owns new integrations"),
  api("app/api/media/assets/route.ts", "v1/assets", "adapter-retained", "asset reads; V1 successor owns new integrations"),
  api("app/api/media/assets/[assetId]/route.ts", "v1/assets", "adapter-retained", "asset item; V1 successor owns new integrations"),
  api("app/api/media/canvas/route.ts", "v1/workflows", "adapter-retained", "canvas graphs; V1 successor owns new integrations"),
  api("app/api/media/canvas/[canvasId]/route.ts", "v1/workflows", "adapter-retained", "canvas item; V1 successor owns new integrations"),
  api("app/api/media/generate/route.ts", "v1/gateway", "adapter-retained", "direct generation; gateway facade owns new integrations"),
  api("app/api/media/image/route.ts", "v1/gateway", "adapter-retained", "fal sync t2i; gateway compat owns new integrations"),
  api("app/api/media/jobs/route.ts", "v1/jobs", "adapter-retained", "job reads; V1 successor owns new integrations"),
  api("app/api/media/jobs/[id]/route.ts", "v1/jobs", "adapter-retained", "job item; V1 successor owns new integrations"),
  api("app/api/media/projects/route.ts", "v1/projects", "adapter-retained", "project reads; V1 successor owns new integrations"),
  api("app/api/media/projects/[projectId]/route.ts", "v1/projects", "adapter-retained", "project item; V1 successor owns new integrations"),
  api("app/api/media/provider-status/route.ts", "v1/catalog", "adapter-retained", "provider health; catalog owns new integrations"),
  api("app/api/media/upload/route.ts", "v1/media", "adapter-retained", "media upload; V1 media owns new integrations"),
  api("app/api/media/video/route.ts", "v1/gateway", "disabled-stub", "410 CAPABILITY_DISABLED; direct t2v never existed"),
] as const;

export const LEGACY_SUPPORT_FILES: readonly string[] = [
  "app/studio/layout.tsx",
  "app/studio/loading.tsx",
  "app/studio/error.tsx",
] as const;

/** Total legacy route files that must be mapped (pages + APIs, no support). */
export const LEGACY_ROUTE_COUNT = LEGACY_ROUTE_MAP.length;

export function findLegacyEntry(legacy: string): LegacyRouteEntry | null {
  return LEGACY_ROUTE_MAP.find((e) => e.legacy === legacy) ?? null;
}

/** Fails closed: unknown legacy paths never resolve to a removal. */
export function removalAllowed(legacy: string): false {
  void legacy;
  return false;
}
