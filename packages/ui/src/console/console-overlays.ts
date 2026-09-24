/**
 * CONSOLE_C2 — one shared overlay interaction model.
 *
 * Workspace menu, account menu, collapsed-rail flyouts, the command palette,
 * dialogs, the mobile drawer, filter controls and row menus all share these
 * semantics: menu keyboard motion, viewport collision (flip/shift/clamp),
 * top-layer Escape ownership, and narrow rail-preference persistence.
 *
 * Pure TypeScript: no React, no DOM, no CSS. Vitest (node) safe. DOM behavior
 * built on these lives in `console-overlay-hooks.ts`.
 */

export type MenuMotionKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/**
 * Next highlighted menu index for ArrowUp/Down/Home/End. Wraps around the
 * list and skips disabled items; a current index of -1 means focus is not on
 * an item yet (ArrowDown/Home land on the first enabled item, ArrowUp/End on
 * the last). Returns `current` when nothing is selectable.
 */
export function moveMenuIndex(
  count: number,
  current: number,
  key: MenuMotionKey,
  isDisabled: (index: number) => boolean,
): number {
  if (count <= 0) return current;
  const enabled = (index: number) => index >= 0 && index < count && !isDisabled(index);
  if (key === "Home" || (key === "ArrowDown" && current < 0)) {
    for (let index = 0; index < count; index += 1) if (enabled(index)) return index;
    return current;
  }
  if (key === "End" || (key === "ArrowUp" && current < 0)) {
    for (let index = count - 1; index >= 0; index -= 1) if (enabled(index)) return index;
    return current;
  }
  const step = key === "ArrowDown" ? 1 : -1;
  for (let hop = 1; hop <= count; hop += 1) {
    const candidate = (current + step * hop + count * hop) % count;
    if (enabled(candidate)) return candidate;
  }
  return current;
}

/* ------------------------------------------------------------ collision */

export type OverlayAnchor = Readonly<{ top: number; bottom: number; left: number; right: number }>;
export type OverlaySize = Readonly<{ width: number; height: number }>;
export type OverlayViewport = Readonly<{ width: number; height: number }>;

export type PlacedOverlay = Readonly<{
  top: number;
  left: number;
  /** Which side of the anchor the overlay ended up on. */
  placement: "below" | "above";
  /** Clamp the overlay's own max-height to this when space is tight. */
  maxHeight: number | null;
}>;

const OVERLAY_MARGIN = 8;

/**
 * Anchor an overlay below its trigger, flipping above when it would overflow
 * the viewport, shifting horizontally to stay inside, and clamping height
 * when neither side fits. Never returns a position outside the viewport
 * margin — menus stay reachable instead of sliding under the chrome.
 */
export function placeOverlay(
  anchor: OverlayAnchor,
  size: OverlaySize,
  viewport: OverlayViewport,
  preferred: "below" | "above" = "below",
): PlacedOverlay {
  const margin = OVERLAY_MARGIN;
  const roomBelow = viewport.height - margin - anchor.bottom;
  const roomAbove = anchor.top - margin;
  const fitsBelow = size.height <= roomBelow;
  const fitsAbove = size.height <= roomAbove;

  let placement: "below" | "above" = preferred;
  if (preferred === "below" && !fitsBelow && fitsAbove) placement = "above";
  if (preferred === "above" && !fitsAbove && fitsBelow) placement = "below";

  let maxHeight: number | null = null;
  if (placement === "below" && !fitsBelow && !fitsAbove) {
    maxHeight = Math.max(96, roomBelow >= roomAbove ? roomBelow : roomAbove);
    placement = roomBelow >= roomAbove ? "below" : "above";
  }

  const top =
    placement === "below"
      ? Math.min(anchor.bottom, viewport.height - margin - (maxHeight ?? size.height))
      : Math.max(margin, anchor.top - (maxHeight ?? size.height));

  const width = Math.min(size.width, viewport.width - margin * 2);
  const left = Math.max(margin, Math.min(anchor.left, viewport.width - margin - width));

  return { top: Math.max(margin, top), left, placement, maxHeight };
}

/**
 * Clamp a viewport-anchored flyout (already measured) so it stays fully
 * inside the viewport after rail scroll or window resize.
 */
export function clampFlyout(
  top: number,
  left: number,
  size: OverlaySize,
  viewport: OverlayViewport,
): Readonly<{ top: number; left: number }> {
  const margin = OVERLAY_MARGIN;
  return {
    top: Math.max(margin, Math.min(top, viewport.height - margin - size.height)),
    left: Math.max(margin, Math.min(left, viewport.width - margin - size.width)),
  };
}

/* ------------------------------------------------------ top-layer Escape */

export type OpenLayers = Readonly<{
  dialog: boolean;
  palette: boolean;
  menu: boolean;
  flyout: boolean;
  drawer: boolean;
}>;

export type EscapeTarget = "dialog" | "palette" | "menu" | "flyout" | "drawer" | "none";

/**
 * Escape closes the TOP layer only: dialog before palette before menu/flyout
 * before drawer. One modal layer owns focus; nothing underneath moves.
 */
export function resolveEscapeAction(open: OpenLayers): EscapeTarget {
  if (open.dialog) return "dialog";
  if (open.palette) return "palette";
  if (open.menu) return "menu";
  if (open.flyout) return "flyout";
  if (open.drawer) return "drawer";
  return "none";
}

/* ---------------------------------------------------------- preferences */

export type ConsoleRailPreferences = Readonly<{
  collapsed?: boolean;
  openGroups?: readonly string[];
}>;

const RAIL_PREFERENCE_KEY = "ethen-console:rail-v1";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storageOrNull(storage?: PreferenceStorage): PreferenceStorage | null {
  if (storage) return storage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* storage unavailable — preferences stay in memory */
  }
  return null;
}

/** Narrow local persistence for collapse/group preference. Never throws. */
export function loadConsolePreferences(storage?: PreferenceStorage): ConsoleRailPreferences {
  const store = storageOrNull(storage);
  if (!store) return {};
  try {
    const raw = store.getItem(RAIL_PREFERENCE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    const out: { collapsed?: boolean; openGroups?: readonly string[] } = {};
    if (typeof record.collapsed === "boolean") out.collapsed = record.collapsed;
    if (Array.isArray(record.openGroups)) {
      const groups = record.openGroups.filter((entry): entry is string => typeof entry === "string").slice(0, 12);
      out.openGroups = groups;
    }
    return out;
  } catch {
    return {};
  }
}

/** Narrow local persistence for collapse/group preference. Never throws. */
export function saveConsolePreferences(preferences: ConsoleRailPreferences, storage?: PreferenceStorage): void {
  const store = storageOrNull(storage);
  if (!store) return;
  try {
    store.setItem(RAIL_PREFERENCE_KEY, JSON.stringify(preferences));
  } catch {
    /* storage unavailable or full — the session simply does not persist */
  }
}
