"use client";

/**
 * CHAT_A1 — the ⌘K palette.
 *
 * Personal content first (Chats, Projects, Artifacts). Platform destinations
 * are allowed to appear, but always last and always labelled, so the palette
 * never quietly turns the Chat surface into a platform launcher.
 *
 * Real dialog semantics: `role="dialog" aria-modal`, focus moved to the input
 * on open, focus trapped inside, Escape closes and returns focus to whatever
 * opened it, and the scrim is not the only way out.
 */
import * as React from "react";
import { Icon } from "../icons";
import { SEARCH_RESULTS, type SearchResult } from "./chat-fixtures";
import styles from "./search-palette.module.css";

/**
 * S3.5 Studio-required surface: action rows for live product surfaces.
 * Beta capabilities render visibly disabled with a subdued badge.
 */
export type PaletteAction = Readonly<{
  id: string;
  label: string;
  beta?: boolean;
}>;

const GROUP_ORDER: readonly SearchResult["group"][] = ["Chats", "Projects", "Artifacts", "Ethen Platform", "Studio"];

export function SearchPalette({
  open,
  onClose,
  initialQuery = "",
  onActivate,
  results: liveResults,
  live = false,
  actions,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
  /** CHAT_A3 — Enter/click activation of the highlighted result (defaults to close). */
  onActivate?: (result: SearchResult) => void;
  /** S3.5 — live results (real product items). Absent keeps the lab fixtures. */
  results?: readonly SearchResult[];
  /** S3.5 — live product surface: honest disabled reasons, no fixture copy. */
  live?: boolean;
  /** S3.5 — action rows (e.g. Studio commands). Absent renders no action group. */
  actions?: readonly PaletteAction[];
  /** S3.5 — action handler. Absent closes without acting. */
  onAction?: (action: PaletteAction) => void;
}) {
  const [query, setQuery] = React.useState(initialQuery);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const optionRefs = React.useRef(new Map<string, HTMLButtonElement>());

  const source = liveResults ?? SEARCH_RESULTS;
  const results = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [...source];
    return source.filter(
      (result) =>
        result.title.toLowerCase().includes(needle) || result.detail.toLowerCase().includes(needle),
    );
  }, [query, source]);

  const activateAction = React.useCallback(
    (action: PaletteAction) => {
      if (action.beta === true) return;
      onAction?.(action);
      onClose();
    },
    [onAction, onClose],
  );

  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        // Trap: the palette is modal, so Tab may not walk the page behind it.
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'input, button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: results.filter((result) => result.group === group),
  })).filter((entry) => entry.items.length > 0);

  const flat = grouped.flatMap((entry) => entry.items);
  // The query can shrink the list under a stale highlight — clamp, never strand.
  const safeActive = flat.length === 0 ? -1 : Math.min(activeIndex, flat.length - 1);
  const activeItem = safeActive >= 0 ? flat[safeActive] : undefined;

  const activate = React.useCallback(
    (result: SearchResult | undefined) => {
      if (!result) return;
      onActivate?.(result);
      onClose();
    },
    [onActivate, onClose],
  );

  // The highlighted option stays visible while arrowing through a long list.
  React.useEffect(() => {
    if (activeItem) optionRefs.current.get(activeItem.id)?.scrollIntoView({ block: "nearest" });
  }, [activeItem]);

  // CHAT_A5.1 — keyboard navigation skips unavailable results; Enter never
  // activates one. A fully-disabled list leaves the highlight where it is.
  // Plain function (not memoized): it closes over the per-render list.
  const stepActive = (from: number, direction: 1 | -1) => {
    if (flat.length === 0) return from;
    let next = from;
    for (let guard = 0; guard < flat.length; guard += 1) {
      next = (next + direction + flat.length) % flat.length;
      if (!flat[next].disabled) return next;
    }
    return from;
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => stepActive(current, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => stepActive(current, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeItem && !activeItem.disabled) activate(activeItem);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.scrim} onPointerDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search Ethen Chat"
        className={styles.palette}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className={styles.inputRow}>
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            value={query}
            placeholder="Search chats, projects and artifacts"
            aria-label="Search chats, projects and artifacts"
            aria-controls="chat-palette-results"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? `chat-palette-option-${activeItem.id}` : undefined}
            onChange={(event) => {
              // Reset the highlight with the query, in the handler rather
              // than an effect: an effect here would render twice per keystroke.
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
          />
          <kbd className={styles.kbd}>Esc</kbd>
        </div>

        <div className={styles.results} id="chat-palette-results" role="listbox" aria-label="Results">
          {grouped.length === 0 && (actions ?? []).length === 0 ? (
            <p className={styles.empty}>Nothing matches “{query}”.</p>
          ) : (
            grouped.map((entry) => (
              <div className={styles.group} key={entry.group} role="presentation">
                <p className={styles.groupLabel}>{entry.group}</p>
                <ul>
                  {entry.items.map((item) => {
                    const index = flat.indexOf(item);
                    const active = index === safeActive && !item.disabled;
                    return (
                      <li key={item.id}>
                        <button
                          ref={(node) => {
                            if (node) optionRefs.current.set(item.id, node);
                            else optionRefs.current.delete(item.id);
                          }}
                          type="button"
                          role="option"
                          id={`chat-palette-option-${item.id}`}
                          aria-selected={active}
                          aria-disabled={item.disabled ? true : undefined}
                          className={styles.result}
                          data-active={active ? "true" : undefined}
                          disabled={item.disabled}
                          title={item.disabled ? (live ? "Not available yet" : "Not available in this lab preview") : undefined}
                          onMouseEnter={() => {
                            if (!item.disabled) setActiveIndex(index);
                          }}
                          onClick={() => activate(item)}
                        >
                          <span className={styles.resultTitle}>{item.title}</span>
                          <span className={styles.resultDetail}>{item.detail}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {(actions ?? []).length > 0 ? (
            <div className={styles.group} role="presentation">
              <p className={styles.groupLabel}>Actions</p>
              <ul>
                {(actions ?? []).map((action) => (
                  <li key={action.id}>
                    <button
                      type="button"
                      role="option"
                      id={`chat-palette-action-${action.id}`}
                      aria-selected={false}
                      aria-disabled={action.beta === true ? true : undefined}
                      className={styles.result}
                      disabled={action.beta === true}
                      title={
                        action.beta === true
                          ? live
                            ? `${action.label} is not available yet`
                            : "Not available in this lab preview"
                          : undefined
                      }
                      onClick={() => activateAction(action)}
                    >
                      <span className={styles.resultTitle}>{action.label}</span>
                      {action.beta === true ? <span className={styles.resultDetail}>Beta</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className={styles.footer}>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span className={styles.footerNote}>{live ? "Live results" : "Design lab — results are fixtures"}</span>
        </div>
      </div>
    </div>
  );
}
