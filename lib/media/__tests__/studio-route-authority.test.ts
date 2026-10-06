import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STUDIO_CANONICAL_ROUTES,
  STUDIO_LEGACY_REDIRECTS,
  canonicalStudioDestination,
  isLegacyStudioPath,
  resolveSettingsSectionId,
  studioSettingsHref,
} from "../../../lib/studio-v5/route-map";

import {
  preserveStudioQuery,
  studioProTitleForTool,
} from "../../../components/studio/v5/shell/navigation-model";
import { studioAppHref, studioWorkflowHref } from "../../../lib/studio-v5/live-destinations";
import { getStudioRouteForAppId } from "../../../components/studio/studio-navigation";
import { getStudioNavEntries, getStudioPaletteEntries } from "@ethen/navigation";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry === ".next") continue;
    const rel = `${dir}/${entry}`;
    try {
      if (entry.includes(".")) {
        if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(rel);
      } else {
        walk(rel, out);
      }
    } catch {
      // Unreadable entries are skipped.
    }
  }
  return out;
}

/** Path part of an href (query/hash stripped) with ${holes} normalized. */
function normalizeHrefTarget(raw: string): string {
  return raw.split("?")[0]!.split("#")[0]!.replace(/\$\{[^}]*\}/g, ":p");
}

// ── RC5: no internal href targets a legacy redirect source ──────────────

interface AllowlistedHref {
  file: string;
  href: string;
  reason: string;
}

/**
 * Literals that look like legacy hrefs but are unreachable in Studio.
 * Each entry is re-verified below (stale entries fail).
 */
const ALLOWLISTED_NON_STUDIO_HREFS: readonly AllowlistedHref[] = [
  {
    file: "packages/ui/src/settings/settings-shared-sections.tsx",
    href: "/upgrade",
    reason: "Chat/Designer upgrade page; Studio omits it via the product prop",
  },
];

