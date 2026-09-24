// Server-only module. Do NOT import from any 'use client' component.
// Real Playwright-backed implementation of the BrowserSession contract
// defined in ./actions.ts. Launches a fresh, isolated chromium context
// per session — no persistent user profile, no real cookies, no access
// to the user's actual browser.

import "server-only";
import type { Browser, BrowserContext, Page } from "playwright";
import type { BrowserSession } from "./actions";
import { browserUrlBlockReason, browserUrlBlockReasonAsync, MAX_BROWSER_RUNTIME_MS, MAX_BROWSER_SCREENSHOT_BYTES } from "./browser-sandbox";

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

// Bounded wait applied after navigation/domcontentloaded settles, before we
// consider the page "stable enough" to screenshot. Never indefinite — this
// caps the extra wait so a slow/never-idle page cannot hang the loop.
const POST_NAVIGATE_SETTLE_TIMEOUT_MS = 4000;

export interface LivePlaywrightSession extends BrowserSession {
  /** Releases the underlying browser/context/page. Always call when the run ends. */
  stop(): Promise<void>;
  /**
   * True if the most recent screenshot() call detected the page might still
   * be loading/blank (used to record an honest observation warning instead
   * of silently treating an early/blank capture as a successful observation).
   */
  lastScreenshotWarning?: string | null;
  /**
   * Captures a Playwright accessibility snapshot for the current page and
   * caches it for synchronous retrieval. Must be called before getAccessibilitySnapshot().
   */
  captureAccessibilitySnapshot(): Promise<void>;
  /**
   * Returns the cached accessibility snapshot (flattened to text + refs).
   * Returns null when not yet captured or unavailable.
   */
  getAccessibilitySnapshot(): { snapshotText: string; refs: Array<{ ref: string; role: string; name: string }> } | null;
  /** Returns bounded console error messages collected since session start. */
  getConsoleErrors(): string[];
  /** Returns bounded network failure summaries collected since session start. */
  getNetworkFailures(): Array<{ url: string; error: string }>;
  /**
   * Captures a bounded ref map of visible interactive elements from the
   * current page DOM and caches it for synchronous retrieval. Must be
   * called before getElementRefMap().
   */
  captureElementRefMap(): Promise<void>;
  /**
   * Returns the cached element ref map. Null when not yet captured,
   * unavailable, or the most recent capture failed.
   */
  getElementRefMap(): {
    snapshotId: string;
    elements: Array<{
      ref: string;
      tagName: string;
      role?: string;
      name?: string;
      label?: string;
      text?: string;
      inputType?: string;
      href?: string;
      disabled?: boolean;
      visible?: boolean;
      clickable?: boolean;
      editable?: boolean;
      boundingBox?: { x: number; y: number; width: number; height: number; centerX: number; centerY: number };
    }>;
  } | null;
  /** Internal cache for the element ref map. */
  _cachedElementRefMap: {
    snapshotId: string;
    elements: Array<{
      ref: string;
      tagName: string;
      role?: string;
      name?: string;
      label?: string;
      text?: string;
      inputType?: string;
      href?: string;
      disabled?: boolean;
      visible?: boolean;
      clickable?: boolean;
      editable?: boolean;
      boundingBox?: { x: number; y: number; width: number; height: number; centerX: number; centerY: number };
    }>;
  } | null;
  /** Internal cache for the accessibility snapshot. */
  _cachedAccessibilitySnapshot: {
    snapshotText: string;
    refs: Array<{ ref: string; role: string; name: string }>;
  } | null;
}

/**
 * Attempts to launch a real, isolated Playwright chromium session.
 *
 * This never falls back to mock data on failure — if launch fails (no
 * browser binaries installed, sandboxed environment, etc.) it throws,
 * and callers must treat that as `unavailable` rather than silently
 * downgrading to simulation while still claiming to be live.
 */
