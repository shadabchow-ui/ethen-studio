"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import styles from "../v2.module.css";
import { V2Badge } from "../Badge";

// ── Column descriptor ─────────────────────────────────────────────
export interface V2TableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  align?: "left" | "right" | "center";
  minWidth?: number;
  sortable?: boolean;
  sortDirection?: "ascending" | "descending";
  onSort?: () => void;
  hidden?: boolean;
}

// ── Table ─────────────────────────────────────────────────────────
export interface V2DataTableProps<T> {
  columns: V2TableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  caption?: string;
  emptyState?: React.ReactNode;
  loading?: boolean;
  error?: React.ReactNode;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onToggleRow?: (key: string, selected: boolean) => void;
  onToggleAll?: (selected: boolean) => void;
  expandable?: boolean;
  expandedKeys?: Set<string>;
  onToggleExpand?: (key: string) => void;
  renderExpanded?: (row: T, index: number) => React.ReactNode;
  stickyHeader?: boolean;
  density?: "comfortable" | "compact";
  className?: string;
  "aria-label"?: string;
}

function SortIcon({ dir }: { dir?: "ascending" | "descending" }) {
  if (dir === "ascending") return <span aria-hidden className="text-[11px]">↑</span>;
  if (dir === "descending") return <span aria-hidden className="text-[11px]">↓</span>;
  return <span aria-hidden className="text-[11px] opacity-40">↕</span>;
}

export function V2DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyState,
  loading,
  error,
  selectable,
  selectedKeys,
  onToggleRow,
  onToggleAll,
  expandable,
  expandedKeys,
  onToggleExpand,
  renderExpanded,
  stickyHeader = true,
  density = "comfortable",
  className,
  "aria-label": ariaLabel,
}: V2DataTableProps<T>) {
  const visibleCols = columns.filter((c) => !c.hidden);
  const allSelected = rows.length > 0 && rows.every((r, i) => selectedKeys?.has(rowKey(r, i)));
  const someSelected = !allSelected && rows.some((r, i) => selectedKeys?.has(rowKey(r, i)));

  if (error) {
    return (
      <div role="alert" className={cn(styles.v2DataEmpty, styles.v2DataError, className)} data-v2-pattern="data-surface">
        <p className={styles.v2DataEmptyTitle}>Could not load</p>
        <p className={styles.v2DataEmptyDesc}>{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn(styles.v2DataTableWrap, className)} role="status" aria-busy="true" aria-label={ariaLabel} data-v2-pattern="data-surface">
        {caption ? <span className="sr-only">{caption}</span> : null}
        <div className={styles.v2DataSkeleton} aria-hidden>
          <div className={styles.v2SkeletonBar} style={{ width: "38%" }} />
          <div className={styles.v2SkeletonBar} style={{ width: "72%" }} />
          <div className={styles.v2SkeletonBar} style={{ width: "54%" }} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(styles.v2DataTableWrap, className)} role={ariaLabel ? "group" : undefined} aria-label={ariaLabel} data-v2-pattern="data-surface">
      <div className={styles.v2DataScroll} tabIndex={0} role="region" aria-label={ariaLabel ? `${ariaLabel} table` : "Scrollable table"}>
        <table className={cn(styles.v2Table, density === "compact" && styles.v2TableCompact)}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className={cn(stickyHeader && styles.v2TheadSticky)}>
            <tr>
              {selectable ? (
                <th scope="col" className={cn(styles.v2Th, styles.v2ThCheck)}>
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={(e) => onToggleAll?.(e.target.checked)}
                    className={styles.v2Check}
                  />
                </th>
              ) : null}
              {expandable ? <th scope="col" className={cn(styles.v2Th, styles.v2ThExpand)} aria-label="Expand row" /> : null}
              {visibleCols.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={col.sortable ? (col.sortDirection ?? "none") : undefined}
                  style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                  className={cn(styles.v2Th, col.align === "right" && styles.v2ThRight, col.align === "center" && styles.v2ThCenter)}
                >
                  {col.sortable && col.onSort ? (
                    <button type="button" onClick={col.onSort} className={styles.v2SortButton} aria-label={`${typeof col.header === "string" ? col.header : col.id} — ${col.sortDirection ?? "not sorted"}`}>
                      <span>{col.header}</span>
                      <SortIcon dir={col.sortDirection} />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + (selectable ? 1 : 0) + (expandable ? 1 : 0)} className={styles.v2TdEmpty}>
                  {emptyState ?? "No records."}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const key = rowKey(row, idx);
                const selected = selectedKeys?.has(key);
                const expanded = expandedKeys?.has(key);
                return (
                  <React.Fragment key={key}>
                    <tr
                      className={cn(styles.v2Tr, selected && styles.v2TrSelected, expanded && styles.v2TrExpanded)}
                      data-selected={selected ? "true" : undefined}
                      data-expanded={expanded ? "true" : undefined}
                    >
                      {selectable ? (
                        <td className={cn(styles.v2Td, styles.v2TdCheck)}>
                          <input
                            type="checkbox"
                            aria-label={`Select row ${key}`}
                            checked={!!selected}
                            onChange={(e) => onToggleRow?.(key, e.target.checked)}
                            className={styles.v2Check}
                          />
                        </td>
                      ) : null}
                      {expandable ? (
                        <td className={cn(styles.v2Td, styles.v2TdExpand)}>
                          <button
                            type="button"
                            aria-expanded={!!expanded}
                            aria-label={expanded ? "Collapse row" : "Expand row"}
                            onClick={() => onToggleExpand?.(key)}
                            className={styles.v2ExpandButton}
                          >
                            <span className={styles.v2ExpandIcon} aria-hidden>{expanded ? "−" : "+"}</span>
                          </button>
                        </td>
                      ) : null}
                      {visibleCols.map((col) => (
                        <td key={col.id} className={cn(styles.v2Td, col.align === "right" && styles.v2TdRight, col.align === "center" && styles.v2TdCenter)}>
                          {col.cell(row, idx)}
                        </td>
                      ))}
                    </tr>
                    {expandable && expanded && renderExpanded ? (
                      <tr className={styles.v2TrExpandedContent}>
                        <td colSpan={visibleCols.length + (selectable ? 1 : 0) + (expandable ? 1 : 0)} className={styles.v2TdExpandedContent}>
                          {renderExpanded(row, idx)}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Cell helpers — long identifiers, status, provider, price ──────
export function V2MonoCell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span className={styles.v2MonoCell} title={title ?? (typeof children === "string" ? children : undefined)}>
      {children}
    </span>
  );
}

export function V2TruncateCell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span className={styles.v2TruncateCell} title={title ?? (typeof children === "string" ? children : undefined)}>
      {children}
    </span>
  );
}

export function V2StatusCell({ label, tone }: { label: string; tone?: "neutral" | "info" | "success" | "warning" | "danger" }) {
  return <V2Badge tone={tone ?? "neutral"} size="sm">{label}</V2Badge>;
}

export function V2ProviderCell({ provider }: { provider: string }) {
  const initials = provider.slice(0, 2).toUpperCase();
  return (
    <span className={styles.v2ProviderCell}>
      <span className={styles.v2ProviderDot} aria-hidden>{initials.slice(0, 1)}</span>
      {provider}
    </span>
  );
}

export function V2PriceCell({ value }: { value: string }) {
  return <span className={styles.v2PriceCell}>{value}</span>;
}

export function V2MetadataCell({ value }: { value: string }) {
  return <span className={styles.v2MetadataCell}>{value}</span>;
}

export type { V2FilterBarProps, V2SelectProps, V2ColumnChooserProps } from "./Filters";
export { V2FilterBar, V2FilterSelect, V2ColumnChooser } from "./Filters";

// ── Pagination ─────────────────────────────────────────────────────
export interface V2PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  totalLabel?: string;
  pageSize?: number;
  onPageSizeChange?: (n: number) => void;
}

export function V2Pagination({ page, pageCount, onPageChange, totalLabel, pageSize, onPageSizeChange }: V2PaginationProps) {
  const pages = Array.from({ length: Math.min(pageCount, 7) }, (_, i) => i + 1);
  if (pageCount <= 1 && !totalLabel) return null;
  return (
    <nav aria-label="Pagination" className={styles.v2Pagination}>
      <div className={styles.v2PaginationMeta}>
        {totalLabel ? <span className={styles.v2PaginationLabel}>{totalLabel}</span> : null}
        {pageSize && onPageSizeChange ? (
          <label className={styles.v2PaginationSize}>
            <span>Rows</span>
            <select value={String(pageSize)} onChange={(e) => onPageSizeChange(Number(e.target.value))} className={styles.v2FilterSelect} aria-label="Rows per page">
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        ) : null}
      </div>
      <div className={styles.v2PaginationControls}>
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={styles.v2PageButton}>Previous</button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPageChange(p)}
            className={cn(styles.v2PageButton, p === page && styles.v2PageButtonActive)}
          >
            {p}
          </button>
        ))}
        {pageCount > 7 ? <span className={styles.v2PaginationEllipsis} aria-hidden>…</span> : null}
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className={styles.v2PageButton}>Next</button>
      </div>
    </nav>
  );
}

