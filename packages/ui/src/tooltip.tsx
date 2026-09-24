"use client";

import * as React from "react";
import { cn } from "./lib/utils";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}

const sideStyles: Record<string, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

const sideArrow: Record<string, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-[var(--ethen-border)]",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-l-[4px] border-r-[4px] border-b-[4px] border-l-transparent border-r-transparent border-b-[var(--ethen-border)]",
  left: "left-full top-1/2 -translate-y-1/2 border-t-[4px] border-b-[4px] border-l-[4px] border-t-transparent border-b-transparent border-l-[var(--ethen-border)]",
  right: "right-full top-1/2 -translate-y-1/2 border-t-[4px] border-b-[4px] border-r-[4px] border-t-transparent border-b-transparent border-r-[var(--ethen-border)]",
};

export function Tooltip({
  content,
  children,
  side = "top",
  disabled = false,
  className,
  contentClassName,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const tooltipId = `tooltip-${id}`;
  const show = open && !disabled;

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={(e) => {
        // Only open on focus if the focus target is the child or within it
        if (e.currentTarget.contains(e.target as Node)) setOpen(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {React.cloneElement(children, {
        ...(show ? { "aria-describedby": tooltipId } : {}),
      })}

      {show && (
        <span
          role="tooltip"
          id={tooltipId}
          className={cn(
            "pointer-events-none absolute z-50 whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--ethen-border)] bg-[var(--ethen-bg-muted)] px-2 py-1 text-[11px] leading-tight text-[var(--ethen-text-primary)] shadow-sm transition-opacity",
            sideStyles[side],
            contentClassName,
          )}
        >
          {content}
          {/* Arrow */}
          <span
            aria-hidden
            className={cn("absolute", sideArrow[side])}
          />
        </span>
      )}
    </span>
  );
}
