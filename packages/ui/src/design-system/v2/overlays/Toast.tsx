"use client";

import * as React from "react";

type V2ToastTone = "status" | "success" | "warning" | "error";
type V2ToastItem = { id: string; message: string; tone: V2ToastTone; action?: { label: string; onClick: () => void }; duration: number };
type V2ToastContext = { toast: (message: string, options?: Partial<Omit<V2ToastItem, "id" | "message">> & { id?: string }) => void; dismiss: (id: string) => void };

const Context = React.createContext<V2ToastContext | null>(null);

export function V2ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<V2ToastItem[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dismiss = React.useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((cur) => cur.filter((i) => i.id !== id));
  }, []);
  const toast = React.useCallback((message: string, options: Partial<Omit<V2ToastItem, "id" | "message">> & { id?: string } = {}) => {
    const id = options.id ?? `${message}:${options.tone ?? "status"}`;
    setItems((cur) => (cur.some((i) => i.id === id) ? cur : [...cur.slice(-3), { id, message, tone: options.tone ?? "status", action: options.action, duration: options.duration ?? 4000 }]));
    if (!timers.current.has(id)) timers.current.set(id, setTimeout(() => dismiss(id), options.duration ?? 4000));
  }, [dismiss]);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (
    <Context.Provider value={{ toast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex justify-end" aria-live="polite" aria-atomic="true" data-v2-pattern="toast">
        <div className="flex w-full max-w-sm flex-col gap-2">
          {items.map((item) => <V2ToastRow key={item.id} item={item} dismiss={dismiss} />)}
        </div>
      </div>
    </Context.Provider>
  );
}

function V2ToastRow({ item, dismiss }: { item: V2ToastItem; dismiss: (id: string) => void }) {
  const toneColor = item.tone === "error" ? "var(--v2-status-danger)" : item.tone === "warning" ? "var(--v2-status-warning)" : item.tone === "success" ? "var(--v2-status-success)" : "var(--v2-text-tertiary)";
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      tabIndex={0}
      className="pointer-events-auto flex items-center gap-3 rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-raised)] px-3 py-2.5 text-[13px] text-[var(--v2-text-primary)] shadow-[var(--v2-shadow-overlay)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: toneColor }} />
      <span className="flex-1">{item.message}</span>
      {item.action ? <button type="button" onClick={item.action.onClick} className="font-medium underline focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]">{item.action.label}</button> : null}
      <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(item.id)} className="rounded-[var(--v2-radius-base)] px-1 text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]">×</button>
    </div>
  );
}

export function useV2Toast() {
  const ctx = React.useContext(Context);
  if (!ctx) throw new Error("useV2Toast must be used within V2ToastProvider");
  return ctx;
}
