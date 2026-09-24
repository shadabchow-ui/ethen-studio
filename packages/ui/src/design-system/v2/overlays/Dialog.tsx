"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import { useOverlay } from "../../../overlay";

export interface V2DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** Production V2 dialog — 12px raised, V2 tokens, focus trap, Escape + backdrop, focus return. */
export function V2Dialog({ open, onClose, title, children, actions, className }: V2DialogProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const { ref, onBackdropMouseDown } = useOverlay(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[rgba(0,0,0,0.4)]"
      onMouseDown={onBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-v2-pattern="dialog"
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={cn(
          "w-full max-w-[400px] rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-raised)] p-4 shadow-[var(--v2-shadow-overlay)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]",
          className
        )}
      >
        <p id={titleId} className="text-[14px] font-semibold text-[var(--v2-text-primary)]">{title}</p>
        <div id={descriptionId} className="mt-2 text-[13px] leading-relaxed text-[var(--v2-text-secondary)]">{children}</div>
        {actions ? <div className="mt-4 flex justify-end gap-2 border-t border-[var(--v2-border-subtle)] pt-3">{actions}</div> : null}
      </div>
    </div>
  );
}
