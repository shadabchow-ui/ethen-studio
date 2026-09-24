import {
  MEDIA_APPS,
  MEDIA_APP_CATEGORY_ORDER,
  MEDIA_APP_SECTION_ORDER,
  filterMediaApps,
  getFeaturedMediaApps,
  getMediaAppById,
  getMediaAppsByCategory,
  getMediaAppsBySection,
  searchMediaApps,
} from "../apps";
import {
  MEDIA_STUDIO_NAV_ITEMS,
  MEDIA_STUDIO_PLACEHOLDER_TABS,
  getAppsForStudioTab,
} from "../app-registry";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }

  failed += 1;
  console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    passed += 1;
    return;
  }

  failed += 1;
  console.error(
    `  FAIL: ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

console.log("\n[Media app registry]");
assert(MEDIA_APPS.length >= 46, "Registry includes the required app inventory");

console.log("\n[Required entries present]");
for (const appId of [
  "create-image",
  "cinematic-cameras",
  "canvas",
  "moodboard",
  "soul-id-character",
  "ai-influencer",
  "photodump",
  "relight",
  "inpaint",
  "image-upscale",
  "face-swap",
  "character-swap",
  "draw-to-edit",
  "fashion-factory",
  "product-photoshoot",
  "create-video",
  "cinema-studio",
  "image-to-video",
  "product-animation",
  "ugc-video",
  "lipsync-studio",
  "motion-graphics",
  "video-upscale",
  "recast-character",
  "product-url-to-ad",
  "voiceover",
  "change-voice",
  "translation",
  "sound-effects",
  "music-bed",
  "audio-for-video",
  "voice-profile",
  "storyboard",
  "campaign-board",
  "brand-kit",
  "game-asset-generator",
  "sprite-pack-generator",
  "character-pack-generator",
  "game-ui-mockup-generator",
  "tileset-generator",
  "icon-pack-generator",
  "background-generator",
  "animation-frame-generator",
  "provider-status",
  "credit-ledger",
  "safety-review",
]) {
  assert(Boolean(getMediaAppById(appId)), `${appId} exists`);
}

console.log("\n[Metadata shape]");
for (const app of MEDIA_APPS) {
  assert(app.requiredInputs.length > 0, `${app.id} has required inputs`);
  assert(app.outputTypes.length > 0, `${app.id} has output types`);
  assert(app.estimatedCreditsLabel.length > 0, `${app.id} has credits label`);
  assert(app.storeSection.length > 0, `${app.id} has store section`);
}

console.log("\n[Categories and sections]");
for (const category of MEDIA_APP_CATEGORY_ORDER) {
  const apps = getMediaAppsByCategory(category);
  assert(apps.length > 0, `Category ${category} has at least one app`);
}

for (const section of MEDIA_APP_SECTION_ORDER) {
  const apps = getMediaAppsBySection(section);
  assert(apps.length > 0, `Section ${section} has at least one app`);
}

console.log("\n[Featured apps]");
assert(getFeaturedMediaApps().length >= 6, "Featured apps list is populated");

console.log("\n[Filtering]");
assertEqual(filterMediaApps({ category: "audio" }).every((app) => app.category === "audio"), true, "Audio filter only returns audio apps");
assert(searchMediaApps("voice").length > 0, "Search finds voice apps");
assert(searchMediaApps("product").length > 0, "Search finds product apps");
assertEqual(filterMediaApps({ query: "nonexistent-term" }).length, 0, "Unknown search returns no apps");

console.log("\n[Safety metadata]");
const faceSwap = getMediaAppById("face-swap");
assert(faceSwap?.safety.consentRequired === true, "face-swap requires consent");

const influencer = getMediaAppById("ai-influencer");
assert(influencer?.safety.disclosureRequired === true, "ai-influencer requires disclosure metadata");

console.log("\n[Registry stable fields]");
for (const app of MEDIA_APPS) {
  assert(app.slug.length > 0, `${app.id} has slug`);
  assert(app.studioTab.length > 0, `${app.id} has studioTab`);
  assert(app.setupState.length > 0, `${app.id} has setupState`);
  assert(typeof app.isFeatured === "boolean", `${app.id} has isFeatured boolean`);
  assert(typeof app.isNew === "boolean", `${app.id} has isNew boolean`);
  assert(typeof app.isTop === "boolean", `${app.id} has isTop boolean`);
  assert(typeof app.route === "string" && app.route.startsWith("/studio/apps/"), `${app.id} has canonical route`);
}

console.log("\n[Studio tab registry]");
assert(MEDIA_STUDIO_NAV_ITEMS.length >= 13, "Studio nav items are defined");
assert(MEDIA_STUDIO_PLACEHOLDER_TABS.includes("supercomputer"), "supercomputer tab is placeholder");
assert(MEDIA_STUDIO_PLACEHOLDER_TABS.includes("mcp-cli"), "mcp-cli tab is placeholder");
assert(MEDIA_STUDIO_PLACEHOLDER_TABS.includes("collab"), "collab tab is placeholder");
assert(getAppsForStudioTab("image").length > 0, "Image tab has apps");
assert(getAppsForStudioTab("video").length > 0, "Video tab has apps");
assert(getAppsForStudioTab("audio").length > 0, "Audio tab has apps");

console.log(`\n${"=".repeat(40)}`);
console.log(`Media apps tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(40)}`);

if (failed > 0) process.exit(1);
