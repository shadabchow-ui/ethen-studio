import type {
  ComputerUseRun,
  ComputerAction,
  ActionResult,
  VerificationResult,
  ComputerUseScreenshot,
  ComputerUseStep,
  ComputerUseObservation,
  BrowserSessionMode,
  ObservationAvailability,
  ObservationSource,
} from "./types";
import {
  getComputerUseRun,
  addComputerUseStep,
  addComputerUseScreenshot,
  addComputerUseObservation,
  addComputerUseEvent,
  getComputerUseObservations,
  getNowIso,
} from "./store";
import { verifyComputerAction, resolutionEventType } from "./agent-loop/verifier";

const MAX_SANITIZED_ERROR_LENGTH = 240;

/**
 * Truncates an error message to a small, event-safe length. Error messages
 * here originate from Playwright/fetch internals, never from raw secret
 * values, but are still bounded defensively before being stored in events.
 */
function sanitizeErrorMessage(message: string | undefined | null): string | undefined {
  if (!message) return undefined;
  return message.length > MAX_SANITIZED_ERROR_LENGTH
    ? `${message.slice(0, MAX_SANITIZED_ERROR_LENGTH)}…`
    : message;
}

// ── Browser Session Bridge ─────────────────────────────────────────────────

export interface BrowserSession {
  runId: string;
  currentUrl: string;
  viewport: { width: number; height: number };
  /**
   * Identifies whether this session is a real Playwright-backed browser
   * or an explicit simulation. Always present so callers (API routes, UI)
   * can label the run accurately instead of guessing.
   */
  mode: BrowserSessionMode;
  navigate(url: string): Promise<{ success: boolean; url: string; error?: string }>;
  screenshot(): Promise<{ imageUri: string; width: number; height: number }>;
  click(x: number, y: number): Promise<{ success: boolean; error?: string }>;
  type(text: string): Promise<{ success: boolean; error?: string }>;
  scroll(direction: string, amount: number): Promise<{ success: boolean; error?: string }>;
  wait(ms: number): Promise<{ success: boolean }>;
  pressKey(keys: string[]): Promise<{ success: boolean; error?: string }>;
  inspectDom(): Promise<{ success: boolean; elements?: Array<{ tag: string; text?: string; attributes?: Record<string, string> }>; error?: string }>;
  extractText(selector?: string): Promise<{ success: boolean; text?: string; error?: string }>;
  extractLinks(): Promise<{ success: boolean; links?: Array<{ href: string; text: string }>; error?: string }>;
  extractHeadings(): Promise<{ success: boolean; headings?: Array<{ level: number; text: string }>; error?: string }>;
  extractTable(selector?: string): Promise<{ success: boolean; table?: string[][]; error?: string }>;
  getState(): { url: string; title: string };
  /**
   * Returns a bounded ref map of visible interactive elements with
   * bounding boxes. Null when unavailable (simulation or failed capture).
   * Each ref is valid only for the current page snapshot.
   */
  getElementRefMap?(): {
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
  /**
   * Optional: returns a short, secret-safe warning if the most recent
   * screenshot() capture looked blank/still-loading. Sessions that cannot
   * detect this (e.g. mock/simulation) may omit it or always return null.
   */
  getObservationWarning?(): string | null;
}

// ── Mock Browser Session (explicit simulation fallback — no real browser) ──
// This session NEVER produces real observations. It is labeled
// `mode: "simulation"` so downstream consumers (action executor, UI,
// validation script) can never mistake it for a live browser run.

let mockUrl = "about:blank";
let mockScreenshotCounter = 0;

export function createMockBrowserSession(runId: string, initialUrl?: string): BrowserSession {
  if (initialUrl) mockUrl = initialUrl;

  return {
    runId,
    currentUrl: mockUrl,
    viewport: { width: 1280, height: 720 },
    mode: "simulation",

    async navigate(url: string) {
      mockUrl = url;
      return { success: true, url: mockUrl };
    },

    async screenshot() {
      mockScreenshotCounter++;
      return {
        imageUri: `mock://screenshot/${runId}/${mockScreenshotCounter}`,
        width: 1280,
        height: 720,
      };
    },

    async click(_x: number, _y: number) {
      return { success: true };
    },

    async type(_text: string) {
      return { success: true };
    },

    async scroll(_direction: string, _amount: number) {
      return { success: true };
    },

    async wait(_ms: number) {
      return { success: true };
    },

    async pressKey(_keys: string[]) {
      return { success: true };
    },

    async inspectDom(): Promise<{ success: boolean; elements?: Array<{ tag: string; text?: string; attributes?: Record<string, string> }>; error?: string }> {
      return {
        success: true,
        elements: [
          { tag: "html", attributes: { lang: "en" } },
          { tag: "body" },
          { tag: "div", attributes: { id: "root" } },
        ],
      };
    },

    async extractText(_selector?: string) {
      return { success: false, error: "Text extraction unavailable — no live browser session." };
    },

    async extractLinks() {
      return { success: false, error: "Link extraction unavailable — no live browser session." };
    },

    async extractHeadings() {
      return { success: false, error: "Heading extraction unavailable — no live browser session." };
    },

    async extractTable(_selector?: string) {
      return { success: false, error: "Table extraction unavailable — no live browser session." };
    },

    getState() {
      return { url: mockUrl, title: "Mock Page" };
    },
  };
}

// ── Before / After Observation Helpers ─────────────────────────────────────

interface ExecutionContext {
  run: ComputerUseRun;
  session: BrowserSession;
  step: ComputerUseStep;
}

async function captureObservation(
  ctx: ExecutionContext,
  phase: "before_action" | "after_action",
): Promise<ComputerUseScreenshot | null> {
  const startedAt = Date.now();
  addComputerUseEvent(ctx.run.id, {
    runId: ctx.run.id,
    stepId: ctx.step.id,
    type: "observation.capture.started",
    timestamp: getNowIso(),
    actor: "runtime",
    metadata: { phase, actionType: ctx.step.action.type },
  });

  try {
    const shot = await ctx.session.screenshot();
    const warning = ctx.session.getObservationWarning?.() ?? null;

    const screenshot = addComputerUseScreenshot(ctx.run.id, {
      id: `cu-screenshot-${phase === "before_action" ? "before" : "after"}-${ctx.step.id}`,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      capturedAt: getNowIso(),
      originalWidth: shot.width,
      originalHeight: shot.height,
      sentWidth: shot.width,
      sentHeight: shot.height,
      scaleX: 1,
      scaleY: 1,
      devicePixelRatio: 1,
      imageUri: shot.imageUri,
      hash: `hash-${phase}-${ctx.step.id}`,
      label: `${phase === "before_action" ? "Before" : "After"} ${ctx.step.action.type}`,
    });

    // getState() is read AFTER the screenshot/settle wait completes so the
    // recorded URL/title reflect the page as it actually was at capture
    // time, not the pre-navigation state.
    const state = ctx.session.getState();
    const pageTitle = state.title || null;

    // Build truthful availability flags — never fabricate data.
    const isLiveBrowser = ctx.session.mode === "live_browser";
    const hasScreenshot = isLiveBrowser && shot.imageUri.startsWith("data:image/");
    const hasUrl = !!state.url;
    const hasTitle = !!pageTitle;
    const hasDom = isLiveBrowser; // DOM inspection is wired for live browser only

    // Capture accessibility snapshot while the page is stable (after screenshot).
    // Only live Playwright sessions support this; mock/simulation sessions skip.
    const canCaptureAccessibility = isLiveBrowser && typeof (ctx.session as unknown as Record<string, unknown>).captureAccessibilitySnapshot === "function";
    if (canCaptureAccessibility) {
      try {
        await ((ctx.session as unknown as Record<string, unknown>).captureAccessibilitySnapshot as () => Promise<void>)();
      } catch {
        // Accessibility capture failure is non-fatal — observation proceeds without it.
      }
    }

    const hasAccessibility = canCaptureAccessibility; // True when live session has accessibility capture wired
    const hasViewport = true;

    // Capture element ref map with bounding boxes from live browser session
    let refMapResult: ReturnType<NonNullable<typeof ctx.session.getElementRefMap>> = null;
    if (isLiveBrowser && typeof ctx.session.getElementRefMap === "function") {
      try {
        // Pre-capture: async DOM evaluation → cached result
        if (typeof (ctx.session as unknown as Record<string, unknown>).captureElementRefMap === "function") {
          await ((ctx.session as unknown as Record<string, unknown>).captureElementRefMap as () => Promise<void>)();
        }
        refMapResult = ctx.session.getElementRefMap();
      } catch {
        // Element ref map capture failure is non-fatal.
      }
    }
    const hasBoundingBoxes = refMapResult !== null && (refMapResult.elements.length > 0);

    // Build coordinate metadata for screenshot/model → viewport mapping
    const coordinateMetadata = isLiveBrowser
      ? {
          viewportWidth: ctx.session.viewport.width,
          viewportHeight: ctx.session.viewport.height,
          screenshotOriginalWidth: shot.width,
          screenshotOriginalHeight: shot.height,
          sentWidth: shot.width,
          sentHeight: shot.height,
          scaleX: 1,
          scaleY: 1,
          devicePixelRatio: 1,
        }
      : null;

    const availability: ObservationAvailability = {
      screenshot: hasScreenshot,
      url: hasUrl,
      title: hasTitle,
      dom: hasDom,
      accessibility: hasAccessibility,
      viewport: hasViewport,
      boundingBoxes: hasBoundingBoxes,
    };

    const source: ObservationSource = {
      provider: ctx.session.mode === "live_browser" ? "playwright" : ctx.session.mode === "simulation" ? "mock" : "none",
      sessionMode: ctx.session.mode,
      capabilities: availability,
      unavailableReason: ctx.session.mode === "simulation"
        ? "Simulation session — no real browser observations."
        : ctx.session.mode === "unavailable"
          ? "Live browser session is unavailable."
          : undefined,
    };

    // Build bounded DOM summary from the most recent inspectDom step result
    // for this run. Only populated for live browser sessions.
    const domSummary = (() => {
      if (!isLiveBrowser) return null;
      // DOM elements already captured from inspectDom action — we derive from
      // the session mode truthfulness. For live browser sessions, a real
      // inspectDom step would populate elements. We mark as unavailable if
      // no inspectDom has yet been executed.
      return null; // Set null initially; the observation is capture-time only
    })();

    const confidence: ComputerUseObservation["confidence"] = ctx.session.mode === "unavailable"
      ? "low"
      : ctx.session.mode === "simulation"
        ? "low"
        : hasScreenshot && hasUrl
          ? "high"
          : "medium";

    addComputerUseObservation(ctx.run.id, {
      runId: ctx.run.id,
      stepId: ctx.step.id,
      timestamp: getNowIso(),
      environment: "browser",
      url: state.url,
      pageTitle,
      screenshot,
      viewport: { width: ctx.session.viewport.width, height: ctx.session.viewport.height },
      networkState: "idle",
      browserSessionMode: ctx.session.mode,
      trustLevel: "untrusted_page",
      availability,
      source,
      domSummary,
      accessibilitySummary: null,
      elementBoundingBoxes: null,
      elementRefs: refMapResult?.elements
        ? refMapResult.elements.map((el) => ({ ...el, snapshotId: refMapResult.snapshotId }))
        : null,
      coordinateMetadata,
      confidence,
    });

    addComputerUseEvent(ctx.run.id, {
      runId: ctx.run.id,
      stepId: ctx.step.id,
      type: "observation.captured",
      timestamp: getNowIso(),
      actor: "runtime",
      screenshotId: screenshot.id,
      metadata: { phase, actionType: ctx.step.action.type, trustLevel: "untrusted_page", url: state.url },
    });

    if (warning) {
      // Honest warning instead of silently treating an early/blank capture
      // as a fully successful observation — visible in the timeline/UI.
      addComputerUseEvent(ctx.run.id, {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        type: "observation.capture.failed",
        timestamp: getNowIso(),
        actor: "runtime",
        screenshotId: screenshot.id,
        metadata: { phase, actionType: ctx.step.action.type, warning, durationMs: Date.now() - startedAt, url: state.url },
      });
    } else {
      addComputerUseEvent(ctx.run.id, {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        type: "observation.capture.completed",
        timestamp: getNowIso(),
        actor: "runtime",
        screenshotId: screenshot.id,
        metadata: { phase, actionType: ctx.step.action.type, durationMs: Date.now() - startedAt, url: state.url },
      });
    }

    return screenshot;
  } catch (err) {
    // Even when the screenshot itself fails, still capture URL/title so the
    // run never loses observable state just because the image couldn't be
    // taken (e.g. page mid-navigation, target closed).
    let fallbackUrl: string | undefined;
    let fallbackTitle: string | undefined;
    try {
      const fallbackState = ctx.session.getState();
      fallbackUrl = fallbackState.url;
      fallbackTitle = fallbackState.title || undefined;
    } catch {
      fallbackUrl = undefined;
    }

    const errorMessage = err instanceof Error ? err.message : "Failed to capture screenshot";

    const fallbackAvailability: ObservationAvailability = {
      screenshot: false,
      url: !!fallbackUrl,
      title: !!fallbackTitle,
      dom: false,
      accessibility: false,
      viewport: true,
      boundingBoxes: false,
    };

    const fallbackSource: ObservationSource = {
      provider: ctx.session.mode === "live_browser" ? "playwright" : ctx.session.mode === "simulation" ? "mock" : "none",
      sessionMode: ctx.session.mode,
      capabilities: fallbackAvailability,
      unavailableReason: errorMessage,
    };

    addComputerUseObservation(ctx.run.id, {
      runId: ctx.run.id,
      stepId: ctx.step.id,
      timestamp: getNowIso(),
      environment: "browser",
      url: fallbackUrl,
      pageTitle: fallbackTitle || null,
      screenshot: undefined,
      viewport: { width: ctx.session.viewport.width, height: ctx.session.viewport.height },
      browserSessionMode: ctx.session.mode,
      trustLevel: "untrusted_page",
      availability: fallbackAvailability,
      source: fallbackSource,
      domSummary: null,
      accessibilitySummary: null,
      elementBoundingBoxes: null,
      elementRefs: null,
      coordinateMetadata: null,
      confidence: "low",
    });

    addComputerUseEvent(ctx.run.id, {
      runId: ctx.run.id,
      stepId: ctx.step.id,
      type: "observation.capture.failed",
      timestamp: getNowIso(),
      actor: "runtime",
      metadata: { phase, actionType: ctx.step.action.type, error: errorMessage, url: fallbackUrl, durationMs: Date.now() - startedAt },
    });

    return null;
  }
}

async function captureBeforeObservation(
  ctx: ExecutionContext,
): Promise<ComputerUseScreenshot | null> {
  return captureObservation(ctx, "before_action");
}

async function captureAfterObservation(
  ctx: ExecutionContext,
): Promise<ComputerUseScreenshot | null> {
  return captureObservation(ctx, "after_action");
}

// ── Action Execution ──────────────────────────────────────────────────────

export interface ExecuteActionInput {
  action: ComputerAction;
  runId: string;
  session: BrowserSession;
}

export interface ExecuteActionResult {
  success: boolean;
  step: ComputerUseStep;
  actionResult: ActionResult;
  verification?: VerificationResult;
  error?: string;
  beforeScreenshotId?: string;
  afterScreenshotId?: string;
}

export async function executeComputerAction(
  input: ExecuteActionInput,
): Promise<ExecuteActionResult> {
  const { action, runId, session } = input;

  const run = getComputerUseRun(runId);
  if (!run) {
    return {
      success: false,
      step: null as unknown as ComputerUseStep,
      actionResult: { success: false, error: `Run ${runId} not found` },
      error: `Run ${runId} not found`,
    };
  }

  const step = addComputerUseStep(runId, {
    id: `cu-step-action-${Date.now()}`,
    runId,
    index: run.stepCount,
    status: "proposed",
    action,
    startedAt: getNowIso(),
  });

  const ctx: ExecutionContext = { run, session, step };

  addComputerUseEvent(runId, {
    runId,
    stepId: step.id,
    type: "action.proposed",
    timestamp: getNowIso(),
    actor: "user",
    action,
  });

  const beforeScreenshot = await captureBeforeObservation(ctx);
  const beforeUrl = session.getState().url;

  const executionStartedAt = Date.now();
  addComputerUseEvent(runId, {
    runId,
    stepId: step.id,
    type: "action.execution.started",
    timestamp: getNowIso(),
    actor: "runtime",
    action,
    metadata: { beforeScreenshotId: beforeScreenshot?.id, actionType: action.type, step: run.stepCount },
  });

  const executionResult = await executeAction(ctx);
  const executionDurationMs = Date.now() - executionStartedAt;

  const afterScreenshot = await captureAfterObservation(ctx);

  const afterUrl = session.getState().url;

  const observations = getComputerUseObservations(runId);
  const beforeObs = observations.filter((o) => o.stepId === step.id).find((o) => (o as unknown as Record<string, unknown>).phase === "before_action") ?? null;
  const afterObs = observations.filter((o) => o.stepId === step.id).find((o) => (o as unknown as Record<string, unknown>).phase === "after_action") ?? null;

  const verification = verifyComputerAction({
    action,
    run,
    executionSuccess: executionResult.success,
    executionError: executionResult.error,
    beforeUrl,
    afterUrl,
    beforeScreenshot,
    afterScreenshot,
    beforeObservation: beforeObs,
    afterObservation: afterObs,
    sessionMode: session.mode,
    policyDecision: undefined,
    elementCount: executionResult.elementCount,
  });

  addComputerUseEvent(runId, {
    runId,
    stepId: step.id,
    type: executionResult.success ? "action.execution.completed" : "action.execution.failed",
    timestamp: getNowIso(),
    actor: "runtime",
    action,
    metadata: {
      actionType: action.type,
      durationMs: executionDurationMs,
      error: executionResult.success ? undefined : sanitizeErrorMessage(executionResult.error),
      beforeScreenshotId: beforeScreenshot?.id,
      afterScreenshotId: afterScreenshot?.id,
    },
  });

  addComputerUseEvent(runId, {
    runId,
    stepId: step.id,
    type: "action.executed",
    timestamp: getNowIso(),
    actor: "runtime",
    action,
    metadata: { beforeScreenshotId: beforeScreenshot?.id, afterScreenshotId: afterScreenshot?.id },
  });

  if (!executionResult.success) {
    addComputerUseEvent(runId, {
      runId,
      stepId: step.id,
      type: "action.failed",
      timestamp: getNowIso(),
      actor: "runtime",
      action,
      result: { success: false, error: executionResult.error },
      metadata: {
        error: executionResult.error,
        beforeScreenshotId: beforeScreenshot?.id,
        afterScreenshotId: afterScreenshot?.id,
      },
    });
  }

  addComputerUseEvent(runId, {
    runId,
    stepId: step.id,
    type: resolutionEventType(verification),
    timestamp: getNowIso(),
    actor: "runtime",
    action,
    metadata: {
      verification,
      verificationStatus: verification.status,
      verificationPassed: verification.passed,
      verificationConfidence: verification.confidence,
      beforeScreenshotId: beforeScreenshot?.id,
      afterScreenshotId: afterScreenshot?.id,
    },
  });

  // Map the executor's raw per-action-type "data" payload into the typed,
  // bounded ActionResult.data shape so observation-packet.ts (and ultimately
  // the planner prompt) can read real extracted text/links/headings/table
  // instead of discarding them after execution.
  const rawData = executionResult.data as Record<string, unknown> | undefined;
  const resultData: ActionResult["data"] = rawData
    ? {
        elements: Array.isArray(rawData.elements) ? (rawData.elements as Array<{ tag: string; text?: string }>) : undefined,
        text: typeof rawData.text === "string" ? rawData.text : undefined,
        links: Array.isArray(rawData.links) ? (rawData.links as Array<{ href: string; text: string }>) : undefined,
        headings: Array.isArray(rawData.headings) ? (rawData.headings as Array<{ level: number; text: string }>) : undefined,
        table: Array.isArray(rawData.table) ? (rawData.table as string[][]) : undefined,
      }
    : undefined;

  const actionResult: ActionResult = {
    success: executionResult.success,
    error: executionResult.error,
    beforeScreenshotId: beforeScreenshot?.id,
    afterScreenshotId: afterScreenshot?.id,
    verification,
    browserSessionMode: session.mode,
    data: resultData,
  };

  step.status = executionResult.success ? "executed" : "failed";
  step.result = actionResult;
  step.beforeScreenshotId = beforeScreenshot?.id;
  step.afterScreenshotId = afterScreenshot?.id;

  return {
    success: executionResult.success,
    step,
    actionResult,
    verification,
    error: executionResult.error,
    beforeScreenshotId: beforeScreenshot?.id,
    afterScreenshotId: afterScreenshot?.id,
  };
}

// ── Internal Action Executors ──────────────────────────────────────────────

interface ActionExecResult {
  success: boolean;
  error?: string;
  elementCount?: number;
  data?: unknown;
}

async function executeAction(ctx: ExecutionContext): Promise<ActionExecResult> {
  const { session, step } = ctx;
  const action = step.action;

  switch (action.type) {
    case "navigate": {
      if (!action.url) {
        return { success: false, error: "Navigate requires a URL" };
      }
      try {
        const result = await session.navigate(action.url);
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Navigate failed" };
      }
    }

    case "click":
    case "dom_click": {
      // Resolve ref to coordinates when a ref is provided without x/y.
      let clickX = action.x;
      let clickY = action.y;
      if (action.ref && (action.x === undefined || action.y === undefined)) {
        const refMap = session.getElementRefMap?.();
        if (refMap && refMap.elements) {
          const matched = refMap.elements.find((el) => el.ref === action.ref);
          if (matched && matched.boundingBox) {
            clickX = matched.boundingBox.centerX;
            clickY = matched.boundingBox.centerY;
          } else if (matched && !matched.boundingBox) {
            return { success: false, error: `Ref "${action.ref}" matched an element without bounding box. Cannot execute click safely.` };
          } else {
            return { success: false, error: `Ref "${action.ref}" not found in current element ref map. The ref may be stale — wait for a new observation and retry.` };
          }
        } else {
          return { success: false, error: `Ref "${action.ref}" provided but no element ref map is available from the current session.` };
        }
      }
      if (clickX === undefined || clickY === undefined) {
        return { success: false, error: "Click requires x,y coordinates or a valid element ref" };
      }
      try {
        const result = await session.click(clickX, clickY);
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Click failed" };
      }
    }

    case "double_click": {
      if (action.x === undefined || action.y === undefined) {
        return { success: false, error: "Double click requires x,y coordinates" };
      }
      try {
        await session.click(action.x, action.y);
        const result = await session.click(action.x, action.y);
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Double click failed" };
      }
    }

    case "drag": {
      if (!action.from || !action.to) {
        return { success: false, error: "Drag requires from/to coordinates" };
      }
      try {
        await session.click(action.from[0], action.from[1]);
        const result = await session.click(action.to[0], action.to[1]);
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Drag failed" };
      }
    }

    case "scroll": {
      const direction = action.direction ?? "down";
      const amount = action.amount ?? 300;
      try {
        const result = await session.scroll(direction, amount);
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Scroll failed" };
      }
    }

    case "type":
    case "dom_type": {
      if (!action.text) {
        return { success: false, error: "Type requires a text value" };
      }
      // When a ref is provided, resolve to coordinates and click first to focus.
      if (action.ref) {
        const refMap = session.getElementRefMap?.();
        if (refMap && refMap.elements) {
          const matched = refMap.elements.find((el) => el.ref === action.ref);
          if (matched && matched.boundingBox) {
            try {
              await session.click(matched.boundingBox.centerX, matched.boundingBox.centerY);
            } catch (err) {
              return { success: false, error: `Failed to focus element ref "${action.ref}": ${err instanceof Error ? err.message : "click failed"}` };
            }
          } else if (matched && !matched.boundingBox) {
            return { success: false, error: `Ref "${action.ref}" matched an element without bounding box. Cannot focus safely.` };
          } else {
            return { success: false, error: `Ref "${action.ref}" not found in current element ref map.` };
          }
        } else {
          return { success: false, error: `Ref "${action.ref}" provided but no element ref map is available.` };
        }
      }
      try {
        const result = await session.type(action.text);
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Type failed" };
      }
    }

    case "key":
    case "pressKey": {
      const keys = action.keys ?? (action.text ? [action.text] : []);
      if (keys.length === 0) {
        return { success: false, error: "Press key requires key(s)" };
      }
      try {
        const result = await session.pressKey(keys);
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Press key failed" };
      }
    }

    case "wait": {
      const ms = action.ms ?? 1000;
      try {
        const result = await session.wait(ms);
        return { success: result.success };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Wait failed" };
      }
    }

    case "screenshot": {
      try {
        await session.screenshot();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Screenshot failed" };
      }
    }

    case "inspectDom": {
      try {
        const result = await session.inspectDom();
        return {
          success: result.success,
          error: result.error,
          elementCount: result.elements?.length,
          data: result.success ? { elements: result.elements, trustLevel: "untrusted_page" as const } : undefined,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "DOM inspection failed" };
      }
    }

    case "extractText": {
      try {
        const result = await session.extractText(action.selector);
        return {
          success: result.success,
          error: result.error,
          data: result.success ? { text: result.text, trustLevel: "untrusted_page" as const } : undefined,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Text extraction failed" };
      }
    }

    case "extractLinks": {
      try {
        const result = await session.extractLinks();
        return {
          success: result.success,
          error: result.error,
          data: result.success ? { links: result.links, trustLevel: "untrusted_page" as const } : undefined,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Link extraction failed" };
      }
    }

    case "extractHeadings": {
      try {
        const result = await session.extractHeadings();
        return {
          success: result.success,
          error: result.error,
          data: result.success ? { headings: result.headings, trustLevel: "untrusted_page" as const } : undefined,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Heading extraction failed" };
      }
    }

    case "extractTable": {
      try {
        const result = await session.extractTable(action.selector);
        return {
          success: result.success,
          error: result.error,
          data: result.success ? { table: result.table, trustLevel: "untrusted_page" as const } : undefined,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Table extraction failed" };
      }
    }

    case "complete": {
      return { success: true };
    }

    case "fail": {
      return { success: false, error: action.reason ?? "Action marked as failed" };
    }

    // ── Desktop-class actions — fail closed, no real execution backend ──
    case "desktop_screenshot":
    case "desktop_click":
    case "desktop_type":
    case "desktop_key":
    case "desktop_scroll":
    case "desktop_app_switch":
    case "desktop_app_open":
    case "desktop_clipboard_read":
    case "desktop_clipboard_write":
    case "desktop_file_download":
    case "desktop_file_upload":
    case "desktop_file_access":
    case "desktop_terminal_exec":
    case "desktop_credential_field":
    case "desktop_os_settings":
    case "desktop_system_dialog":
      return { success: false, error: `Desktop action "${action.type}" is not executable — no desktop execution backend is available.` };

    default:
      return { success: false, error: `Unknown action type: ${(action as ComputerAction).type}` };
  }
}

// ── Normalization helpers ──────────────────────────────────────────────────

export function normalizeAction(action: ComputerAction): ComputerAction {
  return {
    type: action.type,
    x: action.x,
    y: action.y,
    button: action.button ?? "left",
    from: action.from,
    to: action.to,
    direction: action.direction ?? "down",
    amount: action.amount,
    text: action.text,
    keys: action.keys,
    ms: action.ms,
    url: action.url,
    ref: action.ref,
    selector: action.selector,
    targetLabel: action.targetLabel,
    sensitive: action.sensitive ?? false,
    reason: action.reason,
    summary: action.summary,
    metadata: action.metadata,
  };
}

export function describeAction(action: ComputerAction): string {
  switch (action.type) {
    case "navigate":
      return `Navigate to ${action.url ?? "unknown URL"}`;
    case "click":
      return `Click at (${action.x},${action.y})${action.targetLabel ? ` on "${action.targetLabel}"` : ""}`;
    case "double_click":
      return `Double-click at (${action.x},${action.y})${action.targetLabel ? ` on "${action.targetLabel}"` : ""}`;
    case "drag":
      return `Drag from (${action.from?.join(",")}) to (${action.to?.join(",")})`;
    case "scroll":
      return `Scroll ${action.direction ?? "down"} by ${action.amount ?? 0}px`;
    case "type":
    case "dom_type":
      return `Type "${action.text ? (action.sensitive ? "***" : action.text) : ""}"${action.targetLabel ? ` into "${action.targetLabel}"` : ""}`;
    case "key":
    case "pressKey":
      return `Press key(s): ${action.keys?.join(", ") ?? action.text ?? "unknown"}`;
    case "wait":
      return `Wait ${action.ms ?? 0}ms`;
    case "screenshot":
      return "Capture screenshot";
    case "inspectDom":
      return "Inspect DOM";
    case "extractText":
      return `Extract text${action.selector ? ` from "${action.selector}"` : " from page"}`;
    case "extractLinks":
      return "Extract links from page";
    case "extractHeadings":
      return "Extract headings from page";
    case "extractTable":
      return `Extract table${action.selector ? ` from "${action.selector}"` : " from page"}`;
    case "dom_click":
      return `DOM click on "${action.ref ?? "element"}"${action.targetLabel ? ` (${action.targetLabel})` : ""}`;
    case "complete":
      return action.summary ?? "Mark complete";
    case "fail":
      return action.reason ?? "Mark failed";
    // Desktop-class actions — described for policy visibility, never executed
    case "desktop_screenshot":
      return "Capture desktop screenshot";
    case "desktop_click":
      return `Desktop click at (${action.x},${action.y})${action.targetLabel ? ` on "${action.targetLabel}"` : ""}`;
    case "desktop_type":
      return `Desktop type "${action.text ? (action.sensitive ? "***" : action.text) : ""}"${action.targetLabel ? ` into "${action.targetLabel}"` : ""}`;
    case "desktop_key":
      return `Desktop key press: ${action.keys?.join(", ") ?? action.text ?? "unknown"}`;
    case "desktop_scroll":
      return `Desktop scroll ${action.direction ?? "down"} by ${action.amount ?? 0}px`;
    case "desktop_app_switch":
      return `Switch to app: ${action.targetLabel ?? "unknown"}`;
    case "desktop_app_open":
      return `Open app: ${action.targetLabel ?? "unknown"}`;
    case "desktop_clipboard_read":
      return "Read clipboard";
    case "desktop_clipboard_write":
      return "Write to clipboard";
    case "desktop_file_download":
      return `Download file${action.url ? ` from ${action.url}` : ""}`;
    case "desktop_file_upload":
      return `Upload file${action.url ? ` to ${action.url}` : ""}`;
    case "desktop_file_access":
      return `Access file${action.url ? ` at ${action.url}` : ""}`;
    case "desktop_terminal_exec":
      return `Execute terminal command: ${action.text ? (action.sensitive ? "***" : action.text) : "unknown"}`;
    case "desktop_credential_field":
      return "Interact with credential/password field (sensitive)";
    case "desktop_os_settings":
      return `Modify OS settings: ${action.targetLabel ?? "unknown"}`;
    case "desktop_system_dialog":
      return `Interact with system dialog: ${action.targetLabel ?? "unknown"}`;
    default:
      return `Action: ${(action as ComputerAction).type}`;
  }
}
