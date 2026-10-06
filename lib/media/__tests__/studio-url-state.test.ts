import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  remixHref,
  resolveRemix,
  showcaseById,
} from "../../../lib/studio-v5/showcase-feed";
import {
  PROMPT_MAX_LENGTH,
  PROMPT_URL_SAFE_LENGTH,
} from "../../../components/studio/v5/create/composer-registry";
import {
  dropPromptHandoff,
  newPromptHandoffId,
  peekPromptHandoff,
  promptCarriageFor,
  promptHandoffKeyFor,
  storePromptHandoff,
} from "../../../components/studio/v5/create/prompt-handoff";
import { homePromptHref } from "../../../components/studio/v5/discovery/home-prompt-model";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function mapStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; get(key: string): string | undefined } {
  const backing = new Map<string, string>();
  return {
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value);
    },
    removeItem: (key) => {
      backing.delete(key);
    },
    get: (key) => backing.get(key),
  };
}

test("RC9 remix: creation ids resolve to tool, mode, and shared prompt", () => {
  const resolved = resolveRemix("video-19");
  assert.ok(resolved, "known showcase id resolves");
  assert.equal(resolved!.tool, "video");
  assert.equal(resolved!.mode, "image-to-video");
  assert.equal(resolved!.modeLabel, "Animate image");
  assert.equal(resolved!.title, "Headphone model key art");
  // video-19 does not share its prompt: the composer starts blank.
  assert.equal(resolved!.prompt, null);
  assert.equal(resolved!.modelFamilyId, null);
  assert.ok(resolved!.posterUrl.length > 0, "source asset carried");
  assert.equal(resolved!.creationHref, "/studio/explore/creation/video-19");
  // Unknown ids and non-remixable items resolve to null — never a guess.
  assert.equal(resolveRemix("no-such-creation"), null);
  assert.equal(resolveRemix("still-hero"), null);
});

test("RC9 remix: hrefs carry the id, never an inline prompt", () => {
  const item = showcaseById("video-19");
  assert.ok(item);
  assert.equal(remixHref(item!, "proj-1"), "/studio/create/video?projectId=proj-1&remix=video-19");
  assert.equal(remixHref(item!, null), "/studio/create/video?remix=video-19");
  const blocked = showcaseById("still-hero");
  assert.ok(blocked);
  assert.equal(remixHref(blocked!, "proj-1"), null);
});

test("RC9 prompts: documented cap and URL-safe handoff threshold", () => {
  assert.equal(PROMPT_MAX_LENGTH, 4000);
  assert.equal(PROMPT_URL_SAFE_LENGTH, 2000);
  assert.deepEqual(promptCarriageFor("  hello  ", PROMPT_URL_SAFE_LENGTH), {
    type: "inline",
    prompt: "hello",
  });
  assert.deepEqual(promptCarriageFor("", PROMPT_URL_SAFE_LENGTH), { type: "inline", prompt: "" });
  assert.equal(promptCarriageFor("x".repeat(2000), PROMPT_URL_SAFE_LENGTH).type, "inline");
  assert.equal(promptCarriageFor("x".repeat(2001), PROMPT_URL_SAFE_LENGTH).type, "handoff");
  // The home ?prompt= contract is unchanged for short prompts.
  assert.equal(homePromptHref("image", "proj-1", "a red barn"), "/studio/create/image?projectId=proj-1&prompt=a+red+barn");
  assert.equal(homePromptHref("video", null, "  "), "/studio/create/video");
});

test("RC9 handoff: one-shot session stash keyed by short id", () => {
  const storage = mapStorage();
  const id = storePromptHandoff(storage, "a very long prompt");
  assert.ok(id && /^[0-9a-f]{8}$/.test(id), `short hex id, got ${id}`);
  assert.equal(storage.get(promptHandoffKeyFor(id!)), "a very long prompt");
  assert.equal(peekPromptHandoff(storage, id), "a very long prompt");
  assert.equal(newPromptHandoffId() === id, false);
  dropPromptHandoff(storage, id);
  assert.equal(peekPromptHandoff(storage, id), null);
  // Missing storage or id never throws, never resolves.
  assert.equal(storePromptHandoff(null, "x"), null);
  assert.equal(peekPromptHandoff(null, id), null);
  assert.equal(peekPromptHandoff(storage, null), null);
  dropPromptHandoff(null, id);
  dropPromptHandoff(storage, null);
});

test("RC9 create route: remix, handoff, drafts, validation, counter", () => {
  const page = source("app/studio/(workbench)/create/[tool]/page.tsx");
  assert.ok(page.includes("resolveRemix(query.remix.trim())"), "page resolves ?remix=");
  assert.ok(page.includes("promptRef"), "page passes the handoff id through");
  const frame = source("components/studio/v5/create/CreateToolFrame.tsx");
  assert.ok(frame.includes("sessionStorageDrafts()"), "drafts persist to sessionStorage");
  assert.ok(!frame.includes("localStorageHistory"), "drafts leave localStorage");
  assert.ok(frame.includes("peekPromptHandoff(sessionPromptHandoffStorage(), promptRef)"), "handoff prefill");
  assert.ok(frame.includes("dropPromptHandoff(sessionPromptHandoffStorage(), promptRef)"), "one-shot consume");
  assert.ok(frame.includes("remix?.prompt"), "remix prompt prefill");
  assert.ok(frame.includes("Remixing{"), "Remixing chip");
  assert.ok(frame.includes('aria-label="Clear remix"'), "chip clear action");
  assert.ok(frame.includes("remix?.mode === \"image-to-video\""), "i2v mode opens its source affordance");
  assert.ok(frame.includes("input.length > PROMPT_MAX_LENGTH"), "over-cap gate");
  assert.ok(frame.includes("emptyFieldMessage"), "inline empty validation");
  assert.ok(frame.includes("of ${PROMPT_MAX_LENGTH} characters"), "visible counter");
  const voice = source("components/studio/v5/create/audio/VoiceFrame.tsx");
  assert.ok(voice.includes("peekPromptHandoff(sessionPromptHandoffStorage(), promptRef)"), "voice resolves handoffs");
  assert.ok(voice.includes("missingFields[0]?.emptyMessage"), "voice shows its missing field inline");
  const home = source("components/studio/v5/discovery/StudioHomePrompt.tsx");
  assert.ok(home.includes("promptCarriageFor(prompt, PROMPT_URL_SAFE_LENGTH)"), "home chooses inline vs handoff");
  assert.ok(home.includes("params.set(\"promptRef\", id)"), "home passes short handoff ids");
});

test("RC9 Models: q/task/layout/family round-trip the URL", () => {
  const browse = source("components/studio/v5/discovery/ModelsBrowse.tsx");
  assert.ok(browse.includes("router.replace("), "writes go through router.replace");
  assert.ok(browse.includes('next.set("layout", value)'), "layout persists");
  assert.ok(browse.includes('next.set("q", value)'), "query persists");
  assert.ok(browse.includes('next.set("task", value)'), "task persists");
  assert.ok(browse.includes('urlParams.get("layout") === "table"'), "layout restores from the URL");
  assert.ok(browse.includes("setLayoutOverride(undefined)"), "back/forward clears overrides");
});
