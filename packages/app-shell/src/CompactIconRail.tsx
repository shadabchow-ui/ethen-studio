"use client";

import { cn } from "@ethen/ui/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface RailNavItem {
  id: string;
  /** Icon React node (SVG element). Resolved by the caller. */
  icon: React.ReactNode;
  /** Accessible label / tooltip text. */
  label: string;
  /** Whether this item is the active route. */
  isActive: boolean;
  /** Route href for link behaviour. */
  href: string;
}

export interface CompactIconRailProps {
  /** Navigation items rendered as icon-only 32×32 buttons (replaces MODE_TABS). */
  navItems: RailNavItem[];
  /** Primary action icon buttons (replaces PRIMARY_ACTIONS — first item gets highlighted bg). */
  primaryActions: RailNavItem[];
  /** Toggle callback (expands the rail back to full sidebar). */
  onToggleCollapsed: () => void;
  /** Additional class on the outer element. */
  className?: string;
  /** User initials for the footer avatar fallback. */
  userInitials?: string;
  /** User avatar image URL. */
  userAvatarImage?: string;
  /** Open profile handler. */
  onOpenProfile?: () => void;
}

/* ─── Internal icon component (16px stroke-based, same as lab) ──────────── */

function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={cn("h-4 w-4", className)} aria-hidden>
      <path d={path} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Compact Icon Rail — 1:1 match of System Lab Block 4·CODING AGENT SIDEBAR

   Uses CSS variables for light/dark mode compatibility.
   ═══════════════════════════════════════════════════════════════════════════ */

export function CompactIconRail({
  navItems,
  primaryActions,
  onToggleCollapsed,
  className,
  userInitials,
  userAvatarImage,
  onOpenProfile,
}: CompactIconRailProps) {
  return (
    <div
      className={cn("flex h-full w-14 flex-col items-center overflow-hidden", className)}
      style={{ background: "var(--sbnav-rail, var(--console-sidebar))" }}
    >
      {/* ─── Ethen cube brand mark (collapsed sidebar only) ─────────── */}
      <div className="flex h-9 w-full items-center justify-center pt-1">
        <img
          src="/brand/ethen-cube.png"
          alt="Ethen"
          className="h-[22px] w-[22px] object-contain"
        />
      </div>

      {/* ─── Expand button — DL3 iconButton (28x28, 8px radius) ──────── */}
      <div className="flex h-8 w-full items-center justify-center">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          className="ethen-touch-target flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--sbnav-text-3)] transition-colors hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]"
        >
          <Icon path="M3 3h10v10H3z M6 3v10" className="opacity-[.86]" />
        </button>
      </div>

      {/* ─── Navigation items — DL3 collapsed .navRow: 32x32, no accent
       * bar, active state is the background block alone. ─────────────── */}
      <div className="mt-1 flex flex-col items-center gap-0.5">
        {navItems.map((item) => (
          <a
            key={item.id}
            href={item.href}
            aria-current={item.isActive ? "page" : undefined}
            aria-label={item.label}
            className={cn(
              "ethen-touch-target flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors duration-[140ms]",
              item.isActive
                ? "bg-[var(--sbnav-active)] text-[var(--sbnav-text)]"
                : "text-[var(--sbnav-text-2)] hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]",
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center opacity-[.86]">{item.icon}</span>
          </a>
        ))}
      </div>

      {/* ─── Primary actions ────────────────────────────────────────── */}
      <div className="mt-2 flex flex-col items-center gap-0.5">
        {primaryActions.map((item) => (
          <a
            key={item.id}
            href={item.href}
            aria-label={item.label}
            className="ethen-touch-target flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--sbnav-text-2)] transition-colors duration-[140ms] hover:bg-[var(--sbnav-hover)] hover:text-[var(--sbnav-text)]"
          >
            <span className="flex h-4 w-4 items-center justify-center opacity-[.86]">{item.icon}</span>
          </a>
        ))}
      </div>

      {/* ─── Flex spacer (matches lab's recents scroll area) ────────── */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col items-center overflow-hidden" />

      {/* ─── Footer — account avatar ────────────────────────────────── */}
      <div className="flex h-11 w-full shrink-0 items-center justify-center border-t border-[var(--sbnav-line)]">
        <button
          type="button"
          onClick={onOpenProfile}
          data-account-anchor=""
          aria-label="Account"
          aria-haspopup="dialog"
          className="ethen-touch-target flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--sbnav-active)] text-[10.5px] font-medium text-[var(--sbnav-text-2)] transition-colors hover:bg-[var(--sbnav-hover)]"
        >
          {userAvatarImage ? (
            <img
              src={userAvatarImage}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            userInitials ?? "?"
          )}
        </button>
      </div>
    </div>
  );
}
