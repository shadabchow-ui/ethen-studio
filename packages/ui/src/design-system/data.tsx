"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { StatusBadge, type StatusTone } from "../status-badge";

const focus = "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]";
const row = "min-h-9 border-b border-[var(--border-subtle)] px-3 py-2 text-[13px] text-[var(--text-primary)] last:border-b-0";

export interface SimpleRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  detail?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

/** A dense, generic row for operational lists. */
export function SimpleRow({ title, detail, leading, trailing, className, ...props }: SimpleRowProps) {
  return <div className={cn("flex items-center gap-3", row, className)} {...props}>
    {leading ? <div className="shrink-0">{leading}</div> : null}
    <div className="min-w-0 flex-1"><div className="truncate font-medium">{title}</div>{detail ? <div className="mt-0.5 truncate text-[12px] text-[var(--text-tertiary)]">{detail}</div> : null}</div>
    {trailing ? <div className="shrink-0 text-[12px] text-[var(--text-tertiary)]">{trailing}</div> : null}
  </div>;
}

export interface MetadataRowProps extends React.HTMLAttributes<HTMLDivElement> { label: React.ReactNode; value: React.ReactNode; }
export function MetadataRow({ label, value, className, ...props }: MetadataRowProps) {
  return <div className={cn("flex items-baseline justify-between gap-4", row, className)} {...props}><span className="shrink-0 text-[12px] text-[var(--text-tertiary)]">{label}</span><span className="min-w-0 truncate text-right font-mono text-[12px] text-[var(--text-secondary)]">{value}</span></div>;
}

export interface StatusRowProps extends SimpleRowProps { status: string; tone?: StatusTone; }
export function StatusRow({ status, tone = "neutral", trailing, ...props }: StatusRowProps) {
  return <SimpleRow {...props} trailing={<div className="flex items-center gap-3"><StatusBadge tone={tone} label={status} />{trailing}</div>} />;
}

export interface ActionRowProps extends SimpleRowProps { actionLabel: string; onAction?: () => void; actionDisabled?: boolean; }
export function ActionRow({ actionLabel, onAction, actionDisabled, ...props }: ActionRowProps) {
  return <SimpleRow {...props} trailing={<button type="button" onClick={onAction} disabled={actionDisabled} className={cn("h-8 shrink-0 rounded-[var(--v2-radius-base)] px-2.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45", focus)}>{actionLabel}</button>} />;
}

export interface ExpandableRowProps extends Omit<SimpleRowProps, "trailing"> { children: React.ReactNode; defaultOpen?: boolean; }
export function ExpandableRow({ children, defaultOpen = false, title, detail, leading, className, ...props }: ExpandableRowProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return <div className={cn("border-b border-[var(--border-subtle)] last:border-b-0", className)} {...props}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cn("flex min-h-9 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-elevated)]", focus)}>
      {leading ? <span className="shrink-0">{leading}</span> : null}<span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{title}</span>{detail ? <span className="mt-0.5 block truncate text-[12px] text-[var(--text-tertiary)]">{detail}</span> : null}</span><span aria-hidden className="text-[12px] text-[var(--text-tertiary)]">{open ? "−" : "+"}</span>
    </button>
    {open ? <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-inset)] px-3 py-3 text-[13px] text-[var(--text-secondary)]">{children}</div> : null}
  </div>;
}

export interface SelectableRowProps extends SimpleRowProps { selected?: boolean; onSelectedChange?: (selected: boolean) => void; }
export function SelectableRow({ selected = false, onSelectedChange, className, ...props }: SelectableRowProps) {
  return <div className={cn("flex items-center gap-3", row, selected && "bg-[var(--bg-elevated)]", className)}>
    <input type="checkbox" checked={selected} onChange={(event) => onSelectedChange?.(event.target.checked)} aria-label={`Select ${typeof props.title === "string" ? props.title : "row"}`} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
    <SimpleRow {...props} className="min-h-0 flex-1 !border-b-0 !px-0 !py-0" />
  </div>;
}

export interface TableColumn<T> { id: string; header: React.ReactNode; cell: (row: T, index: number) => React.ReactNode; align?: "left" | "right"; minWidth?: number; sortable?: boolean; }
export interface TableProps<T> { columns: TableColumn<T>[]; rows: T[]; rowKey: (row: T, index: number) => string; className?: string; children?: React.ReactNode; }
export function Table<T>({ columns, rows, rowKey, className, children }: TableProps<T>) {
  return <div className={cn("min-w-0 max-w-full overflow-x-auto border-y border-[var(--border-subtle)] bg-[var(--bg-surface)]", className)}><table className="w-full min-w-[720px] border-collapse text-[13px]"><TableHeader columns={columns} /><tbody>{rows.map((item, index) => <TableRow key={rowKey(item, index)}>{columns.map((column) => <TableCell key={column.id} align={column.align}>{column.cell(item, index)}</TableCell>)}</TableRow>)}</tbody></table>{children}</div>;
}

