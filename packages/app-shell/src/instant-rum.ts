/**
 * Ethen Instant Experience — field RUM collector (implementation-ready, not wired).
 *
 * Authority: ETHEN_INSTANT_EXPERIENCE_STANDARD_V2_FINAL.md §9/§17. The lab
 * reference e2e/instant-opus5/collector.js predates remediation pass 1
 * (destination identity, readiness, keyboard/history, shell continuity) and
 * is NOT yet aligned — see artifacts/instant-experience-four-app-remediation-pass1.
 *
 * Wiring (per product, client-only, after consent/logging-mode checks) via the
 * framework adapters (`instant-rum/next`, `instant-rum/react-router`):
 *   <EthenRumNext app="missions-core" product="missions" releaseSha={sha}
 *     endpoint="/api/rum" routes={...} enabled={consent} />
 * Wire format is schema v2 (see `@ethen/contracts` rum/schema): every §17
 * field kept with its meaning, plus `app` / `source_app` / `target_app` /
 * `runtime`; `product` is null for post-v1 surfaces.
 * Destination contract (V2 FINAL §9; remediation pass 1 — see
 * `evaluateDestination` below):
 *  - Identity: `data-iex-route="<route template>"` on the element that makes the
 *    destination recognizable (usually the page <h1>). CTS is the first frame a
 *    RENDERED marker whose value EQUALS the template of the current pathname is
 *    on screen. Stale markers from the previous route and clipped/1px or
 *    off-screen markers never count.
 *  - Primary control (optional, app-declared): `data-iex-primary="<template>"`
 *    on the control(s) the destination needs to be usable. When declared, CTU
 *    waits until one such control is rendered AND enabled.
 *  - Readiness (optional, app-declared): `data-iex-ready="true|false"` on the
 *    identity marker. When present, CTU waits for "true". The shared collector
 *    never infers product-specific business readiness.
 *  - Shell: `data-iex-shell="<owner id>"` on the persistent chrome node (a
 *    rendered box, not `display: contents`). `shell_retained` is true only when
 *    the node captured at input stayed attached AND rendered on every observed
 *    frame AND is still the shell at finish.
 * Interactions measured: pointer (pointerdown → click), keyboard activation
 * (Enter on links/controls, Space on non-link controls), history traversal
 * (Back/Forward via popstate) and programmatic navigation (pushState /
 * replaceState with no in-flight input, e.g. router.push). A newer
 * interaction supersedes an unfinished older one, so one navigation never
 * yields two samples. Every sample carries `origin` (which trigger),
 * `route` (EXPECTED template), `observed_route` (rendered marker at close)
 * and `identity_match` (rendered marker equaled the expectation; null for
 * `ui` samples, which assert no destination identity).
 *
 * Privacy: no text content, URLs with ids, prompts, titles or user ids are
 * collected. `route` must be a template ("/studio/projects/[id]"), never a path.
 */

export type RouteClass = "R1" | "R2" | "R3" | "R4" | "R5";

export type RumNavigationOrigin = "pointer" | "keyboard" | "history" | "programmatic";

