import assert from "node:assert/strict";
import { test } from "node:test";
import {
  catalogTasks,
  endpointsForFamily,
  filterCatalog,
  parseCatalogResponse,
  type CatalogProjectionView,
  type DiscoverableEndpointView,
} from "../../../components/studio/v5/discovery/catalog-client";
import {
  MAX_MODEL_FAVORITES,
  MAX_MODEL_RECENTS,
  pushRecentId,
  toggleFavoriteId,
} from "../../../components/studio/studio-model-lists";
import { getRegistryEndpointById, getRegistryEndpoints } from "../fal-catalog";
import type { StudioEndpoint } from "../endpoint-registry";
import { MODEL_COMPARE_MAX, compareEndpoints } from "../model-compare";

/** Representative tasks: image, image-edit, video, image-to-video, audio. */
const REPRESENTATIVE_TASKS = [
  "text-to-image",
  "image-editing",
  "text-to-video",
  "image-to-video",
  "text-to-audio",
] as const;

function representativeEndpoints(): StudioEndpoint[] {
  const registry = getRegistryEndpoints();
  return REPRESENTATIVE_TASKS.map((task) => {
    const endpoint = registry
      .filter((candidate) => candidate.task === task && candidate.disposition === "eligible" && candidate.schema.status === "supported")
      .sort((a, b) => a.endpointId.localeCompare(b.endpointId))[0];
    assert.ok(endpoint, `no schema-supported eligible endpoint for task ${task}`);
    return endpoint;
  });
}

function toView(endpoint: StudioEndpoint): DiscoverableEndpointView {
  return {
    endpointId: endpoint.endpointId,
    familyId: endpoint.familyId ?? "unknown",
    familyLabel: endpoint.familyId ?? "unknown",
    providerId: "fal.ai",
    task: endpoint.task,
    label: endpoint.endpointId,
    supportedParameters: endpoint.capabilities.supportedInputs ?? [],
    requiredParameters: endpoint.capabilities.requiredInputs ?? [],
    executable: false,
    disabledReasons: [...endpoint.supportReasons],
  };
}

function toProjection(endpoints: readonly StudioEndpoint[]): CatalogProjectionView {
  const views = endpoints.map(toView);
  const families = [...new Map(views.map((view) => [view.familyId, view])).values()].map((view) => ({
    familyId: view.familyId,
    label: view.familyLabel,
    providerId: view.providerId,
    tasks: [view.task],
    endpointCount: 1,
    executableCount: 0,
  }));
  return {
    families,
    endpoints: views,
    tallies: { families: families.length, endpoints: views.length, executable: 0 },
  };
}

test("representative coverage: one supported endpoint per task", () => {
  const picked = representativeEndpoints();
  assert.equal(picked.length, REPRESENTATIVE_TASKS.length);
  assert.deepEqual(picked.map((endpoint) => endpoint.task), [...REPRESENTATIVE_TASKS]);
});

test("model detail: family disclosure carries exact parameters", () => {
  const picked = representativeEndpoints();
  const projection = toProjection(getRegistryEndpoints());
  for (const endpoint of picked) {
    const familyId = endpoint.familyId!;
    const disclosed = endpointsForFamily(projection, familyId);
    assert.ok(disclosed.length > 0, `${familyId}: disclosure is empty`);
    const view = disclosed.find((candidate) => candidate.endpointId === endpoint.endpointId)!;
    assert.ok(view, `${endpoint.endpointId}: missing from family disclosure`);
    assert.deepEqual([...view.requiredParameters], [...(endpoint.capabilities.requiredInputs ?? [])]);
    assert.deepEqual([...view.supportedParameters], [...(endpoint.capabilities.supportedInputs ?? [])]);
    // Detail never claims executability in this lane.
    assert.equal(view.executable, false);
    assert.ok(view.disabledReasons.length > 0);
  }
});

