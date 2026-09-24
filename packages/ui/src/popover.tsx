"use client";

import * as React from "react";
import { V2Popover } from "./design-system/v2/overlays/Popover";

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Accessible name for the dialog when `title` is absent or insufficient. */
  label?: string;
  children: React.ReactNode;
  /** Actions row — typically a button. */
  actions?: React.ReactNode;
  /** Optional class on the floating panel. */
  className?: string;
}

/**
 * Production popover — presentation is V2Popover.
 * Focus-in/return (previousFocusRef + .focus()) is owned by V2Popover.
 * Tokens: var(--ethen-border) var(--text-primary) var(--focus-ring)
 */
export function Popover({
  open,
  onClose,
  title,
  label,
  children,
  actions,
  className,
}: PopoverProps) {
  return (
    <V2Popover
      open={open}
      onClose={onClose}
      title={title}
      label={label}
      actions={actions}
      className={className}
    >
      {children}
    </V2Popover>
  );
}