export async function createLiveBrowserSession(
  runId: string,
  initialUrl?: string,
  viewport: { width: number; height: number } = DEFAULT_VIEWPORT,
  allowedDomains: readonly string[] = [],
): Promise<LivePlaywrightSession> {
  const { chromium } = await import("playwright");

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    throw new Error(
      `Playwright failed to launch chromium: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let context: BrowserContext;
  let page: Page;
  try {
    // Fresh isolated context per session: no persistent profile, no real cookies.
    context = await browser.newContext({ viewport, acceptDownloads: false, permissions: [] });
    page = await context.newPage();
    await context.route("**/*", async (route) => {
      const reason = browserUrlBlockReason(route.request().url(), allowedDomains) ?? await browserUrlBlockReasonAsync(route.request().url(), allowedDomains);
      if (reason) return route.abort("blockedbyclient");
      return route.continue();
    });
    context.on("page", (popup) => { void popup.close().catch(() => {}); });
    page.on("filechooser", (chooser) => { void chooser.setFiles([]).catch(() => {}); });
    if (initialUrl) {
      const reason = browserUrlBlockReason(initialUrl, allowedDomains) ?? await browserUrlBlockReasonAsync(initialUrl, allowedDomains);
      if (reason) throw new Error(reason);
      await page.goto(initialUrl, { waitUntil: "domcontentloaded" }).catch(() => {
        // Navigation failure on initial load shouldn't crash session creation;
        // the agent will see the failed state via getState()/navigate() calls.
      });
    }
  } catch (err) {
    await browser.close().catch(() => {});
    throw new Error(
      `Playwright failed to create browser context: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let currentUrl = page.url() || initialUrl || "about:blank";
  let currentTitle = "";
  let stopped = false;
  const deadline = Date.now() + MAX_BROWSER_RUNTIME_MS;
  let lastScreenshotWarning: string | null = null;

  // Bounded collections for console errors and network failures. Capped
  // to prevent unbounded growth on long-running pages with persistent errors.
  const MAX_LOG_ENTRIES = 50;
  const consoleErrors: string[] = [];
  const networkFailures: Array<{ url: string; error: string }> = [];

  // Collect console errors (truncated per message).
  page.on("console", (msg) => {
    if (msg.type() === "error" && consoleErrors.length < MAX_LOG_ENTRIES) {
      const text = msg.text().slice(0, 300);
      consoleErrors.push(text);
    }
  });

  // Collect uncaught page errors.
  page.on("pageerror", (err) => {
    if (consoleErrors.length < MAX_LOG_ENTRIES) {
      consoleErrors.push(`[pageerror] ${err.message.slice(0, 300)}`);
    }
  });

  // Collect network request failures.
  page.on("requestfailed", (request) => {
    if (networkFailures.length < MAX_LOG_ENTRIES) {
      networkFailures.push({
        url: request.url().slice(0, 500),
        error: request.failure()?.errorText?.slice(0, 200) ?? "unknown",
      });
    }
  });
  page.on("download", (download) => { void download.cancel().catch(() => {}); });
  const ensureActive = () => {
    if (stopped) throw new Error("Browser session is closed.");
    if (Date.now() > deadline) throw new Error("Browser session runtime limit exceeded.");
  };

  const refreshTitle = async () => {
    try {
      currentTitle = await page.title();
    } catch {
      // Page may be navigating/closed; keep last known title.
    }
  };
  await refreshTitle();

  // Bounded "settle" wait after a navigation's domcontentloaded fires. Tries
  // networkidle first (best signal the page has actually rendered content),
  // but never blocks indefinitely — falls back to a short fixed wait so a
  // page that never reaches networkidle (e.g. polling/analytics) doesn't
  // hang the loop or cause a screenshot to be taken before paint.
  async function waitForPracticalStability(): Promise<void> {
    try {
      await page.waitForLoadState("networkidle", { timeout: POST_NAVIGATE_SETTLE_TIMEOUT_MS });
    } catch {
      // networkidle never arrived within the bound — fall back to a short
      // fixed settle delay so we still give the page a chance to paint.
      await page.waitForTimeout(500).catch(() => {});
    }
  }

  const session: LivePlaywrightSession = {
    runId,
    currentUrl,
    viewport,
    mode: "live_browser",
    lastScreenshotWarning: null,

    async navigate(url: string) {
      try {
        ensureActive();
        const reason = browserUrlBlockReason(url, allowedDomains) ?? await browserUrlBlockReasonAsync(url, allowedDomains);
        if (reason) return { success: false, url: currentUrl, error: reason };
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        currentUrl = page.url();
        const redirectReason = browserUrlBlockReason(currentUrl, allowedDomains) ?? await browserUrlBlockReasonAsync(currentUrl, allowedDomains);
        if (redirectReason) { await page.goto("about:blank"); return { success: false, url: currentUrl, error: redirectReason }; }
        await refreshTitle();
        await waitForPracticalStability();
        // Re-read in case the settle wait observed a redirect.
        currentUrl = page.url();
        await refreshTitle();
        return { success: true, url: currentUrl };
      } catch (err) {
        // Even on failure, capture whatever URL/title is currently known —
        // never silently drop observable state just because navigation
        // itself failed or timed out.
        try {
          currentUrl = page.url() || currentUrl;
          await refreshTitle();
        } catch {
          // Page may be in a broken state; keep last known values.
        }
        return {
          success: false,
          url: currentUrl,
          error: err instanceof Error ? err.message : "Navigate failed",
        };
      }
    },

    async screenshot() {
      lastScreenshotWarning = null;
      try {
        ensureActive();
        // Bounded readiness check: if the page is still mid-load, give it a
        // brief, capped chance to settle rather than capturing a guaranteed
        // blank frame immediately after a navigate/action.
        const readyState = await page.evaluate(() => document.readyState).catch(() => "unknown");
        if (readyState !== "complete") {
          await page.waitForLoadState("load", { timeout: 2000 }).catch(() => {});
        }

        const buffer = await page.screenshot({ type: "png", timeout: 8000 });
        if (buffer.length > MAX_BROWSER_SCREENSHOT_BYTES) throw new Error("Screenshot exceeds browser evidence limit.");
        const imageUri = `data:image/png;base64,${buffer.toString("base64")}`;
        const size = page.viewportSize() ?? viewport;

        // Heuristic blank-frame detection: a PNG this small for a full
        // viewport capture is almost certainly a blank/white/loading frame,
        // not real page content. Flag it honestly instead of claiming a
        // normal successful observation.
        if (buffer.length < 1200) {
          lastScreenshotWarning = "Captured screenshot is unusually small and may be a blank or still-loading page.";
        }
        session.lastScreenshotWarning = lastScreenshotWarning;

        return { imageUri, width: size.width, height: size.height };
      } catch (err) {
        session.lastScreenshotWarning = err instanceof Error ? err.message : "Screenshot failed";
        throw err;
      }
    },

    async click(x: number, y: number) {
      try {
        ensureActive();
        await page.mouse.click(x, y);
        currentUrl = page.url();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Click failed" };
      }
    },

    async type(text: string) {
      try {
        ensureActive();
        await page.keyboard.type(text);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Type failed" };
      }
    },

    async scroll(direction: string, amount: number) {
      try {
        ensureActive();
        const dx = direction === "left" ? -amount : direction === "right" ? amount : 0;
        const dy = direction === "up" ? -amount : direction === "down" ? amount : 0;
        await page.mouse.wheel(dx, dy);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Scroll failed" };
      }
    },

    async wait(ms: number) {
      ensureActive();
      if (ms < 0 || ms > 30_000) return { success: false, error: "Wait duration exceeds browser limit." };
      await page.waitForTimeout(ms);
      return { success: true };
    },

    async pressKey(keys: string[]) {
      try {
        for (const key of keys) {
          await page.keyboard.press(key);
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Press key failed" };
      }
    },

    async inspectDom() {
      try {
        const elements = await page.evaluate(() => {
          const interactive = Array.from(
            document.querySelectorAll("a, button, input, select, textarea, [role='button']"),
          ).slice(0, 50);
          return interactive.map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim().slice(0, 100) || undefined,
            attributes: {
              id: el.id || undefined,
              class: el.className || undefined,
            } as Record<string, string>,
          }));
        });
        return { success: true, elements };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "DOM inspection failed" };
      }
    },

    async extractText(selector?: string) {
      try {
        const text = await page.evaluate((sel: string | null) => {
          if (sel) {
            const el = document.querySelector(sel);
            return el ? el.textContent || "" : "";
          }
          return (document.body?.innerText || "").slice(0, 200_000);
        }, selector ?? null);
        return { success: true, text };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Text extraction failed" };
      }
    },

    async extractLinks() {
      try {
        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => ({
            href: a.href,
            text: a.textContent?.trim() || "",
          }));
        });
        return { success: true, links };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Link extraction failed" };
      }
    },

    async extractHeadings() {
      try {
        const headings = await page.evaluate(() => {
          const tags = ["h1", "h2", "h3", "h4", "h5", "h6"];
          const result: Array<{ level: number; text: string }> = [];
          for (const tag of tags) {
            const elements = document.querySelectorAll(tag);
            for (const el of elements) {
              result.push({ level: parseInt(tag[1]), text: el.textContent?.trim() || "" });
            }
          }
          return result;
        });
        return { success: true, headings };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Heading extraction failed" };
      }
    },

    async extractTable(selector?: string) {
      try {
        const table = await page.evaluate((sel: string | null) => {
          const el = sel ? document.querySelector(sel) : document.querySelector("table");
          if (!el) return null;
          const rows = el.querySelectorAll("tr");
          const result: string[][] = [];
          for (const row of rows) {
            const cells = row.querySelectorAll("td, th");
            const rowData: string[] = [];
            for (const cell of cells) {
              rowData.push(cell.textContent?.trim() || "");
            }
            result.push(rowData);
          }
          return result;
        }, selector ?? null);
        if (!table) return { success: false, error: "No table found on page" };
        return { success: true, table };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Table extraction failed" };
      }
    },

    getState() {
      return { url: currentUrl, title: currentTitle };
    },

    getObservationWarning() {
      return lastScreenshotWarning;
    },

    // Cached accessibility snapshot — populated by captureAccessibilitySnapshot().
    _cachedAccessibilitySnapshot: null as {
      snapshotText: string;
      refs: Array<{ ref: string; role: string; name: string }>;
    } | null,

    async captureAccessibilitySnapshot() {
      try {
        const acc = (page as { accessibility?: { snapshot?: () => Promise<{
          role: string;
          name?: string | number;
          value?: string | number;
          description?: string;
          children?: unknown[];
        } | null> } }).accessibility;
        if (!acc?.snapshot) {
          session._cachedAccessibilitySnapshot = null;
          return;
        }

        const snapshot = await acc.snapshot();
        if (!snapshot) {
          session._cachedAccessibilitySnapshot = null;
          return;
        }

        // Flatten the tree into a text summary and refs list.
        const lines: string[] = [];
        const refs: Array<{ ref: string; role: string; name: string }> = [];
        let refCounter = 0;

        function flatten(node: { role: string; name?: string | number; value?: string | number; description?: string; children?: unknown[] }, depth: number) {
          const indent = "  ".repeat(depth);
          const role = node.role || "unknown";
          const name = node.name ? String(node.name).slice(0, 80) : "";
          const value = node.value !== undefined ? `="${String(node.value).slice(0, 60)}"` : "";
          const desc = node.description ? ` [${String(node.description).slice(0, 60)}]` : "";
          const ref = `a11y-${++refCounter}`;
          lines.push(`${indent}${role}${name ? ` "${name}"` : ""}${value}${desc}`);
          refs.push({ ref, role, name });

          const children = Array.isArray(node.children) ? node.children as Array<{ role: string; name?: string | number; children?: unknown[] }> : [];
          const MAX_DEPTH = 5;
          const MAX_CHILDREN_PER_NODE = 50;
          if (depth < MAX_DEPTH && refCounter < 200) {
            for (const child of children.slice(0, MAX_CHILDREN_PER_NODE)) {
              if (refCounter >= 200) break;
              flatten(child, depth + 1);
            }
          }
        }

        flatten(snapshot, 0);

        session._cachedAccessibilitySnapshot = {
          snapshotText: lines.join("\n"),
          refs,
        };
      } catch {
        session._cachedAccessibilitySnapshot = null;
      }
    },

    getAccessibilitySnapshot() {
      return session._cachedAccessibilitySnapshot ?? null;
    },

    getConsoleErrors() {
      return consoleErrors.slice(0, 10);
    },

    getNetworkFailures() {
      return networkFailures.slice(0, 10);
    },

    // Cached element ref map — populated by captureElementRefMap().
    _cachedElementRefMap: null as {
      snapshotId: string;
      elements: Array<{
        ref: string;
        tagName: string;
        role?: string;
        name?: string;
        label?: string;
        text?: string;
        inputType?: string;
        href?: string;
        disabled?: boolean;
        visible?: boolean;
        clickable?: boolean;
        editable?: boolean;
        boundingBox?: { x: number; y: number; width: number; height: number; centerX: number; centerY: number };
      }>;
    } | null,

    async captureElementRefMap() {
      try {
        const results = await page.evaluate(() => {
          const SELECTORS = [
            "a[href]", "button", "input", "select", "textarea", "summary",
            '[role="button"]', '[role="link"]', '[role="textbox"]',
            '[role="checkbox"]', '[role="radio"]', '[role="menuitem"]',
            '[contenteditable="true"]',
          ];
          const candidates = Array.from(document.querySelectorAll(SELECTORS.join(",")));
          const MAX_REFS = 100;
          let counter = 0;
          const elements: Array<{
            ref: string;
            tagName: string;
            role?: string;
            name?: string;
            label?: string;
            text?: string;
            inputType?: string;
            href?: string;
            disabled?: boolean;
            visible?: boolean;
            clickable?: boolean;
            editable?: boolean;
            boundingBox?: { x: number; y: number; width: number; height: number; centerX: number; centerY: number };
          }> = [];

          for (const el of candidates) {
            if (counter >= MAX_REFS) break;
            const tag = el.tagName.toLowerCase();
            const htmlEl = el as HTMLElement;
            const inputEl = el as HTMLInputElement;
            const anchorEl = el as HTMLAnchorElement;
            const rect = htmlEl.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const style = window.getComputedStyle(htmlEl);
            const isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
            if (!isVisible) continue;
            const isClickable = tag === "a" || tag === "button" || (tag === "input" && ["submit", "button", "radio", "checkbox"].includes(inputEl.type)) || el.getAttribute("role") === "button";
            const isEditable = tag === "input" || tag === "textarea" || tag === "select" || el.getAttribute("contenteditable") === "true";
            const ariaRole = el.getAttribute("role") || undefined;
            const ariaLabel = el.getAttribute("aria-label") || undefined;
            const labelText = (() => {
              const labelledBy = el.getAttribute("aria-labelledby");
              if (labelledBy) { const labelEl = document.getElementById(labelledBy); if (labelEl) return labelEl.textContent?.trim().slice(0, 80) || undefined; }
              const htmlLabel = (htmlEl as HTMLInputElement).labels?.[0];
              if (htmlLabel) return htmlLabel.textContent?.trim().slice(0, 80) || undefined;
              return undefined;
            })();
            counter++;
            elements.push({
              ref: `el-${counter}`,
              tagName: tag,
              role: ariaRole,
              name: el.getAttribute("name") || undefined,
              label: ariaLabel || labelText,
              text: htmlEl.textContent?.trim().slice(0, 100) || undefined,
              inputType: tag === "input" ? inputEl.type : undefined,
              href: tag === "a" ? anchorEl.href : undefined,
              disabled: tag === "input" || tag === "button" || tag === "select" || tag === "textarea"
                ? (htmlEl as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" : undefined,
              visible: true,
              clickable: isClickable,
              editable: isEditable,
              boundingBox: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height), centerX: Math.round(rect.x + rect.width / 2), centerY: Math.round(rect.y + rect.height / 2) },
            });
          }
          return elements;
        });
        if (!results || results.length === 0) { session._cachedElementRefMap = null; return; }
        session._cachedElementRefMap = { snapshotId: `refmap-${Date.now()}`, elements: results };
      } catch { session._cachedElementRefMap = null; }
    },

    getElementRefMap() { return session._cachedElementRefMap ?? null; },

    async stop() {
      if (stopped) return;
      stopped = true;
      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };

  return session;
}
