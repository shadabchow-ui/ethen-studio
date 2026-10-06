import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DISCOVERY_MEDIA } from "../../../lib/studio-v5/discovery-media";
import {
  exploreImages,
  exploreVideos,
  formatDuration,
  itemTitle,
  showcaseById,
  showcaseFeed,
} from "../../../lib/studio-v5/showcase-feed";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

// ── RC12 data: browsable walls ─────────────────────────────────────────

test("RC12: Explore walls exclude placeholders but keep them for geometry", () => {
  const feed = showcaseFeed();
  assert.ok(feed.some((item) => item.placeholder), "placeholders still hold home-section geometry");
  for (const item of [...exploreVideos(feed), ...exploreImages(feed)]) {
    assert.equal(item.placeholder, false, `${item.id} leaks into Explore filters`);
    assert.ok(item.title, `${item.id} would render a Sample fallback title`);
    assert.ok(!itemTitle(item).startsWith("Sample "), item.id);
  }
});

test("RC12: video-19 leaves the Images wall but keeps id/workflow for key art + remix", () => {
  const feed = showcaseFeed();
  assert.ok(!exploreImages(feed).some((item) => item.id === "video-19"));
  const keyArt = showcaseById("video-19");
  assert.ok(keyArt, "key-art lookup by id still resolves");
  assert.equal(keyArt.mediaType, "image");
  assert.equal(keyArt.workflow, "image-to-video");
  assert.deepEqual(keyArt.sections, ["feature-rail"]);
});

test("RC12: titles carry no duration claims the badges contradict", () => {
  for (const media of DISCOVERY_MEDIA) {
    assert.ok(!media.title || !/\d+\s*-second/.test(media.title), `${media.id}: ${media.title}`);
  }
  assert.equal(formatDuration(8), "0:08");
  const beauty = showcaseById("showcase-beauty-film-01");
  const hero = showcaseById("product-hero-01");
  assert.ok(beauty?.title && !beauty.title.includes("30-second"));
  assert.ok(hero?.title && !hero.title.includes("10-second"));
});

// ── RC12 tiles ─────────────────────────────────────────────────────────

test("RC12: tiles have one primary tab stop and honest badges", () => {
  const tile = source("components/studio/v5/discovery/showcase/ShowcaseTile.tsx");
  assert.ok(!tile.includes("Open details for"), "redundant Open link removed");
  assert.ok(!tile.includes("Remix ${"), "tile Remix cluster removed (lives in detail)");
  assert.ok(!tile.includes("actions ="), "actions prop removed");
  assert.ok(
    tile.includes('{duration && !playing && !decorative ? ('),
    "decorative tiles (app cards) show no duration badge",
  );
  assert.ok(
    tile.includes('aria-hidden="true" className="pointer-events-none absolute bottom-2'),
    "duration badge is aria-hidden",
  );
  assert.ok(tile.includes("Preview ${label}"), "coarse-pointer preview control kept");
});

// ── RC12 viewer ────────────────────────────────────────────────────────

test("RC12: still viewer offers open, download, zoom, fullscreen", () => {
  const detail = source("components/studio/v5/discovery/explore/CreationDetail.tsx");
  for (const label of ["Open original", "Download image", "Zoom in", "Zoom out", "Reset zoom"]) {
    assert.ok(detail.includes(`aria-label="${label}"`), label);
  }
  assert.ok(detail.includes('"Exit fullscreen" : "Fullscreen"'), "fullscreen toggle");
  assert.ok(detail.includes('role="toolbar" aria-label="Image viewer actions"'));
  // Video keeps native controls on a stable element: fullscreen never remounts it.
  assert.ok(detail.includes("key={item.id}"));
  assert.ok(detail.includes("controls"));
  const icons = source("components/studio/v5/shell/studio-nav-icons.tsx");
  for (const name of ["download:", "fullscreen:", '"exit-fullscreen":']) {
    assert.ok(icons.includes(name), name);
  }
});

test("RC12: detail Type metadata is always populated", () => {
  const detail = source("components/studio/v5/discovery/explore/CreationDetail.tsx");
  assert.ok(detail.includes('{ label: "Type", value: item.mediaType === "video" ? "Video" : "Image" }'));
});

// ── RC12 wiring + copy ─────────────────────────────────────────────────

test("RC12: Explore filters and overflow walls use the browsable selectors", () => {
  const route = source("components/studio/v5/discovery/explore/ExploreRoute.tsx");
  assert.ok(route.includes("exploreVideos(items)") && route.includes("exploreImages(items)"));
  assert.ok(!route.includes("showcaseVideos(items)") && !route.includes("showcaseImages(items)"));
  assert.ok(route.includes("!item.placeholder && !shownIds.has(item.id)"));
});

test("RC12: AI Influencer gets its own locked preview, not Marketing's", () => {
  const workspace = source("components/studio/v5/composites/CompositeWorkspace.tsx");
  assert.ok(workspace.includes('"Series preview (locked)"'));
  assert.ok(workspace.includes('"Series brief preview"'));
  assert.ok(workspace.includes('"Lead character"'));
  assert.ok(workspace.includes('"Campaign preview (locked)"'), "marketing copy unchanged");
  assert.ok(workspace.includes('what={kind === "marketing" ? "Campaigns" : "Series"}'));
});

test("RC12: Product Ad tab aligns with Marketing Studio; glb copy fixed", () => {
  const layout = source("components/studio/v5/create/GeneratorLayout.tsx");
  assert.ok(layout.includes('{ id: "product-ad", label: "Marketing Studio"'));
  assert.ok(!layout.includes('label: "Product Ad"'));
  const tools = source("components/studio/v5/create/tool-definitions.ts");
  assert.ok(tools.includes("the .glb result stages below"));
});

test("RC12: quick-create labels wrap instead of truncating", () => {
  const home = source("components/studio/v5/discovery/StudioHome.tsx");
  assert.ok(!home.includes("block truncate text-[12.5px] font-medium"), "title no longer truncates");
  assert.ok(home.includes("font-medium leading-snug"), "title wraps");
});
