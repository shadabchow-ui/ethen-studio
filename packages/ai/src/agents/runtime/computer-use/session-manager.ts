// Server-only module. Resolves and caches the BrowserSession used for a
// given run: a real Playwright session when the run requests live browser
// mode and Playwright can launch successfully, or the explicit mock
// simulation session otherwise. Never silently substitutes mock data for
// a run that claims to be live — failures fail closed to "unavailable".
//
// Desktop mode ("desktop") is always routed through the virtual desktop
// placeholder, which fails closed with an honest unavailable reason.

import "server-only";
import type { ComputerUseRun, BrowserSessionMode } from "./types";
import { createMockBrowserSession, type BrowserSession } from "./actions";
import type { LivePlaywrightSession } from "./playwright-session";
import { updateRunSandbox } from "./store";
import { getBrowserSandboxReadiness } from "./browser-sandbox";

interface CachedSession {
  session: BrowserSession;
  mode: BrowserSessionMode;
  live?: LivePlaywrightSession;
}

const sessionCache = new Map<string, CachedSession>();

/**
 * Runs request live browser mode by setting sandbox.mode to "local-browser"
 * or "remote-browser" (as opposed to the legacy "browser" mode, which is
 * treated as simulation for backward compatibility with existing mock runs).
 */
function runRequestsLiveBrowser(run: ComputerUseRun): boolean {
  return run.sandbox.mode === "local-browser" || run.sandbox.mode === "remote-browser";
}

/**
 * Runs that request desktop sandbox mode (sandbox.mode === "desktop") are
 * routed to the desktop sandbox adapter, which currently returns unavailable
 * because no real virtual desktop runtime is configured.
 */
function runRequestsDesktop(run: ComputerUseRun): boolean {
  return run.sandbox.mode === "desktop" || run.sandbox.mode === "local-desktop";
}

export interface ResolveSessionResult {
  session: BrowserSession;
  mode: BrowserSessionMode;
  error?: string;
}

/**
 * Resolves the BrowserSession for a run's next action. Caches a live
 * session across calls within the same run so Playwright isn't relaunched
 * per-action. If the run requests live mode and Playwright fails to
 * launch, returns mode: "unavailable" with an error — callers must not
 * proceed to execute the action against mock data in that case.
 */
export async function resolveBrowserSession(run: ComputerUseRun): Promise<ResolveSessionResult> {
  const cached = sessionCache.get(run.id);
  if (cached) {
    return { session: cached.session, mode: cached.mode };
  }

  if (!runRequestsLiveBrowser(run)) {
    // Desktop sandbox mode — returns unavailable because no real virtual
    // desktop runtime is configured. Never falls back to mock/simulation
    // and never starts real processes. Desktop session capabilities
    // (stream, screenshot, input, terminal, file_access, clipboard) all
    // report not_configured.
    if (runRequestsDesktop(run)) {
      const isLocalDesktop = run.sandbox.mode === "local-desktop";
      const reason = isLocalDesktop
        ? (await import("./local-desktop-companion")).LOCAL_COMPANION_UNAVAILABLE_REASON
        : (await import("./desktop-sandbox-adapter")).DESKTOP_SANDBOX_UNAVAILABLE_REASON;
      const session = isLocalDesktop
        ? (await import("./local-desktop-companion")).createLocalDesktopSession(run.id)
        : createMockBrowserSession(run.id, run.sandbox.url);
      sessionCache.set(run.id, { session, mode: "unavailable" });
      updateRunSandbox(run.id, {
        browserSessionMode: "unavailable",
        desktopSessionMode: "not_configured",
      });
      return {
        session,
        mode: "unavailable",
        error: reason,
      };
    }

    const session = createMockBrowserSession(run.id, run.sandbox.url);
    sessionCache.set(run.id, { session, mode: "simulation" });
    updateRunSandbox(run.id, { browserSessionMode: "simulation" });
    return { session, mode: "simulation" };
  }

  // Remote-browser (hosted) path — placeholder until a real hosted
  // provider is configured. Always returns unavailable with a clear
  // reason; never attempts network calls or credential lookups.
  if (run.sandbox.mode === "remote-browser") {
    const { createHostedBrowserSession, UNAVAILABLE_REASON } = await import("./hosted-browser-session");
    const hosted = createHostedBrowserSession(run.id, run.sandbox.url);
    sessionCache.set(run.id, { session: hosted, mode: "unavailable" });
    updateRunSandbox(run.id, { browserSessionMode: "unavailable" });
    return {
      session: hosted,
      mode: "unavailable",
      error: UNAVAILABLE_REASON,
    };
  }

  const readiness = getBrowserSandboxReadiness();
  if (readiness.status === "unavailable") {
    const session = { ...createMockBrowserSession(run.id, run.sandbox.url), mode: "unavailable" as const };
    updateRunSandbox(run.id, { browserSessionMode: "unavailable" });
    return { session, mode: "unavailable", error: readiness.reason };
  }

  try {
    const { createLiveBrowserSession } = await import("./playwright-session");
    const live = await createLiveBrowserSession(run.id, run.sandbox.url, {
      width: run.sandbox.viewport.width,
      height: run.sandbox.viewport.height,
    }, run.permissionScope.allowedDomains);
    sessionCache.set(run.id, { session: live, mode: "live_browser", live });
    updateRunSandbox(run.id, { browserSessionMode: "live_browser" });
    return { session: live, mode: "live_browser" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Playwright failed to launch";
    // Fail closed: do not fall back to mock data while the run claims live mode.
    // The session object itself is labeled "unavailable", not "simulation" —
    // callers must reject/abort rather than execute actions against it.
    const unavailableSession: BrowserSession = {
      ...createMockBrowserSession(run.id, run.sandbox.url),
      mode: "unavailable",
    };
    updateRunSandbox(run.id, { browserSessionMode: "unavailable" });
    return {
      session: unavailableSession,
      mode: "unavailable",
      error,
    };
  }
}

export async function disposeBrowserSession(runId: string): Promise<void> {
  const cached = sessionCache.get(runId);
  if (!cached) return;
  sessionCache.delete(runId);
  if (cached.live) {
    await cached.live.stop().catch(() => {});
  }
}
