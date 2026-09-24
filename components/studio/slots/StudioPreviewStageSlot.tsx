"use client";

import { useMemo } from "react";
import type { StudioPreviewStageSlotProps } from "@ethen/app-shell";
import {
  studioMediaAccessLabel,
  validateStudioMediaLocator,
  type StudioMediaAccess,
} from "@ethen/ui/media/studio-preview-delivery";
import { useStudioWorkbenchSelectionOptional } from "./selection-context";
import { SlotEmpty, SlotPanel } from "./slot-primitives";

/**
 * Studio V2 Job 13 — PreviewStage slot implementation.
 *
 * Renders the workbench-selected output through the shared
 * SOURCE | PREVIEW | REVIEW | DELIVERY contract. The locator is validated
 * live (`validateStudioMediaLocator`): expired previews, unscoped sources,
 * and unpinned deliveries render explicit blocked states instead of media.
 * Access kinds are visibly distinguished and never interchangeable.
 */

const ACCESS_TONE: Record<StudioMediaAccess, string> = {
  source: "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
  preview: "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
  review: "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
  delivery: "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
};

export function StudioPreviewStageSlot({ projectId, access, onOpenReview }: StudioPreviewStageSlotProps) {
  const selection = useStudioWorkbenchSelectionOptional();
  const output = selection?.output ?? null;

  const locator = useMemo(() => {
    if (!output) return null;
    // Source renders only the authorized source URL; every other access
    // kind renders the short-lived preview URL. Never interchangeable.
    const url = access === "source" ? output.url : output.previewUrl;
    return {
      access,
      url,
      projectId,
      expiresAt: output.expiresAt,
      contentHash: output.contentHash,
      explicitDownload: output.explicitDownload,
    };
  }, [output, access, projectId]);

  const issues = useMemo(() => (locator ? validateStudioMediaLocator(locator) : []), [locator]);
  const blocked = issues.length > 0;

  return (
    <SlotPanel label="Preview stage">
      {!output || !locator ? (
        <SlotEmpty title="Nothing rendered yet." hint="Select an asset or a completed job output to preview it here." />
      ) : (
        <div className="overflow-hidden rounded-[12px] bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <span className={`rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium ${ACCESS_TONE[access]}`}>
              {studioMediaAccessLabel(access)}
            </span>
            <span className="truncate text-[11.5px] text-[var(--text-tertiary)]">
              {output.title ?? "Untitled output"}
              {output.contentHash ? ` · sha256:${output.contentHash.slice(0, 12)}…` : ""}
            </span>
          </div>
          {blocked ? (
            <div role="alert" className="px-4 py-6 text-center">
              <p className="text-[12.5px] text-[var(--text-secondary)]">
                {issues[0]?.code === "PREVIEW_EXPIRED"
                  ? "This preview link has expired. Re-open the output to mint a fresh link."
                  : issues[0]?.code === "DELIVERY_NOT_PINNED"
                    ? "This delivery is not pinned to a content hash and cannot be served."
                    : (issues[0]?.message ?? "This output cannot be shown with the current access.")}
              </p>
              {access === "review" && onOpenReview && output.assetId ? (
                <button
                  type="button"
                  onClick={() => onOpenReview(output.assetId as string)}
                  className="mt-3 rounded-[9px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)]"
                >
                  Open review
                </button>
              ) : null}
            </div>
          ) : (
            <div className="px-4 py-4">
              {output.kind === "audio" ? (
                <audio controls preload="metadata" src={locator.url as string} className="w-full" aria-label={output.title ?? "Audio preview"}>
                  Audio preview is not supported in this browser.
                </audio>
              ) : output.kind === "video" ? (
                <video
                  controls
                  preload="metadata"
                  src={locator.url as string}
                  className="max-h-[420px] w-full rounded-[8px] bg-black"
                  aria-label={output.title ?? "Video preview"}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={locator.url as string}
                  alt={output.title ?? "Studio output preview"}
                  className="max-h-[420px] w-full rounded-[8px] object-contain"
                  loading="lazy"
                />
              )}
              <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
                {access === "source"
                  ? "Canonical source · authorized project scope."
                  : access === "preview"
                    ? `Temporary signed preview${output.expiresAt ? ` · expires ${new Date(output.expiresAt).toLocaleString()}` : ""}.`
                    : access === "review"
                      ? "Public review artifact · read-only."
                      : "Final delivery/export · hash-pinned."}
              </p>
            </div>
          )}
        </div>
      )}
    </SlotPanel>
  );
}