export type InstantRumSample = {
  v: 2;
  release_sha: string;
  /** v1 product where one exists; null for post-v1 surfaces (e.g. web). */
  product: "chat" | "platform" | "missions" | "studio" | "designer" | null;
  /** Registry deployable id (IE-M0), validated sink-side against the registry. */
  app: string;
  /** R5 source registry id from `ethen_src` (IE-M2); null when absent/invalid. */
  source_app: string | null;
  /** R5 destination registry id (the wired app itself). */
  target_app: string | null;
  runtime: "next" | "vite-react-router" | "electron";
  route: string;
  route_class: RouteClass | null;
  browser: string;
  device_class: "low" | "mid" | "high" | "unknown";
  network_class: string;
  session_age_bucket: "0-5m" | "5-30m" | "30-120m" | "2h+";
  nav_type: "hard" | "soft" | "back_forward" | "ui";
  /**
   * What triggered the measurement. `programmatic` = history.pushState /
   * replaceState with no in-flight input (e.g. router.push); never fabricated
   * from a pointer event. History traversal is `history`, never pointer.
   */
  origin: RumNavigationOrigin;
  /**
   * Pass 2 identity triple: `route` is the EXPECTED destination (template of
   * the current pathname), `observed_route` is the rendered identity marker
   * on screen when the sample closed, and `identity_match` is whether a
   * rendered marker equaled the expectation. Null for `ui` samples, which
   * make no destination-identity assertion.
   */
  observed_route: string | null;
  identity_match: boolean | null;
  prefetched: boolean | null;
  cta_ms: number | null;
  ack_source: "press" | "result" | "none" | null;
  ctp_ms: number | null;
  cts_ms: number | null;
  ctu_ms: number | null;
  ctc_ms: number | null;
  inp_ms: number | null;
  input_delay_ms: number | null;
  processing_ms: number | null;
  presentation_ms: number | null;
  cls: number;
  loaf_count: number;
  loaf_max_ms: number;
  shell_retained: boolean | null;
  fallback_shown: boolean | null;
  errors: number;
  flags?: Record<string, string>;
};

export type InstantRumOptions = {
  product: InstantRumSample["product"];
  /** Registry deployable id of the wired app. */
  app: string;
  runtime: InstantRumSample["runtime"];
  /** Destination registry id for R5 attribution (usually the wired app). */
  targetApp?: string | null;
  /** Explicit R5 source override; defaults to the `ethen_src` query value. */
  sourceApp?: string | null;
  releaseSha: string;
  endpoint: string;
  /**
   * Map a pathname to a privacy-safe template and its route class.
   * Return null when no template matches — never a raw path.
   */
  routeTemplate: (pathname: string) => { route: string; routeClass: RouteClass | null } | null;
  sampleRate?: number;
  shellSelector?: string;
  flags?: Record<string, string>;
};

/**
 * Segment-aware template match over longest-prefix precedence. Static keys
 * keep exact longest-prefix semantics; keys carrying `[param]` segments
 * match per segment at equal length (Studio V3 project routes). Unknown
 * paths return null so the collector never enqueues a raw URL (no ids, no
 * PII, no unallowlisted routes).
 */
export function matchRouteTemplate(
  path: string,
  routes: Readonly<Record<string, { route: string; routeClass: RouteClass | null }>>,
): { route: string; routeClass: RouteClass | null } | null {
  let best: { route: string; routeClass: RouteClass | null } | null = null;
  let bestKey = "";
  let bestLen = -1;
  let bestSegment = false;
  for (const [prefix, mapped] of Object.entries(routes)) {
    if ((path === prefix || path.startsWith(`${prefix}/`)) && prefix.length > bestLen) {
      best = mapped;
      bestKey = prefix;
      bestLen = prefix.length;
      bestSegment = false;
    }
    if (templateSegmentsMatch(prefix, path) && prefix.length > bestLen) {
      best = mapped;
      bestKey = prefix;
      bestLen = prefix.length;
      bestSegment = true;
    }
  }
  // Closed dynamic families: a path deeper than its static match drops
  // honestly when bracket-keyed children own that namespace (no parent
  // borrowing for unknown project sections).
  if (best && !bestSegment && path.length > bestKey.length && hasBracketChildren(routes, bestKey)) {
    return null;
  }
  return best;
}

function hasBracketChildren(routes: Readonly<Record<string, unknown>>, prefix: string): boolean {
  const childPrefix = prefix === "/" ? "/" : `${prefix}/`;
  return Object.keys(routes).some((key) => {
    if (!key.startsWith(childPrefix)) return false;
    const rest = key.slice(childPrefix.length).split("/");
    return rest.length > 0 && /^\[[^\]]+\]$/.test(rest[0]!);
  });
}

