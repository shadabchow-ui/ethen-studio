"use client";

import * as React from "react";
import { cn } from "./lib/utils";
import { useOverlay } from "./overlay";

const MODAL_SURFACE_CLASS = {
  default: "",
  smoked: "ethen-panel-smoked",
  smokedRefined: "ethen-panel-smoked-refined",
  solidDark: "ethen-panel-solid-dark",
} as const;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  surface?: "default" | "smoked" | "smokedRefined" | "solidDark";
}

const sizeClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-3xl",
};

/**
 * Modal dialog with backdrop scrim.
 *
 * Behavior contract (via `useOverlay` from "./overlay"):
 *   - Focus trap: Tab is constrained to the modal while open.
 *   - Escape closes; backdrop mousedown closes.
 *   - Focus returns to the previously focused element on close.
 * Presentation uses V2 overlay tokens.
 * Tokens: var(--ethen-border) var(--text-primary) var(--glass-overlay) var(--focus-ring)
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  size = "lg",
  surface = "default",
}: ModalProps) {
  const { ref, onBackdropMouseDown } = useOverlay(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-v2-pattern="dialog"
    >
      <div
        ref={ref}
        className="absolute inset-0 bg-[rgba(0,0,0,0.4)]"
        onMouseDown={onBackdropMouseDown}
        aria-hidden
      />
      <div
        className={cn(
          "relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-[var(--eds-radius-raised)] border border-[var(--eds-rule)] bg-[var(--eds-elevated)] text-[var(--eds-ink)] shadow-[var(--eds-elev-overlay-shadow)]",
          surface !== "default" && MODAL_SURFACE_CLASS[surface],
          sizeClasses[size],
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--eds-rule-hair)] px-5 py-3">
            <h2 className="text-sm text-[var(--eds-ink)]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--eds-radius-base)] text-[var(--eds-text-secondary)] hover:bg-[var(--eds-cmp-shell-nav-hover)] hover:text-[var(--eds-ink)] focus-visible:outline-[var(--eds-focus-ring)]"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
