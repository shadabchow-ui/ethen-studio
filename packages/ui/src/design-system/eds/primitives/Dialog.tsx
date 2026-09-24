"use client";

import * as React from "react";
import { useOverlay } from "../../../overlay";

export interface EdsDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function EdsDialog({ open, onClose, title, children, className }: EdsDialogProps) {
  const titleId = React.useId();
  const { ref, onBackdropMouseDown } = useOverlay(open, onClose);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onMouseDown={onBackdropMouseDown}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={["eds-dialog", className].filter(Boolean).join(" ")}
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        <h2 id={titleId} className="eds-dialog__title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export interface EdsDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function EdsDrawer({ open, onClose, title, children, className }: EdsDrawerProps) {
  const titleId = React.useId();
  const { ref, onBackdropMouseDown } = useOverlay(open, onClose);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onMouseDown={onBackdropMouseDown}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={["eds-drawer", className].filter(Boolean).join(" ")}
      >
        <h2 id={titleId} className="eds-dialog__title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
