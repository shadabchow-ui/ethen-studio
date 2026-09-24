"use client";

import type { RefObject } from "react";

export type V2ModelOption = {
  id: string;
  label: string;
  provider?: string;
  capabilities?: readonly string[];
  price?: string;
  latency?: string;
  context?: string;
  contextWindow?: string;
  routingStatus?: string;
  reasoningLevels?: readonly string[];
  recommended?: boolean;
  disabled?: boolean;
  unavailableReason?: string;
};

export type V2ModelPickerProps = {
  options: readonly V2ModelOption[];
  selectedId?: string | null;
  onSelect: (option: V2ModelOption) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  staticLabel?: string;
  reasoningValue?: string;
  onReasoningChange?: (value: string) => void;
  routingEvidence?: string;
  triggerVariant?: string;
};

export function V2ModelPicker({
  options,
  selectedId,
  onSelect,
  open,
  onOpenChange,
  returnFocusRef,
  className,
  staticLabel = "Choose a model",
}: V2ModelPickerProps) {
  if (!open) return null;

  const close = () => {
    onOpenChange(false);
    requestAnimationFrame(() => returnFocusRef?.current?.focus());
  };

  return (
    <div className={className} role="dialog" aria-label={staticLabel}>
      <div className="dl2-panel">
        <div className="dl2-panel__header">
          <strong>{staticLabel}</strong>
          <button type="button" onClick={close} aria-label="Close model picker">
            Close
          </button>
        </div>
        <div role="listbox" aria-label="Models">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === selectedId}
              disabled={option.disabled}
              title={option.unavailableReason}
              onClick={() => {
                onSelect(option);
                close();
              }}
            >
              <span>{option.label}</span>
              {option.provider ? <small>{option.provider}</small> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
