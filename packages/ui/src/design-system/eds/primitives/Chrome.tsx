"use client";

import * as React from "react";

export interface EdsChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  onRemove?: () => void;
  removeLabel?: string;
}

export function EdsChip({ onRemove, removeLabel = "Remove", className, children, ...props }: EdsChipProps) {
  return (
    <span className={["eds-chip", className].filter(Boolean).join(" ")} {...props}>
      {children}
      {onRemove ? (
        <button type="button" aria-label={removeLabel} onClick={onRemove} className="eds-chip__remove">
          <span aria-hidden>×</span>
        </button>
      ) : null}
    </span>
  );
}

export function EdsDivider({ className }: { className?: string }) {
  return <hr aria-hidden className={["eds-divider", className].filter(Boolean).join(" ")} />;
}

export function EdsKbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={["eds-kbd", className].filter(Boolean).join(" ")} {...props} />;
}

export interface EdsSegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface EdsSegmentedControlProps {
  label: string;
  value: string;
  options: readonly EdsSegmentedOption[];
  onChange: (value: string) => void;
  className?: string;
}

export function EdsSegmentedControl({ label, value, options, onChange, className }: EdsSegmentedControlProps) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    for (let step = 1; step <= options.length; step += 1) {
      const next = (index + direction * step + options.length * step) % options.length;
      if (!options[next]?.disabled) {
        onChange(options[next].value);
        refs.current[next]?.focus();
        return;
      }
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={["eds-segment", className].filter(Boolean).join(" ")}
    >
      {options.map((option, index) => {
        const isSelected = index === selected;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={["eds-segment__option", isSelected ? "eds-segment__option--selected" : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function EdsSkeleton({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" aria-label={label} className={["eds-skeleton__wrap", className].filter(Boolean).join(" ")}>
      <span aria-hidden className="eds-skeleton" />
      <span className="eds-skeleton__text">{label}…</span>
    </span>
  );
}

export interface EdsTimestampProps {
  dateTime: string;
  children: React.ReactNode;
  className?: string;
}

export function EdsTimestamp({ dateTime, children, className }: EdsTimestampProps) {
  return (
    <time dateTime={dateTime} className={["eds-timestamp", className].filter(Boolean).join(" ")}>
      {children}
    </time>
  );
}
