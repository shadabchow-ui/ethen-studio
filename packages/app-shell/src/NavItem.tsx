"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@ethen/ui/lib/utils";
import { Badge } from "@ethen/ui/badge";

export interface NavItemProps {
  id: string;
  label: string;
  icon: string;
  href: string;
  active?: boolean;
  badge?: "soon" | "new" | "preview" | "beta" | "mock";
  onClick?: () => void;
  className?: string;
  collapsed?: boolean;
}

export const ICONS: Record<string, React.ReactNode> = {
  compose: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1.5 10.75V12.5H3.25L10.2 5.55 8.45 3.8 1.5 10.75ZM11.7 4.05a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0L7.69 2.56l2.75 2.75 1.26-1.26Z" fill="currentColor" />
    </svg>
  ),
  grid: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" />
    </svg>
  ),
  star: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1.5 8.6 5l3.9.57-2.82 2.74.67 3.87L7 10.08l-3.35 1.76.67-3.87L1.5 5.57 5.4 5 7 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  clock: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 4v3.2l2 1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  folder: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1.5 4A1.5 1.5 0 0 1 3 2.5H5.5L7 4H11A1.5 1.5 0 0 1 12.5 5.5v5A1.5 1.5 0 0 1 11 12H3A1.5 1.5 0 0 1 1.5 10.5V4Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  ),
  sessions: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 3h10a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H7.5L5 12V10H2a.5.5 0 0 1-.5-.5v-6A.5.5 0 0 1 2 3Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  billing: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.5" y="3" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.5 6h11" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  project: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  files: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 1.5h5l2.5 2.5V12.5H3V1.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M8 1.5V4h2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  search: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.25 9.25L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  git: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="4" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 4.5v5M4 4.5C4 7 10 7 10 5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  tasks: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 4h10M2 7h7M2 10h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  models: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1.5 12.5 7 7 12.5 1.5 7 7 1.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  ),
  permissions: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="3" y="6" width="8" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 6V4.5a2 2 0 0 1 4 0V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  sparkle: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1.5L8.2 5l3.3.5-2.4 2.3.6 3.2L7 9.3l-2.7 1.7.6-3.2L2.5 5.5 5.8 5 7 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  plus: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  chats: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 2.5h10a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H7.5L5 12V9.5H2a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  ),
  terminal: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="11" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 5.5l2 2-2 2M7.5 9.5h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  shield: (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1.5 2 3.5v3c0 3.2 2.2 6 5 6.5 2.8-.5 5-3.3 5-6.5v-3L7 1.5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7.5 6.8 9 9 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function NavItem({ label, icon, href, active, badge, onClick, className, collapsed = false }: NavItemProps) {
  const pathname = usePathname();
  const isActive = active ?? (href !== "/" ? pathname.startsWith(href) : pathname === href);

  const isNewChat = icon === "plus";
  /* Row treatment ported from DL3 .navRow: 30px row height, 8px radius,
   * uniform 8px horizontal padding, 9px icon/label gap. Active state is
   * communicated purely by the background block (var(--sbnav-active)) — DL3
   * has no left accent bar, so this row renders none. */
  const inner = (
    <>
      <span
        className={cn(
          collapsed
            ? "flex h-4 w-4 shrink-0 items-center justify-center"
            : "flex h-[15px] w-[15px] shrink-0 items-center justify-center opacity-[.86]",
          isActive ? "text-[var(--sbnav-text)]" : "text-[var(--sbnav-text-2)]",
          isNewChat && !collapsed && "rounded-[4px] bg-[var(--sbnav-hover)]",
        )}
      >
        {ICONS[icon] ?? <span className="text-[11px] opacity-40">•</span>}
      </span>
      {!collapsed && <span className="flex-1 truncate text-[13px]">{label}</span>}
      {!collapsed && badge && badge !== "beta" && badge !== "preview" && (
        <Badge
          variant="muted"
          className={cn(
            "shrink-0 border px-1.5 py-0 text-[11px]",
            badge === "mock"
              ? "border-[var(--sbnav-line)] bg-transparent text-[var(--sbnav-text-3)]"
              : "border-[var(--sbnav-line)] bg-transparent text-[var(--sbnav-text-3)]",
          )}
        >
          {badge}
        </Badge>
      )}
    </>
  );

  const cls = cn(
    "ethen-touch-target w-full rounded-[8px] text-left transition-colors duration-[140ms]",
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[rgba(255,255,255,0.28)] focus-visible:-outline-offset-1 focus-visible:ring-0",
    collapsed && isActive
      ? "flex h-8 w-8 items-center justify-center bg-[var(--sbnav-active)] text-[var(--sbnav-text)]"
      : collapsed && !isActive
        ? "flex h-8 w-8 items-center justify-center text-[var(--sbnav-text-2)] hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]"
        : !collapsed && isActive
          ? "flex h-[var(--sbnav-row-h)] items-center gap-[9px] bg-[var(--sbnav-active)] px-2 text-[var(--sbnav-text)]"
          : "flex h-[var(--sbnav-row-h)] items-center gap-[9px] px-2 font-normal text-[var(--sbnav-text-2)] hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]",
    className,
  );

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cls}
      aria-current={isActive ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
    >
      {inner}
    </Link>
  );
}
