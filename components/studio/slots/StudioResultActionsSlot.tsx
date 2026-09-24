"use client";

import type { StudioResultActionsSlotProps } from "@ethen/app-shell";
import { useStudioWorkbenchSelectionOptional } from "./selection-context";
import { SlotEmpty, SlotPanel } from "./slot-primitives";

/**
 * Studio V2 Job 13 — ResultActions slot implementation.
 *
 * Only executable actions render: download (when the selected output
 * carries a URL), export and reuse-as-reference (when the page wires the
 * handlers). No handler, no data — no button.
 */

export function StudioResultActionsSlot({ outputId, onExport, onUseAsReference }: StudioResultActionsSlotProps) {
  const selection = useStudioWorkbenchSelectionOptional();
  const output = selection?.output ?? null;

  const downloadUrl = output?.previewUrl ?? output?.url ?? null;
  const canDownload = Boolean(outputId ?? output) && Boolean(downloadUrl);
  const canExport = Boolean(outputId ?? output) && onExport !== undefined;
  const canReuse = Boolean(outputId ?? output) && onUseAsReference !== undefined;
  const anyAction = canDownload || canExport || canReuse;

  return (
    <SlotPanel label="Result actions">
      {!anyAction ? (
        <SlotEmpty title="No actions available" hint="Select a completed output to act on it." />
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Result actions">
          {canDownload ? (
            <a
              href={downloadUrl as string}
              download
              className="rounded-[9px] bg-[var(--bg-elevated)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-primary)]"
            >
              Download
            </a>
          ) : null}
          {canExport ? (
            <button
              type="button"
              onClick={onExport}
              className="rounded-[9px] bg-[var(--bg-elevated)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-primary)]"
            >
              Export
            </button>
          ) : null}
          {canReuse ? (
            <button
              type="button"
              onClick={onUseAsReference}
              className="rounded-[9px] bg-[var(--bg-surface)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-primary)]"
            >
              Use as reference
            </button>
          ) : null}
        </div>
      )}
    </SlotPanel>
  );
}
