"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface ResizableWorkbenchShellProps {
  left?: React.ReactNode;
  main: React.ReactNode;
  right?: React.ReactNode;
  bottom?: React.ReactNode;
  defaultLeftWidth?: number;
  defaultRightWidth?: number;
  defaultBottomHeight?: number;
  className?: string;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  bottomCollapsed?: boolean;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
  onToggleBottom?: () => void;
}

/**
 * Production V2 resizable workbench — left / main / right / bottom slots
 * with draggable handles, snap/collapse, and mobile single-column fallback.
 * Outer shell geometry (256/56 sidebar, 56 topbar) remains owned by ConsoleShell.
 */
export function ResizableWorkbenchShell({
  left,
  main,
  right,
  bottom,
  defaultLeftWidth = 256,
  defaultRightWidth = 320,
  defaultBottomHeight = 180,
  className,
  leftCollapsed,
  rightCollapsed,
  bottomCollapsed,
  onToggleLeft,
  onToggleRight,
  onToggleBottom,
}: ResizableWorkbenchShellProps) {
  const [leftW, setLeftW] = React.useState(defaultLeftWidth);
  const [rightW, setRightW] = React.useState(defaultRightWidth);
  const [bottomH, setBottomH] = React.useState(defaultBottomHeight);
  const [dragging, setDragging] = React.useState<"left" | "right" | "bottom" | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);

  const startDrag = (which: "left" | "right" | "bottom") => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDragging(which);
  };

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (dragging === "left") {
        const w = Math.max(160, Math.min(400, clientX - rect.left));
        setLeftW(w < 180 ? 56 : w);
      } else if (dragging === "right") {
        const w = Math.max(200, Math.min(480, rect.right - clientX));
        setRightW(w < 220 ? 56 : w);
      } else if (dragging === "bottom") {
        const h = Math.max(100, Math.min(400, rect.bottom - clientY));
        setBottomH(h < 120 ? 32 : h);
      }
    };
    const onUp = () => setDragging(null);
    const opts = { passive: false } as AddEventListenerOptions;
    document.addEventListener("mousemove", onMove as EventListener, opts);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove as EventListener, opts);
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove as EventListener);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove as EventListener);
      document.removeEventListener("touchend", onUp);
    };
  }, [dragging]);

  const handleKeyDown =
    (which: "left" | "right" | "bottom") => (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 24 : 8;
      if (which === "left" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        setLeftW((w) => Math.max(56, Math.min(400, w + (e.key === "ArrowRight" ? step : -step))));
      } else if (which === "right" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        setRightW((w) => Math.max(56, Math.min(480, w + (e.key === "ArrowLeft" ? step : -step))));
      } else if (which === "bottom" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        setBottomH((h) => Math.max(32, Math.min(400, h + (e.key === "ArrowUp" ? step : -step))));
      }
    };

  const leftWidth = leftCollapsed ? 56 : leftW;
  const rightWidth = rightCollapsed ? 56 : rightW;
  const bottomHeight = bottomCollapsed ? 32 : bottomH;

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex min-h-[520px] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-canvas)]",
        dragging && "select-none",
        className
      )}
      data-ethen-v2
    >
      <div className="flex min-h-0 min-w-0 max-w-full flex-1 overflow-hidden">
        {left ? (
          <>
            <div style={{ width: leftWidth }} className="flex shrink-0 flex-col overflow-hidden border-r border-[var(--v2-border-subtle)] bg-[var(--v2-surface)]">
              <div className="flex-1 overflow-auto" tabIndex={0} role="region" aria-label="Left workbench pane">{left}</div>
              {onToggleLeft ? (
                <button type="button" onClick={onToggleLeft} aria-label={leftCollapsed ? "Expand left rail" : "Collapse left rail"} className="flex h-8 items-center justify-center border-t border-[var(--v2-border-subtle)] text-[var(--v2-text-tertiary)] hover:bg-[var(--v2-hover)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]">
                  <span className="text-[12px]">{leftCollapsed ? "›" : "‹"}</span>
                </button>
              ) : null}
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={leftWidth}
              aria-valuemin={56}
              aria-valuemax={400}
              tabIndex={0}
              onMouseDown={startDrag("left")}
              onTouchStart={startDrag("left")}
              onKeyDown={handleKeyDown("left")}
              className="flex w-2 shrink-0 cursor-col-resize items-center justify-center bg-transparent hover:bg-[var(--v2-hover)] focus-visible:outline-none focus-visible:bg-[var(--v2-active)]"
              aria-label="Resize left panel"
            >
              <span className="h-8 w-0.5 rounded-full bg-[var(--v2-border-strong)]" aria-hidden />
            </div>
          </>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--v2-surface)]">
          <div className="flex-1 overflow-auto" tabIndex={0} role="region" aria-label="Main workbench pane">{main}</div>
          {bottom ? (
            <>
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-valuenow={bottomHeight}
                aria-valuemin={32}
                aria-valuemax={400}
                tabIndex={0}
                onMouseDown={startDrag("bottom")}
                onTouchStart={startDrag("bottom")}
                onKeyDown={handleKeyDown("bottom")}
                className="flex h-2 shrink-0 cursor-row-resize items-center justify-center bg-transparent hover:bg-[var(--v2-hover)] focus-visible:outline-none focus-visible:bg-[var(--v2-active)]"
                aria-label="Resize bottom panel"
              >
                <span className="h-0.5 w-8 rounded-full bg-[var(--v2-border-strong)]" aria-hidden />
              </div>
              <div style={{ height: bottomHeight }} className="shrink-0 overflow-hidden border-t border-[var(--v2-border-subtle)] bg-[var(--v2-raised)]">
                <div className="flex h-full flex-col overflow-hidden">
                  <div className="flex h-8 shrink-0 items-center justify-between px-3">
                    <span className="text-[12px] font-medium text-[var(--v2-text-tertiary)]">Bottom</span>
                    {onToggleBottom ? (
                      <button type="button" onClick={onToggleBottom} className="text-[13px] text-[var(--v2-text-tertiary)] hover:text-[var(--v2-text-primary)]">{bottomCollapsed ? "Expand" : "Collapse"}</button>
                    ) : null}
                  </div>
                  <div className="flex-1 overflow-auto p-3" tabIndex={0} role="region" aria-label="Bottom workbench pane">{bottomCollapsed ? <span className="text-[12px] text-[var(--v2-text-tertiary)]">Collapsed</span> : bottom}</div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {right ? (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={rightWidth}
              aria-valuemin={56}
              aria-valuemax={480}
              tabIndex={0}
              onMouseDown={startDrag("right")}
              onTouchStart={startDrag("right")}
              onKeyDown={handleKeyDown("right")}
              className="flex w-2 shrink-0 cursor-col-resize items-center justify-center bg-transparent hover:bg-[var(--v2-hover)] focus-visible:outline-none focus-visible:bg-[var(--v2-active)]"
              aria-label="Resize right panel"
            >
              <span className="h-8 w-0.5 rounded-full bg-[var(--v2-border-strong)]" aria-hidden />
            </div>
            <div style={{ width: rightWidth }} className="flex shrink-0 flex-col overflow-hidden border-l border-[var(--v2-border-subtle)] bg-[var(--v2-surface)]">
              <div className="flex-1 overflow-auto" tabIndex={0} role="region" aria-label="Right workbench pane">{right}</div>
              {onToggleRight ? (
                <button type="button" onClick={onToggleRight} aria-label={rightCollapsed ? "Expand inspector" : "Collapse inspector"} className="flex h-8 items-center justify-center border-t border-[var(--v2-border-subtle)] text-[var(--v2-text-tertiary)] hover:bg-[var(--v2-hover)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]">
                  <span className="text-[12px]">{rightCollapsed ? "‹" : "›"}</span>
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {/* Mobile: stacked */}
      <style>{`@media (max-width: 768px) { [data-ethen-v2].flex > .flex { flex-direction: column; } [data-ethen-v2].flex > .flex > [style*="width"] { width: 100% !important; max-width: 100%; } }`}</style>
    </div>
  );
}
