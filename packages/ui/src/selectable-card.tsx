"use client";

import * as React from "react";
import { cn } from "./lib/utils";

export interface SelectableCardProps {
  label: string;
  description?: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
  /** Radio group name. Defaults to "selectable-card"; pass a distinct name per picker group. */
  name?: string;
}

/**
 * Dark-console selectable card — radio-style option card for model/mode/agent pickers.
 * Extracted from System Lab `LabSelectableCardPreview`.
 */
export function SelectableCard({
  label,
  description,
  value,
  checked,
  disabled,
  onChange,
  className,
  name = "selectable-card",
}: SelectableCardProps) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 rounded-[var(--ethen-radius-element)] border p-3 transition-colors",
        disabled
          ? "cursor-not-allowed border-[var(--ethen-border)] opacity-45"
          : checked
            ? "cursor-pointer border-[var(--text-primary)] bg-[rgba(255,255,255,0.05)]"
            : "cursor-pointer border-[var(--ethen-border)] hover:border-[var(--ethen-border-strong)]",
        className,
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span className="block text-[12.5px] font-medium text-[var(--text-primary)]">
          {label}
        </span>
        {description && (
          <span className="block text-[11.5px] text-[var(--text-tertiary)]">
            {description}
          </span>
        )}
      </span>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => !disabled && onChange(value)}
        className="h-4 w-4 accent-[var(--text-primary)]"
      />
    </label>
  );
}
