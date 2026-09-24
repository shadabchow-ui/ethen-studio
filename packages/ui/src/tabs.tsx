import * as React from "react";
import { cn } from "./lib/utils";
import v2 from "./design-system/v2/v2.module.css";

export interface Tab {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
  panel?: React.ReactNode;
  id?: string;
}

export function Tabs({ tabs, activeTab, onTabChange, className, panel, id = "tabs" }: TabsProps) {
  const panelId = `${id}-panel`;
  return (
    <div>
      <div className={cn(v2.tabs, className)} role="tablist" aria-label="Tabs">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            id={`${id}-tab-${tab.id}`}
            type="button"
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((item) => item.id === tab.id);
              let nextIndex: number | undefined;
              if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + tabs.length) % tabs.length;
              if (event.key === "Home") nextIndex = 0;
              if (event.key === "End") nextIndex = tabs.length - 1;
              if (nextIndex !== undefined) {
                event.preventDefault();
                const nextTab = tabs[nextIndex];
                onTabChange(nextTab.id);
                requestAnimationFrame(() => document.getElementById(`${id}-tab-${nextTab.id}`)?.focus());
              }
            }}
            className={cn(v2.tab, isActive && v2.tabSelected)}
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            role="tab"
          >
            {tab.label}
          </button>
        );
      })}
      </div>
      {panel !== undefined && (
        <div id={panelId} role="tabpanel" aria-labelledby={`${id}-tab-${activeTab}`} tabIndex={0}>
          {panel}
        </div>
      )}
    </div>
  );
}
