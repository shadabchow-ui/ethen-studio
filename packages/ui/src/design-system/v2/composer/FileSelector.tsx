"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../../../lib/utils";
import { V2MenuRow, V2Overlay } from "../primitives";
import styles from "../v2.module.css";

export type V2FilePickerOption = {
  id: string;
  label: string;
  hint?: string;
  mimeHint?: string;
  onSelect?: () => void;
  disabled?: boolean;
};

export type V2FilePickerProps = {
  options: readonly V2FilePickerOption[];
  onSelect?: (option: V2FilePickerOption) => void;
  className?: string;
  triggerLabel?: string;
  disabled?: boolean;
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={styles.icon}>
      {children}
    </svg>
  );
}

function FileTypeIcon({ id }: { id: string }) {
  if (id.includes("image")) return <Icon><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M2 10l3-3 2.5 2.5L10 6l4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
  if (id.includes("pdf")) return <Icon><path d="M4 2h6l4 4v10H4V2zM4 7h8M4 10h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
  if (id.includes("audio")) return <Icon><path d="M7 12.5a2 2 0 100-5M7 12.5V4.5l8-2v9M15 11.5a2 2 0 100-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
  if (id.includes("video")) return <Icon><rect x="2" y="4" width="9" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" /><path d="M11 6l4-2v8l-4-2V6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></Icon>;
  if (id.includes("json") || id.includes("code")) return <Icon><path d="M5 3l-3 5 3 5M11 3l3 5-3 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
  return <Icon><path d="M4 2h6l4 4v10H4V2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
}

/** Production V2 FilePicker trigger + menu — Plus Icon entry, file type rows, 12px raised. */
export function V2FilePicker({ options, onSelect, className, triggerLabel = "Attach file", disabled }: V2FilePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(option: V2FilePickerOption) {
    if (option.disabled) return;
    option.onSelect?.();
    onSelect?.(option);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={containerRef} className={cn(styles.anchor, className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={styles.iconButton}
      >
        <Icon><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Icon>
      </button>
      {open ? (
        <V2Overlay role="menu" aria-label="File picker" className={cn(styles.toolsMenu, "w-[240px]")}>
          {options.map((option, i) => (
            <V2MenuRow
              key={option.id}
              ref={(n) => { optionRefs.current[i] = n; }}
              role="menuitem"
              aria-disabled={option.disabled || undefined}
              disabled={option.disabled}
              onClick={() => choose(option)}
            >
              <span className="mr-2 flex h-4 w-4 items-center justify-center text-[var(--v2-text-tertiary)]">
                <FileTypeIcon id={option.id} />
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.hint ? <span className="ml-2 shrink-0 text-[12px] text-[var(--v2-text-tertiary)]">{option.hint}</span> : null}
            </V2MenuRow>
          ))}
        </V2Overlay>
      ) : null}
    </div>
  );
}
