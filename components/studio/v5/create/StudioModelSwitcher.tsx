/**
 * STUDIO_M3A — the one canonical Studio model switcher.
 *
 * Replaces the five project + create model pickers (CreateModelPicker,
 * AudioModelRow, StudioModelPicker, StudioModelPickerV5, and the
 * StudioModelDetail select drawer) with a single task-bound dialog over
 * the qualified V1 catalog projection: Auto plus exact endpoints with
 * Recommended/Recent/Favorites/Browse tabs, debounced search, keyboard
 * navigation, virtualized rows, reason-disabled entries, and an inline
 * detail section for the selected endpoint. Support truth comes from
 * the registry, never fixtures.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useModelFavorites, useModelRecents } from "../../studio-model-favorites";
import { useCatalogProjection } from "../discovery/useCatalogProjection";
import { providerHealthLabel, useProviderHealth, type ProviderHealthView } from "../health/provider-health";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import {
  SWITCHER_TABS,
  SWITCHER_VIEWPORT_HEIGHT,
  selectSwitcherRows,
  windowRows,
  type SwitcherRow,
  type SwitcherTab,
} from "./model-switcher-model";

/** Dense switcher rows (M3B): one 32px line per endpoint. */
const ROW_HEIGHT = 32;
/** Open/close duration; reduced motion skips it. */
const MOTION_MS = 140;
const RING = "outline-none focus-visible:outline-2! focus-visible:outline-solid! focus-visible:outline-offset-[-2px]! focus-visible:outline-[var(--studio-focus)]!";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function SwitcherRowView({
  row,
  selected,
  active,
  favorite,
  health,
  healthLoading,
  onPick,
  onToggleFavorite,
}: {
  row: SwitcherRow;
  selected: boolean;
  active: boolean;
  favorite: boolean;
  health: Record<string, ProviderHealthView> | null;
  healthLoading: boolean;
  onPick: () => void;
  onToggleFavorite: () => void;
}) {
  // M4: qualified rows carry their provider's measured health (data
  // only); blocked and Auto rows keep their existing badges.
  const measured = row.id === "auto" || row.blocked ? null : (health?.[row.provider] ?? null);
  const badge =
    row.id === "auto"
      ? "Auto"
      : row.blocked
        ? (row.blockedReason ?? "Unavailable")
        : `Qualified · ${providerHealthLabel(measured, healthLoading)}`;
  return (
    <div
      role="listitem"
      data-create-model-row={row.id}
      data-selected={selected ? "true" : undefined}
      data-provider-health={measured ? providerHealthLabel(measured, false) : undefined}
      className={`group flex h-full items-center gap-1 rounded-[8px] pr-1 transition-colors ${selected ? "bg-[var(--studio-bg-selected)]" : active ? "bg-[var(--bg-surface)]" : "hover:bg-[var(--bg-surface)]"}`}
    >
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        aria-label={row.blocked ? `${row.label} — ${row.blockedReason ?? "unavailable"}` : `Select ${row.label}`}
        data-create-model-pick={row.id}
        onClick={onPick}
        className={`flex h-full min-w-0 flex-1 items-center gap-2 rounded-[8px] px-2 text-left ${row.blocked ? "cursor-not-allowed" : ""} ${RING}`}
      >
        <span aria-hidden="true" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-inset)] text-[10px] font-semibold ${row.blocked ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]"}`}>
          {row.provider.charAt(0).toUpperCase()}
        </span>
        <span className={`min-w-0 shrink truncate text-[12.5px] ${row.blocked ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"} ${selected ? "font-medium" : ""}`}>{row.label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[var(--text-tertiary)]">{row.id === "auto" ? row.detail : row.id}</span>
        <span
          className={`max-w-[150px] shrink-0 truncate rounded-[5px] border px-1.5 py-[2px] text-[10.5px] leading-none ${row.id === "auto" ? "border-[var(--studio-accent)]/40 text-[var(--text-primary)]" : row.blocked ? "border-[var(--border-subtle)] text-[var(--text-tertiary)]" : "border-[var(--border-default)] text-[var(--text-secondary)]"}`}
        >
          {badge}
        </span>
        {selected ? (
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 text-[var(--studio-accent)]"><path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : null}
      </button>
      {row.id !== "auto" && !row.blocked ? (
        <button
          type="button"
          aria-label={favorite ? `Remove ${row.label} from favorites` : `Add ${row.label} to favorites`}
          aria-pressed={favorite}
          onClick={onToggleFavorite}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[13px] transition-opacity ${favorite ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"} hover:text-[var(--text-primary)] ${RING}`}
        >
          {favorite ? "★" : "☆"}
        </button>
      ) : null}
    </div>
  );
}

export function StudioModelSwitcher({
  open,
  onOpenChange,
  projectId,
  task = null,
  selectedId,
  onSelect,
  onCompare,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  /** Catalog task scope; null keeps every endpoint (the models-library scope). */
  task?: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCompare?: (id: string) => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [tab, setTab] = React.useState<SwitcherTab>("recommended");
  const [active, setActive] = React.useState(0);
  const [scrollTop, setScrollTop] = React.useState(0);
  const { favorites, toggleFavorite } = useModelFavorites();
  const { recents, pushRecent } = useModelRecents();
  const { state: catalogState, projection, retry } = useCatalogProjection(projectId);
  const { health: providerHealth, loading: providerHealthLoading } = useProviderHealth();
  const listRef = React.useRef<HTMLDivElement | null>(null);
  // Mounted while open or animating closed; `entered` drives the transition.
  const [present, setPresent] = React.useState(open);
  const [entered, setEntered] = React.useState(false);
  if (open && !present) setPresent(true);
  React.useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    // Closed: `shown` is already false (it requires `open`); unmount after the fade.
    if (!present) return;
    const handle = window.setTimeout(() => {
      setPresent(false);
      setEntered(false);
    }, reducedMotion() ? 0 : MOTION_MS);
    return () => window.clearTimeout(handle);
  }, [open, present]);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open ]);

  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  const close = React.useCallback(() => {
    onOpenChange(false);
    requestAnimationFrame(() => returnFocusRef?.current?.focus());
  }, [onOpenChange, returnFocusRef]);

  const selection = React.useMemo(
    () =>
      selectSwitcherRows({
        endpoints: projection?.endpoints ?? [],
        task: task ?? null,
        query: debounced,
        tab,
        favorites,
        recents,
      }),
    [projection, task, debounced, tab, favorites, recents],
  );
  const { rows } = selection;

  const { start, visible } = windowRows(rows, scrollTop, SWITCHER_VIEWPORT_HEIGHT, ROW_HEIGHT);

  const pick = React.useCallback(
    (id: string) => {
      if (id !== "auto") pushRecent(id);
      onSelect(id);
      close();
    },
    [onSelect, close, pushRecent],
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => Math.min(rows.length - 1, index + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(0, index - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const row = rows[active];
        if (row && !row.blocked) pick(row.id);
      }
    },
    [close, rows, active, pick],
  );

  React.useEffect(() => {
    const top = active * ROW_HEIGHT;
    const node = listRef.current;
    if (!node) return;
    if (top < node.scrollTop) node.scrollTop = top;
    else if (top + ROW_HEIGHT > node.scrollTop + SWITCHER_VIEWPORT_HEIGHT) {
      node.scrollTop = top + ROW_HEIGHT - SWITCHER_VIEWPORT_HEIGHT;
    }
  }, [active]);

  if (!present) return null;
  const shown = open && entered;

  const selectTab = (next: SwitcherTab) => {
    setTab(next);
    setActive(0);
    setScrollTop(0);
    listRef.current?.scrollTo({ top: 0 });
  };

  const selected =
    selectedId && selectedId !== "auto"
      ? (selection.scoped.find((endpoint) => endpoint.endpointId === selectedId) ?? null)
      : null;
  const selectedFavorite = selected ? favorites.includes(selected.endpointId) : false;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--studio-bg-app)]/50 p-4 pt-[8vh] transition-opacity duration-[140ms] ease-out motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"} ${open ? "" : "pointer-events-none"}`}
      role="presentation"
      onClick={close}
    >
      <div
        role="dialog"
        aria-label="Choose model"
        aria-modal="true"
        data-testid="studio-model-switcher"
        data-state={open ? "open" : "closed"}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        className={`w-full max-w-[640px] overflow-hidden rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_24px_70px_rgb(0_0_0/0.6)] transition-[opacity,transform] duration-[140ms] ease-out motion-reduce:transition-none ${shown ? "translate-y-0 scale-100 opacity-100" : "-translate-y-1 scale-[0.985] opacity-0"}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5">
          <strong className="text-[13.5px] font-semibold text-[var(--text-primary)]">Choose model</strong>
          <button
            type="button"
            onClick={close}
            aria-label="Close model picker"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] ${RING}`}
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="space-y-2.5 px-3 pt-3">
          <input
            ref={searchRef}
            type="search"
            role="searchbox"
            aria-label="Search models"
            placeholder={
              projection
                ? `Search ${selection.scoped.length} ${task ?? "catalog"} endpoints...`
                : "Search models..."
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`h-9 w-full rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-inset)] px-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] ${RING}`}
          />
          <div role="tablist" aria-label="Model lists" className="flex gap-1 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-[3px]">
            {SWITCHER_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => selectTab(id)}
                className={`h-7 flex-1 rounded-[7px] px-2 text-[12px] capitalize transition-colors ${tab === id ? "bg-[var(--bg-elevated)] font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgb(0_0_0/0.35)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"} ${RING}`}
              >
                {id}
                <span className="ml-1 text-[11px] text-[var(--text-tertiary)]">{selection.counts[id]}</span>
              </button>
            ))}
          </div>
          {selected ? (
            <section
              aria-label="Selected model detail"
              data-testid="create-picker-selection"
              className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-secondary)]"
            >
              <div className="flex items-start justify-between gap-2">
                <p>
                  Selected: <strong className="text-[var(--text-primary)]">{selected.label}</strong> · {selected.endpointId} ·{" "}
                  {selected.executable ? "qualified endpoint" : (selected.disabledReasons[0] ?? "unavailable")}
                </p>
                <button
                  type="button"
                  onClick={() => toggleFavorite(selected.endpointId)}
                  aria-pressed={selectedFavorite}
                  aria-label={selectedFavorite ? `Remove ${selected.label} from favorites` : `Add ${selected.label} to favorites`}
                  className="shrink-0 rounded-[6px] px-1.5 py-0.5 text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {selectedFavorite ? "★" : "☆"}
                </button>
              </div>
              <dl className="mt-1.5 space-y-0.5">
                <div className="flex gap-2">
                  <dt className="text-[var(--text-tertiary)]">Provider</dt>
                  <dd>{selected.providerId}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-[var(--text-tertiary)]">Family</dt>
                  <dd>{selected.familyLabel}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-[var(--text-tertiary)]">Task</dt>
                  <dd className="font-mono text-[11.5px]">{selected.task}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-[var(--text-tertiary)]">Parameters</dt>
                  <dd>
                    {selected.supportedParameters.length} supported
                    {selected.requiredParameters.length > 0
                      ? ` · required: ${selected.requiredParameters.join(", ")}`
                      : " · none required"}
                  </dd>
                </div>
                {selected.disabledReasons.length > 1 ? (
                  <div className="flex gap-2">
                    <dt className="text-[var(--text-tertiary)]">Unavailable</dt>
                    <dd>{selected.disabledReasons.join(" · ")}</dd>
                  </div>
                ) : null}
              </dl>
              {onCompare ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onCompare(selected.endpointId);
                      close();
                    }}
                    className={`rounded-[8px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
                  >
                    Compare
                  </button>
                </div>
              ) : null}
            </section>
          ) : (
            <p data-testid="create-picker-selection" className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
              Selected: <strong className="text-[var(--text-primary)]">Auto</strong> · deterministic best match with a recorded reason.
            </p>
          )}
        </div>
        <div role="status" data-catalog-state={catalogState} className="px-4 pb-1.5 pt-2.5 text-[11px] text-[var(--text-tertiary)]">
          {catalogState === "loading" ? (
            "Loading catalog…"
          ) : catalogState === "error" ? (
            <span>
              Catalog failed to load.{" "}
              <button type="button" onClick={retry} className={`rounded-[4px] text-[var(--text-primary)] underline ${RING}`}>
                Retry
              </button>
            </span>
          ) : catalogState === "permission" ? (
            "Catalog needs project access — sign in with a project member account."
          ) : catalogState === "setup" ? (
            "This project has no Studio data scope yet."
          ) : catalogState === "empty" ? (
            "No endpoints are published for this project yet."
          ) : (
            `${selection.searched.length} result${selection.searched.length === 1 ? "" : "s"}`
          )}
        </div>
        {catalogState === "ready" && task && selection.scoped.length === 0 ? (
          <p role="note" className="px-4 pb-1.5 text-[12px] text-[var(--text-secondary)]">
            No catalog models serve {task} yet.{" "}
            <Link
              href={projectId ? `/studio/models?projectId=${encodeURIComponent(projectId)}` : "/studio/models"}
              className={`underline underline-offset-2 hover:text-[var(--text-primary)] ${RING}`}
            >
              Browse models
            </Link>
          </p>
        ) : null}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Models"
          tabIndex={0}
          style={{ height: SWITCHER_VIEWPORT_HEIGHT, overflowY: "auto", position: "relative" }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          className={`mx-1.5 mb-1.5 ${RING}`}
        >
          {catalogState === "loading" && rows.length <= 1 ? (
            <div aria-hidden="true" className="space-y-1 px-1.5 pt-1" style={{ position: "absolute", inset: 0 }}>
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex h-8 items-center gap-2 px-2">
                  <span className="h-[18px] w-[18px] rounded-[5px] bg-[var(--bg-surface)] motion-safe:animate-pulse" />
                  <span className="h-2.5 rounded-full bg-[var(--bg-surface)] motion-safe:animate-pulse" style={{ width: `${38 + ((index * 17) % 30)}%` }} />
                </div>
              ))}
            </div>
          ) : null}
          {rows.length === 0 && catalogState === "ready" ? (
            <p className="px-4 py-10 text-center text-[12.5px] text-[var(--text-tertiary)]">
              {tab === "favorites"
                ? "No favorites yet — star a model to pin it here."
                : tab === "recent"
                  ? "No recent models yet — pick a model from Browse."
                  : "No models match these filters."}
            </p>
          ) : null}
          <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
            {visible.map((row, index) => {
              const rowIndex = start + index;
              return (
                <div
                  key={row.id}
                  style={{ position: "absolute", top: rowIndex * ROW_HEIGHT, height: ROW_HEIGHT, left: 0, right: 0 }}
                  data-active={rowIndex === active ? "true" : undefined}
                >
                  <SwitcherRowView
                    row={row}
                    selected={selectedId === row.id || (selectedId === null && row.id === "auto")}
                    active={rowIndex === active}
                    favorite={favorites.includes(row.id)}
                    health={providerHealth}
                    healthLoading={providerHealthLoading}
                    onPick={() => {
                      if (!row.blocked) pick(row.id);
                    }}
                    onToggleFavorite={() => toggleFavorite(row.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Switcher trigger row for run-settings inspectors (replaces the
 * retired AudioModelRow with identical UI): a labelled summary button
 * that opens the one dialog, plus Reset to Auto.
 */
export function StudioModelSwitcherField({
  projectId,
  task,
  taskLabel,
  selection,
  onSelect,
}: {
  projectId: string | null;
  task: string;
  taskLabel: string;
  selection: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] text-[var(--text-secondary)]">Model for {taskLabel}</span>
      <button
        ref={(node) => {
          returnFocusRef.current = node;
        }}
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-[44px] items-center rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-inset)] px-3 text-[12.5px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] pointer-fine:min-h-[32px] ${STUDIO_FOCUS_RING_CLASS}`}
      >
        {selection === "auto" ? "Auto (recommended)" : selection}
      </button>
      <button
        type="button"
        onClick={() => onSelect("auto")}
        disabled={selection === "auto"}
        className={`inline-flex min-h-[44px] items-center rounded-[8px] px-2 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 pointer-fine:min-h-[32px] ${STUDIO_FOCUS_RING_CLASS}`}
      >
        Reset to Auto
      </button>
      <StudioModelSwitcher
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        task={task}
        selectedId={selection === "auto" ? null : selection}
        onSelect={(id) => {
          onSelect(id);
          setOpen(false);
        }}
        returnFocusRef={returnFocusRef}
      />
    </div>
  );
}
