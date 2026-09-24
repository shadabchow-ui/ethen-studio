import type { ReactNode } from "react";

/**
 * Ethen icon registry — D05-B icon language.
 *
 * D05-A extracted the 20 navigation marks verbatim; D05-B normalised them to
 * the instrument drawing rules (ICON_RULES.md) and added the seven originals
 * plus the ordinary set. The union is the gate: `NAV_ICONS` is typed
 * `Record<IconName, ReactNode>`, so a union member without an implementation
 * fails `typecheck`, and `getNavIcon` takes `IconName`, so an unknown name
 * fails `typecheck` at every typed call site.
 *
 * Normalisation (moved twenty): 14-unit source art centred in the 24-unit
 * grid via `translate(5 5)` (5 + 14 + 5 = 24), stroke untouched at 1.5px,
 * caps and joins converted to butt/miter. Three fill-based marks
 * (compose, grid, models) are kept verbatim and flagged in ICON_RULES.md
 * finding F1 — redrawing them is an art decision, not a silent normalisation.
 */
export type IconName =
  | "compose"
  | "grid"
  | "star"
  | "clock"
  | "folder"
  | "sessions"
  | "settings"
  | "billing"
  | "project"
  | "files"
  | "search"
  | "git"
  | "tasks"
  | "models"
  | "permissions"
  | "sparkle"
  | "plus"
  | "chats"
  | "terminal"
  | "shield"
  | "authority"
  | "receipt"
  | "evidence"
  | "verification"
  | "judgement"
  | "ground-truth"
  | "thread"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "check";

export const NAV_ICONS: Record<IconName, ReactNode> = {
  compose: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M1.5 10.75V12.5H3.25L10.2 5.55 8.45 3.8 1.5 10.75ZM11.7 4.05a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0L7.69 2.56l2.75 2.75 1.26-1.26Z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  ),
  grid: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
        <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
        <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
        <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
      </g>
    </svg>
  ),
  star: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M7 1.5 8.6 5l3.9.57-2.82 2.74.67 3.87L7 10.08l-3.35 1.76.67-3.87L1.5 5.57 5.4 5 7 1.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>
    </svg>
  ),
  clock: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 4v3.2l2 1.2" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  folder: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M1.5 4A1.5 1.5 0 0 1 3 2.5H5.5L7 4H11A1.5 1.5 0 0 1 12.5 5.5v5A1.5 1.5 0 0 1 11 12H3A1.5 1.5 0 0 1 1.5 10.5V4Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>
    </svg>
  ),
  sessions: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M2 3h10a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H7.5L5 12V10H2a.5.5 0 0 1-.5-.5v-6A.5.5 0 0 1 2 3Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  billing: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <rect x="1.5" y="3" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M1.5 6h11" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  project: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  files: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M3 1.5h5l2.5 2.5V12.5H3V1.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M8 1.5V4h2.5" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  search: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9.25 9.25L12 12" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  git: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <circle cx="4" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="4" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 4.5v5M4 4.5C4 7 10 7 10 5" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  tasks: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M2 4h10M2 7h7M2 10h5" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  models: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M7 1.5 12.5 7 7 12.5 1.5 7 7 1.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
      </g>
    </svg>
  ),
  permissions: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <rect x="3" y="6" width="8" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 6V4.5a2 2 0 0 1 4 0V6" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  sparkle: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M7 1.5L8.2 5l3.3.5-2.4 2.3.6 3.2L7 9.3l-2.7 1.7.6-3.2L2.5 5.5 5.8 5 7 1.5Z" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  plus: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  chats: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M2 2.5h10a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H7.5L5 12V9.5H2a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>
    </svg>
  ),
  terminal: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <rect x="1.5" y="2.5" width="11" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 5.5l2 2-2 2M7.5 9.5h2.5" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  shield: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(5 5)">
        <path d="M7 1.5 2 3.5v3c0 3.2 2.2 6 5 6.5 2.8-.5 5-3.3 5-6.5v-3L7 1.5Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 7.5 6.8 9 9 5.5" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  ),
  authority: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v10M9.5 9.5h5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  receipt: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6.5 3.5h11v17l-2.2-1.6-2.2 1.6-2.2-1.6-2.2 1.6-2.2-1.6V3.5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 8.5h5M9.5 12h5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  evidence: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14.5 14.5 20 20" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 21.5h18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  verification: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3.5v17" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 12.5 10 18 19.5 7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  judgement: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 4v16M8.5 20.5h7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7l-2 6M5 7l2 6M19 7l-2 6M19 7l2 6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  "ground-truth": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2.5v3M4.5 10h3M16.5 10h3M12 14.5v3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 20.5h16M6.5 20.5 5 22.5M11 20.5 9.5 22.5M15.5 20.5 14 22.5M20 20.5l-1.5 2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  thread: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="16.5" cy="5.5" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.2 6.8 8.5 13.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 13.5c-3 1-4.5 3.5-4 6.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  "chevron-down": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9.5 12 15 18 9.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  "chevron-left": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M14.5 6 9 12l5.5 6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  "chevron-right": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9.5 6 15 12l-5.5 6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  close: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  check: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4.5 12.5 10 18 19.5 7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

/**
 * Typed lookup over the registry. `name` is `IconName`, so passing a name
 * absent from the union is a compile error at the call site — no silent
 * fallback exists anywhere on this path by design.
 */
export function getNavIcon(name: IconName): ReactNode {
  return NAV_ICONS[name];
}
