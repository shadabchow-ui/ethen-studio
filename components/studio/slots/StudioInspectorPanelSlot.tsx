"use client";

import type { StudioInspectorPanelSlotProps } from "@ethen/app-shell";
import { useStudioWorkbenchSelectionOptional } from "./selection-context";
import { SlotEmpty, SlotPanel } from "./slot-primitives";

/**
 * Studio V2 Job 13 — InspectorPanel slot implementation.
 *
 * Pure function of the workbench selection: renders the selected subject's
 * detail rows. It holds no data of its own and builds no second source of
 * truth — selecting nothing renders an honest empty state.
 */

const KIND_LABELS: Record<string, string> = {
  asset: "Asset",
  job: "Generation",
  review: "Review",
  project: "Project",
  node: "Canvas node",
  shot: "Shot",
  take: "Take",
  export: "Export",
  "campaign-item": "Campaign item",
};

export function StudioInspectorPanelSlot({ onOpenDetail }: StudioInspectorPanelSlotProps) {
  const selection = useStudioWorkbenchSelectionOptional();
  const subject = selection?.subject ?? null;

  return (
    <SlotPanel label="Inspector">
      {!subject ? (
        <SlotEmpty title="Nothing selected" hint="Select an asset, generation, or entity to inspect it." />
      ) : (
        <div className="rounded-[12px] bg-[var(--bg-surface)] px-4 py-3.5">
          <p className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
            {KIND_LABELS[subject.kind] ?? subject.kind}
          </p>
          <h3 className="mt-1 truncate text-[14px] text-[var(--text-primary)]">{subject.title}</h3>
          <dl className="mt-3 space-y-1.5">
            {Object.entries(subject.detail).map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-[11.5px] text-[var(--text-tertiary)]">{label}</dt>
                <dd className="min-w-0 truncate text-right font-mono text-[11px] text-[var(--text-secondary)]">{value}</dd>
              </div>
            ))}
          </dl>
          {onOpenDetail ? (
            <button
              type="button"
              onClick={() => onOpenDetail(subject.kind)}
              className="mt-3 rounded-[9px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)]"
            >
              Open details
            </button>
          ) : null}
        </div>
      )}
    </SlotPanel>
  );
}
