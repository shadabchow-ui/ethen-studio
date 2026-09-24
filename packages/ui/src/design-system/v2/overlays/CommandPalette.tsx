"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import { useOverlay } from "../../../overlay";

export type V2CommandItem = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  shortcut?: string;
  href?: string;
  disabled?: boolean;
};

export interface V2CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: V2CommandItem[];
  placeholder?: string;
  loading?: boolean;
  onSelect?: (item: V2CommandItem) => void;
}

function groupItems(items: V2CommandItem[], query: string) {
  const q = query.toLowerCase();
  const filtered = query ? items.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q) || (i.hint && i.hint.toLowerCase().includes(q))) : items;
  const groups = new Map<string, V2CommandItem[]>();
  for (const it of filtered) { if (!groups.has(it.group)) groups.set(it.group, []); groups.get(it.group)!.push(it); }
  return groups;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 items-center rounded-[4px] border border-[var(--v2-border-default)] bg-[var(--v2-surface)] px-1.5 text-[10px] font-medium text-[var(--v2-text-tertiary)]">{children}</kbd>;
}

function KeyboardHintFooter() {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] text-[var(--v2-text-tertiary)]">
      <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate</span>
      <span className="flex items-center gap-1"><Kbd>↵</Kbd> Select</span>
      <span className="flex items-center gap-1"><Kbd>Esc</Kbd> Close</span>
    </div>
  );
}

/** Production V2 command palette — 12px raised, grouped results, keyboard hints, empty/loading. */
export function V2CommandPalette({ open, onClose, items, placeholder = "Search actions, files, agents…", loading = false, onSelect }: V2CommandPaletteProps) {
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const { ref, onBackdropMouseDown } = useOverlay(open, onClose);
  const listRef = React.useRef<HTMLDivElement>(null);

  const groups = React.useMemo(() => groupItems(items, query), [items, query]);
  const flat = React.useMemo(() => Array.from(groups.values()).flat(), [groups]);

  React.useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setQuery("");
        setActiveIndex(0);
      });
    }
  }, [open]);

  function activate(item: V2CommandItem) {
    if (item.disabled) return;
    onSelect?.(item);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.min(activeIndex + 1, flat.length - 1); setActiveIndex(n); listRef.current?.querySelector(`[data-idx="${n}"]`)?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const p = Math.max(activeIndex - 1, 0); setActiveIndex(p); listRef.current?.querySelector(`[data-idx="${p}"]`)?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") { e.preventDefault(); const it = flat[activeIndex]; if (it) activate(it); }
  }

  if (!open) return null;

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[rgba(0,0,0,0.32)] p-4 pt-[10vh]" onMouseDown={onBackdropMouseDown}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-v2-pattern="command-palette"
        onKeyDown={handleKeyDown}
        className="w-full max-w-[640px] overflow-hidden rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-raised)] shadow-[var(--v2-shadow-overlay)]"
      >
        <div className="flex h-12 items-center gap-3 border-b border-[var(--v2-border-subtle)] px-4">
          <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 text-[var(--v2-text-tertiary)]"><path d="M7 11A4 4 0 1 0 7 3a4 4 0 0 0 0 8Z M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" /></svg>
          <input
            aria-label="Search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-[14px] text-[var(--v2-text-primary)] placeholder:text-[var(--v2-text-tertiary)] outline-none"
          />
          <button type="button" aria-label="Close command palette" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-[var(--v2-radius-base)] text-[var(--v2-text-tertiary)] hover:bg-[var(--v2-hover)] hover:text-[var(--v2-text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]">×</button>
        </div>

        <div ref={listRef} className="max-h-[360px] overflow-y-auto p-2" role="listbox" aria-label="Results">
          {loading ? (
            <div className="grid gap-2 p-2" aria-busy="true">
              <div className="h-9 rounded-[var(--v2-radius-base)] bg-[var(--v2-surface)] animate-pulse" />
              <div className="h-9 rounded-[var(--v2-radius-base)] bg-[var(--v2-surface)] animate-pulse" />
              <div className="h-9 rounded-[var(--v2-radius-base)] bg-[var(--v2-surface)] animate-pulse" />
            </div>
          ) : flat.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-[13px] font-medium text-[var(--v2-text-primary)]">No results</p>
              <p className="mt-1 text-[12px] text-[var(--v2-text-tertiary)]">Try a different search or check the spelling.</p>
            </div>
          ) : (
            Array.from(groups.entries()).map(([group, groupItems]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-[12px] font-medium text-[var(--v2-text-tertiary)]">{group}</p>
                <div className="grid gap-0.5">
                  {groupItems.map((item) => {
                    const idx = globalIdx++;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-idx={idx}
                        disabled={item.disabled}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => activate(item)}
                        className={cn(
                          "flex h-9 w-full items-center justify-between rounded-[var(--v2-radius-base)] px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]",
                          isActive ? "bg-[var(--v2-active)] text-[var(--v2-text-primary)]" : "text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)] hover:text-[var(--v2-text-primary)]",
                          item.disabled ? "cursor-not-allowed opacity-[var(--v2-disabled-opacity)]" : "cursor-pointer"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{item.label}</span>
                          {item.hint ? <span className="ml-2 text-[12px] text-[var(--v2-text-tertiary)]">{item.hint}</span> : null}
                        </span>
                        {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <KeyboardHintFooter />
      </div>
    </div>
  );
}

/** Deterministic static sample items for Lab — file/search/settings/agent examples. */
export const V2_COMMAND_SAMPLE_ITEMS: V2CommandItem[] = [
  { id: "file-1", label: "Open README.md", group: "Files", hint: "project / docs", shortcut: "↵" },
  { id: "file-2", label: "Search in files", group: "Files", hint: "⌘F — find in project", shortcut: "⌘F" },
  { id: "settings-1", label: "Open settings", group: "Settings", hint: "Preferences → Appearance" },
  { id: "settings-2", label: "Toggle theme", group: "Settings", hint: "System / Light / Dark" },
  { id: "agent-1", label: "Run: Code review", group: "Agents", hint: "Cortex · requires approval" },
  { id: "agent-2", label: "Run: Research synthesis", group: "Agents", hint: "Cortex · ready" },
  { id: "cmd-1", label: "New session", group: "Commands", hint: "Start a new workspace", shortcut: "⌘N" },
  { id: "cmd-2", label: "Show command palette", group: "Commands", hint: "Global search", shortcut: "⌘K" },
];
