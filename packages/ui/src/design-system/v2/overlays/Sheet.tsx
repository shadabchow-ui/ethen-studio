"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import { useOverlay } from "../../../overlay";

export interface V2SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  side?: "left" | "right" | "bottom";
  className?: string;
}

/** Production V2 sheet — 12px raised, restrained shadow, focus trap, Escape + backdrop. */
export function V2Sheet({ open, onClose, title, children, side = "right", className }: V2SheetProps) {
  const { ref, onBackdropMouseDown } = useOverlay(open, onClose);
  if (!open) return null;
  const placement =
    side === "bottom" ? "inset-x-0 bottom-0 max-h-[85vh] rounded-t-[var(--v2-radius-raised)]"
    : side === "left" ? "inset-y-0 left-0 w-full max-w-[404px] rounded-r-[var(--v2-radius-raised)]"
    : "inset-y-0 right-0 w-full max-w-[404px] rounded-l-[var(--v2-radius-raised)]";

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title} data-sheet="" data-v2-pattern="sheet">
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.32)]" onMouseDown={onBackdropMouseDown} aria-hidden="true" />
      <section
        ref={ref}
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col overflow-hidden border border-[var(--v2-border-default)] bg-[var(--v2-raised)] text-[var(--v2-text-primary)] shadow-[var(--v2-shadow-overlay)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]",
          placement,
          className
        )}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] px-4">
          <h2 className="text-[14px] font-semibold text-[var(--v2-text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--v2-radius-base)] text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)] hover:text-[var(--v2-text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </section>
    </div>
  );
}
