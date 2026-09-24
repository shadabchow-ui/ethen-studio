/**
 * IE-M5 M5-01 — Next.js route-change binding (client boundary).
 *
 * Mounts the single polite announcement region and, after each committed
 * navigation: updates document.title, moves focus to the destination h1,
 * restores trigger focus on Back/Forward when recorded. Title announcement
 * relies on next-route-announcer — this binding never announces titles, only
 * explicit state transitions passed via `announcement`.
 *
 * Pass 3: focus waits (bounded) for the DESTINATION's marked heading when
 * the pathname commits before it mounts, instead of focusing the departed
 * route's heading or a persistent chrome h1. See `selectDestinationHeading`.
 */
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  announceOnce,
  focusStillUnclaimed,
  restoreTriggerFocus,
  selectDestinationHeading,
  updateDocumentTitle,
  type DestinationHeadingQuery,
  type RouteHeadingCandidate,
} from "./route-focus";

/** Upper bound on waiting for a streamed destination heading. */
export const ROUTE_HEADING_WAIT_MS = 2000;

export interface EthenRouteFocusProps {
  /** Document title to write on commit; omit to leave titles to route metadata. */
  title?: string;
  /** State-transition message only (thinking/responding/complete); never prose. */
  announcement?: string | null;
  /** Element id that triggered the navigation (Back/Forward restore). */
  triggerId?: string | null;
  regionId?: string;
}

function isVisible(el: RouteHeadingCandidate): boolean {
  const r = (el as unknown as Element).getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

const liveDocument = (): DestinationHeadingQuery => ({
  querySelectorAll: (s) => document.querySelectorAll(s) as unknown as ArrayLike<RouteHeadingCandidate>,
  querySelector: (s) => document.querySelector(s) as unknown as RouteHeadingCandidate | null,
});

export function EthenRouteFocus({ title, announcement, triggerId, regionId = "ethen-route-status" }: EthenRouteFocusProps): React.JSX.Element {
  const pathname = usePathname();
  const regionRef = useRef<HTMLDivElement | null>(null);
  const last = useRef<{ message: string | null }>({ message: null });
  const previous = useRef<unknown>(null);
  const usesMarkers = useRef(false);

  useEffect(() => {
    if (title !== undefined) updateDocumentTitle(document, title);
    if (restoreTriggerFocus(document, triggerId ?? null)) return;

    const atCommit = document.activeElement;
    const focusHeading = (heading: RouteHeadingCandidate | null): void => {
      if (!heading || !isVisible(heading)) return;
      if (!focusStillUnclaimed(document.activeElement, atCommit, document.body, (el) => !(el as Node).isConnected)) return;
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: false });
      previous.current = heading;
      usesMarkers.current = heading.getAttribute("data-iex-route") !== null;
    };

    const attempt = (): boolean => {
      const result = selectDestinationHeading(liveDocument(), window.location.pathname, previous.current, usesMarkers.current, isVisible);
      if (result.kind === "wait") return false;
      focusHeading(result.heading);
      return true;
    };
    if (attempt()) return;

    let done = false;
    const stop = (): void => {
      done = true;
      observer.disconnect();
      window.clearTimeout(timer);
    };
    const observer = new MutationObserver(() => {
      if (!done && attempt()) stop();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-iex-route"] });
    // Bounded: a destination that never marks a heading must not keep an
    // observer alive; after the cap, the first visible h1 is the contract.
    const timer = window.setTimeout(() => {
      if (done) return;
      stop();
      const doc = liveDocument();
      focusHeading(doc.querySelector("h1[data-iex-route]") ?? doc.querySelector("h1"));
    }, ROUTE_HEADING_WAIT_MS);
    return stop;
  }, [pathname, title, triggerId]);

  useEffect(() => {
    if (regionRef.current) announceOnce(regionRef.current, announcement ?? null, last.current);
  }, [announcement]);

  return (
    <div
      id={regionId}
      ref={regionRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}
    />
  );
}
