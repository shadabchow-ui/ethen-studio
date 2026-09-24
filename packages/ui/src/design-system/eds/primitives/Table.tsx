import * as React from "react";

export interface EdsTableColumn {
  key: string;
  label: string;
}

export interface EdsTableProps {
  caption: string;
  columns: readonly EdsTableColumn[];
  rows: readonly Readonly<Record<string, React.ReactNode>>[];
  className?: string;
}

export function EdsTable({ caption, columns, rows, className }: EdsTableProps) {
  return (
    <div className="eds-table__scroll">
      <table className={["eds-table", className].filter(Boolean).join(" ")}>
        <caption className="eds-table__caption">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="eds-table__header">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`row-${index}`} className="eds-table__row">
              {columns.map((column, columnIndex) =>
                columnIndex === 0 ? (
                  <th key={column.key} scope="row" className="eds-table__cell eds-table__cell--rowhead">
                    {row[column.key]}
                  </th>
                ) : (
                  <td key={column.key} className="eds-table__cell">
                    {row[column.key]}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
