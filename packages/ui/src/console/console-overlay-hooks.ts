/**
 * CONSOLE_C2 — DOM behavior for the shared overlay system.
 *
 * Small hooks implementing the semantics in `console-overlays.ts`: focus
 * trap, focus restoration, body scroll lock, outside dismissal, initial
 * focus, and container menu keyboard motion. Every menu, flyout, dialog,
 * palette and drawer in the Console uses these — one behavior, not five.
 */
"use client";

import * as React from "react";
import { moveMenuIndex, type MenuMotionKey } from "./console-overlays";

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => element.getAttribute("aria-hidden") !== "true" && (element as HTMLInputElement).type !== "hidden",
  );
}

/** Trap Tab inside the container while `active`. Only one top modal layer owns focus. */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const node = ref.current;
      if (!node) return;
      const target = event.target as HTMLElement | null;
      /* A top layer above this one owns the event — nested traps never fight. */
      if (!target || !node.contains(target)) return;
      const items = focusableIn(node);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && target === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && target === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture: the trap owns Tab before any inner handler can move it out.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [ref, active]);
}

/** Remember the opener while `active`; restore focus to it on close. */
export function useRestoreFocus(active: boolean): void {
  const trigger = React.useRef<Element | null>(null);
  React.useEffect(() => {
    if (!active) return;
    trigger.current = document.activeElement;
    return () => {
      const element = trigger.current as HTMLElement | null;
      if (element && document.contains(element) && typeof element.focus === "function") {
        element.focus({ preventScroll: true });
      }
      trigger.current = null;
    };
  }, [active]);
}

let scrollLockCount = 0;

/** Lock body scroll while `active`. Nested locks stack; all must release. */
export function useLockBodyScroll(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    scrollLockCount += 1;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) document.body.style.overflow = previous;
    };
  }, [active]);
}

/**
 * Close on pointer-down outside the container. The trigger lives beside the
 * overlay (same anchor parent), so pointer-downs inside the anchor parent —
 * e.g. re-clicking the trigger — are ignored and left to the trigger.
 */
export function useDismissOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = React.useRef(onClose);
  React.useEffect(() => {
    close.current = onClose;
  });
  React.useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const node = ref.current;
      if (!node) return;
      const target = event.target as Node | null;
      if (target && (node.contains(target) || node.parentElement?.contains(target))) return;
      close.current();
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [ref]);
}

/**
 * Focus the first meaningful task control when an overlay opens: the selected
 * item first, else the first enabled item. Falls back to the container.
 */
export function focusFirstTaskControl(
  container: HTMLElement,
  itemSelector = '[role="menuitem"],[role="menuitemradio"],[role="option"]',
): void {
  const selected =
    container.querySelector<HTMLElement>(`${itemSelector}[aria-checked="true"],${itemSelector}[data-current="true"]`) ??
    container.querySelector<HTMLElement>(itemSelector);
  if (selected) {
    selected.focus({ preventScroll: true });
    return;
  }
  const control =
    container.querySelector<HTMLElement>("input,select,textarea") ?? focusableIn(container)[0] ?? container;
  control.focus({ preventScroll: true });
}

export function useInitialFocus(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  itemSelector?: string,
): void {
  React.useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    // After mount so measured/positioned overlays focus the right control.
    const frame = window.requestAnimationFrame(() => focusFirstTaskControl(node, itemSelector));
    return () => window.cancelAnimationFrame(frame);
  }, [ref, active, itemSelector]);
}

/* -------------------------------------------------------- menu keyboard */

const MENU_ITEM_SELECTOR = '[role="menuitem"],[role="menuitemradio"]';

export function menuItemElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].filter(
    (element) => !(element as HTMLButtonElement).disabled && element.getAttribute("aria-disabled") !== "true",
  );
}

function isMenuMotionKey(key: string): key is MenuMotionKey {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

/**
 * One keyboard handler for every menu container: ArrowUp/Down/Home/End move
 * DOM focus between enabled items (wrapping, skipping disabled), Enter/Space
 * activate natively. Attach to the menu container's onKeyDown.
 */
export function useMenuKeyboard() {
  return React.useCallback((event: React.KeyboardEvent) => {
    if (!isMenuMotionKey(event.key)) return;
    const container = event.currentTarget as HTMLElement;
    const items = menuItemElements(container);
    if (items.length === 0) return;
    event.preventDefault();
    const active = document.activeElement as HTMLElement | null;
    const current = active ? items.indexOf(active) : -1;
    const next = moveMenuIndex(items.length, current, event.key, () => false);
    items[next]?.focus();
  }, []);
}
