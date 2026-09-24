"use client";

/**
 * Studio V3 Job 4 — dominant creative stage.
 *
 * Modes: empty/image/edit/video/compare/grid/review. View controls:
 * fit/fill/zoom/pan/reset, before-after, variant selection, fullscreen.
 * Actions: open/download/edit/animate/reference. Media decodes before
 * reveal; object URLs revoke on change/unmount; video elements pause on
 * unmount. Pure view logic; all records re-resolve against canonical APIs.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type StudioStageMode = "empty" | "image" | "edit" | "video" | "compare" | "grid" | "review";

export interface StudioStageItem {
  id: string;
  kind: "image" | "video";
  title: string;
  previewUrl: string | null;
  assetId: string | null;
  jobId: string | null;
  beforeUrl?: string | null;
}

export interface StudioStageActions {
  onOpen?: (item: StudioStageItem) => void;
  onDownload?: (item: StudioStageItem) => void;
  onEdit?: (item: StudioStageItem) => void;
  onAnimate?: (item: StudioStageItem) => void;
  onUseAsReference?: (item: StudioStageItem) => void;
  onSelectVariant?: (item: StudioStageItem) => void;
  onVariation?: (item: StudioStageItem) => void;
  onReview?: (item: StudioStageItem) => void;
  onExport?: (item: StudioStageItem) => void;
}

export interface StudioEmptyAction {
  label: string;
  hint: string;
  onAction: () => void;
}

type ViewFit = "fit" | "fill";

function clampZoom(next: number): number {
  return Math.min(4, Math.max(0.25, next));
}

export function StudioStage({
  mode,
  items,
  selectedId,
  jobState,
  actions = {},
  emptyTitle = "Nothing staged yet",
  emptyHint = "Generate, open an asset, or pick a job output to preview it here.",
  emptyActions = [],
  generating = null,
  embedded = false,
}: {
  mode: StudioStageMode;
  items: readonly StudioStageItem[];
  selectedId: string | null;
  jobState?: { status: string; progress?: string; detail?: string; onCancel?: () => void; cancelling?: boolean } | null;
  actions?: StudioStageActions;
  emptyTitle?: string;
  emptyHint?: string;
  emptyActions?: readonly StudioEmptyAction[];
  /** Active generation placeholder (renders immediately on submit, replaced by results). */
  generating?: { label: string; detail: string | null } | null;
  /**
   * Generator-shell stage: no card chrome of its own. The shared
   * GeneratorLayout owns the frame, so the stage fills it edge to edge and
   * the view toolbar only appears once there is something to view.
   */
  embedded?: boolean;
}) {
  const [fit, setFit] = useState<ViewFit>("fit");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [beforeAfter, setBeforeAfter] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  const resetView = useCallback(() => {
    setFit("fit");
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBeforeAfter(false);
  }, []);

  // Render-time adjustment (no effect): view state resets when the staged
  // selection changes, deterministically and without cascading renders.
  const [viewFor, setViewFor] = useState<string | null>(null);
  if (viewFor !== (selected?.id ?? null)) {
    setViewFor(selected?.id ?? null);
    setFit("fit");
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBeforeAfter(false);
    setRevealed({});
  }

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      try {
        video?.pause();
      } catch {
        // Element already gone.
      }
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!fullscreen) return;
    const frame = frameRef.current;
    if (!frame?.requestFullscreen) return;
    void frame.requestFullscreen().catch(() => setFullscreen(false));
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [fullscreen]);

  const toggleFullscreen = useCallback(() => {
    if (fullscreen) {
      setFullscreen(false);
      return;
    }
    if (frameRef.current?.requestFullscreen) setFullscreen(true);
  }, [fullscreen]);

  const reveal = useCallback((id: string, url: string) => {
    if (typeof window === "undefined") return;
    const probe = new window.Image();
    probe.decoding = "async";
    probe.onload = () => setRevealed((current) => ({ ...current, [id]: true }));
    probe.onerror = () => setRevealed((current) => ({ ...current, [id]: true }));
    probe.src = url;
  }, []);

  const isRevealed = useCallback((item: StudioStageItem) => !item.previewUrl || !!revealed[item.id], [revealed]);

  useEffect(() => {
    for (const item of mode === "grid" ? items : selected ? [selected] : []) {
      if (item.previewUrl && !revealed[item.id]) reveal(item.id, item.previewUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, items, selected?.id]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (zoom <= 1) return;
    dragRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({ x: event.clientX - drag.x, y: event.clientY - drag.y });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const showCompare = mode === "compare" && items.length >= 2;
  const showGrid = mode === "grid" && items.length > 0;
  const showSingle = !showCompare && !showGrid && selected !== null && mode !== "empty";

  return (
    <section aria-label="Creative stage" className={embedded ? "flex min-h-[340px] flex-1 flex-col overflow-hidden" : "flex min-h-[440px] flex-col overflow-hidden rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)]"}>
      <div hidden={embedded && mode === "empty" && !jobState} className={embedded ? "flex flex-wrap items-center gap-1.5 px-4 py-2 sm:px-6" : "flex flex-wrap items-center gap-1.5 border-b border-[var(--border-default)] px-3 py-2"} role="toolbar" aria-label="Stage view controls">
        <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{mode}</span>
        <StageButton label={fit === "fit" ? "Fill" : "Fit"} onClick={() => setFit(fit === "fit" ? "fill" : "fit")} disabled={!showSingle} />
        <StageButton label="−" onClick={() => setZoom((z) => clampZoom(z - 0.25))} disabled={!showSingle || zoom <= 0.25} aria-label="Zoom out" />
        <span className="min-w-[44px] text-center text-[11.5px] text-[var(--text-secondary)]" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <StageButton label="+" onClick={() => setZoom((z) => clampZoom(z + 0.25))} disabled={!showSingle || zoom >= 4} aria-label="Zoom in" />
        <StageButton label="Reset" onClick={resetView} disabled={!showSingle} />
        {selected?.beforeUrl ? <StageButton label={beforeAfter ? "After" : "Before / After"} onClick={() => setBeforeAfter((v) => !v)} pressed={beforeAfter} /> : null}
        <StageButton label={fullscreen ? "Exit full" : "Fullscreen"} onClick={toggleFullscreen} disabled={!showSingle && !showCompare && !showGrid} />
        {jobState ? (
          <span className="ml-auto flex items-center gap-2 text-[11.5px] text-[var(--text-secondary)]" role="status">
            <span>{jobState.status}{jobState.progress ? ` · ${jobState.progress}` : ""}{jobState.detail ? ` · ${jobState.detail}` : ""}</span>
            {jobState.onCancel ? (
              <button type="button" onClick={jobState.onCancel} disabled={jobState.cancelling} className="rounded-[7px] bg-[var(--bg-surface)] px-2.5 py-1 text-[11.5px] text-[var(--text-primary)] disabled:opacity-50">
                {jobState.cancelling ? "Cancelling…" : "Cancel"}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>

      <div
        ref={frameRef}
        className={embedded ? "relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden" : "relative flex min-h-[400px] flex-1 items-center justify-center overflow-hidden bg-black/40"}
        onPointerDown={showSingle ? onPointerDown : undefined}
        onPointerMove={showSingle ? onPointerMove : undefined}
        onPointerUp={showSingle ? onPointerUp : undefined}
      >
        {generating && !showSingle && !showCompare && !showGrid ? (
          <div className="w-full max-w-[460px] px-6 py-10" role="status" aria-label={generating.label}>
            <div className="rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-4">
              <p className="animate-pulse text-[14px] font-medium text-[var(--text-primary)]">{generating.label}</p>
              {generating.detail ? <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{generating.detail}</p> : null}
              <p className="mt-2 text-[11.5px] text-[var(--text-tertiary)]">You can keep working — the result will land here.</p>
            </div>
          </div>
        ) : null}
        {!generating && (mode === "empty" || (!showSingle && !showCompare && !showGrid)) ? (
          <div className={embedded ? "w-full max-w-[460px] px-6 py-10" : "w-full max-w-[480px] px-6 py-10"}>
            <p className={embedded ? "text-center text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[34px]" : "text-center text-[15px] font-medium text-[var(--text-primary)]"}>{emptyTitle}</p>
            <p className={embedded ? "mt-3 text-center text-[13.5px] leading-[1.55] text-[var(--text-secondary)]" : "mt-2 text-center text-[12.5px] leading-5 text-[var(--text-secondary)]"}>{emptyHint}</p>
            {emptyActions.length > 0 ? (
              <ul className="mt-4 space-y-1.5">
                {emptyActions.map((action) => (
                  <li key={action.label}>
                    <button
                      type="button"
                      onClick={action.onAction}
                      className="flex w-full items-center justify-between gap-3 rounded-[10px] bg-[var(--bg-surface)] px-4 py-2.5 text-left hover:bg-[var(--bg-elevated)]"
                    >
                      <span className="text-[12.5px] font-medium text-[var(--text-primary)]">{action.label}</span>
                      <span className="shrink-0 text-[11.5px] text-[var(--text-tertiary)]">{action.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {showCompare ? (
          <div className="grid w-full grid-cols-2 gap-2 p-3">
            {items.slice(0, 2).map((item) => (
              <StageFigure key={item.id} item={item} revealed={isRevealed(item)} selected={item.id === selected?.id} fit={fit} onSelect={() => actions.onSelectVariant?.(item)} />
            ))}
          </div>
        ) : null}
        {showGrid ? (
          <div className="grid w-full grid-cols-2 gap-2 p-3 sm:grid-cols-3">
            {items.map((item) => (
              <StageFigure key={item.id} item={item} revealed={isRevealed(item)} selected={item.id === selected?.id} fit={fit} onSelect={() => actions.onSelectVariant?.(item)} />
            ))}
          </div>
        ) : null}
        {showSingle && selected ? (
          selected.kind === "video" && selected.previewUrl ? (
            <video
              ref={videoRef}
              src={selected.previewUrl}
              controls
              playsInline
              preload="metadata"
              aria-label={selected.title}
              className="max-h-[560px] w-full"
              style={{ objectFit: fit === "fit" ? "contain" : "cover", transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}
            />
          ) : (
            <figure className="m-0 flex max-h-[560px] w-full items-center justify-center" aria-label={selected.title}>
              {selected.previewUrl && isRevealed(selected) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={beforeAfter && selected.beforeUrl ? selected.beforeUrl : selected.previewUrl}
                  alt={selected.title}
                  draggable={false}
                  className="max-h-[560px] max-w-full select-none"
                  style={{ objectFit: fit === "fit" ? "contain" : "cover", transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, cursor: zoom > 1 ? "grab" : "default" }}
                />
              ) : (
                <div className="flex h-[280px] w-full items-center justify-center text-[12px] text-[var(--text-tertiary)]" role="status" aria-label="Decoding preview">
                  Decoding preview…
                </div>
              )}
            </figure>
          )
        ) : null}
      </div>

      {selected ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border-default)] px-3 py-2" role="toolbar" aria-label="Stage actions">
          <span className="mr-2 min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]">{selected.title}</span>
          {actions.onOpen ? <StageButton label="Open" onClick={() => actions.onOpen?.(selected)} /> : null}
          {actions.onDownload ? <StageButton label="Download" onClick={() => actions.onDownload?.(selected)} /> : null}
          {actions.onEdit ? <StageButton label="Edit" onClick={() => actions.onEdit?.(selected)} /> : null}
          {actions.onAnimate ? <StageButton label="Animate" onClick={() => actions.onAnimate?.(selected)} /> : null}
          {actions.onVariation ? <StageButton label="Variation" onClick={() => actions.onVariation?.(selected)} /> : null}
          {actions.onUseAsReference ? <StageButton label="Reference" onClick={() => actions.onUseAsReference?.(selected)} /> : null}
          {actions.onReview ? <StageButton label="Review" onClick={() => actions.onReview?.(selected)} /> : null}
          {actions.onExport ? <StageButton label="Export" onClick={() => actions.onExport?.(selected)} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function StageButton({ label, onClick, disabled, pressed, ...rest }: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean } & Record<string, unknown>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className="rounded-[7px] bg-[var(--bg-surface)] px-2.5 py-1 text-[11.5px] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-40"
      {...(rest as Record<string, string | undefined>)}
    >
      {label}
    </button>
  );
}

function StageFigure({ item, revealed, selected, fit, onSelect }: { item: StudioStageItem; revealed: boolean; selected: boolean; fit: ViewFit; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${item.title}${selected ? " (selected)" : ""}`}
      className={`group relative aspect-square overflow-hidden rounded-[10px] border bg-black/40 ${selected ? "border-[var(--accent)]" : "border-[var(--border-default)]"}`}
    >
      {item.previewUrl && revealed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.previewUrl} alt="" aria-hidden className="h-full w-full" style={{ objectFit: fit === "fit" ? "contain" : "cover" }} />
      ) : (
        <span className="flex h-full items-center justify-center px-2 text-center text-[11px] text-[var(--text-tertiary)]">Decoding…</span>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-left text-[11px] text-white">{item.title}</span>
    </button>
  );
}
