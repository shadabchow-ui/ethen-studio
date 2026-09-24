"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  V2DropdownMenu,
  type V2DropdownMenuItem,
} from "../design-system/v2/overlays/DropdownMenu";
import { useThemePreference } from "./theme-preference";
import {
  SSR_RESOLVED_THEME,
  readResolvedThemeFromDocument,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme-store";

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

/**
 * V2 appearance control — System / Light / Dark (M3 unification).
 *
 * Uses the shared V2 dropdown menu primitive; stores the PREFERENCE under the
 * unified `ethen-theme` key. Renders inside `[data-ethen-v2]` scopes where
 * V2 tokens resolve (Design Lab, V2 shells, console surfaces).
 */
export function AppearanceSelector() {
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

  const items: V2DropdownMenuItem[] = OPTIONS.map((option) => ({
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
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Theme: ${preference}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-2 rounded-[var(--v2-radius-base)] border border-[var(--v2-border-default)] bg-[var(--v2-surface)] px-3 text-[13px] text-[var(--v2-text-secondary)] transition-colors hover:bg-[var(--v2-hover)] hover:text-[var(--v2-text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]"
        suppressHydrationWarning
      >
        <span aria-hidden>
          <ThemeIcon resolved={resolved} />
        </span>
        {preference[0].toUpperCase() + preference.slice(1)}
      </button>
      {open && (
        <div ref={menuRef} className="absolute right-0 top-full z-50 mt-2">
          <V2DropdownMenu items={items} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** Alias kept for consumers that referenced the original ThemePicker stub. */
export { AppearanceSelector as ThemePicker };
