"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import { cn } from "@ethen/ui/lib/utils";
import { getNavSectionsForPath, type NavSection } from "@ethen/navigation";
import { V2_GEOMETRY } from "@ethen/ui/design-system/v2/geometry";
import { isMockMode } from "@ethen/config/runtime-flags";
import {
  getEthenUserDisplayName,
  getEthenUserInitials,
  useEthenUser,
} from "@ethen/auth/helpers";
import { useRecentSessionsState } from "./hooks/useRecentSessions";
import { NavItem } from "./NavItem";
import { ICONS } from "./NavItem";
import { CompactIconRail, type RailNavItem } from "./CompactIconRail";
import { ThemeToggle } from "./ThemeToggle";
import { Badge } from "@ethen/ui/badge";
import type { AgentSidebarSection } from "@ethen/contracts/agents/types";

interface SidebarProps {
  className?: string;
  currentSessionId?: string;
  onOpenCommandPalette?: () => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onOpenProfile?: () => void;
  onCloseProfile?: () => void;
  profileOpen?: boolean;
  agentSidebarSections?: AgentSidebarSection[];
  onSectionItemClick?: (action: string, itemId: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  navSections?: NavSection[];
  /** Suppress the recent sessions section — used on homepage where recents should not appear. */
  hideRecentSessions?: boolean;
  /** Explicit pixel width override for resizable sidebar. Overrides CSS variable when set. */
  widthPx?: number;
  /** When false, the caller (ConsoleShell) owns the aside frame and 256/56 width. */
  framed?: boolean;
}

/* Primary actions — always shown above the nav sections.
 *
 * Search opens the existing ⌘K command palette; it is deliberately not a
 * second palette. Artifacts moved into the nav sections as Library, so it is
 * no longer duplicated here. */
const SIDEBAR_PRIMARY_ACTIONS = [
  { id: "new-session", label: "New session", href: "/console", iconPath: "M8 2v12M2 8h12" },
] as const;

const SEARCH_ICON_PATH = "M7.2 3.5a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4M10 10l2.5 2.5";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[rgba(255,255,255,0.28)] focus-visible:-outline-offset-1 focus-visible:ring-0";


const PRIMARY_ACTION_ROW_CLASS = cn(
  "flex h-[var(--sbnav-row-h)] items-center gap-[9px] rounded-[8px] border border-transparent px-2 text-left text-[13px] text-[var(--sbnav-text-2)] transition-colors duration-[140ms] hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]",
  FOCUS_RING,
);
const PRIMARY_ACTION_RAIL_CLASS = cn(
  "flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--sbnav-text-2)] transition-colors duration-[140ms] hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]",
  FOCUS_RING,
);

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The shortcut label never changes at runtime, so there is nothing to watch. */
const NO_OP_SUBSCRIBE = () => () => {};

/**
 * Sidebar surface tokens — ported verbatim from the frozen DL3 Console Shell
 * (`components/dev/ethen-design-lab-3/ConsoleShell.module.css` `.root`).
 * Scoped to the sidebar only (inline CSS custom properties on the frame), not
 * merged into the shared `--bg-base`/`--ethen-hover` design tokens, which
 * other surfaces still depend on. This keeps the visual-parity fix local to
 * the sidebar rather than changing shared theme tokens app-wide.
 */
const SIDEBAR_TOKEN_STYLE = {
  "--sbnav-rail": "#050505",
  "--sbnav-line": "rgba(255, 255, 255, 0.07)",
  "--sbnav-line-soft": "rgba(255, 255, 255, 0.05)",
  "--sbnav-text": "#f0f0f0",
  "--sbnav-text-2": "#999999",
  "--sbnav-text-3": "#818181",
  "--sbnav-hover": "#101010",
  "--sbnav-active": "#171717",
  "--sbnav-row-h": "30px",
  "--sbnav-bar-h": "44px",
} as React.CSSProperties;

const CONTROL_ROW =
  "rounded-[6px] bg-transparent text-text-secondary ethen-interactive ethen-pressable hover:bg-[var(--console-surface-card)] hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-default";

const SECTION_LABEL = "mt-[14px] mb-[3px] px-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--sbnav-text-3)] first:mt-0";

function formatRelative(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.max(1, Math.round(diffMs / 60000));

  if (diffMins < 60) return `${diffMins}m`;

  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function Sidebar({
  className,
  currentSessionId,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenProfile,
  profileOpen,
  agentSidebarSections,
  onSectionItemClick,
  collapsed = false,
  onToggleCollapsed,
  navSections,
  hideRecentSessions = false,
  widthPx,
  framed = true,
}: SidebarProps) {
  const pathname = usePathname();
  const resolvedNavSections = navSections ?? getNavSectionsForPath(pathname);
  /* Platform detection is client-only, so the shortcut hint has no server
   * snapshot: the server and the first client render agree on nothing, and the
   * real label appears once hydration completes. Reading `isMac` during render
   * would break hydration on macOS. */
  const searchShortcut = useSyncExternalStore(
    NO_OP_SUBSCRIBE,
    () => (isMac ? "\u2318K" : "Ctrl K"),
    () => null,
  );
  const { items: sessions, loading: sessionsLoading, error: sessionsError } = useRecentSessionsState(5);
  const { user } = useEthenUser();
  const displayName = getEthenUserDisplayName(user);
  const userInitials = getEthenUserInitials(user, isMockMode ? "D" : "?");
  const accountLabel = displayName ?? user?.email ?? "Account";
  const accountStatus = isMockMode ? "Demo" : user ? "Plan not provided" : "Sign in";

  /* ─── Compact icon rail data (Block 4) ──────────────────────────── */
  const compactNavItems = useMemo(() => {
    const items: RailNavItem[] = [];
    for (const section of resolvedNavSections) {
      for (const item of section.items) {
        if (!item.href) continue;
        const isActive =
          item.id === "studio"
            ? pathname.startsWith("/studio")
            : item.href !== "/"
              ? pathname === item.href || pathname.startsWith(item.href + "/")
              : pathname === item.href;
        items.push({
          id: item.id,
          icon: ICONS[item.icon] ?? <span className="opacity-40 text-[11px]">•</span>,
          label: item.label,
          isActive,
          href: item.href,
        });
      }
    }
    return items;
  }, [resolvedNavSections, pathname]);

  const compactPrimaryActions = useMemo((): RailNavItem[] =>
    SIDEBAR_PRIMARY_ACTIONS.map((item) => ({
      id: item.id,
      icon: (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d={item.iconPath} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      label: item.label,
      isActive: false,
      href: item.href,
    })),
    [],
  );

  const Frame = framed ? "aside" : "div";
  const frameWidthStyle = !framed
    ? undefined
    : widthPx && !collapsed
      ? { width: `var(--ethen-sidebar-drag-width, ${widthPx}px)` }
      : collapsed
        ? { width: V2_GEOMETRY.sidebarCollapsed }
        : { width: V2_GEOMETRY.sidebar };

  return (
    <Frame
      style={frameWidthStyle}
      className={cn(
        "flex h-full flex-col bg-[var(--sbnav-rail)] text-[var(--sbnav-text-2)]",
        framed && "shrink-0 border-r border-[var(--sbnav-line)] transition-[width] duration-200",
        framed && !widthPx && !collapsed && "w-[var(--sidebar-width)]",
        framed && collapsed && "w-[var(--sidebar-width-collapsed)]",
        !framed && "min-h-0 w-full",
        className
          )}
        >
          {collapsed ? (
            <CompactIconRail
              navItems={compactNavItems}
              primaryActions={compactPrimaryActions}
              onToggleCollapsed={() => onToggleCollapsed?.()}
              userInitials={userInitials}
              userAvatarImage={user?.imageUrl ?? undefined}
              onOpenProfile={onOpenProfile}
            />
          ) : (
            <>
        {/* Brand header — 44px bar height, 10px inset, matches DL3 .brand */}
      <div className={cn(
        "flex h-[var(--sbnav-bar-h)] shrink-0 items-center gap-[9px] border-b border-[var(--sbnav-line)] px-[10px]",
        collapsed && "justify-center gap-0 px-0"
      )}>
        <Link
          href="/console"
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-[8px] px-1.5 py-1 transition-colors hover:bg-[var(--sbnav-hover)]",
            FOCUS_RING,
            collapsed ? "shrink-0 justify-center" : "flex-1"
          )}
          aria-label="Ethen home"
          title="Ethen"
        >
          {collapsed ? (
            <Image
              src="/brand/ethen-cube.png"
              alt="Ethen"
              width={30}
              height={30}
              className="sidebar-logo-img h-[30px] w-[30px] rounded-[8px] object-contain"
              priority
            />
          ) : (
            <Image
              src="/brand/ethen-logo.png"
              alt="Ethen"
              width={96}
              height={28}
              className="sidebar-logo-img h-[26px] w-auto object-contain"
              priority
            />
          )}
        </Link>
        {!collapsed && (
          <div className="flex shrink-0 items-center gap-0.5">
            {/* Search lives in the primary action rows below — the shell has
             * exactly one entry point into the ⌘K palette. */}
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--sbnav-text-3)] transition-colors hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]",
                FOCUS_RING,
              )}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="opacity-[.86]">
                <path d="M3 3h10v10H3z M6 3v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {collapsed && (
        <div className="flex shrink-0 justify-center py-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--sbnav-text-3)] transition-colors hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]",
              FOCUS_RING,
            )}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="opacity-[.86]">
                <path d="M3 3h10v10H3z M6 3v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
          </button>
        </div>
      )}


      {/* Primary actions — New session, Search. Row height/radius/gap match
       * DL3 .navRow (30px / 8px / 9px); collapsed rows match DL3 collapsed
       * .navRow (32px). */}
      <nav aria-label="Primary actions" className={cn(
        "flex flex-col gap-0.5 px-2 pb-2",
        collapsed ? "mt-2 items-center" : "mt-2"
      )}>
        {SIDEBAR_PRIMARY_ACTIONS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={collapsed ? PRIMARY_ACTION_RAIL_CLASS : PRIMARY_ACTION_ROW_CLASS}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
          >
            {collapsed ? (
              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 shrink-0 opacity-[.86]" aria-hidden>
                <path d={item.iconPath} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <>
                <svg viewBox="0 0 16 16" fill="none" className="h-[15px] w-[15px] shrink-0 opacity-[.86]" aria-hidden>
                  <path d={item.iconPath} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item.label}
              </>
            )}
          </Link>
        ))}

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className={collapsed ? PRIMARY_ACTION_RAIL_CLASS : PRIMARY_ACTION_ROW_CLASS}
          aria-label={collapsed ? "Search" : undefined}
          title={collapsed ? "Search" : undefined}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className={collapsed ? "h-4 w-4 shrink-0 opacity-[.86]" : "h-[15px] w-[15px] shrink-0 opacity-[.86]"}
            aria-hidden
          >
            <path d={SEARCH_ICON_PATH} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!collapsed && (
            <>
              <span className="flex-1">Search</span>
              <span className="shrink-0 text-[10.5px] tracking-[0.02em] tabular-nums text-[var(--sbnav-text-3)]">{searchShortcut}</span>
            </>
          )}
        </button>
      </nav>

      {/* Divider before the destination nav — DL3 .divider (1px, soft line). */}
      <div
        aria-hidden="true"
        className={cn(
          "shrink-0 bg-[var(--sbnav-line-soft)]",
          collapsed ? "mx-auto my-2 h-px w-7" : "mx-[6px] my-[10px] h-px"
        )}
      />

      {!hideRecentSessions && !collapsed && (sessionsLoading || !!sessionsError || sessions.length > 0) && (
        <div className="shrink-0 border-b border-[var(--sbnav-line)] px-2 pb-2">
          <div className="mb-[3px] mt-[14px] flex items-center justify-between gap-2 px-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--sbnav-text-3)]">Recent</p>
            <Link
              href="/"
              className={cn(
                "rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--sbnav-text-3)] transition-colors hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text-2)]",
                FOCUS_RING,
              )}
            >
              New chat
            </Link>
          </div>

          {sessionsLoading ? (
            <div className="space-y-0.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="ethen-threadlist-skeleton flex h-9 flex-col justify-center rounded-[8px] px-2"
                >
                  <div className="mb-1 h-3 w-3/4 rounded-full bg-[var(--sbnav-hover)]" />
                  <div className="h-2 w-1/2 rounded-full bg-[var(--sbnav-hover)]" />
                </div>
              ))}
            </div>
          ) : sessionsError ? (
            <div className="rounded-[8px] border border-[var(--sbnav-line)] bg-[var(--sbnav-hover)] px-2 py-2 text-[11px] text-[var(--sbnav-text-3)]">
              {sessionsError}
            </div>
          ) : (
            <div className="space-y-0.5">
              {sessions.map((session) => {
                const active =
                  currentSessionId === session.id || pathname === `/workspace/${session.id}`;

                return (
                  <Link
                    key={session.id}
                    href={`/workspace/${session.id}`}
                    className={cn(
                      "ethen-threadlist-item group flex items-start gap-[6px] rounded-[8px] px-2 py-[6px] transition-colors",
                      FOCUS_RING,
                      active
                        ? "bg-[var(--sbnav-active)] text-[var(--sbnav-text)]"
                        : "text-[var(--sbnav-text-2)] hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]"
                    )}
                  >
                    <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-current opacity-50" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[12.5px] leading-[17px]">{session.title}</p>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--sbnav-text-3)]">
                          {formatRelative(session.updatedAt)}
                        </span>
                      </div>
                      <p className="truncate text-[10.5px] leading-[14px] text-[var(--sbnav-text-3)]">
                        {session.lastMessagePreview || session.agentName || "No messages yet"}
                      </p>
                    </div>
                  </Link>
                );
              })}

              {sessions.length === 0 && (
                <div className="rounded-[8px] border border-dashed border-[var(--sbnav-line)] px-2 py-2 text-[11px] text-[var(--sbnav-text-3)]">
                  No recent sessions yet.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!collapsed && agentSidebarSections && agentSidebarSections.length > 0 && (
        <div className="shrink-0 border-b border-[var(--shell-border)] px-2.5 pb-3 pt-1">
          {agentSidebarSections.filter((s) => !s.hidden).map((section) => (
            <div key={section.id} className="mb-2 last:mb-0">
              <p className={SECTION_LABEL}>{section.label}</p>
              <div className="space-y-px">
                {section.items.map((item) => {
                  const isPassive = item.disabled || (!item.href && !item.action);
                  const rowCls = cn(
                    "premium-control ethen-pressable flex h-[32px] w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] transition-colors",
                    isPassive
                      ? "cursor-default opacity-30 text-text-tertiary"
                      : "text-text-tertiary hover:bg-[var(--bg-elevated)] hover:text-text-secondary"
                  );

                  const inner = (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.value && (
                        <span className="shrink-0 font-mono text-[11px] text-text-tertiary">{item.value}</span>
                      )}
                      {item.badge && (
                        <Badge variant="muted" className="shrink-0 border border-[var(--border-default)] bg-[var(--bg-elevated)] px-1.5 py-0 text-[11px] text-[var(--text-secondary)]">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  );

                  if (item.href && !item.disabled) {
                    return (
                      <Link key={item.id} href={item.href} className={rowCls}>
                        {inner}
                      </Link>
                    );
                  }

                  if (item.action && !item.disabled && onSectionItemClick) {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={rowCls}
                        onClick={() => onSectionItemClick(item.action!, item.id)}
                      >
                        {inner}
                      </button>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className={rowCls}
                      role="presentation"
                      title={item.description}
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <nav className={cn("flex-1 overflow-y-auto", collapsed ? "px-2 py-2" : "px-2 py-2")} aria-label="Main navigation">
        <div className={cn(collapsed ? "flex flex-col items-center gap-0.5" : "space-y-0")}>
          {resolvedNavSections.map((section) => (
            <div key={section.label}>
              {!collapsed && !!section.label && <p className={SECTION_LABEL}>{section.label}</p>}
              <ul className={cn(collapsed ? "flex flex-col items-center gap-0.5" : "space-y-0.5")}>
                {section.items
                  .filter((item) => item.href !== "")
                  .map((item) => {
                    const hasChildren = item.children && item.children.length > 0;
                    const isParentActive = hasChildren && pathname.startsWith("/studio");
                    return (
                      <li key={item.id}>
                        <NavItem
                          {...item}
                          collapsed={collapsed}
                          active={item.id === "studio" && pathname.startsWith("/studio") ? true : undefined}
                        />
                        {!collapsed && hasChildren && isParentActive && item.children && (
                          <ul className="ml-5 mt-0.5 space-y-px border-l border-[var(--shell-border)] pl-1">
                            {item.children.map((child) => (
                              <li key={child.id}>
                                <NavItem {...child} collapsed={false} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Account footer — DL3 .railFoot: 8px padding, hairline top border. */}
      <div
        className={cn(
          "shrink-0 border-t border-[var(--sbnav-line)]",
          collapsed
            ? "flex h-11 items-center justify-center"
            : "px-2 py-2"
        )}
      >
        {collapsed ? (
          <div className="flex items-center justify-center">
            {onOpenProfile && (
              <button
                type="button"
                onClick={onOpenProfile}
                data-account-anchor=""
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--sbnav-text-3)] transition-colors hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text-2)]",
                  FOCUS_RING,
                )}
                aria-label="Account"
                aria-expanded={profileOpen}
                aria-haspopup="dialog"
                title={accountLabel}
              >
                {user?.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={user.name ?? user.email ?? "Profile avatar"}
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--sbnav-active)] text-[10px] font-medium text-[var(--sbnav-text-2)]">
                    {userInitials}
                  </div>
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={onOpenSettings}
              className={cn(
                "flex h-[var(--sbnav-row-h)] w-full items-center gap-[9px] rounded-[8px] px-2 text-left text-[13px] text-[var(--sbnav-text-2)] transition-colors duration-[140ms] hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]",
                FOCUS_RING,
              )}
            >
              <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center opacity-[.86]">
                {ICONS.settings}
              </span>
              <span className="flex-1 truncate">Settings</span>
            </button>

            <div className="flex items-center gap-1">
            {onOpenProfile && (
              <button
                type="button"
                onClick={onOpenProfile}
                data-account-anchor=""
                className={cn(
                  "min-w-0 flex-1 flex items-center gap-2.5 rounded-[8px] px-2 py-2 text-left transition-colors hover:bg-[var(--sbnav-hover)]",
                  FOCUS_RING,
                )}
                aria-label="Account"
                aria-expanded={profileOpen}
                aria-haspopup="dialog"
                title="Account"
              >
                {user?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.imageUrl}
                    alt={user.name ?? user.email ?? "Profile avatar"}
                    className="h-[22px] w-[22px] shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--sbnav-active)] text-[10.5px] font-medium text-[var(--sbnav-text-2)]">
                    {userInitials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] leading-tight text-[var(--sbnav-text)]">
                    {accountLabel}
                  </p>
                  <p className="truncate text-[11px] leading-tight mt-0.5 text-[var(--sbnav-text-3)]">
                    {accountStatus}
                  </p>
                </div>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden className="shrink-0 text-[var(--sbnav-text-3)]">
                  <path d="M6.5 3a.65.65 0 1 1 0 1.3A.65.65 0 0 1 6.5 3Zm0 2.35a.65.65 0 1 1 0 1.3.65.65 0 0 1 0-1.3Zm0 2.35a.65.65 0 1 1 0 1.3.65.65 0 0 1 0-1.3Z" fill="currentColor" />
                </svg>
              </button>
            )}

            <ThemeToggle compact />
            </div>
          </div>
        )}
      </div>
        </>
      )}
    </Frame>
  );
}
