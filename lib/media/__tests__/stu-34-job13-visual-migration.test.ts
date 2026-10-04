/**
 * Studio V2 Job 13 — visual migration certification.
 *
 * Run: node --conditions=react-server --import tsx /lib/media/__tests__/stu-34-job13-visual-migration.test.ts
 *
 * Proves the migrated production composition without rendering: canonical
 * shell stack mounted, nine slots registered with live implementations,
 * route census intact (URLs unchanged), demo tripwire green, no Studio
 * leakage into shared nav/palette, retired wrappers gone, responsive and
 * accessibility contracts pinned.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  getStudioNavEntries,
  getStudioPaletteEntries,
} from "@ethen/navigation";
import {
  COMMAND_ITEMS,
  SHELL_NAV_SECTIONS,
  getNavSectionsForPath,
} from "@ethen/navigation";
import { V2_GEOMETRY } from "@ethen/ui/design-system/v2/geometry";
import { STUDIO_WORKSPACE_SLOT_KEYS } from "@ethen/app-shell/studio/studio-workspace-slots";

const ROOT = process.cwd();
const STUDIO_APP = join(ROOT, "app/studio");
const source = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

let passed = 0;
function check(condition: boolean, label: string, detail = ""): void {
  assert.ok(condition, `job13: ${label}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  ok: ${label}`);
}

// ── 1. Slot registry: all nine implementations boot ──
// (tsx-bound modules carry CSS imports tsx cannot parse, so registration is
// asserted structurally from the boot source — the same pattern stu-31 uses
// for tsx contracts.)
check(STUDIO_WORKSPACE_SLOT_KEYS.length === 9, "nine typed slot contracts exist");
const bootSrc = source("/components/studio/slots/boot.ts");
check(bootSrc.includes('"use client"'), "boot runs in the client bundle");
for (const key of STUDIO_WORKSPACE_SLOT_KEYS) {
  check(bootSrc.includes(`${key}: Studio${key}Slot`), `boot registers ${key}`);
}
const SLOT_FILES: Record<string, string> = {
  AssetPanel: "StudioAssetPanelSlot.tsx",
  JobPanel: "StudioJobPanelSlot.tsx",
  PreviewStage: "StudioPreviewStageSlot.tsx",
  ReviewPanel: "StudioReviewPanelSlot.tsx",
  CanvasToolbar: "StudioCanvasToolbarSlot.tsx",
  HistoryPanel: "StudioHistoryPanelSlot.tsx",
  InspectorPanel: "StudioInspectorPanelSlot.tsx",
  Composer: "StudioComposerSlot.tsx",
  ResultActions: "StudioResultActionsSlot.tsx",
};
for (const [key, file] of Object.entries(SLOT_FILES)) {
  const body = source(`/components/studio/slots/${file}`);
  check(body.includes(`export function Studio${key}Slot`), `slot implementation exports Studio${key}Slot`);
  check(body.includes('"use client"'), `slot is a client component: ${file}`);
}
const STUDIO_SHELL_DEMO_MARKERS: string[] = (() => {
  const shellSrc = source("packages/ui/src/design-system/v2/shells/StudioShell.tsx");
  const match = shellSrc.match(/STUDIO_SHELL_DEMO_MARKERS[^=]*=\s*\[([\s\S]*?)\]/);
  assert.ok(match, "job13: demo marker list found in StudioShell source");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
})();
check(STUDIO_SHELL_DEMO_MARKERS.length === 6, "six demo tripwire markers", STUDIO_SHELL_DEMO_MARKERS.join(","));

// ── 2. Canonical stack mounted on the workbench layout ──
const workbenchLayout = source("app/studio/(workbench)/layout.tsx");
for (const needle of [
  "StudioWorkbenchChrome",
  "StudioWorkbenchBoot",
  "StudioWorkbenchSelectionProvider",
  "getStudioNavEntries",
  "getStudioPaletteEntries",
  "navEntries=",
  "paletteEntries=",
]) {
  check(workbenchLayout.includes(needle), `workbench layout composes ${needle}`);
}
const studioSegmentLayout = source("app/studio/layout.tsx");
check(!studioSegmentLayout.includes("EdsFlagshipShell"), "studio segment no longer mounts EdsFlagshipShell");
check(!studioSegmentLayout.includes("EdsManagedShell"), "studio segment no longer mounts EdsManagedShell");
check(!studioSegmentLayout.includes("StudioShellFrame"), "studio segment has no forked frame");
check(
  studioSegmentLayout.includes("V2ProductionScope") && studioSegmentLayout.includes("EdsScope"),
  "scopes preserved on the studio segment",
);
check(!existsSync(join(STUDIO_APP, "(workbench)/review")), "public review is outside the workbench group");
check(existsSync(join(STUDIO_APP, "(public)/review/[token]/page.tsx")), "public review route preserved");

// ── 3. Route census: URLs unchanged ──
const EXPECTED_PAGES = [
  "/studio",
  "/studio/apps",
  "/studio/apps/ai-influencer",
  "/studio/apps/character-motion",
  "/studio/apps/cinematic-scene",
  "/studio/apps/create-image",
  "/studio/apps/game-assets",
  "/studio/apps/image-to-video",
  "/studio/apps/marketing",
  "/studio/apps/product-ad",
  "/studio/apps/text-to-video",
  "/studio/archive",
  "/studio/assets",
  "/studio/audio",
  "/studio/campaigns",
  "/studio/canvas",
  "/studio/cinema",
  "/studio/director",
  "/studio/exports",
  "/studio/image",
  "/studio/jobs",
  "/studio/models",
  "/studio/projects",
  "/studio/review/[token]",
  "/studio/video",
  "/studio/workflows",
];
const observedPages: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name === "page.tsx") {
      const route =
        full
          .slice(join(ROOT, "app").length)
          .replace(/\/page\.tsx$/, "")
          .replace(/\/\([^/]*\)/g, "") || "/";
      observedPages.push(route);
    }
  }
};
walk(STUDIO_APP);
for (const expected of EXPECTED_PAGES) {
  check(observedPages.includes(expected), `route preserved: ${expected}`);
}
const routeBaseline = JSON.parse(source("artifacts/studio-closure/OPUS-FINAL-004_ROUTE_BASELINE.json")) as { pages: string[]; apis: string[]; live_workbench_pages: string[] };
const baselineUrls = routeBaseline.pages.map(path => path.slice(3).replace(/\/page\.tsx$/, "").replace(/\/\([^/]*\)/g, ""));
check(JSON.stringify(observedPages.slice().sort()) === JSON.stringify(baselineUrls.sort()), "all current committed Studio routes preserved", observedPages.join(","));

// API routes are pinned to the current committed V1 cutover baseline.
const apiRoutes: string[] = [];
const walkApi = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkApi(full);
    else if (entry.name === "route.ts") apiRoutes.push(full);
  }
};
walkApi(join(ROOT, "app/api"));
check(apiRoutes.length === routeBaseline.apis.length && routeBaseline.apis.every(path => apiRoutes.includes(join(ROOT, path))), "all current committed Studio API paths preserved");
check(
  !existsSync(join(ROOT, "app/api/media/shell/job-presentation/route.ts")) &&
    source("lib/studio-v5/media-cutover.ts").includes('retired(`${M}/shell/job-presentation/route.ts`') &&
    existsSync(join(ROOT, "app/api/studio/v1/jobs/[jobId]/route.ts")),
  "documented legacy projection retirement retains canonical V1 job read route",
);

// V5 owner-locked one-hop redirects and canonical Apps destination.
for (const [page, target] of [
  ["(workbench)/image/page.tsx", "/studio/create/image"],
  ["(workbench)/video/page.tsx", "/studio/create/video"],
  ["(workbench)/audio/page.tsx", "/studio/create/voice"],
  ["(workbench)/canvas/page.tsx", "/studio/workflows"],

]) {
  check(source(`app/studio/${page}`).includes(target), `redirect preserved: ${page} → ${target}`);
}

check(source("app/studio/(workbench)/apps/page.tsx").includes("StudioAppsLibrary") && source("app/studio/(workbench)/apps/page.tsx").includes('dataSource="live"'), "canonical Apps destination renders live V5 library");

// ── 4. Live datasource + demo tripwire ──
const workbenchPages: string[] = [];
const walkPages = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkPages(full);
    else if (entry.name === "page.tsx") workbenchPages.push(full);
  }
};
walkPages(join(STUDIO_APP, "(workbench)"));
const observedLive: string[] = [];
for (const page of workbenchPages) {
  const body = readFileSync(page, "utf8");
  const isRedirect = body.includes("redirect(");
  check(!body.includes('dataSource="preview"'), `no preview datasource: ${page.slice(STUDIO_APP.length)}`);
  for (const marker of STUDIO_SHELL_DEMO_MARKERS) {
    check(!body.includes(marker), `no demo marker ${marker}: ${page.slice(STUDIO_APP.length)}`);
  }
  if (!isRedirect && (body.includes('dataSource="live"') || body.includes("StudioGeneratorWorkbench"))) observedLive.push(page.slice(ROOT.length + 1));
}
check(JSON.stringify(observedLive.sort()) === JSON.stringify(routeBaseline.live_workbench_pages.slice().sort()), "all committed live workbench pages retain their live datasource");
// Legacy generator panels follow the committed V5 cutover destinations.
const legacyPanels: Record<string, string> = {
  "ai-influencer": "/studio/influencer", "character-motion": "/studio/create/video",
  "cinematic-scene": "/studio/pro/cinema", "create-image": "/studio/create/image",
  "game-assets": "/studio/create/image", "image-to-video": "/studio/create/video",
  marketing: "/studio/marketing", "product-ad": "/studio/marketing", "text-to-video": "/studio/create/video",
};
check(!existsSync(join(ROOT, "components/studio/StudioGeneratorWorkbench.tsx")), "retired generator workbench stays absent");
for (const [panel, destination] of Object.entries(legacyPanels)) {
  const body = source(`app/studio/(workbench)/apps/${panel}/page.tsx`);
  check(body.includes("redirect(") && body.includes(destination), `legacy panel follows canonical destination: ${panel}`);
  check(!body.includes("StudioAppPanelPage"), `panel dropped retired page: ${panel}`);
}

// Slot implementations carry no demo/mock rows.
const slotsDir = join(ROOT, "/components/studio/slots");
for (const file of readdirSync(slotsDir).filter((name) => name.endsWith(".tsx"))) {
  const body = readFileSync(join(slotsDir, file), "utf8");
  for (const needle of ["Mock Preview", "Coming soon", "Lorem", "placeholder.com", "resultSeed", "storyboardSeed"]) {
    check(!body.includes(needle), `slot has no ${needle}: ${file}`);
  }
}

// ── 5. Lifecycle nav/palette mounted; shared surfaces leak nothing ──
check(getStudioNavEntries({ enrolled: false }).length === 0, "unenrolled nav derivation stays empty");
check(getStudioNavEntries({ enrolled: true }).length === 5, "enrolled nav derivation yields five entries");
check(getStudioPaletteEntries({ enrolled: false }).length === 0, "unenrolled palette derivation stays empty");
check(getStudioPaletteEntries({ enrolled: true }).length === 3, "enrolled palette derivation yields three entries");
const sharedStudioHrefs = SHELL_NAV_SECTIONS.flatMap((section) =>
  section.items.filter((item) => item.href.startsWith("/studio")),
);
check(sharedStudioHrefs.length === 0, "shared sidebar sections carry zero Studio hrefs");
const sharedStudioCommands = COMMAND_ITEMS.filter((item) => (item.href ?? "").startsWith("/studio"));
check(
  sharedStudioCommands.length === 1 && sharedStudioCommands[0]?.id === "flagship-studio",
  "shared palette carries only the flagship boundary entry",
);
const derivedIds = new Set(getStudioPaletteEntries({ enrolled: true }).map((entry) => entry.id));
const leakedDerived = COMMAND_ITEMS.filter((item) => derivedIds.has(item.id));
check(leakedDerived.length === 0, "derived in-app Studio commands never leak into the shared palette");
check(getNavSectionsForPath("/console") === SHELL_NAV_SECTIONS, "shared /console sections unchanged");
check(getNavSectionsForPath("/projects") === SHELL_NAV_SECTIONS, "shared /projects sections unchanged");

// ── 6. Retirement: old visual authority gone from the studio root ──
const RETIRED = [
  "StudioAppPanelPage.tsx",
  "StudioShellFrame.tsx",
  "StudioSettingsRail.tsx",
  "StudioInspectorRail.tsx",
  "StageResultToolbar.tsx",
  "StudioAppWorkbench.tsx",
  "StudioCrispWorkbenchPage.tsx",
  "StudioHomePage.tsx",
  "StudioLandingPreview.tsx",
  "StudioAppSwitcher.tsx",
  "StudioProviderStatusPanel.tsx",
  "StudioTopNav.tsx",
  "StudioMegaMenu.tsx",
  "StudioCanvasBoard.tsx",
  "studio-mock-canvas.ts",
];
for (const file of RETIRED) {
  check(!existsSync(join(ROOT, "/components/studio", file)), `retired: ${file}`);
}
check(existsSync(join(ROOT, "components/studio/StudioStage.tsx")) && source("components/studio/StudioProjectReview.tsx").includes("StudioStage"), "shared result-stage retained for active project review");
const standalone = source("/components/studio/StudioStandalonePages.tsx");
for (const orphan of ["StudioAppsPage", "StudioImagePage", "StudioVideoPage", "StudioAudioPage", "StudioCanvasPage", "StudioModalityPage"]) {
  check(!standalone.includes(orphan), `orphan export removed: ${orphan}`);
}
for (const kept of ["StudioJobsPage", "StudioAssetsPage", "StudioProjectsPage"]) {
  check(standalone.includes(kept), `live export retained: ${kept}`);
}
check(existsSync(join(ROOT, "/components/studio/StudioPageFrame.tsx")), "StudioPageFrame retained as content frame");
check(!existsSync(join(ROOT, "components/studio/StudioAppPanelPage.tsx")), "standalone tree retains no obsolete monolith test mirror");

// ── 7. Responsive + accessibility contracts pinned ──
check(
  V2_GEOMETRY.sidebar === 256 &&
    V2_GEOMETRY.topbar === 56 &&
    V2_GEOMETRY.sidebarCollapsed === 56 &&
    V2_GEOMETRY.contextRail === 320 &&
    V2_GEOMETRY.contextRailWide === 404 &&
    V2_GEOMETRY.pageGutter === 24,
  "canonical geometry unchanged (256/56/56/320/404/24)",
);
const v2Css = source("packages/ui/src/design-system/v2/v2.module.css");
check(v2Css.includes("prefers-reduced-motion"), "reduced-motion respected in V2 CSS");
check(v2Css.includes("768px") && v2Css.includes("1080px"), "tablet/desktop collapse breakpoints present");
check(v2Css.includes("focus-visible"), "focus visibility styled in V2 CSS");
const viewport = source("packages/ui/src/design-system/v2/canvas/CanvasViewport.tsx");
check(viewport.includes("scrollOwner"), "canvas scroll ownership stays explicit");
const newUiFiles = [
  ...readdirSync(slotsDir).filter((name) => name.endsWith(".tsx")).map((name) => `/components/studio/slots/${name}`),

];
for (const file of newUiFiles) {
  const body = source(file);
  check(!/w-\[\d+px\]|min-w-\[\d+px\]|max-w-\[\d+px\]/.test(body), `no fixed pixel widths: ${file.split("/").pop()}`);
  check(!body.includes("z-[") && !body.includes("z-index"), `no custom z-index stack: ${file.split("/").pop()}`);
}
const toolbar = source("/components/studio/slots/StudioCanvasToolbarSlot.tsx");
check(toolbar.includes('role="toolbar"') && toolbar.includes("aria-pressed"), "canvas toolbar semantics present");
const composer = source("packages/ui/src/design-system/v2/composer/Composer.tsx");
check(composer.includes("role=\"combobox\"") || composer.includes("V2ComposerInput"), "composer input primitive present");

console.log(`\nstu-34 job13 visual migration: PASS (${passed} checks)`);