/** True when a bracket-bearing key matches the path segment by segment. Static keys never match here. */
function templateSegmentsMatch(template: string, path: string): boolean {
  if (!template.includes("[")) return false;
  const segments = template.split("/").filter(Boolean);
  const parts = path.split("?")[0]!.split("/").filter(Boolean);
  if (segments.length !== parts.length) return false;
  for (let i = 0; i < segments.length; i += 1) {
    if (/^\[[^\]]+\]$/.test(segments[i]!)) continue;
    if (segments[i] !== parts[i]) return false;
  }
  return true;
}

/** Destination readiness stages, ordered. `NONE`: no rendered identity marker. */
export type DestinationStage = "NONE" | "VISIBLE" | "IDENTITY_CORRECT" | "CONTROL_PRESENT" | "CONTROL_ENABLED" | "READY";

const STAGE_ORDER: readonly DestinationStage[] = ["NONE", "VISIBLE", "IDENTITY_CORRECT", "CONTROL_PRESENT", "CONTROL_ENABLED", "READY"];

export function stageAtLeast(stage: DestinationStage, min: DestinationStage): boolean {
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(min);
}

/**
 * Rendered = connected, larger than 1×1 (rejects visually-hidden / clipped
 * markers), not `visibility:hidden` / `opacity:0`, and (for identity/controls)
 * intersecting the viewport.
 */
export function isRendered(el: Element, opts: { requireViewport?: boolean } = {}): boolean {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) return false;
  const check = (el as Element & { checkVisibility?: (o: Record<string, boolean>) => boolean }).checkVisibility;
  if (typeof check === "function") {
    if (!check.call(el, { visibilityProperty: true, opacityProperty: true })) return false;
  } else if (typeof getComputedStyle === "function") {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") return false;
  }
  if (opts.requireViewport !== false && typeof innerWidth === "number") {
    if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
  }
  return true;
}

function isEnabledControl(el: Element): boolean {
  if ((el as HTMLButtonElement).matches?.(":disabled")) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  if (el.closest("[inert]")) return false;
  return true;
}

/**
 * Evaluate how far the destination for `expectedRoute` has progressed.
 * `expectedRoute` is the route TEMPLATE the current pathname maps to; null
 * (unmapped) can never pass IDENTITY_CORRECT.
 */
export function evaluateDestination(expectedRoute: string | null, root: ParentNode = document): DestinationStage {
  const markers = [...root.querySelectorAll("[data-iex-route]")].filter((el) => isRendered(el));
  if (markers.length === 0) return "NONE";
  const identity = expectedRoute == null ? undefined : markers.find((el) => el.getAttribute("data-iex-route") === expectedRoute);
  if (!identity) return "VISIBLE";
  let stage: DestinationStage = "IDENTITY_CORRECT";
  const primaries = [...root.querySelectorAll("[data-iex-primary]")].filter((el) => el.getAttribute("data-iex-primary") === expectedRoute);
  if (primaries.length > 0) {
    const rendered = primaries.filter((el) => isRendered(el));
    if (rendered.length === 0) return stage;
    stage = "CONTROL_PRESENT";
    if (!rendered.some(isEnabledControl)) return stage;
    stage = "CONTROL_ENABLED";
  }
  const readyMark = identity.getAttribute("data-iex-ready");
  if (readyMark !== null && readyMark !== "true") return stage;
  return "READY";
}

type InteractionSource = RumNavigationOrigin;

/**
 * First RENDERED identity marker value in the tree, or null. Used for the
 * `observed_route` half of the identity triple: what the screen actually
 * showed when the sample closed — including a stale previous-destination
 * marker, which is precisely the diagnosis the audit repro needs.
 */
export function observedRoute(root: ParentNode = document): string | null {
  const markers = [...root.querySelectorAll("[data-iex-route]")];
  for (const el of markers) {
    if (isRendered(el)) return el.getAttribute("data-iex-route");
  }
  return null;
}

