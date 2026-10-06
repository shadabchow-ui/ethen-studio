import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { studioNavAccessibleNames } from "../../../components/studio/v5/shell/navigation-model";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

// ── RC13: distinct rail names ────────────────────────────────────────────

test("RC13: Create/Pro Image, Video, and Dub/Dubbing gain section qualifiers", () => {
  const names = studioNavAccessibleNames();
  assert.equal(names.get("create-image"), "Image (Create)");
  assert.equal(names.get("pro-image"), "Image (Pro)");
  assert.equal(names.get("create-video"), "Video (Create)");
  assert.equal(names.get("pro-video"), "Video (Pro)");
  assert.equal(names.get("create-dub"), "Dub (Create)");
  assert.equal(names.get("pro-dubbing"), "Dubbing (Pro)");
});

test("RC13: unique labels keep visible text; every override is distinct", () => {
  const names = studioNavAccessibleNames();
  for (const id of ["home", "models", "templates", "create-voice", "voices", "pro-cinema", "marketing"]) {
    assert.equal(names.has(id), false, `${id} must not be overridden`);
  }
  // "Voice" (tool) vs "Voices" (library) are different concepts — untouched.
  assert.equal(names.size, 6);
  assert.equal(new Set(names.values()).size, 6);
});

test("RC13: rail applies overrides with visual labels unchanged", () => {
  const nav = source("components/studio/v5/shell/StudioNavigation.tsx");
  assert.ok(nav.includes("aria-label={accessibleNames.get(entry.id) ?? (collapsed ? label : undefined)}"));
  assert.ok(nav.includes("aria-label={`${accessibleNames.get(entry.id) ?? label} (${resolved.disabledReason ?? \"unavailable\"})`}"));
  assert.ok(nav.includes('<span className={styles.label}>{label}</span>'), "visible label untouched");
});

// ── RC13: Models task filter ─────────────────────────────────────────────

test("RC13: Models task filter is a native select with a real hit area", () => {
  const models = source("components/studio/v5/discovery/ModelsBrowse.tsx");
  const at = models.indexOf('aria-label="Filter by task"');
  assert.ok(at >= 0);
  // Same open tag (options carry no classes): the select itself is 44px tall.
  assert.ok(models.slice(at, at + 400).includes("min-h-[44px]"));
  assert.ok(models.lastIndexOf("<select", at) > models.lastIndexOf("</select>", at), "inside a native select");
  assert.ok(!models.includes('role="listbox"') && !models.includes('role="option"'), "no custom dropdown");
});

// ── RC13: dialog focus trap + return ─────────────────────────────────────

test("RC13: voice drawers trap Tab and return focus to the invoker", () => {
  const drawer = source("components/studio/v5/shell/InspectorDrawer.tsx");
  assert.ok(drawer.includes('if (event.key === "Tab")'), "Tab trap");
  assert.ok(drawer.includes("querySelectorAll<HTMLElement>(FOCUSABLE)"), "trap queries panel focusables");
  assert.ok(drawer.includes("last.focus()") && drawer.includes("first.focus()"), "trap wraps");
  assert.ok(drawer.includes("invokerRef.current = typeof document !== \"undefined\" ? document.activeElement : null"));
  assert.ok(drawer.includes("if (invoker instanceof HTMLElement) invoker.focus();"), "focus return");
  assert.ok(drawer.includes('aria-modal="true"'));
  const clone = source("components/studio/v5/identity/CloneDesignForms.tsx");
  assert.ok(clone.includes("<StudioInspectorDrawer"), "voice design/clone uses the shared drawer");
  const versions = source("components/studio/v5/identity/VersionRightsDrawer.tsx");
  assert.ok(versions.includes("<StudioInspectorDrawer"), "versions drawer uses the shared drawer");
});

test("RC13: search palette traps, escapes, and returns focus on every open path", () => {
  const palette = source("packages/ui/src/chat-lab/search-palette.tsx");
  assert.ok(palette.includes('if (event.key === "Tab")'), "palette trap");
  assert.ok(palette.includes('if (event.key === "Escape")'), "palette escape");
  assert.ok(palette.includes("inputRef.current?.focus()"), "focus moves in on open");
  const chrome = source("packages/ui/src/chat-lab/shared-chat-chrome.tsx");
  assert.ok(chrome.includes("paletteReturnRef.current?.focus?.()"), "focus returns on close");
  assert.ok(chrome.includes("else paletteReturnRef.current = document.activeElement as HTMLElement;"), "button path records invoker");
});

test("RC13: creation detail traps, escapes, inerts the background, returns focus", () => {
  const dialog = source("components/studio/v5/discovery/explore/CreationDialog.tsx");
  assert.ok(dialog.includes('if (event.key !== "Tab") return;'), "dialog trap");
  assert.ok(dialog.includes('if (event.key === "Escape"'), "dialog escape");
  assert.ok(dialog.includes('setAttribute("inert", "")'), "background inert");
  assert.ok(dialog.includes("peekInvoker()"), "invoker recorded at activation");
  assert.ok(dialog.includes("target.focus({ preventScroll: true })"), "focus returns to the tile");
});
