"use client";

import * as React from "react";

type Tone = "status" | "success" | "warning" | "error";
type Toast = { id: string; message: string; tone: Tone; action?: { label: string; onClick: () => void }; duration: number };
type ToastContext = { toast: (message: string, options?: Partial<Omit<Toast, "id" | "message">> & { id?: string }) => void; dismiss: (id: string) => void };
const Context = React.createContext<ToastContext | null>(null);

/**
 * Production toast queue.
 * Queue ordering, 5000ms default auto-dismiss, and pause-on-hover are unchanged.
 * Presentation uses the V2 overlay toast surface.
 * Tokens: var(--ethen-border) var(--text-primary) var(--status-danger)
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dismiss = React.useCallback((id: string) => { const timer = timers.current.get(id); if (timer) clearTimeout(timer); timers.current.delete(id); setItems((current) => current.filter((item) => item.id !== id)); }, []);
  const toast = React.useCallback((message: string, options: Partial<Omit<Toast, "id" | "message">> & { id?: string } = {}) => {
    const id = options.id ?? `${message}:${options.tone ?? "status"}`;
    setItems((current) => current.some((item) => item.id === id) ? current : [...current.slice(-3), { id, message, tone: options.tone ?? "status", action: options.action, duration: options.duration ?? 5000 }]);
    if (!timers.current.has(id)) timers.current.set(id, setTimeout(() => dismiss(id), options.duration ?? 5000));
  }, [dismiss]);
  return (
    <Context.Provider value={{ toast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex justify-end" aria-live="polite" aria-atomic="true" data-v2-pattern="toast">
        <div className="flex w-full max-w-sm flex-col gap-2">
          {items.map((item) => <ToastItem key={item.id} item={item} dismiss={dismiss} />)}
        </div>
      </div>
    </Context.Provider>
  );
}

function ToastItem({ item, dismiss }: { item: Toast; dismiss: (id: string) => void }) {
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => { if (!paused) return; const timer = setTimeout(() => dismiss(item.id), item.duration); return () => clearTimeout(timer); }, [dismiss, item.duration, item.id, paused]);
  const toneColor = item.tone === "error" ? "var(--eds-sys-status-danger)" : item.tone === "warning" ? "var(--eds-sys-status-attention)" : item.tone === "success" ? "var(--eds-sys-status-verified)" : "var(--eds-text-tertiary)";
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-center gap-3 rounded-[var(--eds-radius-raised)] border border-[var(--eds-rule)] bg-[var(--eds-elevated)] px-3 py-2.5 text-[13px] text-[var(--eds-ink)] shadow-[var(--eds-elev-overlay-shadow)] focus-visible:outline-[var(--eds-focus-ring)]"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: toneColor }} />
      <span className="flex-1">{item.message}</span>
      {item.action && <button type="button" onClick={item.action.onClick} className="font-medium underline focus-visible:outline-[var(--eds-focus-ring)]">{item.action.label}</button>}
      <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(item.id)} className="rounded-[var(--eds-radius-base)] px-1 text-[var(--eds-text-secondary)] hover:bg-[var(--eds-cmp-shell-nav-hover)] focus-visible:outline-[var(--eds-focus-ring)]">×</button>
    </div>
  );
}

export function useToast() { const context = React.useContext(Context); if (!context) throw new Error("useToast must be used within ToastProvider"); return context; }
