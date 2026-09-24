"use client";

import * as React from "react";
import { resolveMenuKey, isMenuKey } from "../../../menu-key";
import { Icon, type IconName } from "../../../icons";

export interface EdsMenuAction {
  kind?: "action";
  label: string;
  icon?: IconName;
  hint?: string;
  tone?: "danger";
  disabled?: boolean;
  onSelect?: () => void;
}

export interface EdsMenuSeparator {
  kind: "separator";
}

export type EdsMenuItem = EdsMenuAction | EdsMenuSeparator;

export interface EdsMenuProps {
  items: readonly EdsMenuItem[];
  label: string;
  onClose?: () => void;
  className?: string;
}

export function EdsMenu({ items, label, onClose, className }: EdsMenuProps) {
  const [focused, setFocused] = React.useState(() => items.findIndex((item) => item.kind !== "separator" && !item.disabled));
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const activate = React.useCallback(
    (index: number) => {
      const item = items[index];
      if (!item || item.kind === "separator" || item.disabled) return;
      item.onSelect?.();
      onClose?.();
    },
    [items, onClose],
  );

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (!isMenuKey(event.key)) return;
    event.preventDefault();
    const action = resolveMenuKey(event.key, index, {
      count: items.length,
      isDisabled: (i) => {
        const item = items[i];
        return !item || item.kind === "separator" || item.disabled === true;
      },
    });
    if (action.type === "move") {
      setFocused(action.index);
      refs.current[action.index]?.focus();
    } else if (action.type === "activate") {
      activate(index);
    } else if (action.type === "escape") {
      onClose?.();
    }
  }

  return (
    <div role="menu" aria-label={label} className={["eds-menu", className].filter(Boolean).join(" ")}>
      {items.map((item, index) => {
        if (item.kind === "separator") {
          return <hr key={`sep-${index}`} aria-hidden className="eds-menu__separator" />;
        }
        return (
          <button
            key={item.label}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            tabIndex={focused === index ? 0 : -1}
            onFocus={() => setFocused(index)}
            onClick={() => activate(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={[
              "eds-menu__item",
              focused === index ? "eds-menu__item--focused" : "",
              item.tone === "danger" ? "eds-menu__item--danger" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="eds-menu__label">
              {item.icon ? (
                <span aria-hidden className="eds-menu__icon">
                  <Icon name={item.icon} size={16} />
                </span>
              ) : null}
              {item.label}
            </span>
            {item.hint ? <span className="eds-kbd-hint">{item.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export interface EdsSelectProps {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  description?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const EdsSelect = React.forwardRef<HTMLSelectElement, EdsSelectProps>(
  ({ label, value, options, onChange, description, error, disabled, id: idProp, className }, ref) => {
    const generated = React.useId();
    const id = idProp ?? `eds-select-${generated.replace(/[^a-zA-Z0-9]/g, "")}`;
    const descriptionId = description && !error ? `${id}-description` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="eds-field">
        <label className="eds-label" htmlFor={id}>
          {label}
        </label>
        <div className={["eds-select", className].filter(Boolean).join(" ")}>
          <select
            ref={ref}
            id={id}
            value={value}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            className="eds-select__control"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span aria-hidden className="eds-select__chevron">
            <Icon name="chevron-down" size={16} />
          </span>
        </div>
        {!error && description ? (
          <p className="eds-description" id={descriptionId}>
            {description}
          </p>
        ) : null}
        {error ? (
          <p className="eds-error" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
EdsSelect.displayName = "EdsSelect";
