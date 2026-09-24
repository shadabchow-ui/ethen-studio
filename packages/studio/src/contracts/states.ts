/** Studio V5 kernel — explicit UI states + screenshot conventions for UI owners. */
import type { ApiError } from "./errors";

export type LoadStateKind =
  | "loading"
  | "empty"
  | "blocked"
  | "forbidden"
  | "setup_required"
  | "error"
  | "offline"
  | "partial"
  | "ready";

export interface LoadState<T> {
  kind: LoadStateKind;
  data: T | null;
  error: ApiError | null;
  actionLabel: string | null;
}

export function loadingState<T>(): LoadState<T> {
  return { kind: "loading", data: null, error: null, actionLabel: null };
}
export function readyState<T>(data: T): LoadState<T> {
  return { kind: "ready", data, error: null, actionLabel: null };
}
export function errorState<T>(error: ApiError, actionLabel: string | null = "Retry"): LoadState<T> {
  return { kind: "error", data: null, error, actionLabel };
}

/** Screenshot output conventions consumed by V-ui harnesses. */
export const SCREENSHOT_WIDTHS = [375, 430, 768, 1440] as const;
export const SCREENSHOT_THEMES = ["light", "dark"] as const;
export type ScreenshotWidth = (typeof SCREENSHOT_WIDTHS)[number];
export type ScreenshotTheme = (typeof SCREENSHOT_THEMES)[number];

export function screenshotName(
  job: string,
  state: LoadStateKind,
  width: ScreenshotWidth,
  theme: ScreenshotTheme,
): string {
  return `studio-v5-${job}-${state}-${width}px-${theme}.png`;
}
