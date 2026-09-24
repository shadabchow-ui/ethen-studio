"use client";

import * as React from "react";
import { V2Button } from "./design-system/v2/Button";
import { V2ButtonGroup } from "./design-system/v2/ButtonGroup";

export interface ButtonGroupItem {
  label: string;
  disabled?: boolean;
}

export interface ButtonGroupProps {
  items: ButtonGroupItem[];
  activeIndex?: number;
  onSelectIndex?: (index: number) => void;
  className?: string;
}

/**
 * Segmented button group — presentation is V2ButtonGroup + V2Button.
 */
export function ButtonGroup({
  items,
  activeIndex,
  onSelectIndex,
  className,
}: ButtonGroupProps) {
  return (
    <V2ButtonGroup className={className} role="group" aria-label="Button group">
      {items.map((item, i) => {
        const active = i === activeIndex;
        const disabled = item.disabled;
        return (
          <V2Button
            key={item.label}
            type="button"
            variant="ghost"
            selected={active}
            disabled={disabled}
            aria-pressed={active || undefined}
            onClick={() => {
              if (!disabled) onSelectIndex?.(i);
            }}
          >
            {item.label}
          </V2Button>
        );
      })}
    </V2ButtonGroup>
  );
}
