"use client";

import { useEffect, useRef } from "react";
import { Sidebar } from "./Sidebar";
import type { AgentSidebarSection } from "@ethen/contracts/agents/types";
import type { NavSection } from "@ethen/navigation";

interface MobileSidebarProps {
  currentSessionId?: string;
  open: boolean;
  onClose: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onOpenProfile?: () => void;
  profileOpen?: boolean;
  agentSidebarSections?: AgentSidebarSection[];
  onSectionItemClick?: (action: string, itemId: string) => void;
  navSections?: NavSection[];
}

export function MobileSidebar({
  currentSessionId,
  open,
  onClose,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenHelp,
  onOpenProfile,
  profileOpen,
  agentSidebarSections,
  onSectionItemClick,
  navSections,
}: MobileSidebarProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();

      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handle);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handle);
      previousActive?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex md:hidden" role="dialog" aria-modal="true" aria-label="Navigation drawer">
      {/* Backdrop */}
      <div
        className="animate-overlay-in absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      {/* Drawer */}
      <div
        ref={drawerRef}
        className="animate-drawer-in relative h-full w-[var(--sidebar-width)] max-w-[84vw] border-r border-[var(--sbnav-line)] bg-[var(--sbnav-rail)] shadow-[4px_0_24px_rgba(0,0,0,0.6)]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] text-text-tertiary transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--console-hairline-strong)]"
          style={{ top: `calc(0.9rem + env(safe-area-inset-top, 0px))` }}
          aria-label="Close navigation"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
            <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <Sidebar
          currentSessionId={currentSessionId}
          onOpenCommandPalette={onOpenCommandPalette}
          onOpenSettings={onOpenSettings}
          onOpenHelp={onOpenHelp}
          onOpenProfile={onOpenProfile}
          profileOpen={profileOpen}
          agentSidebarSections={agentSidebarSections}
          onSectionItemClick={onSectionItemClick}
          navSections={navSections}
        />
      </div>
    </div>
  );
}
