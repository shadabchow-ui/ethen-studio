"use client";

/**
 * EDS Sidebar — D09 candidate.
 *
 * Quiet architectural navigation: Lapis wash + 2px structural marker +
 * weight shift for the active item, never a filled pill and never color
 * alone. Inline (expanded / collapsed rail) and drawer variants share one
 * item model. Icons resolve through the canonical icon authority.
 */
import * as React from "react";
import { useOverlay } from "../../../overlay";
import { Icon, type IconName } from "../../../icons";

export interface EdsSidebarItem {
  id: string;
  label: string;
  icon: IconName;
  href?: string;
  badge?: string;
  badgeLabel?: string;
  children?: readonly EdsSidebarItem[];
}

export interface EdsSidebarProps {
  items: readonly EdsSidebarItem[];
  activeItemId?: string;
  collapsed?: boolean;
  onNavigate?: (item: EdsSidebarItem) => void;
  onToggleCollapse?: () => void;
  variant?: "inline" | "drawer";
  open?: boolean;
  onClose?: () => void;
  ariaLabel?: string;
  className?: string;
  hiddenOnNarrow?: boolean;
}

function SidebarRow({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: EdsSidebarItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: (item: EdsSidebarItem) => void;
}) {
  return (
    <a
      href={item.href ?? "#"}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={["eds-sidebar__row", active ? "eds-sidebar__row--active" : ""].join(" ")}
      onClick={
        onNavigate
          ? (event) => {
              if (!item.href || item.href === "#") event.preventDefault();
              onNavigate(item);
            }
          : undefined
      }
    >
      <span aria-hidden className="eds-sidebar__marker" />
      <span aria-hidden className="eds-sidebar__icon">
        <Icon name={item.icon} size={16} />
      </span>
      {collapsed ? null : <span className="eds-sidebar__label">{item.label}</span>}
      {collapsed || !item.badge ? null : (
        <span className="eds-sidebar__badge" aria-label={item.badgeLabel ?? item.badge}>
          {item.badge}
        </span>
      )}
    </a>
  );
}

export function EdsSidebar({
  items,
  activeItemId,
  collapsed = false,
  onNavigate,
  onToggleCollapse,
  variant = "inline",
  open = false,
  onClose = () => {},
  ariaLabel = "Primary",
  className,
  hiddenOnNarrow = false,
}: EdsSidebarProps) {
  const { ref, onBackdropMouseDown } = useOverlay(variant === "drawer" && open, onClose);

  const body = (
    <nav
      aria-label={variant === "drawer" ? `${ariaLabel} (dialog)` : ariaLabel}
      className={[
        "eds-sidebar",
        collapsed && variant === "inline" ? "eds-sidebar--collapsed" : "",
        variant === "drawer" ? "eds-sidebar--drawer" : "",
        hiddenOnNarrow && variant === "inline" ? "eds-sidebar--hidden-narrow" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ul className="eds-sidebar__list">
        {items.map((item) => (
          <li key={item.id}>
            <SidebarRow item={item} active={item.id === activeItemId} collapsed={collapsed && variant === "inline"} onNavigate={onNavigate} />
            {!collapsed || variant === "drawer"
              ? (item.children ?? []).map((child) => (
                  <ul key={child.id} className="eds-sidebar__children">
                    <li>
                      <SidebarRow item={child} active={child.id === activeItemId} collapsed={false} onNavigate={onNavigate} />
                    </li>
                  </ul>
                ))
              : null}
          </li>
        ))}
      </ul>
      {variant === "inline" && onToggleCollapse ? (
        <button
          type="button"
          className="eds-sidebar__collapse"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span aria-hidden className="eds-sidebar__icon">
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={16} />
          </span>
          {collapsed ? null : <span className="eds-sidebar__label">Collapse</span>}
        </button>
      ) : null}
    </nav>
  );

  if (variant !== "drawer") return body;
  if (!open) return null;
  return (
    <div className="eds-appshell__drawer-scrim" onMouseDown={onBackdropMouseDown}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={ariaLabel} className="eds-appshell__drawer">
        <button type="button" className="eds-appshell__drawer-close" onClick={onClose}>
          Close navigation
        </button>
        {body}
      </div>
    </div>
  );
}
