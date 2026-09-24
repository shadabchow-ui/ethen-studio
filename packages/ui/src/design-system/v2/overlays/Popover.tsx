"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";

export interface V2PopoverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  label?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
  getAnchor?: () => HTMLElement | null;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

/** Production V2 popover — 12px raised, V2 tokens, focus return, Escape + outside-click. */
export function V2Popover({ open, onClose, title, label, children, actions, className, anchorRef, getAnchor, side = "bottom", align = "start" }: V2PopoverProps) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const [position, setPosition] = React.useState<React.CSSProperties | undefined>();

  React.useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => { document.removeEventListener("keydown", handler); previousFocusRef.current?.focus(); };
  }, [open, onClose]);

  React.useLayoutEffect(() => {
    const anchor = getAnchor?.() ?? anchorRef?.current ?? null;
    if (!open || !anchor) {
      setPosition({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const gap = 8;
    const alignedLeft = align === "end" ? rect.right : align === "center" ? rect.left + rect.width / 2 : rect.left;
    const alignedTop = align === "end" ? rect.bottom : align === "center" ? rect.top + rect.height / 2 : rect.top;
    const next = side === "top" ? { left: alignedLeft, top: rect.top - gap, transform: `translate(${align === "end" ? "-100%" : align === "center" ? "-50%" : "0"}, -100%)` }
      : side === "left" ? { left: rect.left - gap, top: alignedTop, transform: `translate(-100%, ${align === "end" ? "-100%" : align === "center" ? "-50%" : "0"})` }
      : side === "right" ? { left: rect.right + gap, top: alignedTop, transform: `translate(0, ${align === "end" ? "-100%" : align === "center" ? "-50%" : "0"})` }
      : { left: alignedLeft, top: rect.bottom + gap, transform: `translate(${align === "end" ? "-100%" : align === "center" ? "-50%" : "0"}, 0)` };
    setPosition(next as React.CSSProperties);
  }, [align, anchorRef, getAnchor, open, side]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
        data-popover=""
        data-v2-pattern="popover"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? label : undefined}
        style={position}
        className={cn(
          "absolute w-[280px] rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-raised)] p-3 text-[var(--v2-text-primary)] shadow-[var(--v2-shadow-overlay)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]",
          className
        )}
      >
        {title ? <p id={titleId} className="text-[13px] font-semibold text-[var(--v2-text-primary)]">{title}</p> : null}
        <div className={cn(title ? "mt-2" : "")}>{children}</div>
        {actions ? <div className="mt-3 flex justify-end gap-2 border-t border-[var(--v2-border-subtle)] pt-3">{actions}</div> : null}
      </div>
    </div>
  );
}
