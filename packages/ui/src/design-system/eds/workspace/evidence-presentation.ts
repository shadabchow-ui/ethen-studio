"use client";

/**
 * EDS evidence presentation authority — D11 (G7 remediation).
 *
 * The single source of truth for which Evidence presentation is live at a
 * given viewport. Both the CSS breakpoints and the DOM state read these
 * numbers, so `data-evidence-presentation` can never claim "overlay" while
 * CSS is painting a sheet.
 *
 *   >=1600      rail    persistent 404px third column
 *   1280–1599   rail    persistent 320px third column
 *   1024–1279   overlay right-side panel over the Workspace
 *   <1024       sheet   bottom sheet
 *
 * Below 1280 the rail is NOT a column: it must never become another child of
 * the horizontal Workspace row, because that steals width from Work. The
 * persistent affordance lives in the Workspace header instead.
 */
import * as React from "react";
import type { EvidencePresentation } from "./EvidenceRail";

/** Persistent third column at and above this width. */
export const EVIDENCE_RAIL_MIN_WIDTH = 1280;
/** Rail widens from 320px to 404px at and above this width. */
export const EVIDENCE_RAIL_WIDE_WIDTH = 1600;
/** Overlay presentation at and above this width; sheet below it. */
export const EVIDENCE_OVERLAY_MIN_WIDTH = 1024;

export const EVIDENCE_RAIL_QUERY = `(min-width: ${EVIDENCE_RAIL_MIN_WIDTH}px)`;
export const EVIDENCE_OVERLAY_QUERY = `(min-width: ${EVIDENCE_OVERLAY_MIN_WIDTH}px)`;

/**
 * Resolve the presentation for an exact viewport width. Pure, so the
 * validator and the runtime tests can assert the same boundaries the browser
 * evaluates.
 */
export function presentationForWidth(width: number): EvidencePresentation {
  if (width >= EVIDENCE_RAIL_MIN_WIDTH) return "rail";
  if (width >= EVIDENCE_OVERLAY_MIN_WIDTH) return "overlay";
  return "sheet";
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const queries = [window.matchMedia(EVIDENCE_RAIL_QUERY), window.matchMedia(EVIDENCE_OVERLAY_QUERY)];
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}

function readPresentation(): EvidencePresentation {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "rail";
  if (window.matchMedia(EVIDENCE_RAIL_QUERY).matches) return "rail";
  if (window.matchMedia(EVIDENCE_OVERLAY_QUERY).matches) return "overlay";
  return "sheet";
}

/**
 * The server has no viewport, so it renders the persistent rail: the widest,
 * most complete presentation. The client corrects on hydration through the
 * same media queries the stylesheet uses, which is what keeps the DOM claim
 * and the painted presentation identical.
 */
function serverPresentation(): EvidencePresentation {
  return "rail";
}

export function useEvidencePresentation(): EvidencePresentation {
  return React.useSyncExternalStore(subscribe, readPresentation, serverPresentation);
}
