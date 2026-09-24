"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { COMMAND_ITEMS, CONNECTOR_COMMAND_ITEMS, type CommandItem } from "@ethen/navigation";
import { Chip } from "@ethen/ui/chip";
import { IconButton } from "@ethen/ui/icon-button";
import { Kbd } from "@ethen/ui/kbd";
import {
  CommandRow,
  CommandGroup,
  CommandEmptyState,
  KeyboardHintFooter,
  CommandSearchIcon,
} from "@ethen/ui/command-system";
import { useMockProjects, useMockSessions } from "./hooks/useMockData";
import { isMockMode } from "@ethen/config/runtime-flags";
import { useOverlay } from "@ethen/ui/overlay";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

function matchesQuery(item: CommandItem, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(q) ||
    item.group.toLowerCase().includes(q) ||
    item.hint?.toLowerCase().includes(q) ||
    item.badge?.toLowerCase().includes(q) ||
    item.shortcut?.toLowerCase().includes(q)
  );
}

function buildItems({
  query,
  sessions,
  projects,
}: {
  query: string;
  sessions: ReturnType<typeof useMockSessions>;
  projects: ReturnType<typeof useMockProjects>;
}): CommandItem[] {
  const navItems = COMMAND_ITEMS.map((item) =>
    item.id === "connected-apps" ? { ...item, group: "Apps & Connectors" } : item,
  );
  const connectorItems = CONNECTOR_COMMAND_ITEMS.filter((item) => matchesQuery(item, query));

  const sessionItems: CommandItem[] = isMockMode
    ? sessions
        .filter((session) =>
          matchesQuery({ id: session.id, label: session.title, group: "Sessions" }, query),
        )
        .slice(0, 5)
        .map((session) => ({
          id: `session-${session.id}`,
          label: session.title,
          group: "Sessions",
          href: `/workspace/${session.id}`,
          hint: session.last_message_preview ?? `${session.agent_name} session`,
        }))
    : [];

  const projectItems: CommandItem[] = isMockMode
    ? projects
        .filter((project) =>
          matchesQuery({ id: project.id, label: project.name, group: "Projects" }, query),
        )
        .slice(0, 5)
        .map((project) => ({
          id: `project-${project.id}`,
          label: project.name,
          group: "Projects",
          href: `/projects/${project.id}`,
          hint: project.description ?? `${project.session_ids.length} sessions`,
        }))
    : [];

  return [...navItems, ...sessionItems, ...projectItems, ...connectorItems];
}

function groupItems(items: CommandItem[], query: string) {
  const filtered = items.filter((item) => matchesQuery(item, query));
  const groups = new Map<string, CommandItem[]>();
  for (const item of filtered) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group)!.push(item);
  }
  return groups;
}

function CommandPaletteInner({
  onClose,
  surfaceRef,
}: {
  onClose: () => void;
  surfaceRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const sessions = useMockSessions();
  const projects = useMockProjects();

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    return () => {
      trigger?.focus();
    };
  }, []);

  const allItems = useMemo(
    () => buildItems({ query, sessions, projects }),
    [projects, query, sessions],
  );
  const groups = useMemo(() => groupItems(allItems, query), [allItems, query]);
  const flat = Array.from(groups.values()).flat();

  function handleQueryChange(value: string) {
    setQuery(value);
    setActiveIndex(0);
  }

  function scrollIntoView(index: number) {
    const element = listRef.current?.querySelector(
      `[data-cmd-index="${index}"]`,
    ) as HTMLElement | null;
    element?.scrollIntoView({ block: "nearest" });
  }

  function activate(item: CommandItem) {
    onClose();
    if (item.href) router.push(item.href);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.min(activeIndex + 1, flat.length - 1);
      setActiveIndex(next);
      scrollIntoView(next);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const previous = Math.max(activeIndex - 1, 0);
      setActiveIndex(previous);
      scrollIntoView(previous);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flat[activeIndex];
      if (item) activate(item);
    }
  }

  let globalIndex = 0;

  return (
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal
      aria-label="Command palette"
      data-v2-pattern="command-palette"
      className="relative mx-4 w-full max-w-[640px] overflow-hidden rounded-[var(--eds-radius-raised)] border border-[var(--eds-rule)] bg-[var(--eds-elevated)] text-[var(--eds-ink)] shadow-[var(--eds-elev-overlay-shadow)]"
      onKeyDown={handleKeyDown}
    >
      <div className="flex h-12 items-center gap-3 border-b border-[var(--eds-rule-hair)] bg-transparent px-4">
        <CommandSearchIcon size={13} />
        <input
          autoFocus
          aria-label="Search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Search products, actions, sessions, projects, and apps..."
          className="flex-1 bg-transparent text-[14px] text-[var(--eds-ink)] outline-none placeholder:text-[var(--eds-text-tertiary)]"
        />
        <IconButton label="Close command palette" size="sm" onClick={onClose}>
          ✕
        </IconButton>
      </div>

      <div
        ref={listRef}
        className="max-h-[360px] overflow-y-auto bg-transparent p-2"
        role="listbox"
        aria-label="Results"
      >
        {flat.length === 0 ? (
          <CommandEmptyState query={query} />
        ) : (
          Array.from(groups.entries()).map(([group, items]) => (
            <CommandGroup key={group} label={group}>
              {items.map((item) => {
                const index = globalIndex++;
                const isActive = index === activeIndex;
                return (
                  <CommandRow
                    key={item.id}
                    label={item.label}
                    detail={item.hint}
                    rightMeta={
                      item.badge ? (
                        <Chip variant="muted">{item.badge}</Chip>
                      ) : item.shortcut ? (
                        <Kbd>{item.shortcut}</Kbd>
                      ) : undefined
                    }
                    isActive={isActive}
                    index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => activate(item)}
                  />
                );
              })}
            </CommandGroup>
          ))
        )}
      </div>

      <KeyboardHintFooter
        hints={[
          { keys: "↑ ↓", label: "Navigate" },
          { keys: "↵", label: "Select" },
          { keys: "Esc", label: "Close" },
        ]}
      />
    </div>
  );
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { ref: surfaceRef, onBackdropMouseDown } = useOverlay(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-[rgba(0,0,0,0.32)] p-4 pt-[10vh]"
      onMouseDown={onBackdropMouseDown}
    >
      <div className="relative z-10 flex w-full justify-center">
        <CommandPaletteInner key={String(open)} onClose={onClose} surfaceRef={surfaceRef} />
      </div>
    </div>
  );
}
