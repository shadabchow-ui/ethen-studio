"use client";

import * as React from "react";
import {
  V2MoreMenu,
  type V2DropdownMenuItem,
} from "./design-system/v2/overlays/DropdownMenu";

export interface MoreMenuActionItem {
  kind: "action";
  label: string;
  tone?: "danger";
  disabled?: boolean;
  onSelect?: () => void;
}

export interface MoreMenuSeparatorItem {
  kind: "separator";
}

export type MoreMenuItem = MoreMenuActionItem | MoreMenuSeparatorItem;

export interface MoreMenuProps
  extends React.HTMLAttributes<HTMLDivElement> {
  items: MoreMenuItem[];
}

/**
 * Production compact row-action menu — presentation is V2MoreMenu.
 * Keyboard contract: resolveMenuKey / onKeyDown (from "./menu-key").
 * Tokens: var(--ethen-border) var(--text-primary) var(--focus-ring)
 */
export function MoreMenu({
  items,
  className,
  ...props
}: MoreMenuProps) {
  return (
    <V2MoreMenu
      items={items as V2DropdownMenuItem[]}
      className={className}
      {...props}
    />
  );
}
