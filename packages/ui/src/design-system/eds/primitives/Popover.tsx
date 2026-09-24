"use client";

import * as React from "react";
import { useOverlay } from "../../../overlay";

export interface EdsPopoverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  label?: string;
  children: React.ReactNode;
  className?: string;
}

export function EdsPopover({ open, onClose, title, label, children, className }: EdsPopoverProps) {
  const titleId = React.useId();
  const { ref, onBackdropMouseDown } = useOverlay(open, onClose);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onMouseDown={onBackdropMouseDown}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? label : undefined}
        className={["eds-popover", className].filter(Boolean).join(" ")}
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        {title ? (
          <p id={titleId} className="eds-popover__title">
            {title}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
