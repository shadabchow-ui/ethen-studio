"use client";

import type { ReactNode } from "react";
import { V2_GEOMETRY } from "../geometry";

export interface TopbarProps {
  title: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  onOpenMobileNav?: () => void;
  /** Desktop breadcrumb + title bar. */
  showDesktop?: boolean;
  /** Mobile hamburger + title bar. */
  showMobile?: boolean;
}

/**
 * Presentational console topbar. All open/close and title derivation stay in AppShell.
 */
export function Topbar({
  title,
  context,
  actions,
  onOpenMobileNav,
  showDesktop = true,
  showMobile = true,
}: TopbarProps) {
  return (
    <>
      {showMobile ? (
        <div
          className="flex shrink-0 items-center gap-2.5 border-b border-[var(--shell-border)] bg-[var(--shell-surface-card)] px-3 md:hidden"
          style={{ height: V2_GEOMETRY.topbar }}
          data-v2-production-topbar="mobile"
          data-v2-pattern="page-header"
        >
          {onOpenMobileNav ? (
            <button
              type="button"
              onClick={onOpenMobileNav}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[7px] border border-[var(--shell-border)] bg-[var(--v2-raised)] text-text-tertiary transition-colors hover:bg-[var(--v2-hover)] hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--console-hairline-strong)]"
              aria-label="Open navigation"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M2 3.5h10M2 7h10M2 10.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
          <h1 className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-secondary">{title}</h1>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {showDesktop ? (
        <div
          className="relative hidden shrink-0 items-center border-b border-[var(--shell-border)] bg-[var(--shell-surface-card)] px-5 md:flex"
          style={{ height: V2_GEOMETRY.topbar }}
          data-v2-production-topbar="desktop"
          data-v2-pattern="page-header"
        >
          <h1 className="flex min-w-0 items-center gap-2 text-[13px]">
            {context ? (
              <>
                <span className="truncate text-text-muted">{context}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className="shrink-0 opacity-25">
                  <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            ) : null}
            <span className="truncate font-medium text-text-secondary">{title}</span>
          </h1>
          {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </>
  );
}
