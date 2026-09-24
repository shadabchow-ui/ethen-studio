"use client";

import { forwardRef, useRef, type HTMLAttributes, type KeyboardEvent } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export type V2TabItem = { id: string; label: string; disabled?: boolean };

export interface V2TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: readonly V2TabItem[];
  value: string;
  onValueChange: (id: string) => void;
}

export const V2Tabs = forwardRef<HTMLDivElement, V2TabsProps>(({ className, items, value, onValueChange, ...props }, ref) => {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabledIds = items.filter((item) => !item.disabled).map((item) => item.id);

  function select(id: string) {
    onValueChange(id);
    queueMicrotask(() => buttonRefs.current[id]?.focus());
  }

  function move(delta: number) {
    if (enabledIds.length === 0) return;
    const current = Math.max(0, enabledIds.indexOf(value));
    const next = enabledIds[(current + delta + enabledIds.length) % enabledIds.length];
    if (next) select(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        if (enabledIds[0]) select(enabledIds[0]);
        break;
      case "End":
        event.preventDefault();
        if (enabledIds.length) select(enabledIds[enabledIds.length - 1]);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={ref} role="tablist" className={cn(styles.tabs, className)} onKeyDown={onKeyDown} {...props}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          ref={(node) => {
            buttonRefs.current[item.id] = node;
          }}
          aria-selected={value === item.id}
          aria-disabled={item.disabled || undefined}
          disabled={item.disabled}
          tabIndex={value === item.id ? 0 : -1}
          data-selected={value === item.id ? "true" : undefined}
          className={cn(styles.tab, value === item.id && styles.tabSelected)}
          onClick={() => onValueChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
});
V2Tabs.displayName = "V2Tabs";