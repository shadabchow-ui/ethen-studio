"use client";

/**
 * Compact System / Light / Dark appearance control.
 *
 * One control, one authority: every change writes through the shared theme
 * store (persist + apply + notify), so the shell, the document, and every
 * other control converge without a reload. The pre-hydration bootstrap owns
 * first paint; this control never flashes because it never owns resolution.
 */

import * as React from "react";
import { useThemePreference, type ThemePreference } from "../theme/theme-preference";
import { ChatIcon } from "./chat-icons";
import styles from "./theme-segmented-control.module.css";

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: "monitor" | "sun" | "moon" }> = [
  { value: "system", label: "System", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

export function ThemeSegmentedControl({
  label = "Appearance",
  onChange,
}: {
  label?: string;
  /** Extra sink (e.g. the durable settings doc). The theme store always writes first. */
  onChange?: (next: ThemePreference) => void;
}) {
  const [preference, setPreference] = useThemePreference();
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            data-selected={selected ? "true" : undefined}
            className={styles.option}
            onClick={() => {
              setPreference(option.value);
              onChange?.(option.value);
            }}
          >
            <ChatIcon name={option.icon} size={16} />
          </button>
        );
      })}
    </div>
  );
}
