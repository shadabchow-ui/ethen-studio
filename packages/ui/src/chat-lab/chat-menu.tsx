"use client";

/**
 * CHAT_A1/A3 — the one menu primitive every Chat popup uses.
 *
 * Composer attachment, Tools, model, conversation `…`, account and rail-row
 * menus are ALL this component. Building each popup separately is how a shell
 * ends up with five different focus behaviours and four different Escape
 * conventions, so there is exactly one here.
 *
 * Semantics: a real `<button aria-haspopup="menu" aria-expanded>` owns a real
 * `role="menu"` whose items are `menuitem` (actions), `menuitemradio` (model /
 * intelligence — one choice per group) or `menuitemcheckbox` (tools — many).
 * Selection state is `aria-checked`, never a visual checkmark alone. Arrow
 * keys move, Home/End jump, Escape closes and RETURNS FOCUS to the trigger, a
 * pointer press outside closes, Tab closes onto the trigger, and focus moves
 * to the selected item (or the first) on open. Nothing here is hover-only.
 *
 * CHAT_A3 positioning: the menu portals to `document.body` and is fixed
 * against the trigger rect with flip + shift + a capped max-height, so menus
 * inside scroll containers (rail rows) or near viewport edges (390px) never
 * clip. Scroll or resize while open closes the menu — a stale fixed popup is
 * worse than a closed one.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import {
  resolveMenuPlacement,
  type MenuRect,
  type MenuSize,
  type ResolvedMenuPlacement,
  type ViewportSize,
} from "./chat-interaction";
import styles from "./chat-menu.module.css";

export type { MenuRect, MenuSize, ResolvedMenuPlacement, ViewportSize };
export { resolveMenuPlacement };

export type MenuSelectMode = "action" | "radio" | "checkbox";

export type ChatMenuItem = Readonly<{
  id: string;
  label: string;
  detail?: string;
  /** Rendered as a check on the right — a selected model, an active tool. */
  selected?: boolean;
  disabled?: boolean;
  tone?: "default" | "danger";
}>;

export type ChatMenuGroup = Readonly<{
  label?: string;
  /** action (default) closes on pick; radio picks one and closes; checkbox toggles and stays open. */
  selectMode?: MenuSelectMode;
  items: readonly ChatMenuItem[];
}>;

function itemRole(mode: MenuSelectMode): "menuitem" | "menuitemradio" | "menuitemcheckbox" {
  if (mode === "radio") return "menuitemradio";
  if (mode === "checkbox") return "menuitemcheckbox";
  return "menuitem";
}

