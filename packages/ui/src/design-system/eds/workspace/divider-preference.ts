"use client";

/**
 * EDS workspace divider persistence — D10 candidate.
 *
 * Presentation-layer preference adapter only: the user's preferred split
 * conversation width, in fixed pixels, persisted to namespaced localStorage.
 * There is no server side, no user record, no sync — the boundary is the
 * load/save pair below. Widths clamp to the D10 fixed-width family so a
 * stale or foreign value can never squeeze the conversation column.
 */

export const DIVIDER_MIN_WIDTH = 340;
export const DIVIDER_MAX_WIDTH = 420;
export const DIVIDER_DEFAULT_WIDTH = 380;
export const DIVIDER_STEP = 20;

const STORAGE_KEY = "ethen:eds-workspace:divider-width";

export function clampDividerWidth(width: number): number {
  if (!Number.isFinite(width)) return DIVIDER_DEFAULT_WIDTH;
  return Math.min(DIVIDER_MAX_WIDTH, Math.max(DIVIDER_MIN_WIDTH, Math.round(width)));
}

export function loadDividerWidth(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return null;
    return clampDividerWidth(parsed);
  } catch {
    return null;
  }
}

export function saveDividerWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clampDividerWidth(width)));
  } catch {
    // Storage unavailable (private mode / quota) — persistence is best-effort.
  }
}
