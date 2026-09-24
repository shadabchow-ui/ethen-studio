/**
 * Browser regression for the Studio-owned scroll region.
 * Requires the local Studio server at STUDIO_BASE_URL (default :3015).
 * Run: node --import tsx --test __tests__/studio-scroll-regression.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Page } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3015";
const PROJECT = "0d5d0000-0000-4000-8000-000000000003";

async function metrics(page: Page) {
  return page.locator("[data-studio-scroll-root]").evaluate((node) => ({
    top: node.scrollTop,
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    horizontalOverflow: Math.max(0, node.scrollWidth - node.clientWidth),
  }));
}

async function wheelScrolls(page: Page): Promise<void> {
  const root = page.locator("[data-studio-scroll-root]");
  await root.evaluate((node) => { node.scrollTop = 0; });
  await root.hover();
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(50);
  assert.ok((await metrics(page)).top > 0, "wheel/trackpad path must move the Studio scroll owner");
}

test("Home owns one usable vertical scroll region at every required viewport", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [430, 900], [375, 812]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
      const root = page.locator("[data-studio-scroll-root]");
      const before = await metrics(page);
      assert.ok(before.scrollHeight > before.clientHeight, `${width}x${height}: Home must exceed its viewport`);
      assert.equal(before.horizontalOverflow, 0, `${width}x${height}: no horizontal viewport overflow`);
      const shellTop = await page.locator("[data-ethen-studio]").evaluate((node) => node.getBoundingClientRect().top);

      await wheelScrolls(page);
      await root.evaluate((node) => { node.scrollTop = 0; });
      await root.focus();
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(50);
      assert.ok((await metrics(page)).top > 0, `${width}x${height}: PageDown must scroll Studio`);
      await root.evaluate((node) => { node.scrollTop = 0; });
      await page.keyboard.press("Space");
      await page.waitForTimeout(50);
      assert.ok((await metrics(page)).top > 0, `${width}x${height}: Space must scroll Studio`);

      await page.locator("#explore-models").scrollIntoViewIfNeeded();
      const bottom = await page.locator("#explore-models").evaluate((node) => node.getBoundingClientRect().bottom);
      const rootBottom = await root.evaluate((node) => node.getBoundingClientRect().bottom);
      assert.ok(bottom <= rootBottom + 1, `${width}x${height}: bottom Home section must be reachable`);
      assert.equal(await page.locator("[data-ethen-studio]").evaluate((node) => node.getBoundingClientRect().top), shellTop, "shared shell must remain stationary");
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("Create Image and Video lower regions are reachable at laptop height", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const tool of ["image", "video"]) {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      await page.goto(`${BASE}/studio/projects/${PROJECT}/create/${tool}`, { waitUntil: "networkidle" });
      const root = page.locator("[data-studio-scroll-root]");
      const before = await metrics(page);
      assert.equal(before.horizontalOverflow, 0, `${tool}: no horizontal viewport overflow`);
      // The generator shell fits an empty stage to the viewport with the
      // composer pinned, so the workspace only scrolls once content exceeds
      // it; when it does, the Studio scroll owner must still move.
      if (before.scrollHeight > before.clientHeight) await wheelScrolls(page);
      await root.evaluate((node) => { node.scrollTop = node.scrollHeight; });
      const action = page.getByRole("button", { name: "Generate", exact: true });
      await action.scrollIntoViewIfNeeded();
      const actionBottom = await action.evaluate((node) => node.getBoundingClientRect().bottom);
      const rootBottom = await root.evaluate((node) => node.getBoundingClientRect().bottom);
      assert.ok(actionBottom <= rootBottom + 1, `${tool}: lower action controls must be reachable`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("normal and pro routes keep a bounded Studio scroll owner", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const route of ["/studio/models", "/studio/projects", "/studio/canvas", "/studio/pro/image", "/studio/pro/video", "/studio/pro/cinema", "/studio/cinema"]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      const current = await metrics(page);
      assert.equal(current.horizontalOverflow, 0, `${route}: no horizontal viewport overflow`);
      if (current.scrollHeight > current.clientHeight) await wheelScrolls(page);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
