"use client";

import { useState } from "react";
import type { StudioCanvasToolbarSlotProps } from "@ethen/app-shell";
import { SlotEmpty, SlotPanel } from "./slot-primitives";

/**
 * Studio V2 Job 13 — CanvasToolbar slot implementation.
 *
 * Tool switching only: the toolbar offers the board's canonical card tools
 * (derived from `BoardCardType`, the operations canvas boards support) plus
 * selection. Canvas state, validation, and execution stay with the Studio
 * canvas runtime; this slot only reports the active tool via `onToolChange`.
 */

const CANVAS_TOOLS = [
  { id: "select", label: "Select" },
  { id: "asset", label: "Asset card" },
  { id: "text", label: "Text card" },
  { id: "prompt", label: "Prompt card" },
  { id: "reference", label: "Reference card" },
  { id: "note", label: "Note card" },
] as const;

export function StudioCanvasToolbarSlot({ canvasId, onToolChange }: StudioCanvasToolbarSlotProps) {
  const [activeTool, setActiveTool] = useState<string>("select");

  if (!canvasId) {
    return (
      <SlotPanel label="Canvas toolbar">
        <SlotEmpty title="No canvas open" hint="Open a canvas board to use its tools." />
      </SlotPanel>
    );
  }

  return (
    <SlotPanel label="Canvas toolbar">
      <div role="toolbar" aria-label="Canvas tools" aria-orientation="horizontal" className="flex flex-wrap gap-1.5">
        {CANVAS_TOOLS.map((tool) => {
          const active = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setActiveTool(tool.id);
                onToolChange?.(tool.id);
              }}
              className={`rounded-[9px] px-3 py-1.5 text-[12px] font-medium ${
                active
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] ring-1 ring-[var(--border-default)]"
                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              }`}
            >
              {tool.label}
            </button>
          );
        })}
      </div>
    </SlotPanel>
  );
}
