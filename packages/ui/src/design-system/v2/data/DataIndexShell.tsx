"use client";

import type { ReactNode } from "react";
import { ConsoleShell, type ConsoleTopbarProps } from "../shells/ConsoleShell";
import { cn } from "../../../lib/utils";
import styles from "../v2.module.css";

export type DataIndexRailWidth = 320 | 404;

export interface DataIndexShellProps {
  /** Page identity — rendered as topbar + page header */
  title: string;
  description?: string;
  context?: string;
  topbarActions?: ReactNode;
  headerActions?: ReactNode;
  tabs?: ReactNode;
  filters?: ReactNode;
  selectionToolbar?: ReactNode;
  /** Optional right operational rail (320 or 404). Sticky on desktop, drawer on mobile. */
  contextRail?: ReactNode;
  contextRailWidth?: DataIndexRailWidth;
  footer?: ReactNode;
  children: ReactNode;
  /** Labs may fix collapsed for demos; production defaults to expanded */
  sidebarDefaultCollapsed?: boolean;
  /** Demo sidebar content; production passes real platform nav */
  sidebar?: ReactNode;
  className?: string;
  emptyState?: ReactNode;
  loading?: boolean;
  error?: ReactNode;
}

function DemoSidebar() {
  return (
    <nav aria-label="Demo navigation" className="p-3 text-[13px] text-[var(--console-shell-text-secondary)]">
      <div className="mb-4 text-[14px] font-medium text-[var(--console-shell-text-primary)]">Ethen</div>
      <div className="space-y-0.5">
        <a href="#" className="block rounded-[var(--v2-radius-base)] bg-[var(--console-shell-active)] px-3 py-2 text-[var(--console-shell-text-primary)]">Runs</a>
        <a href="#" className="block rounded-[var(--v2-radius-base)] px-3 py-2 hover:bg-[var(--console-shell-hover)]">Models</a>
        <a href="#" className="block rounded-[var(--v2-radius-base)] px-3 py-2 hover:bg-[var(--console-shell-hover)]">Projects</a>
        <a href="#" className="block rounded-[var(--v2-radius-base)] px-3 py-2 hover:bg-[var(--console-shell-hover)]">Workflows</a>
      </div>
    </nav>
  );
}

export function DataIndexShell({
  title,
  description,
  context = "Data",
  topbarActions,
  headerActions,
  tabs,
  filters,
  selectionToolbar,
  contextRail,
  contextRailWidth = 320,
  footer,
  children,
  sidebarDefaultCollapsed = false,
  sidebar,
  className,
  loading,
  error,
}: DataIndexShellProps) {
  const topbar: ConsoleTopbarProps = {
    context,
    title,
    actions: topbarActions,
  };

  const pageHeader = (
    <div className={styles.dataIndexHeader} data-v2-pattern="page-header">
      <div className={styles.dataIndexHeaderTitles}>
        <h1 className={styles.dataIndexTitle}>{title}</h1>
        {description ? <p className={styles.dataIndexDesc}>{description}</p> : null}
      </div>
      {headerActions ? <div className={styles.dataIndexHeaderActions}>{headerActions}</div> : null}
    </div>
  );

  return (
    <div className={cn(styles.dataIndexShellFrame, className)} data-ethen-v2>
      <ConsoleShell
        sidebar={sidebar ?? <DemoSidebar />}
        topbar={topbar}
        pageHeader={pageHeader}
        contextRail={contextRail}
        contextRailWidth={contextRailWidth}
        sidebarDefaultCollapsed={sidebarDefaultCollapsed}
        persistSidebarState={false}
        className={styles.dataIndexConsole}
      >
        <div className={styles.dataIndexBody}>
          {tabs ? <div className={styles.dataIndexTabs} data-v2-pattern="family-navigation">{tabs}</div> : null}
          {filters ? <div className={styles.dataIndexFilters}>{filters}</div> : null}
          {selectionToolbar ? <div className={styles.dataIndexSelection}>{selectionToolbar}</div> : null}
          <div className={styles.dataIndexContent} data-v2-pattern="data-surface">
            {loading ? (
              <div className={styles.v2DataSkeleton} aria-busy="true">
                <div className={styles.v2SkeletonBar} style={{ width: "44%" }} />
                <div className={styles.v2SkeletonBar} style={{ width: "68%" }} />
                <div className={styles.v2SkeletonBar} style={{ width: "52%" }} />
              </div>
            ) : error ? (
              <div role="alert" className={cn(styles.v2DataEmpty, styles.v2DataError)}>
                <p className={styles.v2DataEmptyTitle}>Could not load</p>
                <p className={styles.v2DataEmptyDesc}>{error}</p>
              </div>
            ) : (
              children
            )}
          </div>
          {footer ? <div className={styles.dataIndexFooter}>{footer}</div> : null}
        </div>
      </ConsoleShell>
    </div>
  );
}
