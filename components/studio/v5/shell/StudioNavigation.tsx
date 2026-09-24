"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getStudioV5NavSections,
  isStudioEntryActive,
  moveRovingIndex,
  preserveStudioQuery,
  resolveStudioV5Entry,
} from "./navigation-model";
import { StudioNavIcon } from "./studio-nav-icons";
import { STUDIO_FOCUS_RING_CLASS } from "./tokens";
import styles from "./studio-sidebar.module.css";

function subscribeSearch(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getSearchSnapshot(): string {
  return window.location.search;
}

function getSearchServerSnapshot(): string {
  return "";
}

const COLLAPSE_STORAGE_KEY = "ethen.studio.nav.groups.v1";
/** Pro and Products start closed so the rail fits common desktop heights. */
const DEFAULT_COLLAPSED: Record<string, boolean> = { pro: true, products: true };

/**
 * STUDIO_08 → V5 M1 — the Studio sidebar navigation (Owner Lock D).
 * Grouped Explore/Create/Build/Discover/Work/Pro/Products entries with
 * roving tabindex, arrow-key travel, aria-current, aria-expanded on
 * collapsible groups and disabled-with-reason entries. In the collapsed
 * icon rail every row keeps an accessible name and a tooltip.
 */
export function StudioNavigation({
  projectId,
  testId,
  collapsed = false,
  onNavigate,
}: {
  projectId: string | null;
  testId?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // External-store search read: SSR-safe and popstate-live without the
  // useSearchParams Suspense requirement in shared chrome.
  const currentSearch = useSyncExternalStore(subscribeSearch, getSearchSnapshot, getSearchServerSnapshot);
  const sections = getStudioV5NavSections();
  const [groupState, setGroupState] = useState<Record<string, boolean>>(DEFAULT_COLLAPSED);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          // Post-hydration preference restore (per-viewer convenience only).
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setGroupState({ ...DEFAULT_COLLAPSED, ...(parsed as Record<string, boolean>) });
        }
      }
    } catch {
      // Storage unavailable: defaults apply.
    }
  }, []);
  // The collapsed icon rail always shows every entry (no group headers).
  const isCollapsed = (sectionId: string): boolean => !collapsed && groupState[sectionId] === true;
  const visibleCounts = sections.map((section) => (section.expandable && isCollapsed(section.id) ? 0 : section.entries.length));
  const offsets: number[] = [];
  let total = 0;
  for (const count of visibleCounts) {
    offsets.push(total);
    total += count;
  }
  const [focusIndex, setFocusIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLAnchorElement | HTMLSpanElement | null>>([]);

  const focusEntry = (index: number) => {
    setFocusIndex(index);
    itemRefs.current[index]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    focusEntry(moveRovingIndex(index, total, event.key));
  };

  const toggleSection = (sectionId: string) => {
    setGroupState((current) => {
      const next = { ...current, [sectionId]: current[sectionId] !== true };
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Non-persistent convenience.
      }
      return next;
    });
    setFocusIndex(0);
  };

  return (
    <nav aria-label="Studio" data-testid={testId ?? "studio-v5-navigation"} className={styles.nav} data-collapsed={collapsed ? "true" : undefined}>
      {sections.map((section, sectionIndex) => {
        const sectionCollapsed = section.expandable === true && isCollapsed(section.id);
        const showHeader = !collapsed && section.id !== "explore";
        return (
          <div key={section.id} className={styles.group} data-section={section.id}>
            {showHeader ? (
              section.expandable ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={!sectionCollapsed}
                  aria-controls={`studio-v5-nav-${section.id}`}
                  className={`${styles.groupToggle} ${STUDIO_FOCUS_RING_CLASS}`}
                >
                  <span>{section.label}</span>
                  <span className={styles.chevron} data-open={sectionCollapsed ? undefined : "true"} aria-hidden="true">
                    <StudioNavIcon name="chevron" size={12} />
                  </span>
                </button>
              ) : (
                <p className={styles.groupLabel} id={`studio-v5-nav-label-${section.id}`}>
                  {section.label}
                </p>
              )
            ) : null}
            {sectionCollapsed ? null : (
              <ul
                id={`studio-v5-nav-${section.id}`}
                className={styles.list}
                aria-labelledby={showHeader && !section.expandable ? `studio-v5-nav-label-${section.id}` : undefined}
              >
                {section.entries.map((entry, entryIndex) => {
                  const index = (offsets[sectionIndex] ?? 0) + entryIndex;
                  const resolved = resolveStudioV5Entry(entry, { projectId });
                  const active = isStudioEntryActive(pathname ?? "/", entry);
                  const tabIndex = index === focusIndex ? 0 : -1;
                  const label = entry.label;
                  const content = (
                    <>
                      <span className={styles.icon}>
                        <StudioNavIcon name={entry.icon} />
                      </span>
                      <span className={styles.label}>{label}</span>
                    </>
                  );
                  if (!resolved.resolvedHref || resolved.disabledReason) {
                    return (
                      <li key={entry.id}>
                        <span
                          ref={(node) => {
                            itemRefs.current[index] = node;
                          }}
                          tabIndex={tabIndex}
                          role="link"
                          aria-disabled="true"
                          title={resolved.disabledReason ?? undefined}
                          aria-label={`${label} (${resolved.disabledReason ?? "unavailable"})`}
                          onKeyDown={(event) => onKeyDown(event, index)}
                          onFocus={() => setFocusIndex(index)}
                          className={`${styles.row} ${STUDIO_FOCUS_RING_CLASS}`}
                          data-disabled="true"
                          data-control-state="disabled-with-reason"
                        >
                          {content}
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={entry.id}>
                      <Link
                        ref={(node) => {
                          itemRefs.current[index] = node;
                        }}
                        href={preserveStudioQuery(resolved.resolvedHref, currentSearch)}
                        tabIndex={tabIndex}
                        aria-current={active ? "page" : undefined}
                        aria-label={collapsed ? label : undefined}
                        title={collapsed ? label : undefined}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        onFocus={() => setFocusIndex(index)}
                        onClick={onNavigate}
                        className={`${styles.row} ${STUDIO_FOCUS_RING_CLASS}`}
                        data-active={active ? "true" : undefined}
                        data-nav-entry={entry.id}
                      >
                        {content}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
