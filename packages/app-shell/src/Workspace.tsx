"use client";

import Link from "next/link";
import { cn } from "@ethen/ui/lib/utils";

interface WorkspaceProps {
  className?: string;
  onOpenMobileSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  notice?: {
    tone?: "warning" | "neutral";
    title: string;
    body: string;
    cta?: { label: string; href: string };
  };
  /** When true, render only the notice card — used for stale/unresolvable session states that should not present the full template launcher as the primary experience. */
  noticeOnly?: boolean;
}

const WORKSPACE_TYPES = [
  {
    slug: "writing-assistant",
    label: "Writing",
    description: "Draft, edit, and refine long-form content",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M2.5 14V10.25L11.5 1.25a1 1 0 0 1 1.42 0l1.83 1.83a1 1 0 0 1 0 1.42L5.75 13.5 2.5 14Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
        <path d="M2.5 16.5h13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    slug: "research-assistant",
    label: "Research",
    description: "Deep-dive any topic with structured analysis",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M12.25 12.25L16 16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    slug: "code-helper",
    label: "Coding",
    description: "Write, review, and debug code faster",
    href: "/code",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M6 5.5 2.5 9 6 12.5M12 5.5 15.5 9 12 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 3.5 8 14.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    slug: "business-plan",
    label: "Business",
    description: "Plans, pitches, and strategic documents",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path d="M5.5 11.5l2.5-3 2 2 2.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    slug: "brainstorm-partner",
    label: "Creative",
    description: "Explore ideas, concepts, and creative directions",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M9 2.5a4 4 0 0 1 3.1 6.6c-.6.7-.9 1.6-.9 2.4v.5H6.8v-.5c0-.8-.3-1.7-.9-2.4A4 4 0 0 1 9 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
        <path d="M6.8 13h4.4M7.5 15.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function Workspace({
  className,
  onOpenMobileSidebar,
  onOpenCommandPalette,
  notice,
  noticeOnly,
}: WorkspaceProps) {
  return (
    <main
      className={cn(
        "flex flex-col flex-1 min-w-0 h-full overflow-hidden",
        "bg-[var(--bg-base)]",
        className
      )}
    >
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 h-[var(--topbar-height)] shrink-0 border-b border-[var(--border-subtle)] glass-chrome">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onOpenMobileSidebar}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] shrink-0"
            aria-label="Open navigation"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-sm font-medium text-[var(--text-secondary)]">Home</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/marketplace"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors"
          >
            Templates
          </Link>
          <button
            onClick={onOpenCommandPalette}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] font-mono"
            aria-label="Open command palette"
          >
            <span>⌘K</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 sm:py-20">

          {notice && (
            <div
              className="mb-10 rounded-[var(--radius-xl)] border px-4 py-3"
              style={{
                backgroundColor: notice.tone === "warning"
                  ? "color-mix(in srgb, var(--status-warning) 8%, var(--bg-surface))"
                  : "var(--bg-surface)",
                borderColor: notice.tone === "warning"
                  ? "color-mix(in srgb, var(--status-warning) 30%, var(--border-subtle))"
                  : "var(--border-subtle)",
              }}
            >
              <p className="text-sm font-medium text-[var(--text-primary)]">{notice.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{notice.body}</p>
              {notice.cta && (
                <Link
                  href={notice.cta.href}
                  className="mt-3 inline-flex items-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-inset)]"
                >
                  {notice.cta.label}
                </Link>
              )}
            </div>
          )}

          {!noticeOnly && (
          <>
          {/* Hero */}
          <div className="mb-10 space-y-3">
            <h1 className="text-[clamp(1.75rem,4vw,2.75rem)] font-normal tracking-tight text-[var(--text-primary)] leading-[1.15]">
              What are you working on today?
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] max-w-lg">
              Pick a workspace template below or describe your goal — Ethen opens a focused session for that kind of work.
            </p>
          </div>

          {/* Command center input */}
          <button
            onClick={onOpenCommandPalette}
            className="w-full flex items-center gap-3 px-4 py-3.5 mb-10 rounded-[var(--radius-xl)] border border-[var(--border-default)] glass-chrome glass-control text-left hover:border-[var(--border-strong)] group"
            aria-label="Open command palette"
          >
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" className="shrink-0 text-[var(--text-tertiary)]" aria-hidden>
              <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.25 9.25L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="flex-1 text-sm text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]">
              Describe what you want to work on…
            </span>
            <kbd className="shrink-0 text-[11px] font-mono text-[var(--text-disabled)] bg-[var(--bg-inset)] px-1.5 py-0.5 rounded-[var(--radius-sm)]">
              ⌘K
            </kbd>
          </button>

          {/* Workspace launcher cards */}
          <div className="space-y-3 mb-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Workspace templates
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {WORKSPACE_TYPES.map((ws) => (
                <Link
                  key={ws.slug}
                  href={ws.href ?? `/agents/${ws.slug}/launch`}
                  className="group flex items-center gap-3.5 px-4 py-3.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] glass-card glass-control hover:border-[var(--border-default)] hover:-translate-y-0.5"
                >
                  <div className="shrink-0 w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors">
                    {ws.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{ws.label}</p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">{ws.description}</p>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-auto shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--text-tertiary)] transition-colors" aria-hidden>
                    <path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              ))}

              {/* Browse all */}
              <Link
                href="/marketplace"
                className="group flex items-center gap-3.5 px-4 py-3.5 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] glass-card glass-control hover:border-[var(--border-default)] hover:-translate-y-0.5 col-span-full sm:col-span-1"
              >
                <div className="shrink-0 w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-elevated)]/60 text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
                  <svg width="18" height="18" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" opacity=".5" />
                    <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" opacity=".5" />
                    <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" opacity=".5" />
                    <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity=".5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">Browse all templates</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Browse the full agent catalog</p>
                </div>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-auto shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--text-tertiary)] transition-colors" aria-hidden>
                  <path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
          </>
          )}

        </div>
      </div>
    </main>
  );
}
