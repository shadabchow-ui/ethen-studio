"use client";

import * as React from "react";

export interface EdsTooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  disabled?: boolean;
  className?: string;
}

export function EdsTooltip({ content, children, disabled = false, className }: EdsTooltipProps) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const tooltipId = `eds-tooltip-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const show = open && !disabled;

  return (
    <span
      className={["eds-tooltip", className].filter(Boolean).join(" ")}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={(event) => {
        if (event.currentTarget.contains(event.target as Node)) setOpen(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      {React.cloneElement(children, {
        ...(show ? { "aria-describedby": tooltipId } : {}),
      })}
      {show ? (
        <span id={tooltipId} role="tooltip" className="eds-tooltip__bubble">
          {content}
        </span>
      ) : null}
    </span>
  );
}
