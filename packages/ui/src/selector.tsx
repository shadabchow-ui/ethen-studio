"use client";

import * as React from "react";
import { cn } from "./lib/utils";

export interface SelectorOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectorProps {
  options: SelectorOption[];
  selectedValue?: string;
  onSelectValue?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Dark-console listbox-style single-select menu.
 * Extracted from System Lab `LabSelectorPreview`.
 */
export function Selector({
  options,
  selectedValue,
  onSelectValue,
  placeholder,
  className,
}: SelectorProps) {
  return (
    <div
      role="listbox"
      className={cn(
        "flex flex-col gap-1 rounded-[var(--ethen-radius-element)] border border-[rgba(255,255,255,0.07)] p-1.5",
        className,
      )}
    >
      {placeholder && options.length === 0 && (
        <div className="px-2.5 py-1.5 text-[12.5px] text-[var(--text-muted)]">
          {placeholder}
        </div>
      )}
      {options.map((opt) => {
        const selected = opt.value === selectedValue;
        return (
          <div
            key={opt.value}
            role="option"
            aria-selected={selected || undefined}
            aria-disabled={opt.disabled || undefined}
            onClick={() => {
              if (!opt.disabled) onSelectValue?.(opt.value);
            }}
            className={cn(
              "flex items-center justify-between rounded-[var(--ethen-radius-inner)] px-2.5 py-1.5 text-[12.5px] transition-colors",
              selected
                ? "bg-[rgba(255,255,255,0.08)] font-medium text-[var(--text-primary)] cursor-pointer"
                : opt.disabled
                  ? "text-[var(--text-muted)] opacity-45 cursor-not-allowed"
                  : "text-[var(--text-secondary)] cursor-pointer hover:bg-[rgba(255,255,255,0.04)]",
            )}
          >
            <span>{opt.label}</span>
            {selected && (
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden
              >
                <path
                  d="M3.5 8.5l3 3 6-6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
