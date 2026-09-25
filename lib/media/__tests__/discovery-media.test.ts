import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DISCOVERY_MEDIA } from "../../studio-v5/discovery-media";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function localFile(pathname: string): string {
  assert.match(pathname, /^\//, `expected root-relative path, got ${pathname}`);
  return join(ROOT, "public", pathname);
}

test("discovery ids are unique", () => {
  const ids = DISCOVERY_MEDIA.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate discovery media id");
});

test("every video has a poster", () => {
  for (const m of DISCOVERY_MEDIA) {
    if (m.type !== "video") continue;
    assert.ok(m.poster, `video ${m.id} is missing a poster`);
  }
});

test("licensed showcase entries carry dimensions, duration and title", () => {
  const showcase = DISCOVERY_MEDIA.filter((m) => m.sourceType === "licensed-showcase");
  assert.ok(showcase.length > 0, "expected at least one licensed-showcase entry");
  for (const m of showcase) {
    assert.equal(m.placeholder, false, `${m.id} must not be a placeholder`);
    assert.ok(m.width && m.height, `${m.id} is missing width/height`);
    assert.ok(m.durationSeconds && m.durationSeconds > 0, `${m.id} is missing durationSeconds`);
    assert.ok(m.title && m.title.length > 0, `${m.id} is missing a title`);
  }
});

test("final (non-placeholder) local media files exist", () => {
  const missing: string[] = [];
  for (const m of DISCOVERY_MEDIA) {
    if (m.placeholder) continue;
    for (const p of [m.src, m.poster]) {
      if (!p || !p.startsWith("/")) continue; // remote URL or n/a
      if (!existsSync(localFile(p))) missing.push(`${m.id}: ${p}`);
    }
  }
  assert.deepEqual(missing, [], `missing media files:\n${missing.join("\n")}`);
});
