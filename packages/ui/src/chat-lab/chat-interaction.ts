/**
 * CHAT_A3 — pure interaction helpers with no component, DOM, or style
 * dependencies, so focused tests can import them directly. Anything here
 * must stay free of JSX, CSS, and browser globals at module scope.
 */

export type MenuRect = Readonly<{ top: number; bottom: number; left: number; right: number; width: number }>;
export type MenuSize = Readonly<{ width: number; height: number }>;
export type ViewportSize = Readonly<{ width: number; height: number }>;

export type ResolvedMenuPlacement = Readonly<{
  top: number;
  left: number;
  maxHeight: number;
  placed: "top" | "bottom";
}>;

/**
 * Pure placement: flip to the side with room, shift into the viewport, cap
 * the height so the menu scrolls internally instead of clipping.
 */
export function resolveMenuPlacement({
  trigger,
  menu,
  viewport,
  placement,
  align,
  gap = 8,
}: {
  trigger: MenuRect;
  menu: MenuSize;
  viewport: ViewportSize;
  placement: "top" | "bottom";
  align: "start" | "end";
  gap?: number;
}): ResolvedMenuPlacement {
  const margin = 8;
  const spaceAbove = trigger.top - margin;
  const spaceBelow = viewport.height - trigger.bottom - margin;
  let placed = placement;
  if (placed === "top" && menu.height > spaceAbove && spaceBelow > spaceAbove) placed = "bottom";
  if (placed === "bottom" && menu.height > spaceBelow && spaceAbove >= spaceBelow) placed = "top";
  const available = (placed === "top" ? spaceAbove : spaceBelow) - gap;
  const maxHeight = Math.max(96, Math.min(menu.height, available));
  const width = Math.min(menu.width, viewport.width - margin * 2);
  let left = align === "end" ? trigger.right - width : trigger.left;
  left = Math.max(margin, Math.min(left, viewport.width - width - margin));
  const top = placed === "top" ? trigger.top - gap - maxHeight : trigger.bottom + gap;
  return { top: Math.max(margin, top), left, maxHeight, placed };
}

/**
 * Pure send-on-Enter rule. Touch-primary surfaces (no hardware keyboard
 * assumed) use Enter for a newline and submit from the Send button; desktop
 * keeps Enter-to-send. Shift+Enter and IME composition never submit.
 */
export function shouldSendOnEnter({
  key,
  shiftKey,
  isComposing,
  touchPrimary,
}: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  touchPrimary: boolean;
}): boolean {
  if (key !== "Enter" || shiftKey || isComposing || touchPrimary) return false;
  return true;
}

/** The textarea must never outgrow the visible viewport (keyboard open). */
export function composerInputCap(visibleHeight?: number): number {
  if (visibleHeight === undefined) {
    if (typeof window === "undefined") return 320;
    visibleHeight = window.visualViewport?.height ?? window.innerHeight;
  }
  return Math.min(320, Math.max(96, Math.floor(visibleHeight * 0.32)));
}

export type ComposerNotice = Readonly<{
  title: string;
  detail: string;
  action: string;
  tone: "danger" | "attention";
}>;

/** CHAT_A5.1 — dismissal is per notice instance: a new notice carries a new
 * key, so dismissing one can never suppress its successor. */
export function noticeKeyOf(notice: ComposerNotice): string {
  return [notice.title, notice.detail, notice.action, notice.tone].join("|");
}

/**
 * CHAT_A5.1 — clipboard writes report truthfully. Resolves false when the
 * API is missing or rejects, so no caller may claim Copied it did not earn.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
