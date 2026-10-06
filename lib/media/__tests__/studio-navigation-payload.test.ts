import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchCatalogCached,
  invalidateCatalogCache,
  peekCatalogCache,
} from "../../../components/studio/v5/discovery/catalog-cache";
import { parseCatalogSummaryResponse } from "../../../components/studio/v5/discovery/catalog-client";
import { summarizeCatalogProjection } from "@ethen/studio-core/catalog/projection";
import { isPublicAnonymousApiRead } from "../../../lib/studio-access-guard";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

// ── RC11.2: module cache + in-flight dedupe ──────────────────────────────

test("RC11: concurrent catalog reads join one in-flight fetch", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { state: "ready" as const };
  };
  const [a, b, c] = await Promise.all([
    fetchCatalogCached("rc11-join", fetcher),
    fetchCatalogCached("rc11-join", fetcher),
    fetchCatalogCached("rc11-join", fetcher),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.state, "ready");
  assert.equal(b, a);
  assert.equal(c, a);
});

test("RC11: resolved values serve from cache until invalidated", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { state: "ready" as const };
  };
  assert.equal(peekCatalogCache("rc11-cache"), null);
  await fetchCatalogCached("rc11-cache", fetcher);
  await fetchCatalogCached("rc11-cache", fetcher);
  assert.equal(calls, 1);
  assert.deepEqual(peekCatalogCache("rc11-cache"), { state: "ready" });
  invalidateCatalogCache("rc11-cache");
  assert.equal(peekCatalogCache("rc11-cache"), null);
  await fetchCatalogCached("rc11-cache", fetcher);
  assert.equal(calls, 2);
});

test("RC11: uncacheable values and rejections never poison the cache", async () => {
  let calls = 0;
  const uncacheable = async (): Promise<{ state: "ready" | "error" }> => {
    calls += 1;
    return { state: "error" as const };
  };
  const cacheReadyOnly = (value: { state: "ready" | "error" }) => value.state === "ready";
  await fetchCatalogCached("rc11-nocache", uncacheable, cacheReadyOnly);
  await fetchCatalogCached("rc11-nocache", uncacheable, cacheReadyOnly);
  assert.equal(calls, 2);

  let failures = 0;
  const failing = async (): Promise<{ state: "ready" }> => {
    failures += 1;
    throw new Error("boom");
  };
  await assert.rejects(() => fetchCatalogCached("rc11-fail", failing));
  await assert.rejects(() => fetchCatalogCached("rc11-fail", failing));
  assert.equal(failures, 2);
  assert.equal(peekCatalogCache("rc11-fail"), null);
});

// ── RC11.3: summary response ─────────────────────────────────────────────

const SUMMARY_BODY = {
  ok: true,
  data: {
    summary: {
      catalogVersion: "test-v1",
      projectedAt: "2026-10-06T00:00:00.000Z",
      tallies: { families: 1372, endpoints: 1487, executable: 0 },
    },
  },
};

test("RC11: summary parser accepts enveloped and bare bodies", () => {
  const parsed = parseCatalogSummaryResponse(SUMMARY_BODY);
  assert.equal(parsed.state, "ready");
  assert.deepEqual(parsed.summary?.tallies, { families: 1372, endpoints: 1487, executable: 0 });
  assert.equal(parsed.summary?.catalogVersion, "test-v1");
  const bare = parseCatalogSummaryResponse(SUMMARY_BODY.data.summary);
  assert.equal(bare.state, "ready");
  assert.deepEqual(bare.summary?.tallies, parsed.summary?.tallies);
});

test("RC11: summary parser maps failures and rejects bad tallies", () => {
  assert.equal(parseCatalogSummaryResponse({ ok: false, error: { code: "SETUP_REQUIRED" } }).state, "setup");
  assert.equal(parseCatalogSummaryResponse({ ok: false, error: { code: "FORBIDDEN" } }).state, "permission");
  assert.equal(parseCatalogSummaryResponse({ ok: false, error: { code: "NOPE" } }).state, "error");
  assert.equal(parseCatalogSummaryResponse({ ok: true, data: {} }).state, "error");
  assert.equal(
    parseCatalogSummaryResponse({ ok: true, data: { summary: { tallies: { families: -1, endpoints: 2, executable: 0 } } } }).state,
    "error",
  );
  assert.equal(
    parseCatalogSummaryResponse({ ok: true, data: { summary: { tallies: { families: 1.5, endpoints: 2, executable: 0 } } } }).state,
    "error",
  );
  const empty = parseCatalogSummaryResponse({
    ok: true,
    data: { summary: { tallies: { families: 0, endpoints: 0, executable: 0 } } },
  });
  assert.equal(empty.state, "empty");
  assert.deepEqual(empty.summary?.tallies, { families: 0, endpoints: 0, executable: 0 });
  // Stamps fall back; counts never do.
  assert.equal(empty.summary?.catalogVersion, "unknown");
});

test("RC11: summarizeCatalogProjection keeps stamps + triple, drops payload", () => {
  const summary = summarizeCatalogProjection({
    catalogVersion: "v",
    taskMapVersion: "1.1.0",
    projectedAt: "now",
    families: [{ familyId: "f" }] as never,
    endpoints: [{ endpointId: "e" }] as never,
    tallies: { families: 3, endpoints: 5, executable: 1, candidates: 4, byTask: {}, byQualification: {}, byPrice: {} } as never,
  });
  assert.deepEqual(Object.keys(summary).sort(), ["catalogVersion", "projectedAt", "tallies"]);
  assert.deepEqual(summary.tallies, { families: 3, endpoints: 5, executable: 1 });
  assert.ok(!("families" in summary) && !("endpoints" in summary));
});

test("RC11: project-less summary stays on the allowlisted path (semantics unchanged)", () => {
  // The predicate is query-agnostic: ?view=summary changes nothing.
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/catalog", "GET", false), true);
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/catalog", "GET", true), false);
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/catalog", "POST", false), false);
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/catalog/resolve", "GET", false), false);
});

// ── RC11 wiring ──────────────────────────────────────────────────────────

test("RC11: workbench loading boundary, pending hints, and summary consumers wired", () => {
  const loading = source("app/studio/(workbench)/loading.tsx");
  assert.ok(loading.includes('RouteSkeleton') && loading.includes('category="workspace"'));
  const nav = source("components/studio/v5/shell/StudioNavigation.tsx");
  assert.ok(nav.includes("useLinkStatus") && nav.includes("<NavPendingHint />"));
  const css = source("components/studio/v5/shell/studio-sidebar.module.css");
  assert.ok(css.includes(".pendingHint") && css.includes("animation-delay: 100ms"));
  const home = source("components/studio/v5/discovery/StudioHome.tsx");
  assert.ok(home.includes("const catalog = useCatalogSummary(projectId);"));
  assert.ok(home.includes("const tallies = catalog.tallies;"));
  const hook = source("components/studio/v5/discovery/useCatalogProjection.ts");
  assert.ok(hook.includes("fetchCatalogCached") && hook.includes("view=summary"));
  const route = source("app/api/studio/v1/catalog/route.ts");
  assert.ok(route.includes('view === "summary"') && route.includes("view is unknown"));
});
