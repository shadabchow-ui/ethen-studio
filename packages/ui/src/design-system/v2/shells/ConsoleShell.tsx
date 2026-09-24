// Promoted from components/shell/console-shell.tsx
// Geometry owner for the production console frame. Collapse persistence and
// every other navigation state stay with the caller (AppShell).

"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import { AppearanceSelector } from "../../../theme/appearance-selector";
import { V2_GEOMETRY } from "../geometry";

export type ConsoleContextRailWidth = 320 | 404 | number;

export interface ConsoleTopbarProps {
  context?: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}

export interface ConsoleShellProps extends React.HTMLAttributes<HTMLDivElement> {
  sidebar?: React.ReactNode | ((state: { collapsed: boolean; toggle: () => void }) => React.ReactNode);
  sidebarDefaultCollapsed?: boolean;
  persistSidebarState?: boolean;
  /** Controlled collapse. When set, AppShell (or another owner) holds the state. */
  sidebarCollapsed?: boolean;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  /** Expanded-state width override (resizable production sidebar). Default 256. */
  sidebarWidthPx?: number;
  topbar?: ConsoleTopbarProps | React.ReactNode;
  pageHeader?: React.ReactNode;
  contextRail?: React.ReactNode;
  contextRailWidth?: 320 | 404 | number;
  /** Canonical 24px main gutter. AppShell disables this so pages keep their own inset. */
  contentInset?: boolean;
  contentAs?: "main" | "div";
}

function isTopbarObject(value: ConsoleShellProps["topbar"]): value is ConsoleTopbarProps {
  return !!value && typeof value === "object" && !React.isValidElement(value) && !Array.isArray(value);
}

/** Spec-authorized 256/56 sidebar, 56px topbar, and optional 320/404 rail. */
export function ConsoleShell({
  sidebar,
  sidebarDefaultCollapsed = false,
  persistSidebarState: _persistSidebarState,
  sidebarCollapsed: sidebarCollapsedProp,
  onSidebarCollapsedChange,
  sidebarWidthPx,
  topbar,
  pageHeader,
  contextRail,
  contextRailWidth = V2_GEOMETRY.contextRail,
  contentInset = true,
  contentAs = "main",
  children,
  className,
  ...props
}: ConsoleShellProps) {
  void _persistSidebarState;
  const isControlled = sidebarCollapsedProp !== undefined;
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = React.useState(sidebarDefaultCollapsed);
  const collapsed = isControlled ? sidebarCollapsedProp : uncontrolledCollapsed;

  const toggle = React.useCallback(() => {
    const next = !collapsed;
    if (!isControlled) setUncontrolledCollapsed(next);
    onSidebarCollapsedChange?.(next);
  }, [collapsed, isControlled, onSidebarCollapsedChange]);

  const sidebarContent = typeof sidebar === "function" ? sidebar({ collapsed, toggle }) : sidebar;
  const sidebarWidth = collapsed
    ? V2_GEOMETRY.sidebarCollapsed
    : (sidebarWidthPx ?? V2_GEOMETRY.sidebar);
  const railWidth = contextRailWidth === 404 ? V2_GEOMETRY.contextRailWide : contextRailWidth;

  const ContentTag = contentAs;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full overflow-hidden bg-[var(--v2-canvas)] text-[var(--v2-text-primary)]",
        className,
      )}
      {...props}
    >
      {sidebarContent ? (
        <aside
          /* Sidebar frame surface — DL3 parity tokens (--sbnav-*), not the
           * shared --v2-raised/--v2-border-subtle used by other v2 panels. */
          className="relative hidden h-full shrink-0 overflow-visible border-r border-[var(--sbnav-line)] bg-[var(--sbnav-rail)] md:flex md:flex-col"
          style={{ width: sidebarWidth }}
          data-v2-production-sidebar={collapsed ? "collapsed" : "expanded"}
          data-collapsed={collapsed ? "true" : undefined}
        >
          {sidebarContent}
        </aside>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {topbar ? (
          isTopbarObject(topbar) ? (
            <header
              className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] px-6"
              style={{ height: V2_GEOMETRY.topbar }}
              data-v2-production-topbar="desktop"
              data-v2-pattern="page-header"
            >
              <div className="min-w-0">
                {topbar.context ? (
                  <p className="truncate text-[12px] text-[var(--v2-text-tertiary)]">{topbar.context}</p>
                ) : null}
                {topbar.title ? (
                  <p className="truncate text-[14px] font-medium text-[var(--v2-text-primary)]">{topbar.title}</p>
                ) : null}
              </div>
              {topbar.actions ? <div className="flex shrink-0 items-center gap-2">{topbar.actions}</div> : null}
            </header>
          ) : (
            topbar
          )
        ) : null}
        <ContentTag
          {...(contentAs === "main"
            ? { tabIndex: 0, role: "region", "aria-label": "Workspace content" }
            : {})}
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]",
            contentInset && "p-6",
          )}
          style={contentInset ? { padding: V2_GEOMETRY.pageGutter } : undefined}
        >
          {pageHeader ? (
            <div className="mb-6" data-v2-pattern="page-header">
              {pageHeader}
            </div>
          ) : null}
          {children}
        </ContentTag>
      </div>
      {contextRail ? (
        <aside
          className="hidden h-full shrink-0 overflow-auto border-l border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] xl:block"
          style={{ width: railWidth }}
          data-context-rail={railWidth}
        >
          {contextRail}
        </aside>
      ) : null}
    </div>
  );
}

export function ConsoleThemeSelector() {
  return <AppearanceSelector />;
}
