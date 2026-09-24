"use client";

import * as React from "react";
import { V2Dialog } from "./design-system/v2/overlays/Dialog";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Actions row — typically Cancel + Confirm buttons. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Production dialog — presentation is V2Dialog.
 * Overlay state machine remains useOverlay (inside V2Dialog; from "./overlay").
 * Tokens: var(--ethen-border) var(--text-primary) var(--focus-ring)
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  className,
}: DialogProps) {
  return (
    <V2Dialog open={open} onClose={onClose} title={title} actions={actions} className={className}>
      {children}
    </V2Dialog>
  );
}