type Pending = {
  source: InteractionSource;
  pd: number | null;
  click: number;
  ack: number | null;
  firstMut: number | null;
  firstPaint: number | null;
  /** CTS: first frame the destination identity was correct. */
  shellAt: number | null;
  /** First frame the destination reached READY. */
  readyAt: number | null;
  done: boolean;
  looping: boolean;
  fromPath: string;
  navType: InstantRumSample["nav_type"];
  shellNode: Element | null;
  shellLost: boolean;
  shellMissingFrames: number;
  prefetched: boolean | null;
  fallback: boolean;
  sourceApp: string | null;
};

const STYLE_KEYS = ["backgroundColor", "color", "borderTopColor", "transform", "opacity", "boxShadow", "outlineStyle"] as const;
const ACTIONABLE = "a[href],button,[role=button],[role=link],[role=tab],[role=menuitem],[data-iex]";

export function startInstantRum(options: InstantRumOptions): () => void {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return () => {};
  if (Math.random() >= (options.sampleRate ?? 0.1)) return () => {};

  const now = () => performance.now();
  const startedKey = "ethen.rum.sessionStart";
  const sessionStart = Number(sessionStorage.getItem(startedKey)) || Date.now();
  sessionStorage.setItem(startedKey, String(sessionStart));
  const shellSel = options.shellSelector ?? "[data-iex-shell]";
  const observers: PerformanceObserver[] = [];
  const interactions = new Map<number, { d: number; ps: number; pe: number; s: number }>();
  const loafs: Array<[number, number]> = [];
  const shifts: Array<[number, number]> = [];
  const longTasks: Array<[number, number]> = [];
  const rsc: Array<{ path: string; s: number }> = [];
  let errors = 0;
  let lastMut = 0;
  let pending: Pending | null = null;
  /** Set by the teardown handle; late history-wrapper calls become no-ops. */
  let stopped = false;
  /** Pathname before the most recent traversal; kept current while idle. */
  let lastPath = location.pathname;
  const queue: InstantRumSample[] = [];

  const observe = (type: string, cb: (e: PerformanceEntry) => void, extra: Record<string, unknown> = {}) => {
    try {
      const o = new PerformanceObserver((list) => list.getEntries().forEach(cb));
      o.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      observers.push(o);
    } catch {
      // Entry type unsupported in this engine: the field stays null.
    }
  };
  observe("event", (e) => {
    const et = e as PerformanceEventTiming & { interactionId?: number };
    if (!et.interactionId) return;
    const prev = interactions.get(et.interactionId);
    if (!prev || et.duration > prev.d) interactions.set(et.interactionId, { d: et.duration, ps: et.processingStart, pe: et.processingEnd, s: et.startTime });
  }, { durationThreshold: 40 });
  observe("layout-shift", (e) => { const ls = e as PerformanceEntry & { value: number; hadRecentInput: boolean }; if (!ls.hadRecentInput) shifts.push([ls.startTime, ls.value]); });
  observe("long-animation-frame", (e) => loafs.push([e.startTime, e.duration]));
  observe("longtask", (e) => longTasks.push([e.startTime, e.duration]));
  observe("resource", (e) => { if (/[?&]_rsc=/.test(e.name)) { try { rsc.push({ path: new URL(e.name).pathname, s: e.startTime }); } catch { /* ignore */ } } });
  const onError = () => { errors += 1; };
  addEventListener("error", onError);
  addEventListener("unhandledrejection", onError);
  const mo = new MutationObserver(() => {
    lastMut = now();
    const p = pending;
    if (!p) {
      lastPath = location.pathname;
      return;
    }
    if (p.firstMut == null) p.firstMut = lastMut;
    // Detachment is caught even when the node is reinserted before the next
    // frame check (the observer runs after the removal task).
    if (p.shellNode && !p.shellNode.isConnected) p.shellLost = true;
  });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

  const snap = (el: Element) => { const cs = getComputedStyle(el); return STYLE_KEYS.map((k) => cs[k]).join("|"); };

  const deviceClass = (): InstantRumSample["device_class"] => {
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const cores = navigator.hardwareConcurrency;
    if (!mem && !cores) return "unknown";
    if ((mem ?? 8) <= 2 || (cores ?? 8) <= 2) return "low";
    if ((mem ?? 8) <= 4 || (cores ?? 8) <= 4) return "mid";
    return "high";
  };
  const networkClass = () => {
    const c = (navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number } }).connection;
    return c?.effectiveType ? `${c.effectiveType}${c.rtt != null ? `:${Math.round(c.rtt / 50) * 50}` : ""}` : "unknown";
  };
  const sessionBucket = (): InstantRumSample["session_age_bucket"] => {
    const m = (Date.now() - sessionStart) / 60000;
    return m < 5 ? "0-5m" : m < 30 ? "5-30m" : m < 120 ? "30-120m" : "2h+";
  };
  const browser = () => {
    const ua = navigator.userAgent;
    return /Firefox\/(\d+)/.test(ua) ? `firefox-${RegExp.$1}` : /Edg\/(\d+)/.test(ua) ? `edge-${RegExp.$1}` : /Chrome\/(\d+)/.test(ua) ? `chrome-${RegExp.$1}` : /Version\/(\d+).*Safari/.test(ua) ? `safari-${RegExp.$1}` : "other";
  };

  const finish = (p: Pending) => {
    if (p.done) return;
    p.done = true;
    const mapped = options.routeTemplate(location.pathname);
    if (!mapped) {
      errors = 0;
      interactions.clear();
      if (pending === p) pending = null;
      lastPath = location.pathname;
      return;
    }
    const c = p.click;
    let ctuAt = p.readyAt ?? Infinity;
    for (const [s, d] of [...longTasks].sort((a, b) => a[0] - b[0])) if (s <= ctuAt + 50 && s + d > ctuAt) ctuAt = s + d;
    const worst = [...interactions.values()].filter((i) => i.s >= (p.pd ?? c) - 5).sort((a, b) => b.d - a.d)[0];
    const { route, routeClass } = mapped;
    // Attribute only entries that started at or after this interaction's input.
    const since = p.pd ?? c;
    // Identity triple: `route` is EXPECTED (template of the current path).
    // `ui` samples make no identity assertion (their shellAt is a fallback);
    // navigation samples match only when a rendered marker equaled the
    // expectation after the move.
    const isUi = location.pathname === p.fromPath && p.source !== "history";
    const loafSince = loafs.filter(([s]) => s >= since).map(([, d]) => d);
    const cls = shifts.filter(([s]) => s >= since).reduce((sum, [, v]) => sum + v, 0);
    const finalShell = document.querySelector(shellSel);
    queue.push({
      v: 2, release_sha: options.releaseSha, product: options.product, app: options.app,
      source_app: p.sourceApp, target_app: options.targetApp ?? options.app,
      runtime: options.runtime, route, route_class: routeClass,
      browser: browser(), device_class: deviceClass(), network_class: networkClass(), session_age_bucket: sessionBucket(),
      nav_type: isUi ? "ui" : p.navType,
      origin: p.source,
      observed_route: observedRoute(),
      identity_match: isUi ? null : p.shellAt != null,
      prefetched: p.prefetched,
      cta_ms: p.pd != null && p.ack != null ? Math.round(p.ack - p.pd) : null,
      ack_source: p.pd == null ? null : p.ack == null ? "none" : p.ack < c ? "press" : "result",
      ctp_ms: p.firstPaint != null ? Math.round(p.firstPaint - c) : null,
      cts_ms: p.shellAt != null ? Math.round(p.shellAt - c) : null,
      ctu_ms: Number.isFinite(ctuAt) ? Math.round(ctuAt - c) : null,
      ctc_ms: p.shellAt != null ? Math.round(Math.max(lastMut, p.readyAt ?? p.shellAt) - c) : null,
      inp_ms: worst ? Math.round(worst.d) : null,
      input_delay_ms: worst ? Math.round(worst.ps - worst.s) : null,
      processing_ms: worst ? Math.round(worst.pe - worst.ps) : null,
      presentation_ms: worst ? Math.round(worst.s + worst.d - worst.pe) : null,
      cls: Number(cls.toFixed(4)), loaf_count: loafSince.length, loaf_max_ms: Math.round(Math.max(0, ...loafSince)),
      shell_retained: p.shellNode ? !p.shellLost && p.shellMissingFrames === 0 && finalShell === p.shellNode : null,
      fallback_shown: p.fallback, errors,
      flags: options.flags,
    });
    errors = 0; interactions.clear();
    loafs.splice(0, loafs.length - 50); shifts.splice(0, shifts.length - 50); longTasks.splice(0, longTasks.length - 50);
    if (pending === p) pending = null;
    lastPath = location.pathname;
    flush();
  };

  /** Start a measurement; an unfinished older one is superseded (never emitted). */
  const begin = (source: InteractionSource, input: number | null, fromPath: string, navType: InstantRumSample["nav_type"]): Pending | null => {
    if (stopped) return null;
    if (pending && !pending.done) pending.done = true;
    const shellNode = document.querySelector(shellSel);
    const p: Pending = {
      source, pd: input, click: input ?? now(), ack: null, firstMut: null, firstPaint: null, shellAt: null, readyAt: null,
      done: false, looping: false, fromPath, navType, shellNode, shellLost: false, shellMissingFrames: 0,
      prefetched: null, fallback: false, sourceApp: resolveSourceApp(options),
    };
    pending = p;
    return p;
  };

  const watchAck = (p: Pending, target: Element) => {
    const before = snap(target);
    const tick = () => {
      if (p.done || p.ack != null || now() - (p.pd ?? 0) > 600) return;
      if (snap(target) !== before) { p.ack = now(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const loop = (p: Pending) => {
    if (p.looping) return;
    p.looping = true;
    const frame = () => {
      if (p.done) return;
      const t = now();
      // Frames run before a popstate handler, so this is the pre-traversal path.
      lastPath = location.pathname;
      if (p.firstPaint == null && p.firstMut != null) p.firstPaint = t;
      if (document.querySelector('[aria-busy="true"],[data-iex-fallback]')) p.fallback = true;
      if (p.shellNode && !(p.shellNode.isConnected && isRendered(p.shellNode, { requireViewport: false }))) p.shellMissingFrames += 1;
      // A traversal IS the navigation: host popstate listeners may already have
      // re-rendered (and refreshed lastPath) before ours ran, so never gate a
      // history measurement on a path comparison.
      const moved = p.source === "history" || location.pathname !== p.fromPath;
      if (moved) {
        const stage = evaluateDestination(options.routeTemplate(location.pathname)?.route ?? null);
        if (p.shellAt == null && stageAtLeast(stage, "IDENTITY_CORRECT")) p.shellAt = t;
        if (p.readyAt == null && stage === "READY") p.readyAt = t;
      }
      if ((p.readyAt != null && t - Math.max(lastMut, p.readyAt) > 1000) || t - p.click > 15000) { finish(p); return; }
      if (p.firstPaint != null && !moved && p.source !== "history" && t - p.click > 1000) {
        p.shellAt ??= p.firstPaint;
        p.readyAt ??= p.shellAt;
        finish(p);
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  const onPointerDown = (e: PointerEvent) => {
    const target = (e.target as Element | null)?.closest?.(ACTIONABLE);
    if (!target) return;
    const p = begin("pointer", e.timeStamp, location.pathname, "soft");
    if (p) watchAck(p, target);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = (e.target as Element | null)?.closest?.(ACTIONABLE);
    if (!target) return;
    const isLink = target.matches("a[href],[role=link]");
    // Space activates buttons/tabs/menu items; on links it scrolls the page.
    if (e.key === " " && isLink) return;
    const p = begin("keyboard", e.timeStamp, location.pathname, "soft");
    if (!p) return;
    watchAck(p, target);
    // Keyboard activation may navigate without a click (router.push on keydown).
    loop(p);
  };
  const onClick = (e: MouseEvent) => {
    const p = pending;
    if (!p || p.done || p.source === "history") return;
    p.click = e.timeStamp;
    const href = (e.target as Element | null)?.closest?.("a")?.getAttribute("href");
    if (href?.startsWith("/")) { const dest = new URL(href, location.origin).pathname; p.prefetched = rsc.some((r) => r.path === dest && r.s < p.click); }
    loop(p);
  };
  const onPopState = (e: PopStateEvent) => {
    // Back/Forward: no input event; timing starts at the traversal.
    const p = begin("history", null, lastPath, "back_forward");
    if (!p) return;
    p.click = e.timeStamp;
    loop(p);
  };

  /**
   * Pass 2 — programmatic navigation (router.push/replace with no in-flight
   * input) starts its own `programmatic` measurement instead of being
   * invisible or misattributed to a pointer. When an input measurement is
   * already in flight (e.g. a click whose framework router pushes state),
   * the push belongs to that navigation and must NOT supersede it.
   */
  const wrapHistory = (method: "pushState" | "replaceState"): (() => void) => {
    const original = history[method].bind(history);
    const wrapped = (...args: [data: unknown, unused: string, url?: string | URL | null]): void => {
      const before = location.pathname;
      original(...args);
      const p = pending;
      if (p && !p.done && now() - p.click < 1000) return;
      const np = begin("programmatic", null, before, "soft");
      if (np) loop(np);
    };
    history[method] = wrapped as typeof original;
    return () => {
      if (history[method] === wrapped) history[method] = original;
    };
  };
  const unwrapPush = wrapHistory("pushState");
  const unwrapReplace = wrapHistory("replaceState");

  /**
   * R5 source attribution (IE-M2): explicit override wins, else the
   * `ethen_src` query value when it is a bare registry-id token. Anything
   * else (or absent) is null — never trusted content, never PII.
   */
  const resolveSourceApp = (opts: InstantRumOptions): string | null => {
    if (opts.sourceApp) return opts.sourceApp;
    try {
      const src = new URLSearchParams(location.search).get("ethen_src");
      return src && /^[a-z0-9][a-z0-9-]{0,63}$/.test(src) ? src : null;
    } catch {
      return null;
    }
  };
  const flush = () => {
    if (!queue.length) return;
    const body = JSON.stringify(queue.splice(0, Math.min(queue.length, 20)));
    // text/plain keeps sendBeacon a simple request (no CORS preflight) so a
    // cross-origin lab sink can accept it; the body is still JSON.
    const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
    if (!navigator.sendBeacon?.(options.endpoint, blob)) {
      void fetch(options.endpoint, {
        method: "POST",
        body,
        keepalive: true,
        mode: "cors",
        credentials: "omit",
        headers: { "content-type": "application/json" },
      }).catch(() => {});
    }
  };
  const onHidden = () => {
    if (pending && !pending.done) finish(pending);
    flush();
  };
  const onVisibility = () => { if (document.visibilityState === "hidden") onHidden(); };

  addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  addEventListener("keydown", onKeyDown, { capture: true, passive: true });
  addEventListener("click", onClick, { capture: true, passive: true });
  addEventListener("popstate", onPopState);
  document.addEventListener("visibilitychange", onVisibility);
  addEventListener("pagehide", onHidden);

  return () => {
    stopped = true;
    unwrapPush();
    unwrapReplace();
    onHidden();
    observers.forEach((o) => o.disconnect());
    mo.disconnect();
    removeEventListener("pointerdown", onPointerDown, { capture: true });
    removeEventListener("keydown", onKeyDown, { capture: true });
    removeEventListener("click", onClick, { capture: true });
    removeEventListener("popstate", onPopState);
    removeEventListener("error", onError);
    removeEventListener("unhandledrejection", onError);
    document.removeEventListener("visibilitychange", onVisibility);
    removeEventListener("pagehide", onHidden);
  };
}
