/**
 * Studio V2 Job 12 (P0-4) — shared canvas hosting contract.
 *
 * Generic viewport/hosting primitive only. It owns pan, zoom, selection
 * region, safe area, pointer ownership, keyboard focus, scroll ownership,
 * overlay anchoring, and responsive sizing. Studio DAG/graph/workflow
 * semantics stay in apps/studio and are never imported here.
 */
"use client";

import * as React from "react";

/** Panel collapse priority for constrained widths (canvas first). */
export const STUDIO_PANEL_COLLAPSE_PRIORITY = ["canvas", "inspector", "history"] as const;

export type StudioPanelId = (typeof STUDIO_PANEL_COLLAPSE_PRIORITY)[number];

/** Minimum/maximum canvas zoom as a scale factor. */
export const CANVAS_ZOOM_MIN = 0.25;
export const CANVAS_ZOOM_MAX = 4;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, zoom));
}

export interface CanvasPan {
  x: number;
  y: number;
}

export function panBy(pan: CanvasPan, dx: number, dy: number): CanvasPan {
  return { x: pan.x + dx, y: pan.y + dy };
}

export function canvasTransform(pan: CanvasPan, zoom: number): string {
  return `translate(${pan.x}px, ${pan.y}px) scale(${clampZoom(zoom)})`;
}

export interface CanvasSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeSelection(selection: CanvasSelection): CanvasSelection {
  return {
    x: Math.min(selection.x, selection.x + selection.width),
    y: Math.min(selection.y, selection.y + selection.height),
    width: Math.abs(selection.width),
    height: Math.abs(selection.height),
  };
}

export interface CanvasViewportProps {
  /** Controlled zoom scale factor. */
  zoom?: number;
  /** Controlled pan offset in CSS pixels. */
  pan?: CanvasPan;
  onZoomChange?: (zoom: number) => void;
  onPanChange?: (pan: CanvasPan) => void;
  /** Fires with canvas-space selection rectangles (already normalized). */
  onSelectRegion?: (selection: CanvasSelection | null) => void;
  /** Owning panel scrolls; the page shell must not steal wheel gestures. */
  scrollOwner?: "panel" | "shell";
  label?: string;
  className?: string;
  children?: React.ReactNode;
  /** Anchored overlays (toolbars, minimap, status chips). */
  overlay?: React.ReactNode;
}

/**
 * Generic canvas host. Pointer drag pans, wheel zooms (when the panel owns
 * scroll), shift-drag selects a region, and arrow keys pan when focused.
 * Content and tools are supplied by the product; this component never
 * interprets Studio graph semantics.
 */
export function CanvasViewport({
  zoom = 1,
  pan = { x: 0, y: 0 },
  onZoomChange,
  onPanChange,
  onSelectRegion,
  scrollOwner = "panel",
  label = "Canvas",
  className,
  children,
  overlay,
}: CanvasViewportProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ startX: number; startY: number; pan: CanvasPan; selecting: boolean } | null>(null);
  const appliedZoom = clampZoom(zoom);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      pan,
      selecting: event.shiftKey,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.selecting) {
      onSelectRegion?.(normalizeSelection({ x: drag.pan.x, y: drag.pan.y, width: dx, height: dy }));
      return;
    }
    onPanChange?.(panBy(drag.pan, dx, dy));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.selecting) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) onSelectRegion?.(null);
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (scrollOwner !== "panel") return;
    // Panel-owned wheel: zoom instead of page scroll so the canvas never
    // fights the shell for the gesture.
    event.preventDefault();
    const next = clampZoom(appliedZoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
    onZoomChange?.(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    if (event.key === "ArrowLeft") onPanChange?.(panBy(pan, step, 0));
    else if (event.key === "ArrowRight") onPanChange?.(panBy(pan, -step, 0));
    else if (event.key === "ArrowUp") onPanChange?.(panBy(pan, 0, step));
    else if (event.key === "ArrowDown") onPanChange?.(panBy(pan, 0, -step));
    else if (event.key === "+" || event.key === "=") onZoomChange?.(clampZoom(appliedZoom * 1.1));
    else if (event.key === "-" || event.key === "_") onZoomChange?.(clampZoom(appliedZoom / 1.1));
    else if (event.key === "0") { onZoomChange?.(1); onPanChange?.({ x: 0, y: 0 }); }
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={hostRef}
      role="application"
      aria-label={label}
      tabIndex={0}
      data-canvas-viewport="true"
      data-scroll-owner={scrollOwner}
      data-zoom={appliedZoom.toFixed(2)}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: 0,
        minWidth: 0,
        flex: 1,
        touchAction: "none",
        outlineOffset: 2,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={() => { dragRef.current = null; }}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
    >
      <div
        aria-hidden={false}
        style={{ position: "absolute", inset: 0, transform: canvasTransform(pan, appliedZoom), transformOrigin: "0 0" }}
      >
        {children}
      </div>
      {overlay ? (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ pointerEvents: "auto" }}>{overlay}</div>
        </div>
      ) : null}
    </div>
  );
}
