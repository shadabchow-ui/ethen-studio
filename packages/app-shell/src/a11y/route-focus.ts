/**
 * IE-M5 M5-01 — Route-change handler core (framework-free, Standard §14.1).
 *
 * After commit: document.title = page title; focus moves to the destination
 * h1[tabindex=-1] once mounted and visible; Back/Forward restores focus to
 * the triggering element when it exists. Announcements go through ONE polite
 * region; title announcements rely on next-route-announcer where present —
 * this core never adds a second one. Reduced-motion safe (instant focus,
 * never smooth scroll).
 */

export interface FocusableElement {
  setAttribute(name: string, value: string): void;
  focus(options?: { preventScroll?: boolean }): void;
}

export interface RouteDocument {
  title: string;
  activeElement: unknown;
  querySelector(selector: string): (FocusableElement & { isVisible?: boolean }) | null;
  getElementById(id: string): FocusableElement | null;
}

export function findRouteHeading(doc: RouteDocument): (FocusableElement & { isVisible?: boolean }) | null {
  return doc.querySelector("h1[data-iex-route]") ?? doc.querySelector("h1");
}

export function focusRouteHeading(doc: RouteDocument): boolean {
  const heading = findRouteHeading(doc);
  if (!heading) return false;
  if (heading.isVisible === false) return false;
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: false });
  return doc.activeElement === heading;
}

export interface RouteHeadingCandidate extends FocusableElement {
  getAttribute(name: string): string | null;
}

export interface DestinationHeadingQuery {
  querySelectorAll(selector: string): ArrayLike<RouteHeadingCandidate>;
  querySelector(selector: string): RouteHeadingCandidate | null;
}

export type DestinationHeadingResult =
  /** A destination heading is mounted and visible: focus it now. */
  | { kind: "ready"; heading: RouteHeadingCandidate }
  /** The app marks route headings but the destination's has not mounted
   * yet (only the departed route's, or none): wait for a DOM change. */
  | { kind: "wait" }
  /** The app does not mark route headings: the first h1 is the contract. */
  | { kind: "unmarked"; heading: RouteHeadingCandidate | null };

/** Segment match of a route template (`[param]`, `[...rest]`) against a path. */
export function routeTemplateMatchesPath(template: string, path: string): boolean {
  const t = template.split("/").filter(Boolean);
  const p = path.split("?")[0]!.split("/").filter(Boolean);
  for (let i = 0; i < t.length; i += 1) {
    const seg = t[i]!;
    if (/^\[\.\.\..+\]$/.test(seg)) return p.length > i;
    if (/^\[\[\.\.\..+\]\]$/.test(seg)) return true;
    if (p[i] === undefined) return false;
    if (/^\[.+\]$/.test(seg)) continue;
    if (seg !== p[i]) return false;
  }
  return t.length === p.length;
}

/**
 * Pass 3 — destination-aware heading selection (Standard §14.1 "once
 * mounted and visible").
 *
 * The route-change effect runs when the pathname commits, which can be
 * before the destination's `h1[data-iex-route]` streams in. Falling back to
 * the first `h1` there focused persistent chrome headings (Designer topbar)
 * on keyboard navigation — reproduced live on the first cert-host run.
 *
 * A marked heading is the destination's when its template matches the new
 * pathname, or when it is a node other than the one focused for the departed
 * route (fresh content). The departed node with a non-matching template is
 * stale and skipped. Apps whose prior route resolved to a marked heading
 * wait for the destination's; unmarked apps keep first-h1 with no delay.
 */
export function selectDestinationHeading(
  doc: DestinationHeadingQuery,
  pathname: string,
  previousNode: unknown,
  appUsesMarkers: boolean,
  isVisible: (heading: RouteHeadingCandidate) => boolean,
): DestinationHeadingResult {
  const marked = Array.from(doc.querySelectorAll("h1[data-iex-route]")).filter(isVisible);
  const exact = marked.find((h) => routeTemplateMatchesPath(h.getAttribute("data-iex-route") ?? "", pathname));
  if (exact) return { kind: "ready", heading: exact };
  const fresh = marked.find((h) => h !== previousNode);
  if (fresh) return { kind: "ready", heading: fresh };
  const first = doc.querySelector("h1");
  const unmarked: DestinationHeadingResult = { kind: "unmarked", heading: first && isVisible(first) ? first : null };
  // The destination has arrived but marks its identity on a non-heading
  // element (e.g. Studio generator label): no marked h1 will come, so keep
  // first-h1 behavior now instead of waiting out the cap.
  const nonHeadingIdentity = Array.from(doc.querySelectorAll("[data-iex-route]")).some(
    (el) => isVisible(el) && routeTemplateMatchesPath(el.getAttribute("data-iex-route") ?? "", pathname),
  );
  if (nonHeadingIdentity) return unmarked;
  if (appUsesMarkers || marked.length > 0) return { kind: "wait" };
  return unmarked;
}

/** Focus may move to the heading only if the user has not moved it since
 * the navigation committed (no focus theft from inputs mid-wait). */
export function focusStillUnclaimed(
  active: unknown,
  atCommit: unknown,
  body: unknown,
  isDetached: (el: unknown) => boolean,
): boolean {
  return active == null || active === body || active === atCommit || isDetached(active);
}

export function updateDocumentTitle(doc: { title: string }, title: string): void {
  doc.title = title;
}

/**
 * Single-announcement writer: writes only when the message differs from the
 * last one routed through this region. Returns true when announced.
 */
export function announceOnce(
  region: { textContent: string | null },
  message: string | null,
  last: { message: string | null },
): boolean {
  if (message == null || message === "" || message === last.message) return false;
  last.message = message;
  region.textContent = "";
  region.textContent = message;
  return true;
}

export function restoreTriggerFocus(doc: RouteDocument, triggerId: string | null): boolean {
  if (!triggerId) return false;
  const trigger = doc.getElementById(triggerId);
  if (!trigger) return false;
  trigger.focus({ preventScroll: false });
  return doc.activeElement === trigger;
}

export function prefersReducedMotion(matchMediaFn?: (query: string) => { matches: boolean }): boolean {
  try {
    const matcher =
      matchMediaFn ?? (typeof matchMedia === "function" ? matchMedia : null);
    if (!matcher) return false;
    return matcher("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
