"use client";

import * as React from "react";
import { cn } from "./lib/utils";
import v2 from "./design-system/v2/v2.module.css";

export interface SegmentedControlProps {
  items: string[];
  activeIndex?: number;
  onSelectIndex?: (index: number) => void;
  className?: string;
  "aria-label"?: string;
}

/**
 * Segmented control — V2 presentation, existing tablist contract.
 * Tokens: var(--ethen-border) var(--text-primary) var(--focus-ring)
 */
export function SegmentedControl({
  items,
  activeIndex = 0,
  onSelectIndex,
  className,
  "aria-label": ariaLabel = "Segmented control",
}: SegmentedControlProps) {
  return (
    <div
      className={cn(v2.segmented, v2.segmentedMd, className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((label, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelectIndex?.(i)}
            className={cn(v2.segment, active && v2.segmentSelected)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
