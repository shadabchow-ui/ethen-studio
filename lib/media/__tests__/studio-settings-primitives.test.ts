import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitNumericDraft } from "@ethen/ui/settings/numeric-draft";
import { DEFAULT_SETTINGS, validateUserSettings } from "@ethen/ui/settings/settings-schema";
import { sectionsForProduct } from "@ethen/ui/settings/settings-sections";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

// ── RC10.1: numeric draft + commit ─────────────────────────────────────

test("RC10: guidance accepts decimals (7.5 survives commit)", () => {
  assert.equal(commitNumericDraft("7.5", { min: 0, max: 20, fallback: 7 }), 7.5);
});

test("RC10: integer fields round and clamp on commit", () => {
  assert.equal(commitNumericDraft("7.5", { min: 1, max: 50, integer: true, fallback: 20 }), 8);
  assert.equal(commitNumericDraft("99", { min: 1, max: 50, integer: true, fallback: 20 }), 50);
  assert.equal(commitNumericDraft("-3", { min: 1, max: 50, integer: true, fallback: 20 }), 1);
  assert.equal(commitNumericDraft(" 12 ", { min: 1, max: 100, integer: true, fallback: 80 }), 12);
});

test("RC10: empty and unparseable drafts revert to fallback, never NaN", () => {
  for (const draft of ["", "   ", "abc", "7..5", "Infinity", "NaN"]) {
    const next = commitNumericDraft(draft, { min: 0, max: 20, fallback: 7 });
    assert.equal(next, 7, `draft ${JSON.stringify(draft)}`);
    assert.ok(Number.isFinite(next));
  }
});

test("RC10: every numeric Studio setting uses SettingsNumberField", () => {
  const src = source("packages/ui/src/settings/settings-product-sections.tsx");
  for (const id of ["sg-steps", "sg-guidance", "se-quality"]) {
    assert.match(src, new RegExp(`<SettingsNumberField id="${id}"`));
  }
  assert.doesNotMatch(src, /steps: Number\(/);
  assert.doesNotMatch(src, /guidance: Number\(/);
  assert.doesNotMatch(src, /quality: Number\(/);
});

// ── RC10.2: font fields ────────────────────────────────────────────────

test("RC10: empty font values parse as empty (= default), named fonts preserved", () => {
  const parsed = validateUserSettings({ appearance: { interfaceFont: "", contentFont: "  Newsreader  " } });
  assert.equal(parsed.appearance.interfaceFont, "");
  assert.equal(parsed.appearance.contentFont, "Newsreader");
  assert.equal(DEFAULT_SETTINGS.appearance.interfaceFont, "Instrument Sans");
  assert.equal(DEFAULT_SETTINGS.appearance.contentFont, "Newsreader");
});

test("RC10: font fields offer the Use default affordance and never force a value", () => {
  const src = source("packages/ui/src/settings/settings-shared-sections.tsx");
  assert.match(src, /id="setting-interface-font"[\s\S]{0,400}placeholder="Use default"/);
  assert.match(src, /id="setting-content-font"[\s\S]{0,400}placeholder="Use default"/);
  assert.doesNotMatch(src, /\|\| "Instrument Sans"/);
  assert.doesNotMatch(src, /\|\| "Newsreader"/);
});

// ── RC10.3: product-aware copy ─────────────────────────────────────────

test("RC10: Studio copy is product-aware via the product prop", () => {
  const shared = source("packages/ui/src/settings/settings-shared-sections.tsx");
  const product = source("packages/ui/src/settings/settings-product-sections.tsx");
  const shell = source("packages/ui/src/settings/settings-shell.tsx");
  const inner = source("components/studio/StudioSettingsInner.tsx");
  for (const src of [shared, product, shell]) {
    assert.ok(src.includes("Shared across Ethen products") || src.includes("across Ethen products"), "Ethen-products copy");
  }
  assert.ok(inner.includes('<GeneralSection ctx={ctx} product="studio" />'));
  assert.ok(inner.includes('<AccountSection ctx={ctx} product="studio"'));
  assert.ok(inner.includes('product="studio"'));
  // Chat/Designer defaults unchanged.
  assert.ok(shared.includes("Shared across Chat and Designer."));
  assert.ok(shell.includes("Synced across Chat and Designer."));
});

// ── RC10.5/6/7: billing, ordering, narrow viewport ────────────────────

test("RC10: billing deployment paragraph renders only with available billing data", () => {
  const src = source("packages/ui/src/settings/settings-shared-sections.tsx");
  assert.match(src, /\{ctx\.state\.settings && b\?\.available \? \(\s*<p[^>]*>\s*Usage credits beyond plan/);
});

test("RC10: Studio nav surfaces Studio sections first; Chat/Designer unchanged", () => {
  const studio = sectionsForProduct("studio").map((s) => s.id);
  assert.deepEqual(studio.slice(0, 6), ["generation", "routing", "assets", "video", "export", "keyboard"]);
  assert.ok(studio.indexOf("export") < studio.indexOf("general"));
  assert.equal(new Set(studio).size, studio.length);
  assert.deepEqual(
    sectionsForProduct("chat").slice(0, 2).map((s) => s.id),
    ["general", "account"],
  );
  assert.deepEqual(
    sectionsForProduct("designer").slice(0, 2).map((s) => s.id),
    ["general", "account"],
  );
});

test("RC10: settings search autofocus skips narrow viewports and never scroll-fights", () => {
  const src = source("packages/ui/src/settings/settings-shell.tsx");
  assert.match(src, /matchMedia\("\(max-width: 640px\)"\)\.matches/);
  assert.match(src, /focus\?\.?\(\{ preventScroll: true \}\)/);
});