const NAVIGATION_TARGET = /(href|actionHref|backHref|secondaryHref|canonical|redirect_url|router\.push|redirect|location\.assign|location\.href)\s*[=(:]?\s*/;
const QUOTED_PATH = /["'`](\/[^"'`]*?)["'`]/g;
const QUOTED_PATH_ONCE = /["'`](\/[^"'`]*?)["'`]/;

test("RC5 no Studio source href targets a legacy redirect source", () => {
  const files = [
    ...walk("components"),
    ...walk("lib"),
    ...walk("packages/ui/src"),
    ...walk("app").filter((f) => !f.startsWith("app/api/")),
    "packages/navigation/src/studio.ts",
  ];
  const legacy = STUDIO_LEGACY_REDIRECTS.map(
    (entry) => new RegExp(`^${entry.source.replace(/:[A-Za-z]+/g, "[^/]+")}$`),
  );
  const violations: string[] = [];
  const allowlistHits = new Set<string>();
  for (const file of files) {
    const text = source(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    const check = (target: string) => {
      const sourceIndex = legacy.findIndex((pattern) => pattern.test(target));
      if (sourceIndex === -1) return;
      const allowlisted = ALLOWLISTED_NON_STUDIO_HREFS.find((a) => a.file === file && a.href === target);
      if (allowlisted) {
        allowlistHits.add(`${allowlisted.file} ${allowlisted.href}`);
        return;
      }
      violations.push(`${file}: ${target} (legacy → ${STUDIO_LEGACY_REDIRECTS[sourceIndex].destination})`);
    };
    for (const line of text.split("\n")) {
      // Single quoted value right after the keyword (href="/x",
      // canonical: `/y`): check exactly that value, so sibling config on
      // the same line (activePrefixes, labels) is ignored. Brace/call
      // forms (href={...}, push(...)) scan the rest of the line for
      // ternaries like href={c ? "/a" : "/b"}.
      const at = line.search(NAVIGATION_TARGET);
      if (at === -1) continue;
      const tail = line.slice(at).replace(NAVIGATION_TARGET, "");
      if (tail.startsWith('"') || tail.startsWith("'") || tail.startsWith("`")) {
        const single = tail.match(QUOTED_PATH_ONCE);
        if (single) {
          const target = normalizeHrefTarget(single[1]);
          if (target !== "/" && target.startsWith("/")) check(target);
        }
        continue;
      }
      for (const match of tail.matchAll(QUOTED_PATH)) {
        const target = normalizeHrefTarget(match[1]);
        if (target === "/" || !target.startsWith("/")) continue;
        check(target);
      }
    }
  }
  assert.deepEqual(violations, [], `internal hrefs must be canonical:\n${violations.join("\n")}`);
  for (const entry of ALLOWLISTED_NON_STUDIO_HREFS) {
    assert.ok(allowlistHits.has(`${entry.file} ${entry.href}`), `stale allowlist entry: ${entry.file} ${entry.href}`);
  }
});

test("RC5 destination builders never emit a legacy source", () => {
  const workflows = [
    "text-to-image",
    "text-to-video",
    "image-to-video",
    "reference-to-video",
    "edit-image",
    "edit-video",
    "background",
    "restyle",
    "text-to-audio",
    "image-to-3d",
    "upscale",
    "compare",
  ] as const;
  for (const workflow of workflows) {
    for (const projectId of [null, "p1"]) {
      const href = studioWorkflowHref(workflow, projectId);
      assert.equal(
        canonicalStudioDestination(normalizeHrefTarget(href)),
        null,
        `${workflow} (${projectId ?? "unscoped"}) must be canonical, got ${href}`,
      );
    }
  }
  const panels = [
    "ai-influencer",
    "marketing-studio",
    "cinema",
    "canvas",
    "compare-models",
    "image-editor",
    "characters",
    "products",
    "brands",
  ] as const;
  for (const panel of panels) {
    for (const projectId of [null, "p1"]) {
      const href = studioAppHref(panel, projectId);
      assert.equal(
        canonicalStudioDestination(normalizeHrefTarget(href)),
        null,
        `${panel} (${projectId ?? "unscoped"}) must be canonical, got ${href}`,
      );
    }
  }
  const appIds = [
    "create-image",
    "create-video",
    "text-to-video",
    "image-to-video",
    "relight",
    "product-url-to-ad",
    "marketing-studio",
    "ai-influencer",
    "canvas",
    "storyboard",
    "cinema-studio",
    "game-asset-generator",
    "character-motion",
    "voiceover",
    "provider-status",
    "unknown-app-id",
  ];
  for (const appId of appIds) {
    const href = getStudioRouteForAppId(appId);
    assert.equal(
      canonicalStudioDestination(normalizeHrefTarget(href)),
      null,
      `app ${appId} must resolve canonical, got ${href}`,
    );
  }
  for (const entry of [...getStudioNavEntries({ enrolled: true }), ...getStudioPaletteEntries({ enrolled: true })]) {
    assert.equal(
      canonicalStudioDestination(normalizeHrefTarget(entry.href)),
      null,
      `nav entry ${entry.id} must link canonical, got ${entry.href}`,
    );
  }
});

test("RC5 destination tables carry no legacy literals", () => {
  const banned = [
    '"/studio/apps/',
    '"/studio/canvas"',
    '"/studio/audio"',
    '"/studio/image"',
    '"/studio/video"',
    '"/studio/cinema"',
    '"/studio/projects"',
    '"/studio/assets"',
    '"/studio/jobs"',
  ];
  for (const file of [
    "lib/studio-v5/live-destinations.ts",
    "components/studio/studio-navigation.ts",
    "components/studio/v5/discovery/TemplatesLibrary.tsx",
  ]) {
    const text = source(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    for (const literal of banned) {
      assert.ok(!text.includes(literal), `${file} must not contain legacy literal ${literal}`);
    }
  }
});

// ── RC5: canonical table + redirect entries ─────────────────────────────

test("RC5 upgrade and settings targets are canonical routes", () => {
  assert.equal(STUDIO_CANONICAL_ROUTES.settings, "/studio/settings");
  assert.equal(STUDIO_CANONICAL_ROUTES.settingsBilling, "/studio/settings?section=billing");
  assert.equal(STUDIO_CANONICAL_ROUTES.upgrade, "/studio/settings?section=billing");
  assert.equal(STUDIO_CANONICAL_ROUTES.createImage, "/studio/create/image");
  assert.equal(STUDIO_CANONICAL_ROUTES.createVideo, "/studio/create/video");
  assert.equal(STUDIO_CANONICAL_ROUTES.createVoice, "/studio/create/voice");
  assert.equal(STUDIO_CANONICAL_ROUTES.createEdit, "/studio/create/edit");
});

test("RC5 /upgrade and /pricing redirect one hop to billing settings", () => {
  const upgrade = STUDIO_LEGACY_REDIRECTS.find((entry) => entry.source === "/upgrade");
  const pricing = STUDIO_LEGACY_REDIRECTS.find((entry) => entry.source === "/pricing");
  assert.ok(upgrade, "/upgrade redirect exists");
  assert.ok(pricing, "/pricing redirect exists");
  assert.equal(upgrade.destination, STUDIO_CANONICAL_ROUTES.upgrade);
  assert.equal(pricing.destination, STUDIO_CANONICAL_ROUTES.upgrade);
  assert.equal(canonicalStudioDestination("/upgrade"), "/studio/settings?section=billing");
});

test("RC5 legacy destinations resolve with param substitution", () => {
  assert.equal(canonicalStudioDestination("/studio/canvas"), "/studio/workflows");
  assert.equal(
    canonicalStudioDestination("/studio/projects/p1/edit/image"),
    "/studio/create/edit?projectId=p1",
  );
  assert.equal(isLegacyStudioPath("/studio/audio"), true);
  assert.equal(isLegacyStudioPath("/studio/create/image"), false);
  assert.equal(canonicalStudioDestination("/studio/create/image"), null);
});

test("RC5 settings href helper builds canonical section links", () => {
  assert.equal(studioSettingsHref(), "/studio/settings");
  assert.equal(studioSettingsHref("billing"), "/studio/settings?section=billing");
});

// ── RC5: settings section resolver ──────────────────────────────────────

const VALID_SECTIONS = ["general", "account", "billing", "api-access"];

test("RC5 section resolver aliases plan and rejects the unknown", () => {
  assert.equal(resolveSettingsSectionId("billing", VALID_SECTIONS), "billing");
  assert.equal(resolveSettingsSectionId("plan", VALID_SECTIONS), "billing");
  assert.equal(resolveSettingsSectionId("Plan", VALID_SECTIONS), "billing");
  assert.equal(resolveSettingsSectionId(null, VALID_SECTIONS), "general");
  assert.equal(resolveSettingsSectionId(undefined, VALID_SECTIONS), "general");
  assert.equal(resolveSettingsSectionId("", VALID_SECTIONS), "general");
  assert.equal(resolveSettingsSectionId("nope", VALID_SECTIONS), "general");
  assert.equal(resolveSettingsSectionId("api-access", VALID_SECTIONS), "api-access");
});

// ── RC5: query hygiene + pro titles ─────────────────────────────────────

test("RC5 page-scoped view never leaks across pages", () => {
  assert.equal(
    preserveStudioQuery("/studio/templates", "?view=expert&projectId=p1"),
    "/studio/templates?projectId=p1",
  );
  assert.equal(preserveStudioQuery("/studio/models", "?view=expert"), "/studio/models");
  // Discovery context still survives tool switches.
  assert.equal(
    preserveStudioQuery("/studio/create/image", "?projectId=p1&q=cat&task=text-to-image&category=x"),
    "/studio/create/image?projectId=p1&q=cat&task=text-to-image&category=x",
  );
});

test("RC5 pro tool titles derive from the nav registry", () => {
  assert.equal(studioProTitleForTool("cinema"), "Cinema Studio");
  assert.equal(studioProTitleForTool("image"), "Image Studio");
  assert.equal(studioProTitleForTool("video"), "Video Studio");
  assert.equal(studioProTitleForTool("audio"), "Audio Studio");
  assert.equal(studioProTitleForTool("dubbing"), "Dubbing Studio");
  assert.equal(studioProTitleForTool("nope"), null);
});

// ── RC5: wiring tripwires (browser-verified locally) ────────────────────

test("RC5 branded 404s exist with recovery destinations", () => {
  for (const file of ["app/not-found.tsx", "app/studio/not-found.tsx"]) {
    assert.ok(source(file).includes("StudioNotFound"), `${file} renders the branded 404 body`);
  }
  const body = source("components/studio/StudioNotFound.tsx");
  assert.ok(body.includes("STUDIO_CANONICAL_ROUTES.home"), "404 offers Studio home");
  assert.ok(body.includes("/studio/explore"), "404 offers Explore");
  assert.ok(body.includes("router.back()"), "404 offers Back");
});

test("RC5 identity kinds resolve, converge voices, and 404 the unknown", () => {
  // next/navigation can't load under tsx, so the helper is pinned by
  // source and verified at runtime in the local browser pass.
  const helper = source("lib/studio-v5/identity-kind-routing.ts");
  assert.ok(helper.includes('"characters", "products", "brands"'), "valid kinds enumerated");
  assert.ok(helper.includes('redirect("/studio/voices")'), "voices converges on the voices library");
  assert.ok(helper.includes("notFound()"), "unknown kinds 404");
  const page = source("app/studio/(workbench)/identities/[kind]/page.tsx");
  assert.ok(page.includes("resolveIdentityKind"), "the page resolves through the shared helper");
  assert.ok(!page.includes("redirect("), "the page keeps its live datasource classification");
});

test("RC5 pro page metadata derives from the registry", () => {
  const page = source("app/studio/(workbench)/pro/[tool]/page.tsx");
  assert.ok(page.includes("generateMetadata"), "per-tool metadata");
  assert.ok(page.includes("studioProTitleForTool"), "titles from the nav registry");
  assert.ok(!page.includes('title: "Pro Workbench"'), "no generic static title");
});

test("RC5 settings shell reacts to client navigation", () => {
  const inner = source("components/studio/StudioSettingsInner.tsx");
  assert.ok(inner.includes("useSearchParams"), "section follows the URL on navigation");
  assert.ok(inner.includes("resolveSettingsSectionId"), "one resolver with aliases");
  assert.ok(!inner.includes("subscribeNever"), "no frozen initial-load-only section");
});

test("RC5 billing section omits View-plans for Studio", () => {
  const shared = source("packages/ui/src/settings/settings-shared-sections.tsx");
  assert.ok(shared.includes('product === "studio" ? null'), "studio omits the /upgrade link");
});
