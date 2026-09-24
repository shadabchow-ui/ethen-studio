import * as React from "react";
import { cn } from "./lib/utils";

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T, index: number) => React.ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  /** Optional unique key extractor — defaults to index. */
  rowKey?: (row: T, index: number) => string;
  className?: string;
}

/**
 * Dark-console data table — compact, column-configurable.
 * Extracted from System Lab `LabTablePreview`.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  className,
}: TableProps<T>) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-[var(--ethen-radius-element)] border border-[rgba(255,255,255,0.07)]",
        className,
      )}
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 40%), #0d0d0d",
      }}
    >
      <table className="w-full min-w-[420px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.07)] text-left text-[10.5px] uppercase tracking-[0.06em] text-[rgba(255,255,255,0.32)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-3 py-2 font-medium",
                  col.align === "right" ? "text-right" : "text-left",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const key = rowKey ? rowKey(row, i) : String(i);
            return (
              <tr
                key={key}
                className="border-b border-[rgba(255,255,255,0.06)] last:border-b-0"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-3 py-2",
                      col.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
