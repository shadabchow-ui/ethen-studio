"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@ethen/ui/lib/utils";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "@ethen/ui/dropdown-menu";
import { useThemePreference } from "@ethen/ui/theme/theme-preference";
import {
  SSR_RESOLVED_THEME,
  readResolvedThemeFromDocument,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@ethen/ui/theme/theme-store";

const OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function ThemeIcon({ resolved }: { resolved: ResolvedTheme }) {
  if (resolved === "dark") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M9.7 1.7A5.5 5.5 0 1 0 12.3 12 5 5 0 0 1 9.7 1.7Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 1.2v1.6M7 11.2v1.6M1.2 7h1.6M11.2 7h1.6M2.9 2.9l1.2 1.2M9.9 9.9l1.2 1.2M2.9 11.1l1.2-1.2M9.9 4.1l1.2-1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

/**
 * Production theme control — System / Light / Dark (M3).
 *
 * Stores the PREFERENCE (`system | light | dark`) under the unified
 * `ethen-theme` key, never the resolved value. Uses the shared production
 * DropdownMenu primitive (APG keyboard, roving tabindex, aria-checked
 * state) — no bespoke theme menu.
 */
export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const [preference, setPreference] = useThemePreference();
  const [open, setOpen] = useState(false);
  const [osTick, setOsTick] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setOsTick((tick) => tick + 1);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [preference]);

  useLayoutEffect(() => {
    if (!open) return;
    const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemcheckbox"][aria-checked="true"]');
    (checked ?? menuRef.current?.querySelector<HTMLElement>('[role="menuitemcheckbox"]'))?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  // Deterministic on SSR and on the first client render (both produce the
  // server's `resolveTheme("system")` value), then reconciled to the real
  // resolved theme in a layout effect — before paint, so the icon never
  // flashes. Branching on `typeof document` during render instead made the
  // hydrating tree differ from the server HTML and forced React to
  // regenerate it.
  const [resolved, setResolved] = useState<ResolvedTheme>(SSR_RESOLVED_THEME);
  useLayoutEffect(() => {
    const sync = () => {
      setResolved(preference === "system" ? readResolvedThemeFromDocument() : resolveTheme(preference));
    };
    sync();
  }, [preference, osTick]);

  const items: DropdownMenuItem[] = OPTIONS.map((option) => ({
    label: option.label,
    kind: "checkbox",
    checked: preference === option.value,
    onSelect: () => {
      setPreference(option.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
  }));

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Theme: ${preference}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center rounded-[10px] border border-black/[0.08] bg-transparent text-[14px] text-neutral-600 transition-colors hover:bg-black/[0.04] hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/20 dark:border-white/[0.08] dark:text-white/80 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-white/30",
          compact ? "h-11 w-11 justify-center" : "w-full justify-between gap-3 px-3.5 py-2.5 text-left",
          className,
        )}
        suppressHydrationWarning
      >
        <span className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center text-[13px]" aria-hidden>
            <ThemeIcon resolved={resolved} />
          </span>
          {!compact && (
            <span className="text-[14px] text-neutral-700 dark:text-white/90" suppressHydrationWarning>
              Theme: {preference[0].toUpperCase() + preference.slice(1)}
            </span>
          )}
        </span>
        {!compact && (
          <span className="text-[12px] capitalize text-neutral-400 dark:text-white/60" aria-hidden>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </button>
      {open && (
        <div ref={menuRef} className="absolute bottom-full right-0 z-50 mb-2">
          <DropdownMenu items={items} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