export function TableHeader<T>({ columns }: { columns: TableColumn<T>[] }) {
  return <thead className="bg-[var(--bg-inset)]"><tr>{columns.map((column) => <th key={column.id} scope="col" style={column.minWidth ? { minWidth: column.minWidth } : undefined} className={cn("h-9 border-b border-[var(--border-subtle)] px-3 text-left text-[12px] font-medium text-[var(--text-tertiary)]", column.align === "right" && "text-right")}>{column.header}</th>)}</tr></thead>;
}
export function TableRow({ children, className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) { return <tr className={cn("border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-elevated)]", className)} {...props}>{children}</tr>; }
export function TableCell({ align, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" }) { return <td className={cn("h-9 px-3 text-[13px] text-[var(--text-secondary)]", align === "right" && "text-right", className)} {...props} />; }

export interface SortControlProps { label: string; direction?: "ascending" | "descending" | undefined; onChange?: (direction: "ascending" | "descending" | undefined) => void; }
export function SortControl({ label, direction, onChange }: SortControlProps) {
  const next = direction === undefined ? "ascending" : direction === "ascending" ? "descending" : undefined;
  const symbol = direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕";
  return <button type="button" onClick={() => onChange?.(next)} aria-label={`${label}, ${direction ?? "not sorted"}; activate to ${next ?? "clear sorting"}`} className={cn("inline-flex h-8 items-center gap-1 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]", focus)}>{label}<span aria-hidden>{symbol}</span></button>;
}

export interface FilterBarProps { query?: string; onQueryChange?: (query: string) => void; placeholder?: string; children?: React.ReactNode; actions?: React.ReactNode; className?: string; }
export function FilterBar({ query = "", onQueryChange, placeholder = "Filter…", children, actions, className }: FilterBarProps) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}><label className="sr-only" htmlFor="data-filter-query">{placeholder}</label><input id="data-filter-query" value={query} onChange={(event) => onQueryChange?.(event.target.value)} placeholder={placeholder} className={cn("h-8 min-w-[180px] flex-1 rounded-[var(--v2-radius-base)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]", focus)} />{children}{actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}</div>;
}

export interface ColumnPickerProps { columns: Array<{ id: string; label: string }>; visible: string[]; onVisibleChange: (visible: string[]) => void; }
export function ColumnPicker({ columns, visible, onVisibleChange }: ColumnPickerProps) {
  return <details className="relative"><summary className={cn("flex h-8 cursor-pointer list-none items-center rounded-[var(--v2-radius-base)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]", focus)}>Columns</summary><div className="absolute right-0 z-10 mt-1 w-44 rounded-[var(--v2-radius-base)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 shadow-[var(--shadow-sm)]">{columns.map((column) => { const checked = visible.includes(column.id); return <label key={column.id} className="flex min-h-8 cursor-pointer items-center gap-2 px-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"><input type="checkbox" checked={checked} onChange={() => onVisibleChange(checked ? visible.filter((id) => id !== column.id) : [...visible, column.id])} className="h-4 w-4 accent-[var(--accent)]" />{column.label}</label>; })}</div></details>;
}

export interface PaginationProps { page: number; pageCount: number; onPageChange: (page: number) => void; totalLabel?: string; }
export function Pagination({ page, pageCount, onPageChange, totalLabel }: PaginationProps) {
  const pages = Array.from({ length: Math.min(pageCount, 5) }, (_, index) => index + 1);
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 py-3"><p className="text-[12px] text-[var(--text-tertiary)]">{totalLabel}</p><div className="flex items-center gap-1"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={cn("h-8 rounded-[var(--v2-radius-base)] px-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-45", focus)}>Previous</button>{pages.map((item) => <button key={item} type="button" aria-current={item === page ? "page" : undefined} onClick={() => onPageChange(item)} className={cn("h-8 min-w-8 rounded-[var(--v2-radius-base)] px-2 text-[13px]", item === page ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]", focus)}>{item}</button>)}<button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className={cn("h-8 rounded-[var(--v2-radius-base)] px-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-45", focus)}>Next</button></div></nav>;
}

export interface DataShellProps { header: React.ReactNode; tabs?: React.ReactNode; filters?: React.ReactNode; children: React.ReactNode; pagination?: React.ReactNode; status?: React.ReactNode; className?: string; }
/** Composes page header → tabs → filters/actions → data → pagination/status without introducing a card surface. */
export function DataShell({ header, tabs, filters, children, pagination, status, className }: DataShellProps) { return <section className={cn("min-w-0 space-y-4", className)}>{header}{tabs ? <div className="border-b border-[var(--border-subtle)]">{tabs}</div> : null}{filters}{children}{pagination || status ? <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)]">{pagination}{status ? <div className="pb-3 text-[12px] text-[var(--text-tertiary)]">{status}</div> : null}</footer> : null}</section>; }
