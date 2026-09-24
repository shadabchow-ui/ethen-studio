"use client";

import Link from "next/link";
import type { StudioLibraryFrameProps } from "./types";
import { STUDIO_FOCUS_RING_CLASS } from "./tokens";
import { StudioEmptyState, StudioErrorState } from "./states";

/**
 * STUDIO_08 — shared library frame (authority §17 Library archetype):
 * scope/search/filter + card/table toggle, selection toolbar, detail
 * slot via children, and a useful empty action. The switcher hosts the
 * Identities tabs (characters/products/brands) inside libraries.
 */
export function StudioLibraryFrame({
  title,
  scopeLabel,
  searchValue,
  searchLabel,
  onSearchChange,
  view,
  onViewChange,
  filters,
  switcher,
  activeSwitcherId,
  selectionCount,
  selectionActions,
  state,
  emptyProps,
  errorProps,
  onRetry,
  children,
}: StudioLibraryFrameProps) {
  return (
    <section aria-label={title} className="space-y-4">
      <div className="flex flex-col gap-3">
        {scopeLabel ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{scopeLabel}</p>
        ) : null}
        {switcher && switcher.length > 0 ? (
          <div role="tablist" aria-label={`${title} libraries`} className="flex flex-wrap gap-1.5">
            {switcher.map((option) => {
              const active = option.id === activeSwitcherId;
              const disabled = !option.href && !option.onSelect;
              const className = `inline-flex min-h-[44px] items-center rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium transition ${STUDIO_FOCUS_RING_CLASS} ${
                active
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
              if (option.onSelect) {
                return (
                  <button key={option.id} type="button" role="tab" aria-selected={active} onClick={option.onSelect} className={className}>
                    {option.label}
                  </button>
                );
              }
              if (!option.href) {
                return (
                  <span key={option.id} role="tab" aria-selected={false} aria-disabled title={option.disabledReason} className={className}>
                    {option.label}
                  </span>
                );
              }
              return (
                <Link key={option.id} href={option.href} role="tab" aria-selected={active} className={className}>
                  {option.label}
                </Link>
              );
            })}
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex min-h-[44px] flex-1 items-center gap-2 rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-inset)] px-3 transition-colors duration-150 focus-within:border-[var(--border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
            <span className="sr-only">{searchLabel}</span>
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchLabel}
              aria-label={searchLabel}
              className="w-full bg-transparent py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            />
          </label>
          <div role="group" aria-label="Layout" className="flex gap-1">
            {(["cards", "table"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onViewChange(option)}
                aria-pressed={view === option}
                aria-label={`${option === "cards" ? "Card" : "Table"} layout`}
                className={`inline-flex min-h-[44px] items-center rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-150 ${STUDIO_FOCUS_RING_CLASS} ${
                  view === option
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {option === "cards" ? "Cards" : "Table"}
              </button>
            ))}
          </div>
        </div>
        {filters ? <div className="flex flex-wrap gap-2">{filters}</div> : null}
        {selectionCount > 0 ? (
          <div
            role="toolbar"
            aria-label={`${selectionCount} selected`}
            className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2"
          >
            <span className="text-[12.5px] text-[var(--text-secondary)]">{selectionCount} selected</span>
            {selectionActions}
          </div>
        ) : null}
      </div>

      {state === "loading" ? (
        <p role="status" className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-12 text-center text-[13px] text-[var(--text-tertiary)] motion-safe:animate-pulse">
          Loading…
        </p>
      ) : null}
      {state === "empty" && emptyProps ? <StudioEmptyState {...emptyProps} /> : null}
      {(state === "error" || state === "setup" || state === "permission") && errorProps ? (
        <StudioErrorState {...errorProps} onRetry={state === "error" ? (onRetry ?? errorProps.onRetry) : undefined} retryLabel={state === "error" ? errorProps.retryLabel : undefined} />
      ) : null}
      {state === "ready" ? children : null}
    </section>
  );
}
