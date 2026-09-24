"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { Kbd } from "../kbd";
import { StatusDot } from "../status-dot";

/* ── CommandRow ───────────────────────────────────────────────────
   A single command result row.
   Maps to Lab Section 9 CommandRow — 40px height, icon+label+rightMeta.
   Uses real production primitives (Kbd, StatusDot), never lab clones.
   ────────────────────────────────────────────────────────────────── */

export interface CommandRowProps {
  /** Leading icon. Renders as a 20×20 block. */
  icon?: React.ReactNode;
  /** Primary label text. */
  label: string;
  /** Optional subtitle/detail shown to the right of the label (two-line layout). */
  detail?: string;
  /** Content rendered in the right gutter — shortcut kbd, scope chip, status chip, etc. */
  rightMeta?: React.ReactNode;
  /** Whether this row is currently keyboard- or mouse-highlighted. */
  isActive?: boolean;
  /** Whether the command is disabled. */
  disabled?: boolean;
  /** Reason shown when disabled. */
  disabledReason?: string;
  /** Subtle red tint for dangerous commands (muted — never full red fill). */
  danger?: boolean;
  /** Unique index for data-cmd-index attribute. */
  index?: number;
  /** Mouse enter handler for active index tracking. */
  onMouseEnter?: () => void;
  /** Click / activation handler. */
  onClick?: () => void;
  /** Additional class names. */
  className?: string;
}

export function CommandRow({
  icon,
  label,
  detail,
  rightMeta,
  isActive,
  disabled,
  disabledReason,
  danger,
  index,
  onMouseEnter,
  onClick,
  className,
}: CommandRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive || undefined}
      aria-disabled={disabled || undefined}
      data-cmd-index={index}
      onMouseEnter={onMouseEnter}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "mx-2 flex w-[calc(100%-16px)] items-start gap-3 rounded-[var(--radius-lg)] border px-3 py-2.5 text-left text-sm outline-none transition-colors",
        isActive && !disabled
          ? "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
        disabled && "cursor-not-allowed opacity-45",
        danger && isActive && "text-[var(--status-danger)]",
        className,
      )}
    >
      {/* Left icon block — fixed 20×20 */}
      {icon ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {icon}
        </span>
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}

      {/* Label + optional detail */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate">{label}</span>
        </div>
        {detail && (
          <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
            {detail}
          </p>
        )}
      </div>

      {/* Right gutter */}
      <div className="flex shrink-0 items-center gap-1.5">
        {disabledReason && !rightMeta && (
          <span className="rounded-[4px] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {disabledReason}
          </span>
        )}
        {rightMeta}
      </div>
    </button>
  );
}

/* ── CommandEmptyState ─────────────────────────────────────────────
   No-results screen for the command palette.
   Maps to Lab Section 9 EmptyStateBlock.
   ────────────────────────────────────────────────────────────────── */

export interface CommandEmptyStateProps {
  query: string;
}

export function CommandEmptyState({ query }: CommandEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-8 w-8 text-[var(--text-tertiary)]/50"
        aria-hidden
      >
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div>
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          No commands found
        </p>
        {query && (
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-tertiary)]">
            No results for &ldquo;{query}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

/* ── CommandGroup ──────────────────────────────────────────────────
   A labeled group wrapper with listbox role for a set of commands.
   Maps to Lab Section 9 CommandGroup (group label + listbox).
   ────────────────────────────────────────────────────────────────── */

export interface CommandGroupProps {
  label: string;
  children: React.ReactNode;
}

export function CommandGroup({ label, children }: CommandGroupProps) {
  return (
    <div>
      <p className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <div role="listbox" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

/* ── KeyboardHintFooter ────────────────────────────────────────────
   A footer bar showing keyboard shortcut hints.
   Maps to Lab Section 9 KeyboardHintFooter.
   Uses real production Kbd primitive.
   ────────────────────────────────────────────────────────────────── */

export interface KeyboardHint {
  keys: string;
  label: string;
}

export interface KeyboardHintFooterProps {
  hints?: KeyboardHint[];
  compact?: boolean;
}

const DEFAULT_HINTS: KeyboardHint[] = [
  { keys: "↑ ↓", label: "Navigate" },
  { keys: "↵", label: "Select" },
  { keys: "Esc", label: "Close" },
  { keys: "⌘K", label: "Open" },
  { keys: "⌘↵", label: "Run" },
];

export function KeyboardHintFooter({
  hints = DEFAULT_HINTS,
  compact,
}: KeyboardHintFooterProps) {
  const visible = compact ? hints.slice(0, 3) : hints;

  return (
    <div
      className="flex items-center gap-4 border-t border-[var(--border-subtle)] px-4 py-2.5"
      aria-label="Keyboard shortcuts"
    >
      {visible.map((h) => (
        <span key={h.keys} className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          <Kbd>{h.keys}</Kbd>
          <span className="hidden sm:inline">{h.label}</span>
        </span>
      ))}
    </div>
  );
}

/* ── ScopeChip ─────────────────────────────────────────────────────
   A small scope/label chip used as right-side metadata on command rows.
   Maps to Lab Section 9 ScopeChip.
   ────────────────────────────────────────────────────────────────── */

export interface ScopeChipProps {
  label: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}

export function ScopeChip({ label, tone = "neutral" }: ScopeChipProps) {
  const toneClass =
    tone === "success"
      ? "text-[var(--status-success)]"
      : tone === "warning"
        ? "text-[var(--status-warning)]"
        : tone === "danger"
          ? "text-[var(--status-danger)]"
          : tone === "info"
            ? "text-[var(--text-secondary)]"
            : "text-[var(--text-muted)]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-2 py-0.5 text-[10px] font-medium",
        toneClass,
      )}
    >
      {tone !== "neutral" && <StatusDot tone={tone} size="sm" />}
      {label}
    </span>
  );
}

/* ── CommandSearchIcon ─────────────────────────────────────────────
   Reusable 16×16/14×14 search magnifier icon.
   ────────────────────────────────────────────────────────────────── */

export function CommandSearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 text-[var(--text-tertiary)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.25 9.25L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
