/**
 * Toolbar — left / center / right slot layout with optional bottom section.
 * Presentation is V2Toolbar. Tokens: var(--ethen-border) var(--text-primary)
 */
import * as React from "react";
import { cn } from "./lib/utils";
import { V2Toolbar } from "./design-system/v2/Toolbar";

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  bottom?: React.ReactNode;
}

export function Toolbar({
  left,
  center,
  right,
  bottom,
  className,
  children,
  ...props
}: ToolbarProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      <V2Toolbar start={left} center={center} end={right} />
      {children}
      {bottom && <div className="flex items-center gap-2">{bottom}</div>}
    </div>
  );
}
