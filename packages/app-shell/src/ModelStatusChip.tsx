"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * ModelStatusChip — Compact model selector/status chip for the sidebar.
 *
 * Shows the currently active model and links to the model library.
 * This is a utility/status surface, not a main nav item.
 */
export function ModelStatusChip() {
  const pathname = usePathname();
  const isActive = pathname === "/model-library" || pathname === "/models";

  return (
    <Link
      href="/model-library"
      className={`flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 transition-colors ${
        isActive
          ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {/* Icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        className="shrink-0"
        aria-hidden
      >
        <rect
          x="1.5"
          y="1.5"
          width="13"
          height="13"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="8" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M3 12.5L5.5 9.5L8 11.5L10.5 8L13 12.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Label */}
      <span className="text-[12px] font-medium leading-tight">Model Library</span>

      {/* Badge */}
      <span className="ml-auto inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--bg-elevated)] text-[var(--text-muted)]">
        {isActive ? "Open" : "Browse"}
      </span>
    </Link>
  );
}
