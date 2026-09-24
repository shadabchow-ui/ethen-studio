"use client";

import * as React from "react";
import {
  V2DropdownMenu,
  type V2DropdownMenuItem,
} from "./design-system/v2/overlays/DropdownMenu";

/* -------------------------------------------------------------------------- */
/*  Types — public signatures are unchanged                                   */
/* -------------------------------------------------------------------------- */

export interface DropdownMenuItemBase {
  label: string;
  disabled?: boolean;
}

export interface DropdownMenuAction extends DropdownMenuItemBase {
  kind?: "action";
  shortcut?: string;
  /** Pass "danger" to render the item with the danger color. */
  tone?: "danger";
  onSelect?: () => void;
}

export interface DropdownMenuCheckbox extends DropdownMenuItemBase {
  kind: "checkbox";
  checked: boolean;
  onSelect?: () => void;
}

export interface DropdownMenuSeparator {
  kind: "separator";
}

export type DropdownMenuItem =
  | DropdownMenuAction
  | DropdownMenuCheckbox
  | DropdownMenuSeparator;

export interface DropdownMenuProps
  extends React.HTMLAttributes<HTMLDivElement> {
  items: DropdownMenuItem[];
  onClose?: () => void;
}

/**
 * Production dropdown — presentation and APG keyboard are V2DropdownMenu.
 * Keyboard contract: resolveMenuKey / onKeyDown (from "./menu-key").
 * Tokens: var(--ethen-border) var(--text-primary) var(--focus-ring)
 */
export function DropdownMenu({
  items,
  onClose,
  className,
  ...props
}: DropdownMenuProps) {
  return (
    <V2DropdownMenu
      items={items as V2DropdownMenuItem[]}
      onClose={onClose}
      className={className}
      {...props}
    />
  );
}
