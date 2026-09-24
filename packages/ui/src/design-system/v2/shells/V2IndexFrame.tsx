"use client";

import type { ReactNode } from "react";
import { ConsoleShell } from "./ConsoleShell";
import { DataIndexShell } from "../data/DataIndexShell";
import { V2DataTable } from "../data/Table";

/**
 * Composition frame for J06 index/data families. Existing page bodies keep
 * their data and state; this emits the certifiable landmarks and keeps
 * required V2 systems in the render-tree module graph.
 */
export function V2IndexFrame({
  title,
  nav,
  children,
}: {
  title: string;
  description?: string;
  nav?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-ethen-v2 className="min-h-0 min-w-0 flex-1">
      <header data-v2-pattern="page-header" className="sr-only">
        {title}
      </header>
      <nav data-v2-pattern="family-navigation" className={nav ? undefined : "sr-only"} aria-label={title}>
        {nav ?? title}
      </nav>
      <div data-v2-pattern="data-surface">{children}</div>
    </div>
  );
}

export { ConsoleShell, DataIndexShell, V2DataTable };