test("compare: rows disagree honestly and unknowns stay neutral", () => {
  const picked = representativeEndpoints();
  const mixed = compareEndpoints([picked[0]!, picked[4]!]);
  assert.equal(mixed.columns.length, 2);
  assert.equal(mixed.truncated, false);
  const taskRow = mixed.rows.find((row) => row.key === "task")!;
  assert.equal(taskRow.differing, true);
  // Same-task pair agrees on task.
  const sameTask = getRegistryEndpoints().filter(
    (candidate) => candidate.task === picked[4]!.task && candidate.endpointId !== picked[4]!.endpointId,
  ).slice(0, 1);
  assert.equal(sameTask.length, 1);
  const pair = compareEndpoints([picked[4]!, sameTask[0]!]);
  assert.equal(pair.rows.find((row) => row.key === "task")!.differing, false);
  // License provenance flows into comparison.
  const marigold = getRegistryEndpointById("fal-ai/marigold-v2")!;
  const licensed = compareEndpoints([marigold, picked[2]!]);
  const licenseRow = licensed.rows.find((row) => row.key === "license")!;
  assert.match(licenseRow.values[0]!, /Apache-2\.0/);
  // Truncation is explicit, never silent.
  const many = compareEndpoints(getRegistryEndpoints().slice(0, MODEL_COMPARE_MAX + 2));
  assert.equal(many.columns.length, MODEL_COMPARE_MAX);
  assert.equal(many.truncated, true);
});

test("favorites and recents: toggle and recency-cap algebra", () => {
  assert.deepEqual(toggleFavoriteId([], "a"), ["a"]);
  assert.deepEqual(toggleFavoriteId(["a", "b"], "a"), ["b"]);
  assert.deepEqual(toggleFavoriteId(["a"], ""), ["a"]);
  const full = Array.from({ length: MAX_MODEL_FAVORITES + 5 }, (_, i) => `m${i}`);
  assert.equal(toggleFavoriteId(full.slice(0, MAX_MODEL_FAVORITES), "new").length, MAX_MODEL_FAVORITES);
  assert.deepEqual(pushRecentId([], "a"), ["a"]);
  assert.deepEqual(pushRecentId(["b", "a"], "a"), ["a", "b"]);
  assert.deepEqual(pushRecentId(["a"], ""), ["a"]);
  const recents = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7"];
  assert.equal(recents.length, MAX_MODEL_RECENTS);
  assert.deepEqual(pushRecentId(recents, "r8"), ["r8", "r0", "r1", "r2", "r3", "r4", "r5", "r6"]);
});

test("search and filters narrow families without inventing counts", () => {
  const picked = representativeEndpoints();
  const projection = toProjection(picked);
  assert.deepEqual(catalogTasks(projection).sort(), [...REPRESENTATIVE_TASKS].sort());
  const videoOnly = filterCatalog(projection, { query: "", task: "text-to-video", executableOnly: false });
  assert.equal(videoOnly.endpoints.length, 1);
  assert.equal(videoOnly.endpoints[0]!.task, "text-to-video");
  assert.equal(videoOnly.families.length, 1);
  const queried = filterCatalog(projection, { query: picked[0]!.endpointId, task: null, executableOnly: false });
  assert.equal(queried.endpoints.length, 1);
  const empty = filterCatalog(projection, { query: "no-such-model-zzz", task: null, executableOnly: false });
  assert.equal(empty.endpoints.length, 0);
  assert.equal(empty.families.length, 0);
});

test("catalog envelope parsing keeps error/setup/permission distinct", () => {
  const picked = representativeEndpoints();
  const views = picked.map(toView);
  const ok = parseCatalogResponse({
    ok: true,
    data: {
      catalog: {
        families: views.map((view) => ({ familyId: view.familyId, label: view.familyLabel })),
        endpoints: views,
      },
    },
  });
  assert.equal(ok.state, "ready");
  assert.equal(ok.projection!.tallies.endpoints, views.length);
  assert.equal(parseCatalogResponse({ ok: false, error: { code: "SETUP_REQUIRED" } }).state, "setup");
  assert.equal(parseCatalogResponse({ ok: false, error: { code: "FORBIDDEN" } }).state, "permission");
  assert.equal(parseCatalogResponse({ ok: false, error: { code: "NOPE" } }).state, "error");
  assert.equal(parseCatalogResponse({ ok: true, data: { catalog: { families: [], endpoints: [] } } }).state, "empty");
});
