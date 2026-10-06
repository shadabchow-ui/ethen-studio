import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStudioSearchIndex,
  matchStudioSearchIndex,
} from "../../../components/studio/v5/search/studio-search-index";
import { STUDIO_LEGACY_REDIRECTS } from "../../../lib/studio-v5/route-map";

const FAMILIES = [
  { familyId: "falfam/fal-ai-flux-pro", label: "fal · Flux Pro", tasks: ["image.generate", "image.edit", "unknown"] },
  { familyId: "falfam/minimax-hailuo", label: "fal · Hailuo", tasks: ["video.generate"] },
];

test("RC7 index: covers every Studio surface group", () => {
  const index = buildStudioSearchIndex(FAMILIES);
  const groups = new Set(index.results.map((result) => result.group));
  for (const group of ["Create", "Pro", "Apps", "Templates", "Models", "Pages", "Settings"]) {
    assert.ok(groups.has(group as never), `missing group ${group}`);
  }
  // Every result resolves to a canonical href; ids are unique.
  const ids = new Set<string>();
  for (const result of index.results) {
    assert.ok(!ids.has(result.id), `duplicate id ${result.id}`);
    ids.add(result.id);
    const href = index.hrefs.get(result.id);
    assert.ok(href, `${result.id}: missing href`);
    assert.ok(href!.startsWith("/studio/"), `${result.id}: ${href}`);
    for (const legacy of Object.keys(STUDIO_LEGACY_REDIRECTS)) {
      assert.ok(href !== legacy && !href!.startsWith(`${legacy}?`), `${result.id}: legacy href ${href}`);
    }
  }
});

test("RC7 index: families merge from generated data", () => {
  const empty = buildStudioSearchIndex([]);
  assert.ok(!empty.results.some((result) => result.group === "Models"), "no families, no Models group");
  const index = buildStudioSearchIndex(FAMILIES);
  const flux = index.results.find((result) => result.id === "model-family:falfam/fal-ai-flux-pro");
  assert.ok(flux, "flux family indexed");
  assert.equal(flux!.title, "fal · Flux Pro");
  assert.ok(flux!.detail.includes("Image Generation"), flux!.detail);
  assert.ok(flux!.detail.includes("Image Editing"), flux!.detail);
  assert.ok(!flux!.detail.includes("unclassified"), "unmapped tasks stay out of family details");
  assert.ok(
    index.hrefs.get(flux!.id)?.startsWith("/studio/models?q="),
    "family links the filtered Models page",
  );
});

test('RC7 queries: "voice", "flux", "templates", "billing" return results', () => {
  const index = buildStudioSearchIndex(FAMILIES);
  const voice = matchStudioSearchIndex(index, "voice");
  assert.ok(voice.length > 0, "voice returns results");
  assert.ok(voice.some((result) => result.id === "create:create-voice"), "Create voice found");
  assert.ok(voice.some((result) => result.id === "template:voice-draft"), "voice template found");

  const flux = matchStudioSearchIndex(index, "flux");
  assert.ok(flux.length > 0, "flux returns results");
  assert.ok(flux.some((result) => result.id === "model-family:falfam/fal-ai-flux-pro"), "flux family found");

  const templates = matchStudioSearchIndex(index, "templates");
  assert.ok(templates.length > 0, "templates returns results");
  assert.ok(templates.some((result) => result.id === "page:templates"), "Templates page found");

  const billing = matchStudioSearchIndex(index, "billing");
  assert.ok(billing.length > 0, "billing returns results");
  assert.ok(
    billing.some((result) => result.id === "settings:billing"),
    "Billing & Usage section found",
  );
  assert.equal(index.hrefs.get("settings:billing"), "/studio/settings?section=billing");
});

test("RC7 index: settings keywords are searchable", () => {
  const index = buildStudioSearchIndex([]);
  // Section keywords ride the detail line so the palette can match them.
  assert.ok(matchStudioSearchIndex(index, "subscription").some((r) => r.id === "settings:billing"));
  assert.ok(matchStudioSearchIndex(index, "shortcuts").some((r) => r.id === "settings:keyboard"));
  assert.ok(matchStudioSearchIndex(index, "").length === index.results.length, "empty query lists all");
});
