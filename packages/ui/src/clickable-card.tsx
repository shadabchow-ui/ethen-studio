"use client";

import * as React from "react";
import { cn } from "./lib/utils";
import { Card } from "./card";

export interface ClickableCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether the card is currently selected (renders with a primary border). */
  selected?: boolean;
  padding?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

/**
 * Dark-console clickable card — a Card variant for destination/entry points with
 * hover and selected states. Extracted from System Lab `LabClickableCardPreview`.
 *
 * Wraps the production `Card` component and adds hover/selected styling.
 */
export function ClickableCard({
  selected,
  padding = "sm",
  className,
  children,
  ...props
}: ClickableCardProps) {
  return (
    <Card
      clickable
      padding={padding}
      className={cn(
        selected
          ? "border-[var(--text-primary)]"
          : "hover:border-[var(--ethen-border-strong)] hover:bg-[var(--ethen-hover)]",
        className,
      )}
      {...props}
    >
      {children}
    </Card>
  );
}
