"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import { isMenuKey, resolveMenuKey } from "../../../menu-key";

export interface V2DropdownMenuItemBase { label: string; disabled?: boolean; }
export interface V2DropdownMenuAction extends V2DropdownMenuItemBase { kind?: "action"; shortcut?: string; tone?: "danger"; onSelect?: () => void; }
export interface V2DropdownMenuCheckbox extends V2DropdownMenuItemBase { kind: "checkbox"; checked: boolean; onSelect?: () => void; }
export interface V2DropdownMenuSeparator { kind: "separator"; }
export type V2DropdownMenuItem = V2DropdownMenuAction | V2DropdownMenuCheckbox | V2DropdownMenuSeparator;

export interface V2DropdownMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  items: V2DropdownMenuItem[];
  onClose?: () => void;
}

/** Production V2 dropdown — 12px raised surface, V2 tokens, APG menu keyboard. */
export function V2DropdownMenu({ items, className, onClose, ...props }: V2DropdownMenuProps) {
  const initialIndex = items.findIndex((item) => item.kind === "checkbox" && item.checked);
  const [activeIndex, setActiveIndex] = React.useState(initialIndex >= 0 ? initialIndex : 0);
  const itemRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const isDisabled = React.useCallback((index: number) => {
    const item = items[index];
    return item !== undefined && "disabled" in item ? !!(item as { disabled?: boolean }).disabled : false;
  }, [items]);

  const moveFocus = React.useCallback((index: number) => {
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  }, []);

  const activate = React.useCallback((index: number) => {
    const item = items[index];
    if (!item || item.kind === "separator" || (item as { disabled?: boolean }).disabled) return;
    (item as V2DropdownMenuAction | V2DropdownMenuCheckbox).onSelect?.();
  }, [items]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent) => {
    if (!isMenuKey(event.key)) return;
    const action = resolveMenuKey(event.key, activeIndex, { count: items.length, isDisabled });
    switch (action.type) {
      case "move": event.preventDefault(); moveFocus(action.index); break;
      case "activate": event.preventDefault(); activate(activeIndex); break;
      case "escape": event.preventDefault(); event.stopPropagation(); onClose?.(); break;
      default: break;
    }
  }, [activeIndex, items.length, isDisabled, moveFocus, activate, onClose]);

  return (
    <div
      role="menu"
      data-v2-pattern="dropdown-menu"
      onKeyDown={handleKeyDown}
      className={cn(
        "w-[220px] rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-raised)] p-1.5 text-[14px] shadow-[var(--v2-shadow-overlay)]",
        className
      )}
      {...props}
    >
      {items.map((item, i) => {
        if (item.kind === "separator") return <div key={`sep-${i}`} className="my-1 h-px bg-[var(--v2-border-subtle)]" role="separator" />;
        const isCheckbox = item.kind === "checkbox";
        const isDanger = !isCheckbox && (item as V2DropdownMenuAction).tone === "danger";
        const disabled = (item as { disabled?: boolean }).disabled ?? false;
        const isActive = i === activeIndex;
        return (
          <div
            key={(item as V2DropdownMenuItemBase).label + i}
            ref={(node) => { itemRefs.current[i] = node; }}
            role={isCheckbox ? "menuitemcheckbox" : "menuitem"}
            aria-checked={isCheckbox ? (item as V2DropdownMenuCheckbox).checked : undefined}
            aria-disabled={disabled || undefined}
            tabIndex={isActive ? 0 : -1}
            onClick={() => { if (!disabled) activate(i); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); activate(i); } }}
            className={cn(
              "flex h-9 min-h-[32px] items-center justify-between rounded-[var(--v2-radius-base)] px-2.5 text-[14px] transition-colors select-none focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]",
              disabled ? "cursor-not-allowed opacity-[var(--v2-disabled-opacity)] text-[var(--v2-text-disabled)]" : isDanger ? "text-[var(--v2-status-danger)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--v2-status-danger)_10%,transparent)]" : "text-[var(--v2-text-secondary)] cursor-pointer hover:bg-[var(--v2-hover)] hover:text-[var(--v2-text-primary)]"
            )}
          >
            <span className="flex items-center gap-2">
              {isCheckbox && (item as V2DropdownMenuCheckbox).checked && (
                <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-3.5 w-3.5"><path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
              {item.label}
            </span>
            {!isCheckbox && (item as V2DropdownMenuAction).shortcut && <kbd className="text-[11px] text-[var(--v2-text-tertiary)]">{(item as V2DropdownMenuAction).shortcut}</kbd>}
          </div>
        );
      })}
    </div>
  );
}

/** Compact row-action variant — same keyboard contract, narrower surface. */
export function V2MoreMenu(props: V2DropdownMenuProps) {
  return <V2DropdownMenu {...props} className={cn("w-[180px]", props.className)} />;
}

export type V2MoreMenuProps = V2DropdownMenuProps;
