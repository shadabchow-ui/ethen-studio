import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rovingTabTarget } from "../../../components/studio/v5/shell/roving-tabs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

test("RC8 tabs: roving target wraps and jumps", () => {
  const ids = ["curated", "workspace", "shared"];
  assert.equal(rovingTabTarget(ids, "curated", "ArrowRight"), "workspace");
  assert.equal(rovingTabTarget(ids, "shared", "ArrowRight"), "curated");
  assert.equal(rovingTabTarget(ids, "curated", "ArrowLeft"), "shared");
  assert.equal(rovingTabTarget(ids, "workspace", "ArrowLeft"), "curated");
  assert.equal(rovingTabTarget(ids, "workspace", "Home"), "curated");
  assert.equal(rovingTabTarget(ids, "curated", "End"), "shared");
  assert.equal(rovingTabTarget(ids, "curated", "Enter"), null);
  assert.equal(rovingTabTarget(ids, "curated", "Tab"), null);
  assert.equal(rovingTabTarget([], "curated", "ArrowRight"), null);
  assert.equal(rovingTabTarget(["only"], "only", "ArrowRight"), "only");
});

test("RC8 tabs: frame wires tablist semantics", () => {
  const frame = source("components/studio/v5/shell/LibraryFrame.tsx");
  assert.ok(frame.includes('role="tablist"'), "tablist role");
  assert.ok(frame.includes('role="tabpanel"'), "tabpanel role");
  assert.ok(frame.includes("aria-controls={panelId}"), "tabs control the panel");
  assert.ok(frame.includes("aria-labelledby={rovingId"), "panel labelled by the roving tab");
  assert.ok(
    frame.includes("tabIndex={option.id === rovingId ? 0 : -1}"),
    "roving tabIndex, one stop in the tab order",
  );
  assert.ok(frame.includes("rovingTabTarget(focusableIds"), "arrow keys move focus");
  // Manual activation: arrows move focus only — Link tabs keep native Enter.
  assert.ok(!frame.includes("onSelect("), "no auto-activation from arrowing");
});

test("RC8 toggle: layout toggle renders only with a table renderer", () => {
  const frame = source("components/studio/v5/shell/LibraryFrame.tsx");
  assert.ok(frame.includes("tableAvailable = false"), "toggle gated off by default");
  assert.ok(frame.includes("tableAvailable ? ("), "Layout group gated on the prop");
  const consumers = [
    "components/studio/v5/discovery/ModelsBrowse.tsx",
    "components/studio/v5/discovery/AppsLibrary.tsx",
    "components/studio/v5/discovery/TemplatesLibrary.tsx",
    "components/studio/v5/identity/IdentityLibrary.tsx",
    "components/studio/v5/work/AssetsLibrary.tsx",
    "components/studio/v5/work/ProjectsLibrary.tsx",
  ];
  for (const path of consumers) {
    const body = source(path);
    assert.ok(body.includes("tableAvailable"), `${path}: declares its table renderer`);
    assert.ok(body.includes("<table"), `${path}: renders a table`);
    assert.ok(body.includes('scope="col"'), `${path}: column headers scoped`);
  }
});

test("RC8 counts: labels stay intact with explicit separators", () => {
  for (const path of [
    "components/studio/v5/discovery/ModelsBrowse.tsx",
    "components/studio/v5/discovery/AppsLibrary.tsx",
    "components/studio/v5/discovery/TemplatesLibrary.tsx",
  ]) {
    assert.ok(source(path).includes("whitespace-nowrap"), `${path}: count label never wraps mid-phrase`);
  }
  const models = source("components/studio/v5/discovery/ModelsBrowse.tsx");
  assert.ok(!models.includes('of{" "}'), "Models summary is one template, not split expressions");
  assert.ok(
    models.includes("families · ${filtered.endpoints.length} of ${projection.tallies.endpoints} endpoints"),
    "Models summary keeps the · separator",
  );
});
