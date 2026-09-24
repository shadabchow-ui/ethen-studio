"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import styles from "../v2.module.css";

// Visual contract from LabDataRowsTablesFiltersSection — search + slots + actions,
// labelled select, column chooser. Presentation only; callers own filter state.

export interface V2FilterBarProps {
  query: string;
  onQueryChange: (v: string) => void;
  placeholder?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
}

export function V2FilterBar({ query, onQueryChange, placeholder = "Search…", filters, actions }: V2FilterBarProps) {
  return (
    <div className={styles.v2FilterBar}>
      <label className="sr-only" htmlFor="v2-filter-query">{placeholder}</label>
      <input
        id="v2-filter-query"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        className={styles.v2FilterInput}
      />
      {filters ? <div className={styles.v2FilterSlots}>{filters}</div> : null}
      {actions ? <div className={styles.v2FilterActions}>{actions}</div> : null}
    </div>
  );
}

export interface V2SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

export function V2FilterSelect({ label, children, className, ...props }: V2SelectProps) {
  return (
    <>
      <label className="sr-only" htmlFor={`v2-filter-${label.replace(/\s+/g, "-").toLowerCase()}`}>{label}</label>
      <select id={`v2-filter-${label.replace(/\s+/g, "-").toLowerCase()}`} className={cn(styles.v2FilterSelect, className)} {...props}>
        {children}
      </select>
    </>
  );
}

export interface V2ColumnChooserProps {
  columns: Array<{ id: string; label: string }>;
  visible: Set<string>;
  onToggle: (id: string) => void;
}

export function V2ColumnChooser({ columns, visible, onToggle }: V2ColumnChooserProps) {
  return (
    <details className={styles.v2ColumnChooser}>
      <summary className={styles.v2ColumnChooserTrigger}>Columns</summary>
      <div className={styles.v2ColumnChooserPanel} role="group" aria-label="Column visibility">
        {columns.map((c) => (
          <label key={c.id} className={styles.v2ColumnChooserRow}>
            <input type="checkbox" checked={visible.has(c.id)} onChange={() => onToggle(c.id)} className={styles.v2Check} />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
