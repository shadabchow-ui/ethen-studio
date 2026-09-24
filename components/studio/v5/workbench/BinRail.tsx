/**
 * STUDIO_14 — bin rail: project media available to the timeline.
 * Reference only; selecting a bin item never mutates the source.
 */
"use client";

import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { BinItemView } from "./types";
import { ticksToTimecode } from "./timecode";

export function BinRail({
  items,
  selectedAssetId,
  onSelect,
  timescale,
  fpsNum,
  fpsDen,
}: {
  items: BinItemView[];
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
  timescale: number;
  fpsNum: number;
  fpsDen: number;
}) {
  return (
    <aside aria-label="Media bin" data-testid="workbench-bin" className="flex w-56 shrink-0 flex-col gap-2 overflow-y-auto rounded-[16px] bg-[var(--bg-surface)] p-3">
      <h2 className="px-1 text-[12px] font-semibold text-[var(--text-primary)]">Bin</h2>
      {items.length === 0 ? (
        <p className="px-1 text-[12px] text-[var(--text-tertiary)]">No media yet. Create or import to begin.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => {
            const selected = item.assetId === selectedAssetId;
            return (
              <li key={`${item.assetId}:v${item.version}`}>
                <button
                  type="button"
                  data-testid={`bin-item-${item.assetId}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(item.assetId)}
                  className={`min-h-[44px] w-full rounded-[10px] px-3 py-2 text-left ${STUDIO_FOCUS_RING_CLASS} ${
                    selected ? "bg-[var(--bg-elevated)] ring-1 ring-[var(--border-default)]" : "bg-[var(--bg-inset)]"
                  }`}
                >
                  <span className="block truncate text-[12.5px] text-[var(--text-primary)]">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--text-tertiary)]">
                    {item.kind} · v{item.version}
                    {item.durationMs !== null
                      ? ` · ${ticksToTimecode(Math.round((item.durationMs / 1000) * timescale), timescale, fpsNum, fpsDen)}`
                      : " · unmeasured"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