export function ChatMenu({
  label,
  trigger,
  groups,
  align = "start",
  placement = "top",
  footer,
  open,
  onOpenChange,
  onSelect,
  triggerClassName,
  menuClassName,
}: {
  /** Accessible name of the trigger. */
  label: string;
  trigger: React.ReactNode;
  groups: readonly ChatMenuGroup[];
  align?: "start" | "end";
  placement?: "top" | "bottom";
  footer?: React.ReactNode;
  /** Controlled openness — specimens mount a menu already open. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect?: (id: string) => void;
  triggerClassName?: string;
  menuClassName?: string;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(false);
  const isOpen = open ?? uncontrolled;
  const setOpen = React.useCallback(
    (next: boolean) => {
      setUncontrolled(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = React.useState<ResolvedMenuPlacement | null>(null);
  const [portalTarget, setPortalTarget] = React.useState<Element | null>(null);

  const focusItem = React.useCallback((index: number) => {
    const nodes = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)',
    );
    if (!nodes || nodes.length === 0) return;
    const bounded = (index + nodes.length) % nodes.length;
    nodes[bounded]?.focus();
  }, []);

  // Measure on open: trigger rect + real menu size into the pure placer.
  // Until measured, the portal stays hidden so no frame flashes unplaced.
  React.useLayoutEffect(() => {
    // Closed menus unmount; on reopen this recomputes synchronously before
    // paint, so no frame ever shows a stale position.
    if (!isOpen) return;
    const triggerNode = triggerRef.current;
    const menuNode = menuRef.current;
    if (!triggerNode || !menuNode || typeof window === "undefined") return;
    const rect = triggerNode.getBoundingClientRect();
    const size = { width: Math.max(menuNode.offsetWidth, 216), height: Math.max(menuNode.offsetHeight, 96) };
    setGeometry(
      resolveMenuPlacement({
        trigger: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width },
        menu: size,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        placement,
        align,
      }),
    );
    // Land on the selected item for radio/checkbox groups, else the first.
    const frame = requestAnimationFrame(() => {
      const nodes = Array.from(
        menuNode.querySelectorAll<HTMLButtonElement>(
          '[role="menuitemradio"][aria-checked="true"], [role="menuitemcheckbox"][aria-checked="true"]',
        ),
      );
      if (nodes.length > 0) nodes[0].focus();
      else focusItem(0);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, placement, align, focusItem, groups, portalTarget]);

  // A fixed popup must not survive the scroll/resize that moved its anchor.
  React.useEffect(() => {
    if (!isOpen) return;
    const dismiss = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [isOpen, setOpen]);

  const close = React.useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    },
    [setOpen],
  );

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)',
      ) ?? [],
    );
    const current = nodes.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(current - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(nodes.length - 1);
    } else if (event.key === "Tab") {
      // Predictable landing: close onto the trigger and let the next Tab
      // continue from there, instead of dropping focus when the item unmounts.
      event.preventDefault();
      close(true);
    }
  };

  // CHAT_A4.1 — the portal must stay INSIDE the `[data-ethen-chat]` token
  // scope. Portaling to document.body orphaned the menu from every --chat-*
  // token, so --chat-overlay resolved to nothing and page content showed
  // through. Fixed positioning still escapes scroll containers from in-scope.
  // Resolved in an effect (never during render): the open effect below
  // re-renders once mounted, then measurement runs against the live node.
  React.useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    setPortalTarget(triggerRef.current?.closest("[data-ethen-chat]") ?? document.body);
  }, [isOpen]);

  const menu =
    isOpen && portalTarget ? (
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        data-placement={geometry?.placed ?? placement}
        data-align={align}
        data-chat-menu-portal="true"
        className={[styles.menu, styles.portal, menuClassName].filter(Boolean).join(" ")}
        style={
          geometry
            ? { top: geometry.top, left: geometry.left, maxHeight: geometry.maxHeight, visibility: "visible" }
            : { visibility: "hidden" }
        }
        onKeyDown={onMenuKeyDown}
      >
        {groups.map((group, groupIndex) => {
          const mode = group.selectMode ?? "action";
          const role = itemRole(mode);
          return (
            <div className={styles.group} key={group.label ?? `group-${groupIndex}`}>
              {group.label ? (
                <p className={styles.groupLabel} role="presentation">
                  {group.label}
                </p>
              ) : null}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role={role}
                  aria-checked={role === "menuitem" ? undefined : item.selected === true}
                  className={styles.item}
                  data-tone={item.tone ?? "default"}
                  data-selected={item.selected ? "true" : undefined}
                  disabled={item.disabled}
                  onClick={(event) => {
                    onSelect?.(item.id);
                    if (mode === "checkbox") {
                      // Multi-select: the menu stays open and focus stays on
                      // the toggled item so a run of picks needs no re-entry.
                      event.currentTarget.focus();
                    } else {
                      close(true);
                    }
                  }}
                >
                  <span className={styles.itemText}>
                    <span className={styles.itemLabel}>{item.label}</span>
                    {item.detail ? <span className={styles.itemDetail}>{item.detail}</span> : null}
                  </span>
                  {item.selected ? (
                    <span className={styles.itemCheck} aria-hidden="true">
                      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="butt" strokeLinejoin="miter">
                        <path d="m5 12.5 4.5 4.5L19 7" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          );
        })}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    ) : null;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={[styles.trigger, triggerClassName].filter(Boolean).join(" ")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={() => setOpen(!isOpen)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {portalTarget ? createPortal(menu, portalTarget) : null}
    </div>
  );
}
