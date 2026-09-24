import {
  buildMediaLibraryCollections,
  buildMediaProjectCollections,
  deriveMediaRiskLevels,
  deriveMediaTrustState,
  getDisabledActionReason,
} from "../studio";
import { seedMockAssets, clearAssets } from "../assets";
import { seedMockProjects, clearProjects } from "../projects";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function testLibraryCollections(): void {
  clearAssets();
  const assets = seedMockAssets(12);
  const collections = buildMediaLibraryCollections(assets);

  // 9 collections: my-generations, favorites, references, moodboards, character-profiles,
  // voice-profiles, product-assets, campaign-assets, game-assets (added for Game Asset
  // Studio / games-and-interactive-media V1 — see lib/media/studio.ts buildMediaLibraryCollections).
  assertEqual(collections.length, 9, "all requested asset collections are represented");
  assert(collections.some((collection) => collection.id === "favorites" && collection.count >= 1), "favorites collection is populated");
  assert(collections.some((collection) => collection.id === "voice-profiles" && collection.count >= 1), "voice profiles collection is populated");
  assert(collections.some((collection) => collection.id === "campaign-assets" && collection.count >= 1), "campaign assets collection is populated");
}

function testProjectCollections(): void {
  clearProjects();
  const projects = seedMockProjects();
  const collections = buildMediaProjectCollections(projects);

  assertEqual(collections.length, 4, "recent, campaign, product, and character project collections are represented");
  assert(collections.some((collection) => collection.id === "campaign-boards" && collection.count >= 1), "campaign boards collection is populated");
  assert(collections.some((collection) => collection.id === "product-boards" && collection.count >= 1), "product boards collection is populated");
}

function testTrustStatePriority(): void {
  const fallback = deriveMediaTrustState({
    providerStatus: {
      id: "openai",
      label: "OpenAI",
      modality: "image",
      mode: "setup-required",
      available: false,
      configured: false,
      setupRequired: true,
      lastCheckedAt: new Date().toISOString(),
      trust: "setup_required",
    },
    isMock: true,
    fallbackUsed: true,
    jobState: "completed",
  });
  assertEqual(fallback, "fallback", "fallback trust wins when mock output substitutes for unavailable preferred provider");

  const approval = deriveMediaTrustState({
    isMock: true,
    jobState: "awaiting_approval",
  });
  assertEqual(approval, "awaiting-approval", "awaiting approval wins over mock");
}

function testRiskMapping(): void {
  const risks = deriveMediaRiskLevels({
    outcome: "consent_required",
    triggeredCategories: ["face_swap", "voice_cloning", "public_figures"],
    reasons: [],
    messages: [],
    requiresConsent: true,
    requiresApproval: false,
    blocked: false,
    warnOnly: false,
  });

  assert(risks.includes("identity"), "identity risk derived from face swap");
  assert(risks.includes("voice"), "voice risk derived from voice cloning");
  assert(risks.includes("public_figure"), "public figure risk derived from public figure trigger");
}

function testDisabledReasons(): void {
  assertEqual(getDisabledActionReason("export", "mock"), "Export requires live provider output.", "export helper stays honest");
  assertEqual(getDisabledActionReason("download", "mock"), "Download unavailable in mock preview.", "download helper calls out mock preview");
  assertEqual(getDisabledActionReason("upload", "mock"), "Upload storage is not configured.", "upload helper stays honest");
}

testLibraryCollections();
testProjectCollections();
testTrustStatePriority();
testRiskMapping();
testDisabledReasons();

console.log(`media studio helper tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exitCode = 1;
}