// ── Empty / loading / error helpers ────────────────────────────────
export function V2EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className={styles.v2DataEmpty}>
      <p className={styles.v2DataEmptyTitle}>{title}</p>
      {description ? <p className={styles.v2DataEmptyDesc}>{description}</p> : null}
      {action ? <div className={styles.v2DataEmptyAction}>{action}</div> : null}
    </div>
  );
}

export function V2LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.v2DataSkeleton} role="status" aria-busy="true" aria-label="Loading rows">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.v2SkeletonRow}>
          <div className={styles.v2SkeletonBar} style={{ width: `${62 + ((i * 13) % 30)}%` }} />
          <div className={styles.v2SkeletonBar} style={{ width: `${28 + ((i * 7) % 18)}%` }} />
        </div>
      ))}
    </div>
  );
}

// ── DataShell — flat header → filters → table → pagination ────────
export interface V2DataShellProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  filters?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function V2DataShell({ title, description, actions, tabs, filters, children, footer, className }: V2DataShellProps) {
  return (
    <section className={cn(styles.v2DataShell, className)}>
      <header className={styles.v2DataShellHeader}>
        <div className={styles.v2DataShellTitles}>
          <h2 className={styles.v2DataShellTitle}>{title}</h2>
          {description ? <p className={styles.v2DataShellDesc}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.v2DataShellActions}>{actions}</div> : null}
      </header>
      {tabs ? <div className={styles.v2DataShellTabs}>{tabs}</div> : null}
      {filters ? <div className={styles.v2DataShellFilters}>{filters}</div> : null}
      <div className={styles.v2DataShellBody}>{children}</div>
      {footer ? <footer className={styles.v2DataShellFooter}>{footer}</footer> : null}
    </section>
  );
}
