"use client";

import * as React from "react";

export interface EdsTab {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface EdsTabsProps {
  tabs: readonly EdsTab[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  renderPanel: (id: string) => React.ReactNode;
  className?: string;
}

function enabledIndex(tabs: readonly EdsTab[], from: number, direction: 1 | -1): number {
  const count = tabs.length;
  for (let step = 1; step <= count; step += 1) {
    const next = (from + direction * step + count * step) % count;
    if (!tabs[next]?.disabled) return next;
  }
  return from;
}

export function EdsTabs({ tabs, value, onChange, label, renderPanel, className }: EdsTabsProps) {
  const selected = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === value),
  );
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = enabledIndex(tabs, index, 1);
    else if (event.key === "ArrowLeft") next = enabledIndex(tabs, index, -1);
    else if (event.key === "Home") next = tabs.findIndex((tab) => !tab.disabled);
    else if (event.key === "End") {
      const reversed = [...tabs].reverse().findIndex((tab) => !tab.disabled);
      next = reversed === -1 ? -1 : tabs.length - 1 - reversed;
    }
    if (next === null || next < 0) return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div className={["eds-tabs", className].filter(Boolean).join(" ")}>
      <div role="tablist" aria-label={label} className="eds-tabs__list">
        {tabs.map((tab, index) => {
          const isSelected = index === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`eds-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`eds-tabpanel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={["eds-tabs__tab", isSelected ? "eds-tabs__tab--selected" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`eds-tabpanel-${tabs[selected]?.id}`}
        aria-labelledby={`eds-tab-${tabs[selected]?.id}`}
        tabIndex={0}
        className="eds-tabs__panel"
      >
        {tabs[selected] ? renderPanel(tabs[selected].id) : null}
      </div>
    </div>
  );
}
