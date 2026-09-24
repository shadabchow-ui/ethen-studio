"use client";

import { useEffect, useRef, useState } from "react";
import { STUDIO_FOCUS_RING_CLASS } from "./tokens";

/** Open-drawer stack so Escape always closes the topmost drawer only. */
const drawerStack: symbol[] = [];

/**
 * STUDIO_08 — shared right inspector drawer. Escape closes, focus
 * returns to the invoker, and content is labelled for assistive tech.
 * One inspector at a time at mid widths; bottom sheet on small screens
 * via responsive classes in the consumer layout.
 */
export function StudioInspectorDrawer({
  open,
  onClose,
  title,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<Element | null>(null);
  const [id] = useState(() => Symbol("studio-drawer"));
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    drawerStack.push(id);
    invokerRef.current = typeof document !== "undefined" ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (drawerStack[drawerStack.length - 1] !== id) return;
      event.stopPropagation();
      event.stopImmediatePropagation();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const position = drawerStack.lastIndexOf(id);
      if (position >= 0) drawerStack.splice(position, 1);
      const invoker = invokerRef.current;
      if (invoker instanceof HTMLElement) invoker.focus();
    };
  }, [open, id]);

  if (!open) return null;

  return (
    <div data-testid={testId ?? "studio-inspector-drawer"} className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[var(--studio-bg-app)]/70"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col bg-[var(--bg-base)] shadow-xl ${STUDIO_FOCUS_RING_CLASS}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4">
          <h2 className="truncate text-[14px] font-medium text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] text-[13px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
